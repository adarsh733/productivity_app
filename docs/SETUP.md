# SPEAK — setup, step by step

Everything here is free. Total time: about 35 minutes.

Do the steps in order — step 4 needs values from steps 1–3.

---

## Step 1 — Supabase (10 min)

This is backup only. The app works fully without it; you just have no copy if
the phone dies.

1. Go to **https://supabase.com** → **Start your project** → sign in with GitHub
   or email.
2. **New project.**
   - Name: `speak`
   - Database password: let it generate one, and **save it** — you won't need it
     day to day, but you cannot recover it later.
   - Region: **South Asia (Mumbai)** — closest to you.
   - Plan: **Free**.
3. Wait ~2 minutes while it provisions.
4. Left sidebar → **SQL Editor** → **New query**.
5. Open `speak/supabase/schema.sql` on your machine, copy the **entire** file,
   paste it into the editor, and press **Run**.
   - Expect: *Success. No rows returned.* That's correct — it creates tables, it
     doesn't select anything.
   - To confirm: sidebar → **Table Editor**. You should see six tables:
     `profile`, `cards`, `reviews`, `events`, `days`, `inbox`.
6. Sidebar → **Project Settings** (gear) → **API**. Copy and keep two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon / public** key — a long string starting `eyJ…`

> The anon key is *meant* to be public — it ships in the browser bundle. What
> protects your data is the row-level security in `schema.sql`, which grants
> nothing to unauthenticated users. Do **not** copy the `service_role` key
> anywhere; that one bypasses all of it.

---

## Step 2 — Gemini key (3 min)

1. Go to **https://aistudio.google.com/apikey** and sign in with your Google
   account.
2. **Create API key** → choose the Google Cloud project it offers (or let it
   create one).
3. Copy the key. Keep it somewhere safe for step 4.

Free tier, no card required. Nothing in Phase 0 calls it — you're setting it up
now so Phase 1 has a proven path.

---

## Step 3 — Groq key (3 min)

This is the backup provider, so one exhausted quota can't take the app down.

1. Go to **https://console.groq.com/keys** → sign in with Google or GitHub.
2. **Create API Key** → name it `speak`.
3. Copy it immediately — Groq shows it **once** and never again.

---

## Step 4 — Netlify (15 min)

### 4a. Put the code on GitHub

The repo already exists locally at `speak/` with two commits. It needs to be on
GitHub for Netlify to build it.

1. Go to **https://github.com/new**.
   - Repository name: `speak`
   - **Private** ← choose this
   - Do **not** add a README, .gitignore or licence — the repo already has them.
2. Run these two commands, replacing `YOUR-USERNAME`:

```bash
cd "D:\Adarsh\Mission AI\Productivity\speak" && git remote add origin https://github.com/YOUR-USERNAME/speak.git
```

```bash
cd "D:\Adarsh\Mission AI\Productivity\speak" && git branch -M main && git push -u origin main
```

### 4b. Connect Netlify

1. Go to **https://app.netlify.com** → sign up **with GitHub** (this makes the
   next step one click).
2. **Add new site** → **Import an existing project** → **GitHub** → authorise →
   pick `speak`.
3. Build settings — Netlify should read these from `netlify.toml` already.
   Confirm they say:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. **Before deploying**, click **Add environment variables** and add all four:

   | Key | Value | Notes |
   |---|---|---|
   | `VITE_SUPABASE_URL` | your Project URL from step 1 | |
   | `VITE_SUPABASE_ANON_KEY` | your anon key from step 1 | |
   | `GEMINI_API_KEY` | your key from step 2 | **no** `VITE_` prefix |
   | `GROQ_API_KEY` | your key from step 3 | **no** `VITE_` prefix |

   > The `VITE_` prefix is not decoration. Vite inlines every `VITE_` variable
   > into the JavaScript that ships to the browser. Putting it on the Gemini or
   > Groq key would publish that key to anyone who opens devtools, and the free
   > quota would be gone within a day. The two without the prefix are readable
   > only by the Netlify Function.

5. **Deploy site.** First build takes ~2 minutes.
6. **Site configuration → Change site name** → set something like
   `adarsh-speak`. Your URL becomes `https://adarsh-speak.netlify.app`.

### 4c. Check the function deployed

Open this in any browser, replacing the domain:

`https://adarsh-speak.netlify.app/.netlify/functions/ai`

You should see `{"ok":false,"error":"POST only"}`. That is the **correct**
answer — it means the function is live and refusing a GET. A 404 means the
functions directory didn't get picked up; tell me and I'll look.

---

## Step 5 — Install it on your phone (2 min)

1. Open **Safari** on the iPhone (it must be Safari — Chrome on iOS can't
   install a PWA) and go to your Netlify URL.
2. Tap the **Share** button → scroll → **Add to Home Screen** → **Add**.
3. Open it from the home screen icon. It should be full-screen with no browser
   bar.

### Then do the part that actually matters

Put the SPEAK icon **exactly where Instagram is now** — same page, same
position, same spot your thumb goes without looking. Move Instagram to page
three, inside a folder.

The app is designed to win the four seconds after you unlock the phone. It
cannot do that from page two. This step is not optional decoration; it is the
feature.

---

## What you'll see on day one

- It opens straight into a card. No menu, no dashboard.
- **Core 3** — one breath drill, one say-it line, one word. About three minutes.
  This and only this is what the streak counts, so a bad day still counts.
- Then **Keep going** into an endless queue that never shows a "you're done"
  screen.
- **Swipe up** on a card to pass it. Buttons for again / hard / good / easy.
- **"Felt the pull"** — tap it every time you catch yourself reaching for
  Instagram. That counter is on the You tab and it is the real scoreboard.
- **Inbox** — one box. Dump anything, any time. It becomes cards in Phase 2.
- **हिंदी** — 40 cards, separate from the feed, as you asked.

Say every card out loud. A card answered silently is a card wasted — 315 of the
370 are speaking drills.

---

## Troubleshooting

**Build fails on Netlify.** Open the deploy log, copy the last 20 lines, send
them to me.

**The app opens but is empty.** Open Safari → Settings → check that content
blockers aren't blocking local storage. Failing that, delete the home-screen
icon and re-add it.

**"Local only — no backup configured" on the You tab.** The two `VITE_` variables
didn't reach the build. Add them in Netlify, then **Deploys → Trigger deploy →
Clear cache and deploy site** — environment variables are read at build time,
so an existing deploy won't pick them up.

**Function returns 404.** Check that `netlify/functions/ai.ts` is in the pushed
repo (`git ls-files netlify`).

---

## What is deliberately not working yet

- **No microphone.** Speaking cards are spoken and self-graded. Measurement —
  pace, volume, pause detection, real breath numbers — is Phase 1.
- **No AI.** The proxy is deployed but nothing calls it. Inbox items sit as raw
  text until the Phase 2 classifier.
- **No sign-in.** Sync is wired but there's no sign-in button yet, so everything
  is on the device. Don't clear Safari's website data for the site.
