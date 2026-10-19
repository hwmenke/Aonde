// Validação da busca que a pessoa submeteu. Datas irreconhecíveis, aeroportos
// desconhecidos e combinações de passageiros que a busca não cobre param AQUI,
// antes de qualquer consulta a parceiro e sem trocar a rota por outra.

import { resolveAeroporto } from "../render/aeroportos.js";
import { parseDataPtBr } from "./datas.js";

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function somarDiasIso(iso, dias) {
  const m = ISO_RE.exec(String(iso || ""));
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + dias);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

export function datasSugeridas(hojeIso) {
  const ida = somarDiasIso(hojeIso, 30);
  const volta = ida ? somarDiasIso(ida, 7) : null;
  return { ida, volta };
}

function inteiroInformado(valor, { ausente }) {
  if (valor === undefined || valor === null || String(valor).trim() === "") {
    return { ok: true, n: ausente };
  }
  const texto = String(valor).trim();
  if (!/^\d+$/.test(texto)) return { ok: false, n: null };
  return { ok: true, n: Number(texto) };
}

function erro(campo, mensagem) {
  return { campo, mensagem };
}

/**
 * @param {object} entrada o que veio na query, ainda cru
 * @param {{hoje: string}} ctx dia de calendário AAAA-MM-DD no fuso do produto
 */
export function validarConsulta(entrada = {}, { hoje, exigirDatas = true } = {}) {
  const informada = {
    origem: String(entrada.origem || "").trim(),
    destino: String(entrada.destino || "").trim(),
    ida: String(entrada.ida || "").trim(),
    volta: String(entrada.volta || "").trim(),
    adultos: entrada.adultos,
    criancas: entrada.criancas,
    bebes: entrada.bebes,
  };
  const erros = [];
  const origem = resolveAeroporto(informada.origem);
  const destino = resolveAeroporto(informada.destino);
  if (!informada.origem || !origem) {
    erros.push(erro("origem", "Não reconhecemos essa origem. Use a cidade ou o código de três letras, como GRU."));
  }
  if (!informada.destino || !destino) {
    erros.push(erro("destino", "Não reconhecemos esse destino. Use a cidade ou o código de três letras, como REC."));
  }
  if (origem && destino && origem === destino) {
    erros.push(erro("destino", "Origem e destino precisam ser aeroportos diferentes."));
  }

  const pediuDatas = informada.ida !== "" || informada.volta !== "";
  let ida = null;
  let volta = null;
  if (exigirDatas || pediuDatas) {
    ida = parseDataPtBr(informada.ida);
    volta = parseDataPtBr(informada.volta);
    if (!informada.ida || !ida) {
      erros.push(erro("ida", "Informe a data de ida. Datas incompletas não são substituídas por outra."));
    } else if (hoje && ida < hoje) {
      erros.push(erro("ida", "A ida precisa ser hoje ou uma data futura."));
    }
    if (!informada.volta || !volta) {
      erros.push(erro("volta", "Informe a data de volta. Datas incompletas não são substituídas por outra."));
    } else if (ida && volta < ida) {
      erros.push(erro("volta", "A volta não pode ser antes da ida."));
    }
  }

  const adultos = inteiroInformado(informada.adultos, { ausente: 1 });
  const criancas = inteiroInformado(informada.criancas, { ausente: 0 });
  const bebes = inteiroInformado(informada.bebes, { ausente: 0 });
  if (!adultos.ok || adultos.n < 1 || adultos.n > 9) {
    erros.push(erro("adultos", "Informe de 1 a 9 adultos."));
  }
  if (!criancas.ok || criancas.n < 0 || criancas.n > 8) {
    erros.push(erro("criancas", "Informe de 0 a 8 crianças (2 a 11 anos)."));
  }
  if (!bebes.ok || bebes.n < 0 || bebes.n > 8) {
    erros.push(erro("bebes", "Informe de 0 a 8 bebês de colo."));
  }
  if (adultos.ok && bebes.ok && bebes.n > adultos.n) {
    erros.push(erro("bebes", "Cada bebê de colo precisa ir no colo de um adulto. Há mais bebês do que adultos."));
  }
  if (adultos.ok && criancas.ok && bebes.ok && adultos.n + criancas.n + bebes.n > 9) {
    erros.push(erro("adultos", "A busca aceita no máximo 9 passageiros no total."));
  }

  const consulta =
    erros.length === 0
      ? {
          origem,
          destino,
          ida,
          volta,
          adultos: adultos.n,
          criancas: criancas.n,
          bebes: bebes.n,
        }
      : null;

  return { ok: erros.length === 0, erros, consulta, informada };
}
