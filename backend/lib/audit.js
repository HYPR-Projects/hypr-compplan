/**
 * lib/audit.js — registra mudanças nas tabelas de configuração do Commplan.
 *
 * Toda mutação em commplan_rules, commplan_cs_config, commplan_mentorships e
 * commplan_abs_clients deve passar por aqui. Append-only, imutável.
 */

import crypto from 'crypto';
import { query, tableRef, escSql } from './bigquery.js';

/**
 * Registra uma mudança no audit log.
 *
 * @param {object} args
 * @param {string} args.entityType   - 'rule' | 'cs_config' | 'mentorship' | 'abs_client' | 'version' | 'feature'
 * @param {string} args.entityId     - id da entidade alterada (ou chave composta)
 * @param {string} args.action       - 'create' | 'update' | 'delete' | 'activate' | 'deactivate' | 'approve' | 'reject'
 * @param {string} args.changedBy    - email do admin
 * @param {object} [args.before]     - estado anterior (null em create)
 * @param {object} [args.after]      - novo estado (null em delete)
 * @param {string} [args.notes]
 */
export async function logAudit({ entityType, entityId, action, changedBy, before, after, notes }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const sql = `
    INSERT INTO ${tableRef('commplan_audit_log')}
      (id, entity_type, entity_id, action, changed_by, changed_at, before_value, after_value, notes)
    VALUES (
      ${escSql.str(id)},
      ${escSql.str(entityType)},
      ${escSql.str(entityId)},
      ${escSql.str(action)},
      ${escSql.str(changedBy)},
      ${escSql.ts(now)},
      ${escSql.json(before || null)},
      ${escSql.json(after || null)},
      ${escSql.str(notes || null)}
    )
  `;

  try {
    await query(sql);
  } catch (err) {
    // Audit failure não deve quebrar a operação principal — log e continua.
    // (Mas logue forte pra detectar problema na infra.)
    console.error('[audit] failed to log:', err.message, { entityType, entityId, action });
  }
}

/**
 * Lista entradas do audit log com filtros opcionais.
 */
export async function listAudit({ entityType, entityId, changedBy, since, until, limit = 100 } = {}) {
  const where = [];
  const params = {};
  if (entityType) { where.push('entity_type = @entityType'); params.entityType = entityType; }
  if (entityId)   { where.push('entity_id = @entityId');     params.entityId = entityId; }
  if (changedBy)  { where.push('changed_by = @changedBy');   params.changedBy = changedBy; }
  if (since)      { where.push('changed_at >= @since');      params.since = since; }
  if (until)      { where.push('changed_at <= @until');      params.until = until; }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT *
    FROM ${tableRef('commplan_audit_log')}
    ${whereSql}
    ORDER BY changed_at DESC
    LIMIT ${Math.min(parseInt(limit) || 100, 500)}
  `;
  return query(sql, params);
}
