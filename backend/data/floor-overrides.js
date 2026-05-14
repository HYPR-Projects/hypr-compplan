import { query, tableRef } from '../lib/bigquery.js';

export async function getFloorOverride({ csEmail, quarter }) {
  const sql = `
    SELECT months_off, note, updated_at, updated_by
    FROM ${tableRef('commplan_floor_overrides')}
    WHERE LOWER(cs_email) = LOWER(@cs) AND quarter = @q
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  const rows = await query(sql, { cs: csEmail, q: quarter });
  return rows[0] || null;
}

export async function setFloorOverride({ csEmail, quarter, monthsOff, note, byEmail }) {
  if (![0, 1, 2].includes(monthsOff)) {
    throw new Error('monthsOff deve ser 0, 1 ou 2');
  }
  await query(
    `DELETE FROM ${tableRef('commplan_floor_overrides')}
     WHERE LOWER(cs_email) = LOWER(@cs) AND quarter = @q`,
    { cs: csEmail, q: quarter }
  );
  await query(
    `INSERT INTO ${tableRef('commplan_floor_overrides')}
       (cs_email, quarter, months_off, note, updated_at, updated_by)
     VALUES (LOWER(@cs), @q, @m, @n, CURRENT_TIMESTAMP(), @by)`,
    { cs: csEmail, q: quarter, m: monthsOff, n: note || null, by: byEmail || null }
  );
}
