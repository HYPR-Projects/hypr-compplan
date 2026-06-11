/**
 * lib/email.js — envio de e-mails via SMTP (Gmail).
 *
 * Reusa a mesma config do HYPR Command (EMAIL_USER/EMAIL_PASS).
 * Usado para notificar CSs quando o quarter é aprovado/pago.
 *
 * Init lazy: só conecta ao primeiro envio, não na boot.
 */

import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT || '587');
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    throw new Error('EMAIL_HOST/USER/PASS não configurados — não posso enviar e-mail');
  }

  transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

/** Envia e-mail. Falha não quebra a operação principal — apenas loga.
 *  Se EMAIL_PASS não estiver configurado, retorna silenciosamente
 *  (não loga erro — é estado esperado quando email está desativado).
 */
export async function sendEmail({ to, subject, html, text }) {
  // Sem credencial → desativado, retorna silenciosamente
  if (!process.env.EMAIL_PASS) {
    return { ok: false, skipped: true };
  }
  try {
    const t = getTransporter();
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || 'HYPR Commplan <noreply@hypr.mobi>',
      to, subject, html, text,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[email] erro ao enviar:', err.message);
    return { ok: false, error: err.message };
  }
}

// ─── Templates ───────────────────────────────────────────────────────────

export function templateQuarterApproved({ csName, quarter, bonusGross, bonusNet, salaryDeduction }) {
  const fmtBrl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const subject = `[HYPR Commplan] Bônus aprovado — ${quarter}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; padding: 24px; color: #1a1a1a;">
      <h2 style="color: #2563eb;">Seu bônus do ${quarter} foi aprovado</h2>
      <p>Olá ${csName || 'CS'},</p>
      <p>O cálculo do seu bônus do <strong>${quarter}</strong> foi finalizado e aprovado:</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px 16px 8px 0;">Bônus bruto:</td><td><strong>${fmtBrl(bonusGross)}</strong></td></tr>
        <tr><td style="padding: 8px 16px 8px 0;">Desconto (2× salário):</td><td>${fmtBrl(salaryDeduction)}</td></tr>
        <tr><td style="padding: 8px 16px 8px 0; border-top: 1px solid #e5e7eb;">Bônus líquido:</td>
            <td style="border-top: 1px solid #e5e7eb;"><strong>${fmtBrl(bonusNet)}</strong></td></tr>
      </table>
      <p>Para ver o detalhamento por campanha, acesse <a href="https://commplan.hypr.mobi" style="color: #2563eb;">commplan.hypr.mobi</a>.</p>
      <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">— HYPR Commplan</p>
    </div>
  `;
  const text = `Seu bônus do ${quarter} foi aprovado.\n\nBônus bruto: ${fmtBrl(bonusGross)}\nDesconto: ${fmtBrl(salaryDeduction)}\nBônus líquido: ${fmtBrl(bonusNet)}\n\nVer detalhes em commplan.hypr.mobi`;
  return { subject, html, text };
}

export function templateQuarterPaid({ csName, quarter, bonusNet, paidAt }) {
  const fmtBrl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const subject = `[HYPR Commplan] Bônus pago — ${quarter}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; padding: 24px; color: #1a1a1a;">
      <h2 style="color: #16a34a;">Bônus do ${quarter} marcado como pago</h2>
      <p>Olá ${csName || 'CS'},</p>
      <p>O bônus do <strong>${quarter}</strong> no valor de <strong>${fmtBrl(bonusNet)}</strong> foi marcado como pago.</p>
      <p>Verifique o crédito na sua conta. Em caso de dúvida, fale com a admin.</p>
      <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">— HYPR Commplan</p>
    </div>
  `;
  const text = `Bônus do ${quarter} pago: ${fmtBrl(bonusNet)}.`;
  return { subject, html, text };
}
