// ---------------------------------------------------------------------------
// ENVIO DE E-MAIL — a camada que faltava.
//
// Ate aqui o projeto tinha template pronto, double opt-in funcionando, dedup de
// alerta e descadastro — e NADA que efetivamente enviasse. `senderImpl` so
// gravava numa fila em disco. Ou seja: o alerta de preco, que e a razao de
// alguem voltar ao site, nunca chegava a lugar nenhum.
//
// O que este modulo faz:
//   - fala com UM provedor por vez, atras de uma interface minima;
//   - tenta de novo quando a falha e temporaria, e desiste quando nao e;
//   - respeita a lista de supressao (bounce/reclamacao) ANTES de enviar;
//   - registra o que aconteceu com cada mensagem, para dar para auditar.
//
// O que ele NAO faz, de proposito:
//   - nao envia sozinho: quem chama e o worker (src/newsletter/worker.js);
//   - nao inventa provedor. Sem AONDE_EMAIL_PROVIDER configurado ele opera em
//     modo "registro apenas" e DIZ que esta nesse modo. Fingir envio seria a
//     pior forma de quebrar a promessa do produto: a pessoa acha que vai
//     receber alerta e nunca recebe.
//
// LGPD: o endereco so aparece no log em forma de hash. O corpo do e-mail nunca
// e registrado.
// ---------------------------------------------------------------------------

import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

import { resolveDataDir, ensureDir } from "../store/dataDir.js";
import { hashEmail } from "./subscriberStore.js";
import { httpRequest } from "../http.js";

/** Falhas que ADIANTA repetir: a mensagem ainda pode ser entregue. */
const TEMPORARIAS = new Set([408, 429, 500, 502, 503, 504]);

/** Motivos que colocam um endereco na lista de supressao para sempre. */
export const MOTIVOS_SUPRESSAO = ["bounce_permanente", "reclamacao_spam", "descadastro"];

function arquivoLog() {
  return path.join(resolveDataDir(), "email_log.jsonl");
}
function arquivoSupressao() {
  return path.join(resolveDataDir(), "email_suppression.jsonl");
}

/**
 * Le a lista de supressao. Endereco aqui NUNCA recebe e-mail, aconteca o que
 * acontecer — e a regra que protege a reputacao de envio e, antes disso, a
 * pessoa que pediu para parar.
 *
 * Arquivo ilegivel => conjunto vazio. Escolha deliberada e discutivel: erra
 * para o lado de ENVIAR. O caminho oposto (bloquear tudo quando o arquivo
 * quebra) transformaria um arquivo corrompido em blackout silencioso de todos
 * os alertas, que e mais dificil de perceber. O worker loga o problema.
 */
export function listaSupressao() {
  const set = new Set();
  try {
    const txt = readFileSync(arquivoSupressao(), "utf-8");
    for (const linha of txt.split("\n")) {
      if (!linha.trim()) continue;
      try {
        const item = JSON.parse(linha);
        if (item && item.emailHash) set.add(item.emailHash);
      } catch {
        // linha corrompida nao invalida as outras
      }
    }
  } catch {
    return set;
  }
  return set;
}

/** Poe um endereco na lista de supressao. Idempotente por natureza (append). */
export function suprimir(email, motivo = "bounce_permanente") {
  const dir = resolveDataDir();
  ensureDir(dir);
  const item = {
    emailHash: hashEmail(email),
    motivo: MOTIVOS_SUPRESSAO.includes(motivo) ? motivo : "bounce_permanente",
    em: new Date().toISOString(),
  };
  appendFileSync(arquivoSupressao(), `${JSON.stringify(item)}\n`, "utf-8");
  return item;
}

/** True quando o endereco esta suprimido. */
export function estaSuprimido(email, lista = listaSupressao()) {
  return lista.has(hashEmail(email));
}

function registrar(entrada) {
  try {
    const dir = resolveDataDir();
    ensureDir(dir);
    appendFileSync(arquivoLog(), `${JSON.stringify(entrada)}\n`, "utf-8");
  } catch {
    // Log e para auditoria; falhar em gravar nao pode derrubar o envio.
  }
}

/**
 * Provedores conhecidos. Cada um so precisa saber montar a requisicao HTTP.
 * Adicionar outro e escrever mais um objeto aqui — nada mais no projeto muda.
 */
const PROVEDORES = {
  // https://resend.com/docs/api-reference/emails/send-email
  resend: {
    exigeChave: "AONDE_EMAIL_API_KEY",
    montar({ chave, de, para, assunto, textoPlano, html }) {
      return {
        url: "https://api.resend.com/emails",
        opcoes: {
          method: "POST",
          headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: de, to: [para], subject: assunto, text: textoPlano, html }),
        },
      };
    },
  },
  // https://docs.sendgrid.com/api-reference/mail-send/mail-send
  sendgrid: {
    exigeChave: "AONDE_EMAIL_API_KEY",
    montar({ chave, de, para, assunto, textoPlano, html }) {
      return {
        url: "https://api.sendgrid.com/v3/mail/send",
        opcoes: {
          method: "POST",
          headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: para }] }],
            from: { email: de },
            subject: assunto,
            content: [
              { type: "text/plain", value: textoPlano },
              { type: "text/html", value: html },
            ],
          }),
        },
      };
    },
  },
};

export function provedorConfigurado() {
  const nome = String(process.env.AONDE_EMAIL_PROVIDER || "").trim().toLowerCase();
  if (!nome) return null;
  const p = PROVEDORES[nome];
  if (!p) return { nome, erro: `Provedor desconhecido: "${nome}". Conhecidos: ${Object.keys(PROVEDORES).join(", ")}.` };
  const chave = process.env[p.exigeChave];
  if (!chave) return { nome, erro: `${p.exigeChave} nao definida.` };
  const de = process.env.AONDE_EMAIL_FROM;
  if (!de) return { nome, erro: "AONDE_EMAIL_FROM nao definida." };
  return { nome, chave, de, montar: p.montar };
}

/**
 * Envia UMA mensagem. Nunca lanca: devolve o que aconteceu.
 *
 * @returns {Promise<{ok:boolean, estado:"enviado"|"suprimido"|"sem_provedor"|"falha_permanente"|"falha_temporaria", tentativas:number, motivo?:string}>}
 */
export async function enviarEmail(
  { para, assunto, textoPlano, html },
  { tentativasMax = 3, esperaMs = 500, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}
) {
  const hash = hashEmail(para);
  const base = { emailHash: hash, assunto, em: new Date().toISOString() };

  if (estaSuprimido(para)) {
    const saida = { ok: false, estado: "suprimido", tentativas: 0 };
    registrar({ ...base, ...saida });
    return saida;
  }

  const prov = provedorConfigurado();
  if (!prov || prov.erro) {
    // MODO REGISTRO: nao ha provedor. Nao fingimos que enviou.
    const saida = {
      ok: false,
      estado: "sem_provedor",
      tentativas: 0,
      motivo: (prov && prov.erro) || "AONDE_EMAIL_PROVIDER nao definida.",
    };
    registrar({ ...base, ...saida });
    return saida;
  }

  let ultima = "";
  for (let tentativa = 1; tentativa <= tentativasMax; tentativa++) {
    const { url, opcoes } = prov.montar({ chave: prov.chave, de: prov.de, para, assunto, textoPlano, html });
    let resposta;
    try {
      resposta = await httpRequest(url, { ...opcoes, retries: 0 });
    } catch (err) {
      ultima = (err && err.message) || String(err);
      resposta = null;
    }

    if (resposta && resposta.ok) {
      const saida = { ok: true, estado: "enviado", tentativas: tentativa };
      registrar({ ...base, ...saida, provedor: prov.nome });
      return saida;
    }

    const status = resposta ? resposta.status : 0;
    // 4xx que nao seja 408/429 e erro nosso (endereco invalido, chave errada):
    // repetir so gasta cota e piora a reputacao de envio.
    const vaiAdiantar = status === 0 || TEMPORARIAS.has(status);
    if (!vaiAdiantar) {
      const saida = { ok: false, estado: "falha_permanente", tentativas: tentativa, motivo: `HTTP ${status}` };
      registrar({ ...base, ...saida, provedor: prov.nome });
      // Endereco que o provedor recusa nao deve ser tentado de novo nunca.
      if (status === 400 || status === 422) suprimir(para, "bounce_permanente");
      return saida;
    }
    if (tentativa < tentativasMax) await dormir(esperaMs * 2 ** (tentativa - 1));
  }

  const saida = { ok: false, estado: "falha_temporaria", tentativas: tentativasMax, motivo: ultima || "sem resposta" };
  registrar({ ...base, ...saida, provedor: prov.nome });
  return saida;
}

/** Le o log de envio (auditoria). Mais recente por ultimo. */
export function historicoEnvios() {
  try {
    return readFileSync(arquivoLog(), "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
