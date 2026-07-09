# PlanPal – Setup

Stack: Next.js 14 (App Router) · Supabase (Postgres + Auth) · Resend (email) · Vercel (hosting) · PWA.

## 1. Supabase

1. Create a project at https://supabase.com (region: `eu-north-1` Stockholm is closest for Finland).
2. Open **SQL Editor** → run every file in `supabase/migrations/` in numeric order (`0001_init.sql`, `0002_calendar_sync.sql`, … `0008_event_location_coords.sql`).
3. **Authentication → Providers → Email**: make sure Email is enabled. Magic link works out of the box.
   - Set **Email OTP length** to **6** — the sign-in screen accepts exactly 6 digits (local dev already uses `otp_length = 6` in `supabase/config.toml`). A project configured to send 8-digit codes will fail to verify here.
   - The **Magic Link** email template must contain `{{ .Token }}` so the code is included alongside the link.
4. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (switch to the Vercel domain later)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://YOUR-APP.vercel.app/auth/callback`
5. **Project Settings → API**: copy (skip if using the Vercel Supabase integration – see step 4 – which sets these for you)
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secret, never in client code)

> **Free tier note:** Supabase pauses free projects after 7 days of inactivity. A cron ping (e.g. a Vercel Cron running a select) keeps it awake.

## 2. Resend

Resend has no Vercel integration here – `RESEND_API_KEY` / `RESEND_FROM` are added by hand, scoped per Vercel environment.

1. Create an account at https://resend.com → **API Keys** → create a key.
2. For real invitations: **Domains** → add your own domain → add the DNS records (SPF/DKIM) → this unlocks sending to arbitrary recipients.
3. In Vercel → **Settings → Environment Variables**, add both vars per environment:
   - **Production**: `RESEND_API_KEY` (your key) + `RESEND_FROM="PlanPal <noreply@yourdomain.com>"` (verified domain).
   - **Development** (and Preview): same `RESEND_API_KEY`, but `RESEND_FROM="PlanPal <onboarding@resend.dev>"` – the sandbox sender, which only delivers to your own account email. Keeps local testing from accidentally emailing real invitees.
4. Locally, `vercel env pull .env.local` (step 3 below) picks these up automatically – no manual editing.

## 3. Local

```bash
npm install
vercel link                  # connects this folder to the Vercel project (once)
vercel env pull .env.local   # pulls the env vars from Vercel (Supabase integration + Resend etc.)
npm run dev                  # http://localhost:3000
```

> `vercel env pull` grabs the **Development** environment values by default. If the Supabase integration wired the *same* project to Production, Preview and Development, local dev will hit the prod database. To isolate them, create a second Supabase project for dev and override the `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` values for the **Development** environment in Vercel's dashboard before pulling.

## 4. Vercel

1. Push the repo to GitHub.
2. https://vercel.com → **Add New → Project** → import the repo. Next.js is detected automatically.
3. **Integrations → Supabase** → connect your project – this auto-populates `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` for you (per environment).
4. Still add manually (not covered by the integration), under **Environment Variables**:
   - `RESEND_API_KEY`
   - `RESEND_FROM`
   - `NEXT_PUBLIC_APP_URL` = `https://YOUR-APP.vercel.app`
5. Deploy. Then update Supabase **Site URL** + **Redirect URLs** with the Vercel domain (step 1.4).

## 5. PWA

Nothing extra needed – `manifest.json` + `sw.js` live in `public/` and register automatically. On mobile: open the page → "Add to Home Screen". Requires HTTPS (Vercel has it by default).

## 6. Offline mode (read, not edit)

The app works offline for **reading** all your trips, as long as you've opened the app at least once while online:

- When you open the home page online, **all your trips'** calendars and notes are prefetched in the background and saved to the browser's IndexedDB (a small "Saving trips for offline reading…" line shows while it runs).
- Each trip link is also `prefetch`ed, so the page route itself gets cached by the service worker – that's what lets you *open* a trip offline, not just have the data saved.
- When you go offline, the last saved data is shown automatically, with a yellow banner showing when it was last saved.
- All buttons to create, edit, delete or share are disabled offline (otherwise the Supabase calls would just fail silently).

**How it works in practice:** open the app with a connection at some point → all trips get cached → then you can go offline, open the app from your home screen, and browse into any of your trips and see the whole calendar.

**What it does not do:**
- Edit offline and sync later (that's "level 3", a much bigger feature – see the earlier discussion of ElectricSQL/PowerSync if it becomes relevant).
- Open a trip added *after* your last online session, or a trip via a shared link you never loaded online – that requires a connection the first time.
- Cold deep link (pasting a trip URL directly while offline without opening the app first) – the service worker sends you to the home page then. Open the app first, then navigate.

## 7. Calendar sync to Outlook / iCloud / Google

Each trip exposes an iCalendar feed at `/api/calendar/<token>`. Click **Sync** in the trip view to subscribe:

- **Apple / iCloud:** the webcal link opens the subscription dialog directly. In iCloud you can choose the refresh interval (down to ~5 min).
- **Outlook.com:** the button opens "subscribe from web". Outlook desktop: Calendar → Add calendar → Subscribe from web → paste the https link.
- **Google:** the button opens "add by URL" in Google Calendar. Note: Google refreshes external subscriptions notoriously slowly (often 8–24 h) and the interval can't be configured.

**Important about "real-time":** the feed is generated live on every request, so it always contains your latest changes. But it's the calendar app that decides how often it fetches – Apple can be set fast, Outlook.com can take several hours. So sync to the second can't be guaranteed; that's an inherent limitation in how calendar subscriptions work, not in the app. True push sync would require Microsoft Graph (Outlook) and CalDAV with an app-specific password (iCloud), which is a considerably larger and more fragile integration.

**Security:** anyone with the token URL can read the trip's calendar (that's how all .ics feeds work). The link is protected by the fact that `calendar_token` is only visible to the trip's members. If it leaks, any member can create a new one via "Create new link", which revokes the old one.

## How permissions work

- Roles: `owner` > `edit` > `read`. Stored in `trip_members`.
- **Re-share at most at your own level** is enforced by a DB trigger (`enforce_invite_role`) on insert into `trip_invites` – so it can't be bypassed via the API.
- RLS policies: `read` can only SELECT events/notes; `edit`/`owner` can write, including the trip's own name and dates; only `owner` can delete the trip or other members.
- Calendar sync is available to **every** member, `read` included — subscribing to the .ics feed and rotating the link don't modify trip content.
- Invitation flow: `POST /api/invites` → row in `trip_invites` with a unique token → Resend email with accept/decline links → `/invite/[token]`. Accepting requires sign-in (RPC `accept_invite`); declining works without sign-in.

## Quick functional test

1. Sign in with a magic link, create a trip.
2. Add an event of each type – activity (blue), travel (orange), accommodation (green, date only).
3. Share → send an invite to another address with "View" → accept in an incognito window → verify that user can't edit and can only re-share with "View".
