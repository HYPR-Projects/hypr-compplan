/**
 * data/snapshots.js — escrita dos snapshots de cálculo.
 *
 * commplan_campaign_calc       → 1 row por (campanha, cs, quarter)
 * commplan_quarter_summary     → 1 row por (cs, quarter), agrega tudo
 *
 * Padrão upsert: se existir snapshot pra mesma chave, deleta e insere
 * novo (snapshot é replaceable até o quarter ser aprovado).
 *
 * Após status='approved', snapshots ficam imutáveis — admin precisa
 * "reabrir" o quarter (status=draft de volta) pra recomputar.
 */

import crypto from 'crypto';
import { query, tableRef, escSql } from '../lib/bigquery.js';

/** Upsert de campaign_calc — deleta snapshot anterior e insere novo. */
export async function upsertCampaignCalc(calc) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Deleta anterior
  await query(`
    DELETE FROM ${tableRef('commplan_campaign_calc')}
    WHERE short_token = @t AND LOWER(cs_email) = LOWER(@c) AND quarter = @q
  `, { t: calc.short_token, c: calc.cs_email, q: calc.quarter });

  // Insere novo
  const sql = `
    INSERT INTO ${tableRef('commplan_campaign_calc')}
      (id, cs_email, short_token, quarter, version_id,
       client_name, campaign_name, campaign_start_date, campaign_end_date,
       revenue_gross_brl, revenue_net_brl,
       rules_applied, total_pct, bonus_amount_brl,
       mentor_email, mentor_bonus_amount_brl,
       study_author_email, study_author_bonus_amount_brl,
       computed_at, computed_by)
    VALUES (
      ${escSql.str(id)},
      ${escSql.str(calc.cs_email)},
      ${escSql.str(calc.short_token)},
      ${escSql.str(calc.quarter)},
      ${escSql.str(calc.version_id)},
      ${escSql.str(calc.client_name)},
      ${escSql.str(calc.campaign_name)},
      ${escSql.date(calc.campaign_start_date)},
      ${escSql.date(calc.campaign_end_date)},
      ${escSql.num(calc.revenue_gross)},
      ${escSql.num(calc.revenue_net)},
      ${escSql.json(calc.rule_results)},
      ${escSql.num(calc.cs_total_pct)},
      ${escSql.num(calc.cs_bonus_amount)},
      ${escSql.str(calc.mentor_email)},
      ${escSql.num(calc.mentor_bonus_amount)},
      ${escSql.str(calc.study_author_email)},
      ${escSql.num(calc.study_author_bonus_amount)},
      ${escSql.ts(now)},
      ${escSql.str('system_auto')}
    )
  `;
  await query(sql);
  return id;
}

/**
 * Recalcula e upserta o quarter_summary pra um CS, agregando todas as
 * campanhas dele no quarter + bônus de mentoria que ele recebeu.
 */
export async function recomputeQuarterSummary({ csEmail, quarter, versionId, salaryMonthlyBrl }) {
  // Soma o que o CS recebe COMO DONO de campanha
  const ownSql = `
    SELECT
      COALESCE(SUM(bonus_amount_brl), 0) AS bonus_own,
      COUNT(*) AS campaigns_count
    FROM ${tableRef('commplan_campaign_calc')}
    WHERE LOWER(cs_email) = LOWER(@c) AND quarter = @q
  `;
  const ownRows = await query(ownSql, { c: csEmail, q: quarter });
  const bonusOwn = Number(ownRows[0]?.bonus_own || 0);
  const campaignsCount = Number(ownRows[0]?.campaigns_count || 0);

  // Soma o que o CS recebe COMO MENTOR (campanhas dos mentees onde ele aparece)
  const mentorSql = `
    SELECT COALESCE(SUM(mentor_bonus_amount_brl), 0) AS bonus_mentor
    FROM ${tableRef('commplan_campaign_calc')}
    WHERE LOWER(mentor_email) = LOWER(@c) AND quarter = @q
  `;
  const mentorRows = await query(mentorSql, { c: csEmail, q: quarter });
  const bonusMentor = Number(mentorRows[0]?.bonus_mentor || 0);

  // Soma o que o CS recebe COMO AUTOR DE ESTUDO (campanhas onde estudo dele foi usado)
  const studySql = `
    SELECT COALESCE(SUM(study_author_bonus_amount_brl), 0) AS bonus_study
    FROM ${tableRef('commplan_campaign_calc')}
    WHERE LOWER(study_author_email) = LOWER(@c) AND quarter = @q
  `;
  const studyRows = await query(studySql, { c: csEmail, q: quarter });
  const bonusStudy = Number(studyRows[0]?.bonus_study || 0);

  // Conta evidências pendentes
  const pendingSql = `
    SELECT COUNT(*) AS n
    FROM ${tableRef('commplan_evidences')} e
    WHERE LOWER(e.cs_email) = LOWER(@c)
      AND e.status = 'claimed'
      AND e.short_token IN (
        SELECT short_token FROM ${tableRef('commplan_campaign_calc')}
        WHERE LOWER(cs_email) = LOWER(@c) AND quarter = @q
      )
  `;
  const pendingRows = await query(pendingSql, { c: csEmail, q: quarter });
  const pendingCount = Number(pendingRows[0]?.n || 0);

  const bonusGross = bonusOwn + bonusMentor + bonusStudy;
  const salaryDeduction = 2 * (salaryMonthlyBrl || 0);
  const bonusNet = Math.max(0, bonusGross - salaryDeduction);

  // Upsert
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await query(`
    DELETE FROM ${tableRef('commplan_quarter_summary')}
    WHERE LOWER(cs_email) = LOWER(@c) AND quarter = @q
      AND status IN ('draft', 'pending_approval')
  `, { c: csEmail, q: quarter });

  // Se já tem approved/paid, NÃO sobrescreve (snapshot imutável)
  const existingApproved = await query(`
    SELECT id FROM ${tableRef('commplan_quarter_summary')}
    WHERE LOWER(cs_email) = LOWER(@c) AND quarter = @q
      AND status IN ('approved', 'paid')
    LIMIT 1
  `, { c: csEmail, q: quarter });

  if (existingApproved.length > 0) {
    return { skipped: true, reason: 'quarter já aprovado/pago — snapshot imutável' };
  }

  const sql = `
    INSERT INTO ${tableRef('commplan_quarter_summary')}
      (id, cs_email, quarter, version_id,
       bonus_from_own_campaigns_brl, bonus_from_mentorship_brl, bonus_from_studies_brl,
       bonus_gross_brl, fixed_salary_monthly_brl, salary_deduction_brl, bonus_net_brl,
       status, campaigns_count, evidences_pending_count,
       computed_at, created_at, updated_at)
    VALUES (
      ${escSql.str(id)},
      ${escSql.str(csEmail.toLowerCase())},
      ${escSql.str(quarter)},
      ${escSql.str(versionId)},
      ${escSql.num(bonusOwn)},
      ${escSql.num(bonusMentor)},
      ${escSql.num(bonusStudy)},
      ${escSql.num(bonusGross)},
      ${escSql.num(salaryMonthlyBrl)},
      ${escSql.num(salaryDeduction)},
      ${escSql.num(bonusNet)},
      ${escSql.str('draft')},
      ${escSql.num(campaignsCount)},
      ${escSql.num(pendingCount)},
      ${escSql.ts(now)},
      ${escSql.ts(now)},
      ${escSql.ts(now)}
    )
  `;
  await query(sql);
  return {
    id, csEmail, quarter, bonusGross, bonusNet, campaignsCount, pendingCount,
    bonusOwn, bonusMentor, bonusStudy,
  };
}

export async function getQuarterSummary({ csEmail, quarter }) {
  const rows = await query(
    `SELECT * FROM ${tableRef('commplan_quarter_summary')}
     WHERE LOWER(cs_email) = LOWER(@c) AND quarter = @q
     ORDER BY created_at DESC LIMIT 1`,
    { c: csEmail, q: quarter }
  );
  return rows[0] || null;
}

export async function listQuarterSummaries({ quarter }) {
  return query(
    `SELECT * FROM ${tableRef('commplan_quarter_summary')}
     WHERE quarter = @q
     ORDER BY cs_email`,
    { q: quarter }
  );
}

export async function getCampaignCalcsByQuarter({ csEmail, quarter }) {
  return query(
    `SELECT * FROM ${tableRef('commplan_campaign_calc')}
     WHERE LOWER(cs_email) = LOWER(@c) AND quarter = @q
     ORDER BY campaign_end_date DESC`,
    { c: csEmail, q: quarter }
  );
}

export async function approveQuarter({ csEmail, quarter, approvedBy }) {
  const sql = `
    UPDATE ${tableRef('commplan_quarter_summary')}
    SET status = 'approved',
        approved_by = ${escSql.str(approvedBy)},
        approved_at = CURRENT_TIMESTAMP(),
        updated_at = CURRENT_TIMESTAMP()
    WHERE LOWER(cs_email) = LOWER(@c) AND quarter = @q
      AND status IN ('draft', 'pending_approval')
  `;
  await query(sql, { c: csEmail, q: quarter });
}

export async function markQuarterPaid({ csEmail, quarter, paidBy }) {
  const sql = `
    UPDATE ${tableRef('commplan_quarter_summary')}
    SET status = 'paid',
        paid_by = ${escSql.str(paidBy)},
        paid_at = CURRENT_TIMESTAMP(),
        updated_at = CURRENT_TIMESTAMP()
    WHERE LOWER(cs_email) = LOWER(@c) AND quarter = @q
      AND status = 'approved'
  `;
  await query(sql, { c: csEmail, q: quarter });
}
