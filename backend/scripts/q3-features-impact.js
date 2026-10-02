/**
 * scripts/q3-features-impact.js
 *
 * Mede quanto de bônus ficou de fora num quarter por causa das features e
 * produtos que não chegavam ao Compplan (features do Force em
 * extras.cl_features e produtos/features apagados pela linha de override).
 * SÓ LEITURA — não grava nada.
 *
 * Para cada campanha do quarter: calcula como está hoje e de novo aplicando
 * produtos/features do checklist original (a mesma correção que vale na
 * 2026-Q4). Mostra as campanhas que mudam e o total por CS.
 *
 * Uso:
 *   node scripts/q3-features-impact.js            # Q3-2026
 *   node scripts/q3-features-impact.js Q2-2026
 *   node scripts/q3-features-impact.js --csv > impacto.csv
 */

import 'dotenv/config';
import { fetchAuditCampaigns } from '../routes/admin/export.js';
import { fetchFactsByToken, factsFor } from '../lib/external-facts.js';
import { computeBonus } from '../engine/compplan-engine.js';

const args = process.argv.slice(2);
const quarter = args.find(a => /^Q[1-4]-\d{4}$/.test(a)) || 'Q3-2026';
const asCsv = args.includes('--csv');
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const campaigns = await fetchAuditCampaigns({ quarter, includeUnfinished: true });
const facts = await fetchFactsByToken(campaigns.map(c => c.short_token));

const rows = [];
for (const c of campaigns) {
  const f = factsFor(facts, c.short_token);
  const opts = { preAssignee: c.pre_assignee || null, csOwner: c.cs_email, studiesInfo: c.studiesInfo || [] };
  const now = c.breakdown;
  const fixed = computeBonus(c, c.manual_checks_parsed || {}, c.metrics, c.admin_overrides_parsed || {},
    { ...opts, facts: f, forceChecklistFallback: true });
  const diff = fixed.total_brl - now.total_brl;
  if (Math.abs(diff) < 0.01) continue;
  const gained = [];
  for (const [cat, cb] of Object.entries(fixed.by_category)) {
    for (const it of cb.items) {
      const before = now.by_category[cat]?.items.find(i => i.id === it.id);
      if (it.earned && !before?.earned) gained.push(it.label);
    }
  }
  rows.push({
    cs: c.cs_name || c.cs_email, cs_email: c.cs_email, token: c.short_token, cliente: c.client_name,
    hoje: now.total_brl, corrigido: fixed.total_brl, diferenca: diff,
    features_view: (c.features || []).join(', '), features_checklist: (f.checklist?.features || []).join(', '),
    produtos_checklist: (f.checklist?.products || []).join(', '), itens_ganhos: gained.join(' | '),
  });
}

if (asCsv) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  console.log(['cs', 'token', 'cliente', 'bonus_hoje', 'bonus_corrigido', 'diferenca', 'features_na_view', 'features_no_checklist', 'produtos_no_checklist', 'itens_que_passam_a_contar'].join(';'));
  for (const r of rows) console.log([r.cs, r.token, r.cliente, r.hoje.toFixed(2), r.corrigido.toFixed(2), r.diferenca.toFixed(2), r.features_view, r.features_checklist, r.produtos_checklist, r.itens_ganhos].map(esc).join(';'));
} else {
  console.log(`\nImpacto das features/produtos que não chegavam — ${quarter} (${campaigns.length} campanhas, ${rows.length} mudam)\n`);
  console.table(rows.map(r => ({ CS: r.cs, Token: r.token, Cliente: r.cliente, Hoje: brl(r.hoje), Corrigido: brl(r.corrigido), Diferença: brl(r.diferenca), 'Passa a contar': r.itens_ganhos })));
  const byCs = {};
  for (const r of rows) byCs[r.cs] = (byCs[r.cs] || 0) + r.diferenca;
  console.log('\nTotal por CS (bônus bruto, antes do piso):');
  console.table(Object.entries(byCs).map(([cs, v]) => ({ CS: cs, Diferença: brl(v) })));
  console.log(`Total: ${brl(rows.reduce((s, r) => s + r.diferenca, 0))}\n`);
}
