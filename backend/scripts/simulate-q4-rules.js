/**
 * scripts/simulate-q4-rules.js
 *
 * Recalcula um quarter já fechado com as regras da versão 2026-Q4 e compara
 * com as regras atuais — SÓ LEITURA, não grava nada no BigQuery. Serve para
 * medir o impacto da versão nova por CS antes de ela valer.
 *
 * Uso:
 *   node scripts/simulate-q4-rules.js            # Q3-2026
 *   node scripts/simulate-q4-rules.js Q2-2026
 *
 * Saída: tabela no terminal + CSV em stdout com --csv.
 *
 * Como funciona: a versão é escolhida pela data de início da campanha
 * (COMPPLAN_2026Q4_FROM). Rodamos o cálculo duas vezes trocando essa data:
 * uma no futuro (todas as campanhas na versão 2026) e outra no passado (todas
 * na 2026-Q4). Itens Max Attention dependem das peças vinculadas no Report
 * Hub — campanhas antigas tendem a ter menos vínculos, então a simulação
 * mostra o pior caso para Tier 1.
 */

import 'dotenv/config';
import { parseQuarter } from '../engine/quarter-resolver.js';
import { computeCsBonus } from '../lib/bonus-calc.js';
import { listAllMembers } from '../data/team-members.js';

const args = process.argv.slice(2);
const qStr = args.find(a => /^Q[1-4]-\d{4}$/.test(a)) || 'Q3-2026';
const asCsv = args.includes('--csv');
const { startDate, endDate } = parseQuarter(qStr);

async function runWith(cutoff, csEmail) {
  process.env.COMPPLAN_2026Q4_FROM = cutoff;
  return computeCsBonus({ csEmail, startDate, endDate });
}

const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const members = (await listAllMembers({ activeOnly: true })).filter(m => m.role !== 'admin');
const rows = [];
for (const m of members) {
  const email = String(m.email).toLowerCase();
  // Sequencial: a troca de env vale para a chamada inteira.
  const atual = await runWith('2999-01-01', email);
  const nova = await runWith('2000-01-01', email);
  rows.push({
    cs: m.name || email,
    email,
    campanhas: atual.by_campaign.length,
    atual: atual.total_brl,
    regras_q4: nova.total_brl,
    diferenca: nova.total_brl - atual.total_brl,
  });
}

if (asCsv) {
  console.log('cs,email,campanhas,atual_brl,regras_q4_brl,diferenca_brl');
  for (const r of rows) console.log([r.cs, r.email, r.campanhas, r.atual.toFixed(2), r.regras_q4.toFixed(2), r.diferenca.toFixed(2)].join(','));
} else {
  console.log(`\nSimulação ${qStr} (${startDate} a ${endDate}) — regras atuais × regras 2026-Q4\n`);
  console.table(rows.map(r => ({
    CS: r.cs, Campanhas: r.campanhas, Atual: brl(r.atual), 'Regras Q4': brl(r.regras_q4), Diferença: brl(r.diferenca),
  })));
  const tot = rows.reduce((a, r) => ({ atual: a.atual + r.atual, nova: a.nova + r.regras_q4 }), { atual: 0, nova: 0 });
  console.log(`Total: ${brl(tot.atual)} → ${brl(tot.nova)} (${brl(tot.nova - tot.atual)})\n`);
}
