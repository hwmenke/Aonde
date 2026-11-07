#!/usr/bin/env node
// node scripts/planejar-alertas.js [--json]
// Read-only preview. Offer exclusions count offers; channel exclusions count
// matching non-email candidates. Planned/cooldown counts cover email only.
// Apply is unavailable until worker stale-lock recovery is safe for producers.
import { pathToFileURL } from 'node:url';
import { listOffers } from '../src/store/offersStore.js';
import { listAlertRules } from '../src/newsletter/alertRules.js';
import { listSubscribers } from '../src/newsletter/subscriberStore.js';
import { planAlerts, readAlertQueue, matchAlerts } from '../src/newsletter/alertMatcher.js';
import { precoCentavosOferta } from '../src/newsletter/alertEligibility.js';
import { datasImpossiveis, viagemAindaVale } from '../src/offers/elegibilidade.js';

export function previewAlerts({ agora = Date.now() } = {}) {
  const rules = listAlertRules();
  const subscribers = listSubscribers();
  const queueItems = readAlertQueue();
  const today = new Date(agora).toISOString().slice(0, 10);
  const offers = [];
  for (const source of listOffers()) {
    const price = precoCentavosOferta(source);
    const row = { id: source?.id || null,
      route: `${String(source?.origem || '').toUpperCase()}-${String(source?.destino || '').toUpperCase()}`,
      price, planned: 0, cooldownSuppressed: 0, excluded: {} };
    offers.push(row);
    let reason;
    if (source?.status !== 'publicada') reason = 'nao-publicada';
    else if (!source.id) reason = 'sem-id';
    else if (datasImpossiveis(source, today) || !viagemAindaVale(source, today)) reason = 'oferta-inelegivel';
    else if (price === null) reason = 'preco-nao-verificavel';
    if (reason) { row.excluded[reason] = 1; continue; }
    const offer = { ...source, preco_centavos: price };
    const matches = matchAlerts(offer, { rules, subscribers, dia: today });
    const nonEmail = matches.filter(match => match.canal !== 'email').length;
    if (nonEmail) row.excluded['canal-nao-email'] = nonEmail;
    if (!matches.length) row.excluded['regra-nao-casa'] = 1;
    const emailRules = rules.map(rule => {
      if (!rule) return rule;
      const channels = Array.isArray(rule.canais) && rule.canais.length ? rule.canais : ['email'];
      return channels.includes('email') ? { ...rule, canais: channels.filter(c => c === 'email') } : null;
    });
    const plan = planAlerts({ offers: [offer], rules: emailRules, subscribers, queueItems, agora });
    row.planned = plan.queued;
    row.cooldownSuppressed = plan.suprimidos;
    queueItems.push(...plan.items);
  }
  return { previewOnly: true, applyAvailable: false, message: 'Somente prévia. --apply não está disponível ainda.',
    planned: offers.reduce((n, row) => n + row.planned, 0),
    cooldownSuppressed: offers.reduce((n, row) => n + row.cooldownSuppressed, 0), offers };
}

export function main(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--json')) {
    console.error('Opção inválida. Use apenas --json. --apply não está disponível ainda.');
    process.exitCode = 1;
    return;
  }
  try {
    const result = previewAlerts();
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(result.message);
      for (const row of result.offers) console.log(JSON.stringify(row));
      console.log(`Planejados: ${result.planned}; suprimidos por cooldown: ${result.cooldownSuppressed}`);
    }
  } catch {
    console.error('Não foi possível ler os dados para a prévia. Nenhuma alteração foi feita. --apply não está disponível ainda.');
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
