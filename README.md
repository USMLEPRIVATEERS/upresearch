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

### The journal club roles

**Rotating roles** — these take turns every session and form a ladder into presenting:

- **Question reader** (2 per session, 5–10 min prep) — reads one Step question out loud and defends an answer before the group reveals it. *No prerequisites: this is the way in.*
- **Methods checker** (1, 30–45 min prep) — reads the article for design, sample, analysis and limitations, and brings 3–5 written critical points. Also the natural **backup for the presenter**, since they've already read the article closely.
- **Presenter** (1, 2–4 h prep) — chooses the article, posts it at least 72 h ahead, presents it in English and leads the discussion. Requires attaching the article: link (full manuscript preferred), study design, specialty/subspecialty, and what caught their attention.
- **Attendee** — joins the call and takes part in the discussion.

The ladder is **question reader → methods checker → presenter**: each step is a little more preparation than the last, so a first presentation never has to feel like a leap. It's stated on the *My Availability* page so the path is visible rather than folklore. Prerequisites are shown as guidance, not enforced — the platform counts *signups*, not verified attendance, so blocking on them would punish the wrong people.

**Organizing team** — standing roles that don't rotate:

- **Host / coordination** — opens the room, **provides the meeting link** (Zoom/Meet), keeps time and publishes the report. The link can be posted days ahead or the moment the call starts.
- **Scientific lead** — leads the methodology and statistics discussion and validates research ideas.
- **Clinical lead** — runs the Step question block and brings the bedside reading of the article.

#### When does a session actually happen?

Slots are colour-coded by **what they need**, so the colour tells you whether to act:

| Tier | Condition | Shown as | Colour |
|---|---|---|---|
| **Complete** | presenter + host + methods checker + 2 readers | ✅ Fully staffed | green |
| **Viable** | host + a presenter with an article — it happens | ⭐📄 Session confirmed, listing what's still open | blue |
| **Needs coordination** | a presenter, but no host | 📄 Presenter confirmed | navy |
| **Needs a presenter** | the team is available | ⭐ Team available | amber |
| **At risk** | no presenter yet, under 72 h to go | 🚨 Needs a presenter | red |
| **Open** | just members available | 👥 Members available | gray |

Only the **presenter** blocks a session; the smaller rotating roles never do (if no one checks the methods, the scientific lead covers it, as always). Sessions list the line-up **with names**, not empty vacancies — a published roster shows the rotation is real, where a list of open slots advertises that nobody has stepped up.

---

## Setup (one time, ~15 minutes)

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project** (free tier is fine).
2. Once the project is ready, open **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates the tables (`profiles`, `articles`, `availabilities`, `meetings`, the shared board, session confirmations, and the `research_*` tables), the signup trigger, and all Row Level Security policies.

   > The script is **idempotent** (`create table if not exists`, `drop policy if exists`), so re-running it after an update is safe. If you already ran an earlier version, **run it again** — the **Research** page needs the `research_*` tables from section 8, the co-author recruitment tables (`research_recruitments`, `research_applications`) from section 9, and the section-8 policy update that makes research projects **private to their team** (only the creator and accepted co-authors can read a project). Re-running it also creates `session_absences` (used to mark who didn't show up), `availability_exceptions` (single days a member can't make, which take them out of that day's slots without touching their weekly recurrence), `presenter_passes` ("not yet" on the presenter queue), `research_tasks.completed_at` and the `research_scores` view that feeds the rank (counts only — the projects themselves stay private to their team), and widens the `availabilities.role` constraint to allow the rotating and organizing roles (methods checker, question reader, scientific lead, clinical lead) — without it those signups are rejected by the database.

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

- **Presenter queue** — the home page publishes **who's up next to present**: members who have taken part in at least two sessions and haven't presented yet, most experienced first, showing the ladder steps they've already done. It's computed from the same signup history as the stats — no extra bookkeeping — and anyone already signed up to present a future slot drops off automatically. This is what replaces asking "who wants to volunteer?" in the group: the next person is simply obvious, and the copy makes clear that passing is fine and keeps your place.
- **Attendance & absences** — when the organizing team confirms a past session they can also tick anyone who signed up but **didn't show up**. An absent presenter gets no certificate, and nobody marked absent is counted in their participation stats — so the numbers reflect who was actually there rather than who clicked "I'll attend". (This closes the old caveat that stats were signup-based.)
- **Role caps** — some roles have a hard limit: only 2–3 questions get read per session, so a **4th question reader is refused** at save time with an explanation. The cap lives on the role definition (`max`), so other roles can get one by adding a number.
- **Notification bell** — a 🔔 in the nav bar (always visible, desktop and mobile) with an unread badge and a dropdown. It surfaces what changed for *you*: new sessions and posted meeting links, **sessions filling up** and **sessions still missing a methods checker or question reader** (those link to *My Availability* with the date, hour and role already selected — one Save and the turn is yours), your **certificate** becoming available once a host confirms your presentation, updates to research **projects you're on**, **new applicants** to your co-author calls, your own application being **accepted/rejected**, and **new open positions**. Notifications open the thing they're about, rather than dropping you on a page to hunt for it: a session notification **opens that session's details** (`home.html?slot=…`), “a project is looking for co-authors” **opens the apply form** (`research.html?apply=…`), and “someone applied to your project” **opens the review list** so you can accept or reject on the spot (`research.html?applications=…`). It's computed client-side from lightweight, RLS-scoped queries and diffed against a per-device “last opened” marker (so you start clean and only see genuinely new things), with a *Mark all read* action.
- **Session reminders** — the bell also counts down to each upcoming session, escalating through three stages: **“coming up”** (within a day), **“starting in N min”** (within the hour) and **“🔴 Live now”**. Each stage arrives as its own fresh unread, so a badge pops when a call is about to start even if the tab has been open for hours (the bell re-checks every couple of minutes and whenever you return to the tab). Once the host has posted the meeting link, the “starting soon” and “live now” reminders **link directly to the call** — one tap to join — and posting the link also notifies everyone else in the slot.
- **WhatsApp group onboarding** — a short guided dialog on the home page that recruits presenters and walks members into the club's WhatsApp group: it links the signup **form** and the group **WhatsApp number**, and offers *“I'm already in the group”* to dismiss it for good. Closing without ticking that asks whether they'd rather not join — *“No thanks”* silences it permanently, *“Yes, I want to join”* starts a two-step flow (**1** open the form → tick *“I've filled it out”*, **2** message us on WhatsApp → tick *“I've sent the message”*), after which it never shows again. Progress is remembered per member, so a half-finished flow resumes where it left off, and it stays out of the way when a notification link already opened a session. To change the form or number, edit `FORM_URL` / `WA_NUMBER` in `home.html`.
- **Live-updating meeting link** — the home page re-checks every 60 seconds, so the *Join the call* button appears without refreshing when the host posts the link at the last minute. A **“next session / live now” banner** with a countdown sits at the top of the home page.
- **One-click slot joining** — “Present here”, “volunteer to host”, calendar slot details, and even *empty* calendar cells deep-link into the availability form with the date, hour and role pre-selected. Session and open-slot cards on the home page have a **one-tap “I’ll attend”** button that registers you as attendee instantly.
- **Occupancy hints while scheduling** — when adding availability, each 1-hour box shows how many members are already available at that time on the chosen day(s) (👥N, plus ⭐/📄 when a host/presenter is there).
- **Home filters & sorting** — filter upcoming sessions by specialty and sort by date or member count. Open slots default to a **“best to join”** ranking that weighs three capped signals — the organizing team already being there (worth most, since then a presenter is all it takes), how many members are in, and how soon it is — with the first two decaying the further away the slot is. That nudges people towards slots the team can staff **without** letting a fully-staffed slot next month permanently outrank a session that needs someone this week; sorting by members or by date is still one click away; open slots sortable by most members or soonest (the open-slot list scrolls inside a fixed-height panel).
- **Shared board** — a rich-text “mural” on the home page that every member can edit. Saves automatically ~1s after you stop typing and streams to everyone else within seconds (Supabase Realtime + polling fallback; last save wins). Pasting from Claude/ChatGPT/Word keeps the structure (headings, bold, lists, links, tables) but strips **all** colors and backgrounds, so dark-mode copies paste clean — and everything is sanitized against scripts/embeds before rendering. Bare URLs typed or pasted into the board become clickable links that open in a new tab.
- **Profile photos** — members can upload a picture on their profile. It’s cropped to a square and compressed **in the browser** to a tiny 128px JPEG, then stored as a base64 text data URL in `profiles.avatar` (typically 4–8 KB) — no file storage/bucket needed. It shows everywhere avatars appear (nav, members, profiles, home rosters); anything that isn’t a valid image data URL falls back to initials, so the field can’t be used to inject markup.
- **Certificates** — members get an official, printable *Certificate of Presentation* for each article they have presented, auto-generated from the session record (name, article, study design/specialty, date). The wording is a dignified attestation of the accomplishment (it does not instruct the holder how to use it), with a deterministic reference code and a named signatory whose institutional email allows the certificate's authenticity to be verified. Print or “Save as PDF” from the browser (a print stylesheet outputs just the certificate on an A4-landscape page). **A certificate is only issued after the session’s host confirms it actually took place** — on the History page each past session shows the host a “Confirm this session took place” button; until confirmed, the presenter sees the presentation as locked with an “awaiting host confirmation” note. (A session with a presenter but no host can’t be certified, since there’s no one to confirm it.)
- **Research board** — a project tracker for the club's systematic reviews / meta-analyses. A member creates a project (auto-titled from PICO fields — *intervention VS comparison FOR population*), adds co-authors, breaks the work into tasks that move through the full research pipeline (from *finding studies* to *submitting to a journal*), sets per-task and per-project deadlines, tags project status (conference / submitted / published / archived), and browses everything on a month/week/year calendar of deadlines. **Projects are private to their team** — only the creator and accepted co-authors can see a project's title, description, tasks and files (enforced by Row Level Security). The creator can delete; any participant can edit. Descriptions are rich text, sanitized and auto-linkified. Optional Google Drive integration (via a Google Apps Script deployment) creates the recommended folder structure per project — on by default when creating a project — and lets members upload/manage files; if the Apps Script URL isn't configured the board works fully minus the Drive features. The whole page is in English.
- **Live Drive folders** — the *Project Files* panel lists what is **actually in Drive right now**, so folders you add, rename or delete by hand in Drive show up on the site, and uploads/deletes go straight to Drive. This needs the `listProjectTree` action from [`apps-script/research-drive.gs`](apps-script/research-drive.gs) (v2.7+) to be deployed; until then the panel falls back to the folder snapshot stored in the database when the project was created, so nothing breaks either way. The live view is marked "· live" in the folder header.
- **Co-author recruitment** — because projects are private, members find new work through an **open-positions board** shown both on the **Home page** (below the shared board) and on the Research page. It's a single shared component (`WA.positions` in `js/common.js`). A project owner posts an anonymous call showing only their **name, specialty and what help they need** — never the project title or links. Other members **apply** with a WhatsApp number and a short (≤100-word) note about how they can help; they can also **hide** postings they're not interested in (and unhide later). The owner reviews applications and, on **accepting** one, the applicant is added as a co-author — which is the only way they gain access to the project. Stored in the `research_recruitments` / `research_applications` tables.
- **Add to calendar** — every session offers a Google Calendar link and an `.ics` download (works with Apple/Outlook), including the article and meeting link.
- **Duplicate protection** — signing up twice for the same slot with the same role is detected and skipped.
- **Editable articles** — presenters can edit their article details from their profile.
- **Copy meeting link** button and show/hide password toggles.
- **Timezone selector** — auto-detected, manually overridable (Brazil / US / Europe presets), applied to every time shown on the site including the calendar grid. An inline picker sits at the top of the Home, Calendar and History pages; the full selector lives on My Availability.
- **Phone-first design** — optimized for mobile Safari/Chrome: 16px inputs (no iOS zoom-on-focus), large touch targets, safe-area insets, `dvh` viewport fix, no tap-highlight flash, `apple-touch-icon`, and layouts tuned down to 320px-wide screens.

## Known limitations / future ideas

- Attendance is verified only when the organizing team marks absences; anyone not marked is assumed present.
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
apps-script/           # Google Apps Script backend for the Research page's Drive folders
```
