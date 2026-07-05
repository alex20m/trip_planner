# TripPlan

A PWA for planning trips together.

- 📅 Weekly calendar view with color-coded events: **activity** (blue), **travel** (orange), **accommodation** (green, no time of day)
- 📝 Notes in sections below the calendar (packing list, bookings, links…)
- ✉️ Share trips via email invitation (Resend) — the recipient accepts or declines
- 🔒 Permissions: view/edit, and you can only re-share with at most your own level (enforced in the database)
- 🔌 Offline mode: all your trips are prefetched when you open the app online and can then be read without a connection (read-only) — see SETUP.md
- 📆 Calendar sync: subscribe to a trip in Outlook, iCloud or Google via an .ics feed
- 📱 Installable as a PWA

Stack: Next.js 14 · Supabase · Resend · Vercel · Tailwind.

See **SETUP.md** for the full installation guide.
