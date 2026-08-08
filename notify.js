/**
 * Owner notifications (email)
 * ---------------------------------------------------
 * Sends an email to the business owner the moment a call books, so
 * they actually see the lead instead of it just sitting in a server
 * log nobody's watching.
 *
 * Deliberately built on email + Gmail instead of SMS/Twilio, because
 * sending SMS requires its own separate business verification process
 * with carriers (the same kind of EIN/compliance wait as the voice
 * number) — email has no such requirement and works immediately.
 *
 * If the required environment variables aren't set, notifications are
 * silently skipped — the phone agent still works normally, it just
 * won't email anyone. This means adding notifications later never
 * breaks anything that's already working.
 */

const nodemailer = require('nodemailer');

function isNotifyConfigured() {
  return !!(process.env.NOTIFY_EMAIL_USER && process.env.NOTIFY_EMAIL_APP_PASSWORD);
}

function getOwnerEmail(vertical) {
  const perVertical = process.env[`OWNER_EMAIL_${vertical.toUpperCase()}`];
  return perVertical || process.env.OWNER_EMAIL_DEFAULT || null;
}

let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.NOTIFY_EMAIL_USER,
      pass: process.env.NOTIFY_EMAIL_APP_PASSWORD
    }
  });
  return cachedTransporter;
}

/**
 * Sends the "you got a lead" email. Silently no-ops if either the
 * sending account or a recipient for this vertical isn't configured,
 * so this is always safe to call from saveTicket().
 */
async function notifyOwner(vertical, businessLabel, ticket) {
  if (!isNotifyConfigured()) {
    console.log('[notify] Skipped — NOTIFY_EMAIL_USER / NOTIFY_EMAIL_APP_PASSWORD not set.');
    return null;
  }
  const to = getOwnerEmail(vertical);
  if (!to) {
    console.log(`[notify] Skipped — no OWNER_EMAIL_${vertical.toUpperCase()} or OWNER_EMAIL_DEFAULT set.`);
    return null;
  }

  const rows = Object.entries(ticket)
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;text-transform:capitalize;">${k.replace(/_/g, ' ')}</td><td style="padding:4px 0;font-weight:600;">${v}</td></tr>`)
    .join('');

  const callerName = ticket.name || 'A caller';

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: `"${businessLabel} — AI Front Desk" <${process.env.NOTIFY_EMAIL_USER}>`,
      to,
      subject: `New booking: ${callerName} — ${businessLabel}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px;">
          <h2 style="margin-bottom: 4px;">New call booked</h2>
          <p style="color:#666; margin-top:0;">Your AI front desk agent just captured this while you were away.</p>
          <table style="border-collapse: collapse; margin-top: 12px;">${rows}</table>
        </div>
      `
    });
    console.log(`[notify] Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (e) {
    console.error('[notify] Failed to send email:', e.message);
    return null;
  }
}

module.exports = { notifyOwner, isNotifyConfigured };
