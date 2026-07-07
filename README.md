# Ward Academy Journal Club

A lightweight web platform for organizing the **Ward Academy Journal Club**: members register, post the days and times they can meet, volunteer as **Host**, **Presenter** or **Attendee**, attach the article they want to discuss, and join the call through the link the host posts.

The visual identity follows the Ward Academy brand: **burnt orange, white and black** (role coding: Host = burnt orange, Presenter = black, Attendee = neutral gray).

Built as **static HTML pages hosted on GitHub Pages** with **[Supabase](https://supabase.com)** (free tier) providing authentication and the database. No build step, no server to maintain.

---

## Pages

| Page | What it does |
|---|---|
| `index.html` | Sign in, create account, and “forgot password” flow |
| `reset-password.html` | Landing page for the password-reset email link |
| `home.html` | Upcoming sessions (slots with a presenter), host highlight, meeting link, slots still looking for a presenter |
| `availability.html` | Post availability — single date or weekly recurrence, 1-hour clickable slots, role selection, article submission for presenters |
| `calendar.html` | Week and month calendar of all posted availability |
| `members.html` | Member directory with participation stats |
| `profile.html` | Member profile: bio, stats (times as Host / Presenter / Attendee), upcoming commitments, articles submitted |

### The three journal club roles

- **Host** — moderates the session, keeps time, opens the discussion, and **provides the meeting link** (Zoom/Meet). The host can post the link days ahead or the moment the call starts; the home page shows it as soon as it exists.
- **Presenter** — presents and critically appraises the article. Presenting requires attaching the article: link (full manuscript preferred; Google Drive link if paywalled), study design, specialty/subspecialty, and what caught their attention.
- **Attendee** — joins the call and participates in the discussion.

A slot only appears under **“Upcoming journal club sessions”** when at least one presenter committed to it. Slots with a confirmed host are visually highlighted (amber) since the session is then fully staffed.

---

## Setup (one time, ~15 minutes)

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project** (free tier is fine).
2. Once the project is ready, open **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the tables (`profiles`, `articles`, `availabilities`, `meetings`), the signup trigger, and all Row Level Security policies.

### 2. Configure authentication

In the Supabase dashboard, under **Authentication**:

1. **Sign In / Up → Email** should be enabled (it is by default).
   - *Confirm email*: if left **on**, new members must click a confirmation link before signing in (recommended). If you want frictionless signup, turn it off.
2. **URL Configuration**:
   - **Site URL**: your GitHub Pages URL, e.g. `https://YOUR-USER.github.io/upresearch/`
   - **Redirect URLs**: add
     - `https://YOUR-USER.github.io/upresearch/home.html`
     - `https://YOUR-USER.github.io/upresearch/reset-password.html`

   These make the confirmation and password-reset email links land back on the site.

### 3. Connect the site to Supabase

Open [`js/config.js`](js/config.js) and paste your project’s values from **Project Settings → API**:

```js
window.WA_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",
};
```

> The anon key is **safe to commit publicly** — every table is protected by Row Level Security, so the key can only do what the policies allow (signed-in members read the club’s data and write only their own rows).

### 4. Enable GitHub Pages

Repository **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)`. Your site goes live at `https://YOUR-USER.github.io/upresearch/`.

That’s it. Share the URL with the club.

---

## How the scheduling model works

- Availability is stored as **1-hour slots**, either a **single date+hour** or a **weekly recurrence** (e.g. every Tuesday and Thursday at 20:00).
- Recurring availability **expires after 1 month by default**. Checking **“I will keep this availability for more than a month”** makes it open-ended — a standing commitment until the member edits or removes it (there is also a one-click *Renew +1 month* button).
- All times are stored in **UTC** and displayed in each viewer’s **local timezone**, so an international group sees correct local times automatically. (Caveat: for members in countries with daylight saving time, a recurring slot keeps its UTC time, so its local time can shift by one hour when clocks change.)
- **Participation stats** (times as Host / Presenter / Attendee shown on profiles and the member directory) are computed from past slots that had at least one presenter — i.e., slots where a session actually happened.
- The **meeting link** is attached to a specific slot by a host of that slot. Everyone sees a *Join the call* button on the home page as soon as it’s posted.

## Design decisions (critical analysis of the original idea)

- **Presenter is the trigger, not the host.** A journal club session only really exists once someone commits to presenting a paper, so the home page treats “slot with presenter” as a session and “slot with people but no presenter” as a call to action. A host alone doesn’t make a session.
- **Fixed roles per signup, proper names.** The three canonical journal club roles are used: *Host* (moderator/facilitator), *Presenter*, *Attendee* (rather than “spectator”, which sounds passive — attendees are expected to discuss).
- **Article metadata is structured.** Study design, specialty/subspecialty and “what caught your attention” are separate fields, not free text in a comment — this makes sessions scannable on the home page and calendar, and doubles as light critical-appraisal training.
- **Expiry instead of stale data.** The biggest failure mode of availability boards is zombie entries. Defaulting to a 1-month expiry (with explicit opt-in to open-ended commitment) keeps the calendar honest.
- **Meeting link decoupled from availability.** Hosts often create the Zoom room minutes before the call; the link is a separate record the host can post/update at any time without touching the schedule.
- **Timezone-aware by construction.** USMLE-oriented communities are spread across countries; storing UTC and rendering local removes a whole class of confusion.
- **No custom backend.** Supabase RLS enforces all the security rules server-side, so the entire site can be static files on GitHub Pages — free, fast, and trivially maintainable.

## Quality-of-life features

- **Live-updating meeting link** — the home page re-checks every 60 seconds, so the *Join the call* button appears without refreshing when the host posts the link at the last minute. A **“next session / live now” banner** with a countdown sits at the top of the home page.
- **One-click slot joining** — “Present here”, “volunteer to host”, calendar slot details, and even *empty* calendar cells deep-link into the availability form with the date, hour and role pre-selected.
- **Add to calendar** — every session offers a Google Calendar link and an `.ics` download (works with Apple/Outlook), including the article and meeting link.
- **Duplicate protection** — signing up twice for the same slot with the same role is detected and skipped.
- **Editable articles** — presenters can edit their article details from their profile.
- **Copy meeting link** button and show/hide password toggles.

## Known limitations / future ideas

- Attendance stats are based on **signups**, not verified attendance (a host “session log” could refine this later).
- Two hosts could theoretically volunteer for the same slot; the first to post a meeting link “wins” (others still appear as hosts).
- Email notifications/reminders would require Supabase Edge Functions or an external cron — a good next step.
- The 60-second polling could be upgraded to Supabase Realtime subscriptions for instant updates.

## Repository layout

```
index.html            # auth (sign in / sign up / forgot password)
reset-password.html   # password reset landing page
home.html             # dashboard
availability.html     # post & manage availability
calendar.html         # week / month calendar
members.html          # member directory
profile.html          # profiles (own + others)
css/styles.css        # design system
js/config.js          # Supabase credentials (fill in)
js/common.js          # shared runtime: auth guard, nav, slot expansion, stats
supabase/schema.sql   # database schema + RLS (run once in Supabase)
```
