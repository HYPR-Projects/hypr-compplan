/**
 * lib/manual-checks.js — leitura e gravação pontual do manual_checks de uma
 * campanha, para rotas que mexem só numa chave (deck da pré-campanha, reunião
 * de pós-venda). Não toca em revisão, notas nem nos outros campos.
 */

import { query, tableRef } from './bigquery.js';

function tableFor(isLegacy) {
  return isLegacy ? 'commplan_legacy_assignments' : 'commplan_command_overrides';
}

export async function readManualChecks(shortToken, isLegacy) {
  const [row] = await query(
    `SELECT manual_checks, admin_overrides, pre_campaign_assignee_email
     FROM ${tableRef(tableFor(isLegacy))} WHERE short_token = @t LIMIT 1`,
    { t: shortToken }
  );
  return {
    manualChecks: row?.manual_checks ? JSON.parse(row.manual_checks) : {},
    adminOverrides: row?.admin_overrides ? JSON.parse(row.admin_overrides) : {},
    preAssignee: row?.pre_campaign_assignee_email || null,
    exists: !!row,
  };
}

/**
 * Lê, aplica `mutate(manualChecks)` e grava. Lança erro se a leitura falhar
 * (nunca grava em cima de um estado que não conseguiu ler).
 */
export async function patchManualChecks({ shortToken, isLegacy, ownerEmail, byEmail, mutate }) {
  const current = await readManualChecks(shortToken, isLegacy);
  const next = mutate({ ...current.manualChecks }) || current.manualChecks;
  const mc = JSON.stringify(next);
  if (isLegacy) {
    await query(
      `UPDATE ${tableRef('commplan_legacy_assignments')} SET manual_checks = @mc WHERE short_token = @t`,
      { mc, t: shortToken }
    );
  } else {
    await query(
      `MERGE ${tableRef('commplan_command_overrides')} T
       USING (SELECT @t AS short_token) S ON T.short_token = S.short_token
       WHEN MATCHED THEN UPDATE SET manual_checks = @mc, updated_at = CURRENT_TIMESTAMP(), updated_by = @by
       WHEN NOT MATCHED THEN INSERT
         (short_token, cs_email, manual_checks, notes, reviewed, reviewed_at, created_at, updated_at, updated_by)
       VALUES (@t, @owner, @mc, '', FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @by)`,
      { t: shortToken, mc, by: byEmail, owner: ownerEmail || byEmail }
    );
  }
  return next;
}

// Chaves que só o servidor grava (vêm de outras plataformas). O PUT da
// campanha preserva o valor do banco e ignora o que o navegador mandar.
export const SERVER_OWNED_KEYS = ['__pre_deck', '__pv_meeting'];
