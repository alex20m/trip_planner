# TripPlan – Setup

Stack: Next.js 14 (App Router) · Supabase (Postgres + Auth) · Resend (email) · Vercel (hosting) · PWA.

## 1. Supabase

1. Create a project at https://supabase.com (region: `eu-north-1` Stockholm is closest for Finland).
2. Open **SQL Editor** → paste the whole of `supabase/migrations/0001_init.sql` → Run. Then do the same with `supabase/migrations/0002_calendar_sync.sql`.
3. **Authentication → Providers → Email**: make sure Email is enabled. Magic link works out of the box.
4. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (switch to the Vercel domain later)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://YOUR-APP.vercel.app/auth/callback`
5. **Project Settings → API**: copy
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secret, never in client code)

> **Free tier note:** Supabase pauses free projects after 7 days of inactivity. A cron ping (e.g. a Vercel Cron running a select) keeps it awake.

## 2. Resend

1. Create an account at https://resend.com → **API Keys** → create a key → `RESEND_API_KEY`.
2. For testing, `onboarding@resend.dev` works as the sender, **but only to your own email address**.
3. For real invitations: **Domains** → add your own domain → add the DNS records (SPF/DKIM) → set `RESEND_FROM="TripPlan <noreply@yourdomain.com>"`.

## 3. Local

```bash
npm install
cp .env.example .env.local   # fill in the values from steps 1–2
npm run dev                  # http://localhost:3000
```

## 4. Vercel

1. Push the repo to GitHub.
2. https://vercel.com → **Add New → Project** → import the repo. Next.js is detected automatically.
3. **Environment Variables** – add all of them from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM`
   - `NEXT_PUBLIC_APP_URL` = `https://YOUR-APP.vercel.app`
4. Deploy. Then update Supabase **Site URL** + **Redirect URLs** with the Vercel domain (step 1.4).

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
- RLS policies: `read` can only SELECT events/notes; `edit`/`owner` can write; only `owner` can delete the trip or other members.
- Invitation flow: `POST /api/invites` → row in `trip_invites` with a unique token → Resend email with accept/decline links → `/invite/[token]`. Accepting requires sign-in (RPC `accept_invite`); declining works without sign-in.

## Quick functional test

1. Sign in with a magic link, create a trip.
2. Add an event of each type – activity (blue), travel (orange), accommodation (green, date only).
3. Share → send an invite to another address with "View" → accept in an incognito window → verify that user can't edit and can only re-share with "View".
