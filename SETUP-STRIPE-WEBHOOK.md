# Access code + signup tracking — setup guide

Two pieces, both needed to actually enforce "you must pay to use this."

---

## Part 1 — The access code gate (already live in the app)

`quickquote_app.html` now shows a lock screen before anything else loads. The customer types a code, and if it matches, the app unlocks and stays unlocked on that device going forward.

### Set your real code
1. Open `quickquote_app.html`
2. Find this line near the top of the `<script>` section:
   ```javascript
   const ACCESS_CODE = 'QUOTE2026';
   ```
3. Change `'QUOTE2026'` to whatever code you want to use
4. Re-upload the file to GitHub / wherever you're hosting the app

### Show that code to customers automatically after they pay
1. Go to your Stripe Payment Link (dashboard.stripe.com → Payment Links → click your link → Edit)
2. Look for **"After payment"** settings
3. Choose **"Show confirmation page"** and customize the message to say something like:
   *"Thank you! Your access code is: **QUOTE2026** — go to [your app link] to get started."*
4. Save

Now the whole loop is self-serve: customer pays → Stripe shows them the code → they unlock the app themselves. You don't have to manually message anyone the code.

### The honest limitation
This is **one shared code for everyone**, not a unique login per customer — there's no real account system here. That's a deliberate simplification: building actual per-user accounts (sign-up, login, password reset, sessions) is a much bigger project than an MVP needs. The tradeoff is that if a paying customer shares the code with someone else, there's nothing technically stopping that. For a first product with a handful of clients, this is a reasonable and common approach — most small tools start exactly this way and add real accounts later once it's worth the engineering time.

---

## Part 2 — Getting notified every time someone actually pays

This is the "keep a record" half — a webhook that emails you the moment a real payment completes, reusing the same email notification system already built for the phone agent.

### Step A — Get your Stripe keys
1. Go to **dashboard.stripe.com/apikeys**
2. Copy your **Secret key** (starts with `sk_live_...` for real payments, or `sk_test_...` if you're still testing)

### Step B — Add the webhook in Stripe
1. Go to **dashboard.stripe.com/webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `https://your-railway-url.up.railway.app/webhook/stripe`
4. Under "Select events," choose **checkout.session.completed**
5. Click **Add endpoint**
6. Click into the endpoint you just created, find **Signing secret**, click **Reveal**, copy it (starts with `whsec_...`)

### Step C — Add both values to Railway
In your Railway service's **Variables** tab, add:
```
STRIPE_SECRET_KEY=sk_live_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
```

You should already have `NOTIFY_EMAIL_USER`, `NOTIFY_EMAIL_APP_PASSWORD`, and `OWNER_EMAIL_DEFAULT` set from the phone agent's email notification setup — if so, this reuses those same values automatically. If not, see `SETUP-NOTIFICATIONS.md` first.

### Step D — Push and redeploy
Push the updated `server.js` and `package.json` to GitHub. Railway redeploys automatically.

### Step E — Test it
1. Go through your own Stripe payment link and pay yourself (Stripe lets you refund it after — or use a test-mode link while confirming this works, then switch to the live key once verified)
2. Check the inbox set as `OWNER_EMAIL_DEFAULT` — an email should land within a few seconds with the customer's email and payment amount

---

## What you get once both parts are set up

- A customer can't use the app without a valid code
- The moment someone actually pays, you get an email with their info — a real, searchable record of every signup, sitting in your inbox
- No database, no accounts system, no new paid signups beyond Stripe (which you already have) — everything reuses infrastructure that already exists
