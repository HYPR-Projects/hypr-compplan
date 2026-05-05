/**
 * data/team-members.js — gerencia hypr_sales_center.team_members.
 *
 * team_members é uma tabela COMPARTILHADA com o HYPR Command — fica no
 * dataset hypr_sales_center, NÃO no hypr_commplan. Razão: quando o admin
 * do Commplan adiciona um CS, ele precisa aparecer no Command imediatamente
 * (dropdown de CP em formulários). Ter duas tabelas separadas exigiria
 * duplicação manual.
 *
 * Padrão: Commplan tem WRITE access ao hypr_sales_center.team_members
 * via SA permissions (BQ Data Editor no dataset). Cross-dataset write
 * tem mesma latência que same-dataset.
 *
 * O Commplan usa pra:
 *   - decidir role no login (admin vs cs)
 *   - manter nome/email canônico do CS
 *   - origem da lista de CSs no admin
 *
 * Formato do nome canônico: "Primeiro Sobrenome" (ex: "João Buzolin").
 */

import { query, sourceTableRef, escSql, TTLCache } from '../lib/bigquery.js';

const cache = new TTLCache(2 * 60_000); // 2min

/** Lista todos os membros (CSs + admins). */
export async function listAllMembers({ activeOnly = true, role = null } = {}) {
  const cacheKey = `members:${activeOnly}:${role || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  const where = [];
  const params = {};
  if (activeOnly) where.push('active = TRUE');
  if (role)       { where.push('role = @role'); params.role = role; }

  const sql = `
    SELECT email, name, role, added_by, added_at, active
    FROM ${sourceTableRef('team_members')}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY name
  `;
  const rows = await query(sql, params);
  cache.set(cacheKey, rows);
  return rows;
}

export async function getMemberByEmail(email) {
  const rows = await query(
    `SELECT email, name, role, added_by, added_at, active
     FROM ${sourceTableRef('team_members')}
     WHERE LOWER(email) = LOWER(@e) LIMIT 1`,
    { e: email }
  );
  return rows[0] || null;
}

/**
 * Adiciona ou atualiza membro.
 *
 * Idempotente: se o e-mail já existe, atualiza (UPDATE). Senão, INSERT.
 * Padrão upsert é seguro porque team_members é tabela pequena (~20 linhas).
 */
export async function upsertMember({ email, name, role = 'cs', addedBy }) {
  const emailLower = email.toLowerCase();
  const existing = await getMemberByEmail(emailLower);

  if (existing) {
    const sql = `
      UPDATE ${sourceTableRef('team_members')}
      SET name = ${escSql.str(name)},
          role = ${escSql.str(role)},
          active = TRUE
      WHERE LOWER(email) = LOWER(@e)
    `;
    await query(sql, { e: emailLower });
    cache.clear();
    return { updated: true, email: emailLower };
  }

  const sql = `
    INSERT INTO ${sourceTableRef('team_members')}
      (email, name, role, added_by, added_at, active)
    VALUES (
      ${escSql.str(emailLower)},
      ${escSql.str(name)},
      ${escSql.str(role)},
      ${escSql.str(addedBy || 'system')},
      CURRENT_TIMESTAMP(),
      TRUE
    )
  `;
  await query(sql);
  cache.clear();
  return { created: true, email: emailLower };
}

/** Desativa membro (soft delete — preserva histórico). */
export async function deactivateMember(email) {
  await query(
    `UPDATE ${sourceTableRef('team_members')}
     SET active = FALSE
     WHERE LOWER(email) = LOWER(@e)`,
    { e: email }
  );
  cache.clear();
}

/** Promove a admin (ou rebaixa pra cs). */
export async function setRole(email, role) {
  if (!['admin', 'cs'].includes(role)) {
    throw new Error(`role inválido: ${role}`);
  }
  await query(
    `UPDATE ${sourceTableRef('team_members')}
     SET role = ${escSql.str(role)}
     WHERE LOWER(email) = LOWER(@e)`,
    { e: email }
  );
  cache.clear();
}

export function invalidateMembersCache() { cache.clear(); }
