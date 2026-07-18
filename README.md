# Ward Academy Journal Club

A lightweight web platform for organizing the **Ward Academy Journal Club**: members register, post the days and times they can meet, volunteer as **Host**, **Presenter** or **Attendee**, attach the article they want to discuss, and join the call through the link the host posts.

The visual identity follows the colors of the **American flag** — Old Glory Blue (`#0A3161`), Old Glory Red (`#B31942`) and white (role coding: Host = red, Presenter = navy blue, Attendee = light blue-gray).

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
| `history.html` | Past sessions: article discussed, presenter, host and attendees, grouped by month, searchable |
| `certificates.html` | Auto-generated, printable Certificate of Presentation for each article a member has presented |
| `members.html` | Member directory with participation stats |
| `profile.html` | Member profile: bio, stats (times as Host / Presenter / Attendee), upcoming commitments, articles submitted |
| `research.html` | Research project board: members create **private** systematic-review/meta-analysis projects (visible only to their team), track tasks through the research pipeline (stages), set deadlines, tag status, optionally create/upload to Google Drive folders, and **recruit co-authors** through an anonymous open-positions board |

### The three journal club roles

- **Host** — moderates the session, keeps time, opens the discussion, and **provides the meeting link** (Zoom/Meet). The host can post the link days ahead or the moment the call starts; the home page shows it as soon as it exists.
- **Presenter** — presents and critically appraises the article. Presenting requires attaching the article: link (full manuscript preferred; Google Drive link if paywalled), study design, specialty/subspecialty, and what caught their attention.
- **Attendee** — joins the call and participates in the discussion.

A slot only appears under **“Upcoming journal club sessions”** when at least one presenter committed to it. Slots with a confirmed host are visually highlighted (amber) since the session is then fully staffed.

---

## Setup (one time, ~15 minutes)

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project** (free tier is fine).
2. Once the project is ready, open **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the tables (`profiles`, `articles`, `availabilities`, `meetings`, the shared board, session confirmations, and the `research_*` tables), the signup trigger, and all Row Level Security policies.

   > The script is **idempotent** (`create table if not exists`, `drop policy if exists`), so re-running it after an update is safe. If you already ran an earlier version, **run it again** — the **Research** page needs the `research_*` tables from section 8, the co-author recruitment tables (`research_recruitments`, `research_applications`) from section 9, and the section-8 policy update that makes research projects **private to their team** (only the creator and accepted co-authors can read a project).

### 2. Configure authentication

In the Supabase dashboard, under **Authentication**:

1. **Sign In / Up → Email** should be enabled (it is by default).
   - *Confirm email*: if left **on**, new members must click a confirmation link before signing in (recommended). If you want frictionless signup, turn it off.
2. **URL Configuration**:
   - **Site URL**: the production URL, `https://journalward.vercel.app`
   - **Redirect URLs**: add `https://journalward.vercel.app/*`
     (and, if you also use GitHub Pages, `https://YOUR-USER.github.io/upresearch/*`)

   These make the confirmation and password-reset email links land back on the site.
   Any URL not on this list is silently replaced by the Site URL, so a wrong list
   is why reset/confirmation emails would redirect to the wrong place.

### 3. Connect the site to Supabase

Open [`js/config.js`](js/config.js) and paste your project’s values from **Project Settings → API**:

```js
window.WA_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",
};
```

> The anon key is **safe to commit publicly** — every table is protected by Row Level Security, so the key can only do what the policies allow (signed-in members read the club’s data and write only their own rows).

### 4. Hosting

The site is plain static files, so it runs anywhere:

- **Vercel (current production)**: the repo is connected to the Vercel project `journalward`; every merge to `main` deploys automatically to `https://journalward.vercel.app` (PR branches get preview URLs). Vercel serves clean URLs, so `/home.html` redirects to `/home` — both work.
- **GitHub Pages (alternative)**: repository **Settings → Pages** → Source = *Deploy from a branch*, Branch = `main`, folder = `/ (root)` → live at `https://YOUR-USER.github.io/upresearch/`.

That’s it. Share the URL with the club.

---

## How the scheduling model works

- Availability is stored as **1-hour slots**, either a **single date+hour** or a **weekly recurrence** (e.g. every Tuesday and Thursday at 20:00).
- Recurring availability **expires after 1 month by default**. Checking **“I will keep this availability for more than a month”** makes it open-ended — a standing commitment until the member edits or removes it (there is also a one-click *Renew +1 month* button).
- All times are stored in **UTC** and displayed in each member’s **timezone**. The timezone is auto-detected from the device and can be changed manually (selector on the *My Availability* page, with Brazil / US / Europe presets); the choice is remembered per device. DST in the US/Europe is handled by the conversion. (Caveat: a *recurring* slot keeps its UTC time, so its displayed hour can shift by one hour when clocks change.)
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
- **One-click slot joining** — “Present here”, “volunteer to host”, calendar slot details, and even *empty* calendar cells deep-link into the availability form with the date, hour and role pre-selected. Session and open-slot cards on the home page have a **one-tap “I’ll attend”** button that registers you as attendee instantly.
- **Occupancy hints while scheduling** — when adding availability, each 1-hour box shows how many members are already available at that time on the chosen day(s) (👥N, plus ⭐/📄 when a host/presenter is there).
- **Home filters & sorting** — filter upcoming sessions by specialty and sort by date or member count; open slots sortable by most members or soonest (the open-slot list scrolls inside a fixed-height panel).
- **Shared board** — a rich-text “mural” on the home page that every member can edit. Saves automatically ~1s after you stop typing and streams to everyone else within seconds (Supabase Realtime + polling fallback; last save wins). Pasting from Claude/ChatGPT/Word keeps the structure (headings, bold, lists, links, tables) but strips **all** colors and backgrounds, so dark-mode copies paste clean — and everything is sanitized against scripts/embeds before rendering. Bare URLs typed or pasted into the board become clickable links that open in a new tab.
- **Profile photos** — members can upload a picture on their profile. It’s cropped to a square and compressed **in the browser** to a tiny 128px JPEG, then stored as a base64 text data URL in `profiles.avatar` (typically 4–8 KB) — no file storage/bucket needed. It shows everywhere avatars appear (nav, members, profiles, home rosters); anything that isn’t a valid image data URL falls back to initials, so the field can’t be used to inject markup.
- **Certificates** — members get an official, printable *Certificate of Presentation* for each article they have presented, auto-generated from the session record (name, article, study design/specialty, date). The wording is a dignified attestation of the accomplishment (it does not instruct the holder how to use it), with a deterministic reference code and a named signatory whose institutional email allows the certificate's authenticity to be verified. Print or “Save as PDF” from the browser (a print stylesheet outputs just the certificate on an A4-landscape page). **A certificate is only issued after the session’s host confirms it actually took place** — on the History page each past session shows the host a “Confirm this session took place” button; until confirmed, the presenter sees the presentation as locked with an “awaiting host confirmation” note. (A session with a presenter but no host can’t be certified, since there’s no one to confirm it.)
- **Research board** — a project tracker for the club's systematic reviews / meta-analyses. A member creates a project (auto-titled from PICO fields — *intervention VS comparison FOR population*), adds co-authors, breaks the work into tasks that move through the full research pipeline (from *finding studies* to *submitting to a journal*), sets per-task and per-project deadlines, tags project status (conference / submitted / published / archived), and browses everything on a month/week/year calendar of deadlines. **Projects are private to their team** — only the creator and accepted co-authors can see a project's title, description, tasks and files (enforced by Row Level Security). The creator can delete; any participant can edit. Descriptions are rich text, sanitized and auto-linkified. Optional Google Drive integration (via a Google Apps Script deployment) creates the recommended folder structure per project — on by default when creating a project — and lets members upload/manage files; if the Apps Script URL isn't configured the board works fully minus the Drive features. The whole page is in English.
- **Co-author recruitment** — because projects are private, members find new work through an **open-positions board** shown both on the **Home page** (below the shared board) and on the Research page. It's a single shared component (`WA.positions` in `js/common.js`). A project owner posts an anonymous call showing only their **name, specialty and what help they need** — never the project title or links. Other members **apply** with a WhatsApp number and a short (≤100-word) note about how they can help; they can also **hide** postings they're not interested in (and unhide later). The owner reviews applications and, on **accepting** one, the applicant is added as a co-author — which is the only way they gain access to the project. Stored in the `research_recruitments` / `research_applications` tables.
- **Add to calendar** — every session offers a Google Calendar link and an `.ics` download (works with Apple/Outlook), including the article and meeting link.
- **Duplicate protection** — signing up twice for the same slot with the same role is detected and skipped.
- **Editable articles** — presenters can edit their article details from their profile.
- **Copy meeting link** button and show/hide password toggles.
- **Timezone selector** — auto-detected, manually overridable (Brazil / US / Europe presets), applied to every time shown on the site including the calendar grid. An inline picker sits at the top of the Home, Calendar and History pages; the full selector lives on My Availability.
- **Phone-first design** — optimized for mobile Safari/Chrome: 16px inputs (no iOS zoom-on-focus), large touch targets, safe-area insets, `dvh` viewport fix, no tap-highlight flash, `apple-touch-icon`, and layouts tuned down to 320px-wide screens.

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
research.html         # research project board (projects, tasks, collaborators, Drive)
css/styles.css        # design system
js/config.js          # Supabase credentials (fill in)
js/common.js          # shared runtime: auth guard, nav, slot expansion, stats
supabase/schema.sql   # database schema + RLS (run once in Supabase)
```
