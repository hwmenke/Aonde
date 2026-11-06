import test from "node:test";
import assert from "node:assert/strict";
import { buildWelcomeEmail } from "../src/newsletter/emailTemplates.js";

const input = {
  email: "pessoa@example.com",
  origem: "GRU",
  unsubscribeUrl: "https://aonde.com.br/api/newsletter/unsubscribe?email=pessoa%40example.com",
};

for (const target of [{}, { destino: "REC", precoAlvoCentavos: 80000 }]) {
  test(`welcome sets honest expectations (${target.destino || "origin only"})`, () => {
    const result = buildWelcomeEmail({ ...input, ...target });
    for (const body of [result.textoPlano, result.html]) {
      assert.match(body, /só recebe alertas quando encontrarmos um preço que bate com o que você pediu/);
      assert.match(body, /Sem frequência fixa/);
      assert.match(body, /Quando há histórico suficiente, também mostra a comparação com a média da rota/);
      assert.match(body, /caso contrário, informa que não há histórico suficiente para comparar/);
      assert.match(body, /o Aonde não vende passagens, não processa pagamento nem emite passagem/);
      assert.match(body, /A compra é feita direto com o parceiro/);
      assert.match(body, /preço final é sempre confirmado no site do parceiro, na hora da compra/);
      assert.match(body, /cancelamento, reembolso, alteração/);
      assert.match(body, /negociado direto com o parceiro que vendeu a passagem/);
      assert.match(body, /Cancelar inscrição interrompe todos os alertas deste endereço, não apenas este alerta/);
      assert.ok(body.includes(input.unsubscribeUrl));
      assert.match(body, /sem perguntas/);
      if (target.destino) {
        assert.match(body, /Recife/);
        assert.match(body, /R\$\s*800/);
      } else {
        assert.doesNotMatch(body, /até R\$/);
      }
    }
    assert.match(result.textoPlano, /Cancelar inscrição \(confirma numa página/);
    assert.match(result.html, /abre a página de confirmação/);
    const content = `${result.assunto}\n${result.textoPlano}\n${result.html}`;
    assert.doesNotMatch(content, /nunca mais|jamais|em um clique|é assim em qualquer comparador|últimas horas|só hoje|corra|aproveite agora/i);
    assert.doesNotMatch(content, /Cada alerta mostra o preço encontrado, como ele se compara à média/);
  });
}
