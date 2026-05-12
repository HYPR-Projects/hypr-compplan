/**
 * routes/admin/team-members.js — gestão de CSs e admins.
 *
 * Endpoints:
 *   GET  /commplan/admin/team-members?role=cs|admin   lista
 *   GET  /commplan/admin/team-members/:email          detalhe (com salário)
 *   POST /commplan/admin/team-members                 cria CS completo (member + salário)
 *   PUT  /commplan/admin/team-members/:email          edita nome/role
 *   PUT  /commplan/admin/team-members/:email/role     promove/rebaixa
 *   DEL  /commplan/admin/team-members/:email          desativa
 *
 * "Cria CS completo" significa:
 *   1. Insere/atualiza em hypr_sales_center.team_members (compartilhado com
 *      o Command — vai aparecer nos dropdowns de CS lá automaticamente).
 *   2. Cria entry em commplan_cs_config com salário fixo informado.
 *   3. Loga ambos no audit log.
 *
 * Por que não exigir salário? Pode ser que o admin queira só registrar o
 * email primeiro e definir salário depois — então salário é OPCIONAL no
 * POST. Sem salário, o cálculo de bônus do CS desconta R$0 (até definir).
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { logAudit } from '../../lib/audit.js';
import {
  listAllMembers, getMemberByEmail, upsertMember,
  deactivateMember, setRole,
} from '../../data/team-members.js';
import {
  getSalaryForCs, setSalary, getSalaryHistory,
} from '../../data/cs-config.js';

export const router = Router();
router.use(authRequired, adminRequired);

/** GET /commplan/admin/team-members?role=cs */
router.get('/', async (req, res) => {
  try {
    const role = req.query.role || null;
    const activeOnly = req.query.active !== 'false';
    const members = await listAllMembers({ activeOnly, role });

    // Opcionalmente enriquece com salário vigente
    if (req.query.with_salary === 'true') {
      const enriched = await Promise.all(members.map(async (m) => {
        if (m.role !== 'cs') return m;
        const salary = await getSalaryForCs({ csEmail: m.email });
        return { ...m, current_salary: salary?.fixed_salary_brl || null };
      }));
      return res.json({ count: enriched.length, items: enriched });
    }

    res.json({ count: members.length, items: members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /commplan/admin/team-members/:email — detalhe completo do CS */
router.get('/:email', async (req, res) => {
  try {
    const member = await getMemberByEmail(req.params.email);
    if (!member) return res.status(404).json({ error: 'membro não encontrado' });

    const result = { ...member };
    if (member.role === 'cs') {
      result.current_salary = await getSalaryForCs({ csEmail: member.email });
      result.salary_history = await getSalaryHistory(member.email);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /commplan/admin/team-members
 *
 * Body:
 *   {
 *     email: 'nova.cs@hypr.mobi',
 *     name: 'Nova CS',
 *     role: 'cs' | 'admin' (default 'cs'),
 *     fixed_salary_brl?: 12000.00,    // só pra role='cs'
 *     effective_from?: '2026-01-01',  // padrão: hoje
 *     notes?: '...'
 *   }
 *
 * Validações:
 *   - email termina em @hypr.mobi (mesma regra do login)
 *   - se role='cs' e salário fornecido, effective_from obrigatório
 *
 * Retorno:
 *   { ok: true, email, created: bool, salary_set: bool }
 */
router.post('/', async (req, res) => {
  try {
    const { email, name, role = 'cs', fixed_salary_brl, effective_from, notes } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'email e name obrigatórios' });
    }
    if (!email.toLowerCase().endsWith('@hypr.mobi')) {
      return res.status(400).json({ error: 'email deve terminar em @hypr.mobi' });
    }
    if (!['cs', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role deve ser "cs" ou "admin"' });
    }

    // ── 1. Upsert em team_members ────────────────────────────────────────
    const before = await getMemberByEmail(email);
    const memberResult = await upsertMember({
      email, name, role,
      addedBy: req.user.email,
    });
    const after = await getMemberByEmail(email);

    await logAudit({
      entityType: 'team_member',
      entityId: email.toLowerCase(),
      action: memberResult.created ? 'create' : 'update',
      changedBy: req.user.email,
      before, after,
      notes,
    });

    // ── 2. Se for CS e veio salário, cria/atualiza commplan_cs_config ───
    let salarySet = false;
    if (role === 'cs' && fixed_salary_brl != null) {
      const fromDate = effective_from || new Date().toISOString().slice(0, 10);
      const beforeSalary = await getSalaryForCs({ csEmail: email, asOfDate: fromDate });

      await setSalary({
        csEmail: email,
        fixedSalaryBrl: fixed_salary_brl,
        effectiveFrom: fromDate,
        notes: notes || `Definido junto com criação do CS por ${req.user.email}`,
        updatedBy: req.user.email,
      });
      const afterSalary = await getSalaryForCs({ csEmail: email, asOfDate: fromDate });

      await logAudit({
        entityType: 'cs_config',
        entityId: email.toLowerCase(),
        action: beforeSalary ? 'update' : 'create',
        changedBy: req.user.email,
        before: beforeSalary, after: afterSalary,
      });
      salarySet = true;
    }

    res.status(201).json({
      ok: true,
      email: email.toLowerCase(),
      created: !!memberResult.created,
      salary_set: salarySet,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** PUT /commplan/admin/team-members/:email — edita nome/role/salário */
router.put('/:email', async (req, res) => {
  try {
    const before = await getMemberByEmail(req.params.email);
    if (!before) return res.status(404).json({ error: 'membro não encontrado' });

    const { name, role, fixed_salary_brl, effective_from, notes } = req.body;

    // 1. Atualiza nome/role
    await upsertMember({
      email: req.params.email,
      name: name || before.name,
      role: role || before.role,
      addedBy: before.added_by,
    });
    const after = await getMemberByEmail(req.params.email);

    await logAudit({
      entityType: 'team_member',
      entityId: req.params.email.toLowerCase(),
      action: 'update',
      changedBy: req.user.email,
      before, after,
    });

    // 2. Se for CS e veio salário, atualiza/cria em commplan_cs_config
    let salaryUpdated = false;
    const effectiveRole = role || before.role;
    if (effectiveRole === 'cs' && fixed_salary_brl != null && fixed_salary_brl !== '') {
      const fromDate = effective_from || new Date().toISOString().slice(0, 10);
      const beforeSalary = await getSalaryForCs({ csEmail: req.params.email, asOfDate: fromDate });

      // Só atualiza se o valor mudou
      const newValue = Number(fixed_salary_brl);
      const oldValue = Number(beforeSalary?.fixed_salary_brl) || 0;
      if (oldValue !== newValue) {
        await setSalary({
          csEmail: req.params.email,
          fixedSalaryBrl: newValue,
          effectiveFrom: fromDate,
          notes: notes || `Atualizado via /admin/time por ${req.user.email}`,
          updatedBy: req.user.email,
        });
        const afterSalary = await getSalaryForCs({ csEmail: req.params.email, asOfDate: fromDate });

        await logAudit({
          entityType: 'cs_config',
          entityId: req.params.email.toLowerCase(),
          action: beforeSalary ? 'update' : 'create',
          changedBy: req.user.email,
          before: beforeSalary, after: afterSalary,
        });
        salaryUpdated = true;
      }
    }

    res.json({ ok: true, item: after, salary_updated: salaryUpdated });
  } catch (err) {
    console.error('PUT /admin/team-members error:', err);
    res.status(400).json({ error: err.message });
  }
});

/** PUT /commplan/admin/team-members/:email/role — promove/rebaixa */
router.put('/:email/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['cs', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role deve ser "cs" ou "admin"' });
    }
    const before = await getMemberByEmail(req.params.email);
    if (!before) return res.status(404).json({ error: 'membro não encontrado' });

    await setRole(req.params.email, role);
    const after = await getMemberByEmail(req.params.email);

    await logAudit({
      entityType: 'team_member',
      entityId: req.params.email.toLowerCase(),
      action: role === 'admin' ? 'promote' : 'demote',
      changedBy: req.user.email,
      before, after,
    });

    res.json({ ok: true, item: after });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** DELETE /commplan/admin/team-members/:email — soft delete */
router.delete('/:email', async (req, res) => {
  try {
    const before = await getMemberByEmail(req.params.email);
    if (!before) return res.status(404).json({ error: 'membro não encontrado' });

    await deactivateMember(req.params.email);

    await logAudit({
      entityType: 'team_member',
      entityId: req.params.email.toLowerCase(),
      action: 'deactivate',
      changedBy: req.user.email,
      before,
      after: { ...before, active: false },
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
