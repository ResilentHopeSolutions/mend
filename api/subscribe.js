// api/subscribe.js  (CommonJS — works on Vercel with no package.json / no framework)
// Receives a signup from the Mend form and adds the person to your Brevo list.
// Your Brevo REST API key stays secret on the server (never in the browser).
//
// REQUIRED Vercel environment variables (Project -> Settings -> Environment Variables):
//   BREVO_API_KEY   - Brevo -> top-right menu -> "SMTP & API" -> "API Keys" (starts with xkeysib-)
//   BREVO_LIST_ID   - Brevo -> Contacts -> Lists (the number shown for your list)
//
// OPTIONAL (enables an instant welcome email on signup):
//   BREVO_SENDER_EMAIL - a sender you've verified in Brevo
//   BREVO_SENDER_NAME  - e.g. "Mend"

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};
  const email = (body.email || '').trim();
  const firstName = (body.firstName || '').trim();
  const phase = (body.phase || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const listId = parseInt(process.env.BREVO_LIST_ID, 10);
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing BREVO_API_KEY (check the name/scope in Vercel, then redeploy).' });
  }
  if (!listId) {
    return res.status(500).json({ error: 'Server is missing or invalid BREVO_LIST_ID - it must be the NUMERIC list id from Brevo, then redeploy.' });
  }

  try {
    const contactRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        email,
        attributes: { FIRSTNAME: firstName, RECOVERY_PHASE: phase },
        listIds: [listId],
        updateEnabled: true,
      }),
    });

    if (![200, 201, 204].includes(contactRes.status)) {
      const detail = await contactRes.json().catch(() => ({}));
      console.error('Brevo contacts error:', contactRes.status, detail);
      return res.status(502).json({ error: 'We could not save your signup just now.' });
    }

    if (process.env.BREVO_SENDER_EMAIL) {
      const hello = firstName ? ('Hi ' + firstName + ',') : 'Hi there,';
      try {
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify({
            sender: {
              email: process.env.BREVO_SENDER_EMAIL,
              name: process.env.BREVO_SENDER_NAME || 'Mend',
            },
            to: [{ email: email, name: firstName || undefined }],
            subject: 'You did the hard part. Now we heal together.',
            htmlContent:
              '<div style="font-family:Georgia,serif;color:#2A2620;max-width:560px;margin:0 auto;line-height:1.6">' +
              '<h2 style="color:#1F3D32">Welcome to Mend</h2>' +
              '<p>' + hello + '</p>' +
              "<p>If you're reading this fresh out of surgery: take a breath. The hardest single step — the repair itself — is behind you.</p>" +
              '<p><b>Rest is not doing nothing. It\'s the most important thing you\'ll do all week.</b> Your tendon is already at work while you lie still.</p>' +
              '<p>Today, that\'s the whole assignment: get comfortable, keep your foot elevated with toes above your nose, keep water and snacks in reach, and let people help you.</p>' +
              "<p>We'll be here each day with one small, doable thing and a little encouragement. Slow and steady — together.</p>" +
              "<p style='margin-top:24px'>You've got this,<br/>The Mend community</p>" +
              "<hr style='border:none;border-top:1px solid #E4DCCD;margin:24px 0'/>" +
              "<p style='font-size:12px;color:#7C7468'>Mend is peer support and education, not medical advice. Always follow your own surgeon's and physical therapist's instructions. Seek prompt care for sudden severe pain, calf swelling or redness, or shortness of breath.</p>" +
              '</div>',
          }),
        });
      } catch (mailErr) {
        console.error('Welcome email error (non-blocking):', mailErr);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return res.status(500).json({ error: 'Something went wrong on our end.' });
  }
};
