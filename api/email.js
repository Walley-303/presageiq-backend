export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, concept, neighborhood, message } = req.body;
  if (!name || !email || !concept || !neighborhood) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: 'Email service not configured' });

  try {
    // Email to Walley — full submission details
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Presage Consult <onboarding@resend.dev>',
        to: 'walley.research@gmail.com',
        subject: `New Session Request — ${concept} in ${neighborhood}`,
        html: `
          <div style="font-family:monospace;background:#0a0d12;color:#eef1f4;padding:32px;border-radius:8px;max-width:560px;">
            <div style="font-size:18px;font-weight:800;margin-bottom:4px;">New Presage Consult Request</div>
            <div style="font-size:11px;color:#8a9aaa;letter-spacing:2px;text-transform:uppercase;margin-bottom:28px;">Towns & Walley Intelligence</div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #1a2230;color:#8a9aaa;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:140px;">Name</td><td style="padding:10px 0;border-bottom:1px solid #1a2230;font-size:13px;">${name}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #1a2230;color:#8a9aaa;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Email</td><td style="padding:10px 0;border-bottom:1px solid #1a2230;font-size:13px;"><a href="mailto:${email}" style="color:#c8963e;">${email}</a></td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #1a2230;color:#8a9aaa;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Concept</td><td style="padding:10px 0;border-bottom:1px solid #1a2230;font-size:13px;">${concept}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #1a2230;color:#8a9aaa;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Neighborhood</td><td style="padding:10px 0;border-bottom:1px solid #1a2230;font-size:13px;">${neighborhood}</td></tr>
              ${message ? `<tr><td style="padding:10px 0;color:#8a9aaa;font-size:11px;letter-spacing:1px;text-transform:uppercase;vertical-align:top;">Notes</td><td style="padding:10px 0;font-size:13px;line-height:1.6;">${message}</td></tr>` : ''}
            </table>
            <div style="margin-top:24px;padding:16px;background:#0f1319;border:1px solid #1a2230;border-radius:4px;font-size:11px;color:#8a9aaa;line-height:1.6;">
              Reply directly to this email to reach the client at <strong style="color:#c8963e;">${email}</strong>
            </div>
          </div>
        `
      })
    });

    // Confirmation email to client
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Presage Consult <onboarding@resend.dev>',
        to: email,
        subject: 'Your Presage Consult Request — Received',
        html: `
          <div style="font-family:monospace;background:#0a0d12;color:#eef1f4;padding:32px;border-radius:8px;max-width:560px;">
            <div style="font-size:18px;font-weight:800;margin-bottom:4px;">Request Received</div>
            <div style="font-size:11px;color:#8a9aaa;letter-spacing:2px;text-transform:uppercase;margin-bottom:24px;">Presage Consult · Towns & Walley Intelligence</div>
            <p style="font-size:13px;color:#8a9aaa;line-height:1.8;margin-bottom:24px;">Hi ${name} — we've received your session request and will be in touch within 24 hours to confirm details and schedule your session.</p>
            <div style="background:#0f1319;border:1px solid #1a2230;border-radius:6px;padding:20px;margin-bottom:24px;">
              <div style="font-size:9px;color:#3d5060;letter-spacing:2px;text-transform:uppercase;margin-bottom:14px;">Your Request</div>
              <div style="font-size:12px;margin-bottom:8px;"><span style="color:#3d5060;">Concept:</span> &nbsp;${concept}</div>
              <div style="font-size:12px;"><span style="color:#3d5060;">Neighborhood:</span> &nbsp;${neighborhood}</div>
            </div>
            <div style="background:#0f1319;border-left:2px solid #c8963e;padding:14px 18px;font-size:12px;color:#8a9aaa;line-height:1.7;margin-bottom:24px;">
              <strong style="color:#eef1f4;">What happens next:</strong> We'll review your concept against PresageIQ data before we connect, so the full 60 minutes is focused on insight. Session payment is collected at confirmation — nothing is charged until we've spoken.
            </div>
            <div style="font-size:11px;color:#3d5060;line-height:1.6;">
              Questions? Reply directly to this email.<br>
              — Towns & Walley Intelligence · Kansas City
            </div>
          </div>
        `
      })
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    return res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
}
