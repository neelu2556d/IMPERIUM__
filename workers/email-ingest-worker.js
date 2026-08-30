/**
 * Vitality inbound-email Worker  (BUILD71)
 * =========================================
 * Cloudflare Email Routing delivers any message sent to  *@in.<yourdomain>  to
 * this Worker. It parses the MIME, then POSTs the parts to Vitality's
 * /api/wearables/email, which reverses the u-<handle>@ address back to a user,
 * runs the Claude extractor on the text, and saves the reading.
 *
 * ── Cloudflare setup ────────────────────────────────────────────────────────
 *  1. Dashboard → your domain → Email → Email Routing → Enable (adds MX records).
 *  2. Workers & Pages → Create → paste this file → Deploy.
 *  3. That Worker → Settings → Variables:
 *       INGEST_URL    = http://localhost:3000/api/wearables/email
 *       INGEST_SECRET = <the same value you set as EMAIL_INGEST_SECRET on Vercel>
 *       (add INGEST_SECRET as an encrypted "Secret", not a plain var)
 *  4. Email Routing → Routing rules → Catch-all → Action: "Send to a Worker" →
 *       pick this Worker. (Or a custom rule for *@in.<domain>.)
 *  5. npm i postal-mime  in the Worker, or add it via the dashboard editor's
 *     "npm" panel — it's the MIME parser used below.
 *
 * No per-email work after this — it just runs.
 */

import PostalMime from 'postal-mime'

export default {
  async email(message, env, ctx) {
    // Parse the raw RFC-822 message into text / html / subject.
    const parsed = await PostalMime.parse(message.raw)

    const payload = {
      to: message.to,                       // u-<handle>@in.<domain>
      from: message.from || parsed.from?.address || null,
      subject: parsed.subject || '',
      text: parsed.text || '',
      html: parsed.html || '',
    }

    const res = await fetch(env.INGEST_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-vitality-ingest-secret': env.INGEST_SECRET,
      },
      body: JSON.stringify(payload),
    })

    // Log the result so failures show in the Worker's tail; never throw (a thrown
    // Worker bounces the email, which we don't want for a transient API blip).
    if (!res.ok) {
      console.error('vitality ingest failed', res.status, await res.text())
    }
  },
}
