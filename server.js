/**
 * QuickQuote Backend
 * ---------------------------------------------------
 * A small, dedicated server for QuickQuote only. Two jobs:
 *
 * 1. /api/claude — lets the app generate quotes and captions without
 *    the customer ever needing their own Anthropic API key. The app
 *    calls this server, this server holds the real key and forwards
 *    the request to Claude.
 *
 * 2. /webhook/stripe — fires whenever someone actually pays. Emails
 *    you (the owner) so every paid signup lands in your inbox as a
 *    real record, not just buried in Stripe's dashboard.
 *
 * Nothing here is related to phone calls, Twilio, or any other
 * project — this is QuickQuote's own dedicated server.
 */

const express = require('express');
const bodyParser = require('body-parser');
const { notifyOwner } = require('./notify');

const app = express();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------
// Stripe webhook — MUST be registered before the global JSON parser
// below, since Stripe's signature check needs the exact raw,
// unparsed request body.
// ---------------------------------------------------
app.post('/webhook/stripe', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.log('[stripe webhook] STRIPE_WEBHOOK_SECRET not set — ignoring.');
    return res.status(200).send('Webhook not configured.');
  }

  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || '');
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.error('[stripe webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email || 'unknown email';
    const amount = session.amount_total ? (session.amount_total / 100).toFixed(2) : 'unknown amount';
    console.log(`\n=== NEW PAID SIGNUP ===\n${customerEmail} — $${amount}\n=======================\n`);

    try {
      await notifyOwner('signup', 'QuickQuote', {
        name: customerEmail,
        phone: '',
        reason: `New paid signup — $${amount}`,
        time: new Date().toLocaleString()
      });
    } catch (e) {
      console.error('[stripe webhook] Failed to send notification email:', e.message);
    }
  }

  res.status(200).send('OK');
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ---------------------------------------------------
// Claude proxy — the app calls this instead of api.anthropic.com
// directly, so customers never need their own API key. CORS is open
// (*) since this is called from a public static site (GitHub Pages)
// with no login system of its own.
// ---------------------------------------------------
app.options('/api/claude', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

app.post('/api/claude', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: 'Server is not configured with an Anthropic API key.' } });
  }

  const { system, messages, max_tokens } = req.body || {};
  if (!messages) {
    return res.status(400).json({ error: { message: 'Missing "messages" in request body.' } });
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 2500,
        system,
        messages
      })
    });
    const data = await anthropicRes.json();
    res.status(anthropicRes.status).json(data);
  } catch (e) {
    console.error('[api/claude] Request failed:', e.message);
    res.status(500).json({ error: { message: 'Proxy request failed.' } });
  }
});

app.get('/', (req, res) => {
  res.send('QuickQuote backend is running. Endpoints: POST /api/claude, POST /webhook/stripe.');
});

app.listen(PORT, () => {
  console.log(`QuickQuote backend listening on port ${PORT}`);
});
