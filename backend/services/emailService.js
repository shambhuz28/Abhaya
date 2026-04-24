const nodemailer = require('nodemailer');
const dns = require('dns');
const net = require('net');

const DEFAULT_RECIPIENTS = [
  'khataleharshad26@gmail.com',
  'madanrajsagar83@gmail.com',
  'gaikwadshambhu24@gmail.com',
  'ameymohite2006@gmail.com',
];

const safeText = (value, fallback = 'N/A') => {
  const str = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return str ? str : fallback;
};

const pickFirstVideoEvidenceUrl = (report) => {
  const evidence = Array.isArray(report?.evidence) ? report.evidence : [];
  const video = evidence.find((item) => item?.type === 'video' && item?.url);
  if (video?.url) return String(video.url).trim();
  const anyWithUrl = evidence.find((item) => item?.url);
  return anyWithUrl?.url ? String(anyWithUrl.url).trim() : '';
};

const buildEmergencyEmailBodyFromReport = (report) => {
  const incidentId = safeText(report?.incidentId, 'N/A');
  const createdAt = safeText(report?.createdAt, new Date().toISOString());
  const status = safeText(report?.status, 'N/A');
  const triggerType = safeText(report?.trigger?.type, 'N/A');
  const riskScore = safeText(report?.trigger?.riskScore, 'N/A');
  const locationAddress = safeText(report?.location?.address, 'N/A');
  const videoUrl = safeText(pickFirstVideoEvidenceUrl(report), 'N/A');

  return [
    'Emergency Alert!',
    '',
    `Incident ID: ${incidentId}`,
    `Time: ${createdAt}`,
    `Status: ${status}`,
    `Trigger: ${triggerType}`,
    `Risk Score: ${riskScore}`,
    `Location: ${locationAddress}`,
    '',
    'Video Evidence:',
    videoUrl,
    '',
  ].join('\n');
};

const parseBoolean = (value) => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
};

const resolveHostForSmtp = async (host) => {
  const cleanHost = String(host || '').trim();
  if (!cleanHost) return { connectHost: '', servername: false };

  if (net.isIP(cleanHost)) {
    return { connectHost: cleanHost, servername: false };
  }

  try {
    // Use OS resolver (dns.lookup) to avoid c-ares DNS issues that can cause
    // `dns.resolve4()` timeouts on some Windows setups.
    const res = await dns.promises.lookup(cleanHost, { family: 4 });
    return { connectHost: res?.address || cleanHost, servername: cleanHost };
  } catch (e) {
    const servers = (() => {
      try {
        return dns.getServers();
      } catch {
        return [];
      }
    })();
    const message =
      e?.message ||
      `Failed to resolve SMTP host "${cleanHost}". DNS servers: ${servers.length ? servers.join(', ') : 'unknown'}`;
    return { error: message, connectHost: '', servername: false };
  }
};

const createGmailTransporter = async () => {
  const user = String(process.env.EMAIL_USER || '').trim();
  const pass = String(process.env.EMAIL_PASS || '').trim();

  if (!user) return { ok: false, error: 'EMAIL_USER is missing in backend/.env.' };
  if (!pass) return { ok: false, error: 'EMAIL_PASS is missing in backend/.env.' };

  const smtpHost = String(process.env.EMAIL_HOST || 'smtp.gmail.com').trim();
  const smtpPort = Number(process.env.EMAIL_PORT || 465);
  const secureFromEnv = parseBoolean(process.env.EMAIL_SECURE);
  const smtpSecure = typeof secureFromEnv === 'boolean' ? secureFromEnv : smtpPort === 465;

  const resolved = await resolveHostForSmtp(smtpHost);
  if (resolved?.error) return { ok: false, error: resolved.error };
  if (!resolved?.connectHost) return { ok: false, error: `SMTP host "${smtpHost}" is invalid.` };

  // EMAIL_PASS must be a Gmail App Password (not your normal Gmail password).
  // Using an IP (resolved via dns.lookup) avoids Nodemailer's c-ares resolve4/6 path that can timeout.
  const transporter = nodemailer.createTransport({
    host: resolved.connectHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user, pass },
    ...(resolved.servername
      ? {
          tls: {
            servername: resolved.servername,
          },
        }
      : {}),
  });

  return { ok: true, transporter, user };
};

const sendEmergencyEmail = async (report, recipients = DEFAULT_RECIPIENTS) => {
  const transportResult = await createGmailTransporter();
  if (!transportResult.ok) return { success: false, error: transportResult.error };

  const toList = Array.isArray(recipients) ? recipients : DEFAULT_RECIPIENTS;
  const cleanRecipients = toList.map((r) => String(r || '').trim()).filter(Boolean);
  if (!cleanRecipients.length) {
    return { success: false, error: 'No email recipients configured.' };
  }

  const subject = '🚨 Emergency Alert - Abhaya';
  const text = buildEmergencyEmailBodyFromReport(report || {});

  console.log('[email] sending emergency email', {
    incidentId: report?.incidentId,
    recipients: cleanRecipients,
  });

  try {
    const info = await transportResult.transporter.sendMail({
      from: transportResult.user,
      to: cleanRecipients.join(', '),
      subject,
      text,
    });

    console.log('[email] sendMail success', {
      messageId: info?.messageId,
      accepted: info?.accepted,
      rejected: info?.rejected,
      response: info?.response,
    });

    return { success: true, info };
  } catch (e) {
    console.warn('[email] sendMail failed', {
      message: e?.message || String(e || 'Email send failed.'),
      code: e?.code,
      response: e?.response,
      responseCode: e?.responseCode,
      command: e?.command,
    });
    return { success: false, error: e?.message || 'Failed to send emergency email.' };
  }
};

module.exports = {
  DEFAULT_RECIPIENTS,
  sendEmergencyEmail,
  buildEmergencyEmailBodyFromReport,
};
