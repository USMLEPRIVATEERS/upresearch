/* ============================================================
   Ward Academy Journal Club — shared runtime
   Loaded by every page after config.js and the Supabase CDN.
   Exposes a single global: window.WA
   ============================================================ */
(function () {
  "use strict";

  const WA = {};
  window.WA = WA;

  /* ---------- configuration / client ---------- */

  WA.configured = function () {
    const c = window.WA_CONFIG || {};
    return (
      c.SUPABASE_URL &&
      c.SUPABASE_ANON_KEY &&
      !c.SUPABASE_URL.startsWith("YOUR_") &&
      !c.SUPABASE_ANON_KEY.startsWith("YOUR_")
    );
  };

  WA.client = null;
  if (WA.configured() && window.supabase) {
    WA.client = window.supabase.createClient(
      window.WA_CONFIG.SUPABASE_URL,
      window.WA_CONFIG.SUPABASE_ANON_KEY
    );
  }

  /* Base path of the site (works at domain root and in
     GitHub Pages project subpaths like /upresearch/). */
  WA.basePath = window.location.pathname.replace(/[^/]*$/, "");
  WA.pageUrl = (page) => window.location.origin + WA.basePath + page;

  /* ---------- tiny DOM / formatting helpers ---------- */

  WA.esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  /* Only ever emit http(s) links that came from users. */
  WA.safeUrl = function (u) {
    try {
      const url = new URL(String(u || "").trim());
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch (e) { /* fallthrough */ }
    return null;
  };

  /* Renders a member avatar as a .avatar span: their uploaded picture
     (a tiny base64 data URL stored in profiles.avatar) when present and
     valid, otherwise their initials. The strict data-URL check prevents
     a member from injecting markup through the avatar field. */
  WA.AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  WA.avatarHtml = function (profile, extraClass, title) {
    const cls = "avatar" + (extraClass ? " " + extraClass : "");
    const name = profile ? profile.full_name : "";
    const av = profile && profile.avatar;
    const t = title == null ? (name || "") : title;
    if (av && WA.AVATAR_RE.test(av)) {
      return '<span class="' + cls + ' avatar-img" title="' + WA.esc(t) +
        '" style="background-image:url(\'' + av + "')\"></span>";
    }
    return '<span class="' + cls + '" title="' + WA.esc(t) + '">' +
      WA.esc(WA.initials(name)) + "</span>";
  };

  WA.initials = function (name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    const first = parts[0][0] || "?";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  };

  WA.WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  WA.WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  WA.MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  WA.pad = (n) => String(n).padStart(2, "0");
  WA.hourLabel = (h) => WA.pad(h) + ":00";
  WA.hourRange = (h) => WA.pad(h) + ":00–" + WA.pad((h + 1) % 24) + ":00";

  /* ---------- timezone handling ----------
     Everything is stored in UTC. Display and slot entry use the
     member's timezone: auto-detected from the device, but the
     member can override it (persisted per device in localStorage).
     All conversions go through Intl.DateTimeFormat so DST is
     handled correctly for US/EU members. */

  WA.isValidTz = function (tz) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; }
    catch (e) { return false; }
  };

  WA.detectTz = function () {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && WA.isValidTz(tz)) return tz;
    } catch (e) { /* fallthrough */ }
    return "UTC";
  };

  WA._tz = null;
  WA.getTz = function () {
    if (WA._tz) return WA._tz;
    try {
      const saved = localStorage.getItem("wa_tz");
      if (saved && WA.isValidTz(saved)) { WA._tz = saved; return saved; }
    } catch (e) { /* private mode etc. */ }
    WA._tz = WA.detectTz();
    return WA._tz;
  };

  WA.setTz = function (tz) {
    if (!WA.isValidTz(tz)) return;
    WA._tz = tz;
    try { localStorage.setItem("wa_tz", tz); } catch (e) { /* ignore */ }
  };

  const tzFmtCache = {};
  function tzFmt(tz) {
    if (!tzFmtCache[tz]) {
      tzFmtCache[tz] = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
        hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "short",
      });
    }
    return tzFmtCache[tz];
  }
  const WD_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /* Calendar components of an instant, as seen in the given timezone. */
  WA.zonedParts = function (date, tz) {
    tz = tz || WA.getTz();
    const parts = {};
    for (const p of tzFmt(tz).formatToParts(date)) parts[p.type] = p.value;
    let hour = Number(parts.hour);
    if (hour === 24) hour = 0; // some engines report midnight as 24
    return {
      y: Number(parts.year), m: Number(parts.month) - 1, d: Number(parts.day),
      hour, minute: Number(parts.minute), weekday: WD_MAP[parts.weekday],
    };
  };

  /* The UTC instant at which the given timezone's wall clock shows
     y-m-d hour:00. Two-pass correction handles DST transitions. */
  WA.zonedToUtc = function (y, m, d, hour, tz) {
    tz = tz || WA.getTz();
    const target = Date.UTC(y, m, d, hour);
    let t = target;
    for (let i = 0; i < 2; i++) {
      const p = WA.zonedParts(new Date(t), tz);
      const shown = Date.UTC(p.y, p.m, p.d, p.hour, p.minute);
      t += target - shown;
    }
    return new Date(t);
  };

  WA.tzOffsetLabel = function (tz) {
    const now = new Date();
    const p = WA.zonedParts(now, tz);
    const shown = Date.UTC(p.y, p.m, p.d, p.hour, p.minute);
    const utcNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      now.getUTCHours(), now.getUTCMinutes());
    const off = Math.round((shown - utcNow) / 60000);
    const sign = off < 0 ? "-" : "+";
    const abs = Math.abs(off);
    return "GMT" + sign + WA.pad(Math.floor(abs / 60)) + ":" + WA.pad(abs % 60);
  };

  WA.TZ_GROUPS = [
    ["Brazil", ["America/Sao_Paulo", "America/Bahia", "America/Fortaleza", "America/Recife",
      "America/Belem", "America/Manaus", "America/Cuiaba", "America/Campo_Grande",
      "America/Boa_Vista", "America/Rio_Branco", "America/Noronha"]],
    ["United States & Canada", ["America/New_York", "America/Chicago", "America/Denver",
      "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
      "America/Toronto", "America/Vancouver"]],
    ["Europe", ["Europe/Lisbon", "Europe/London", "Europe/Dublin", "Europe/Madrid",
      "Europe/Paris", "Europe/Amsterdam", "Europe/Brussels", "Europe/Berlin",
      "Europe/Zurich", "Europe/Rome", "Europe/Vienna", "Europe/Warsaw", "Europe/Athens"]],
    ["Other", ["UTC", "America/Mexico_City", "America/Bogota", "America/Lima",
      "America/Santiago", "America/Argentina/Buenos_Aires", "Asia/Dubai", "Asia/Jerusalem",
      "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"]],
  ];

  WA.tzSelectHtml = function (id) {
    const current = WA.getTz();
    const detected = WA.detectTz();
    const listed = new Set(WA.TZ_GROUPS.flatMap((g) => g[1]));
    let html = '<select id="' + id + '">';
    html += '<optgroup label="Detected on this device">' +
      '<option value="' + WA.esc(detected) + '"' + (current === detected ? " selected" : "") + ">" +
      WA.esc(detected.replace(/_/g, " ")) + " (" + WA.tzOffsetLabel(detected) + ")</option></optgroup>";
    if (!listed.has(current) && current !== detected) {
      html += '<option value="' + WA.esc(current) + '" selected>' +
        WA.esc(current.replace(/_/g, " ")) + " (" + WA.tzOffsetLabel(current) + ")</option>";
    }
    for (const [label, zones] of WA.TZ_GROUPS) {
      html += '<optgroup label="' + WA.esc(label) + '">';
      for (const z of zones) {
        if (z === detected) continue;
        html += '<option value="' + WA.esc(z) + '"' +
          (current === z && current !== detected ? " selected" : "") + ">" +
          WA.esc(z.replace(/_/g, " ")) + " (" + WA.tzOffsetLabel(z) + ")</option>";
      }
      html += "</optgroup>";
    }
    html += "</select>";
    return html;
  };

  /* Compact inline timezone picker: "🌍 All times in [select]".
     Auto-detected value pre-selected; changing it persists the choice
     and re-renders the page so every displayed time updates. */
  WA.tzInlineWidget = function (el, onApplied) {
    el.innerHTML = '🌍 All times in <span class="tz-inline-slot"></span>';
    const slot = el.querySelector(".tz-inline-slot");
    slot.innerHTML = WA.tzSelectHtml("tz-inline-" + Math.floor(Math.random() * 1e9));
    const sel = slot.querySelector("select");
    sel.className = "tz-inline";
    sel.setAttribute("aria-label", "Timezone");
    sel.addEventListener("change", () => {
      WA.setTz(sel.value);
      if (onApplied) onApplied();
      else window.location.reload();
    });
  };

  /* ---------- date formatting (always in the active timezone) ---------- */

  WA.fmtComps = function (p) {
    return WA.WEEKDAYS_SHORT[p.weekday] + ", " + WA.MONTHS[p.m].slice(0, 3) +
      " " + p.d + ", " + p.y;
  };
  WA.fmtDate = function (d) { return WA.fmtComps(WA.zonedParts(d)); };
  WA.fmtDateTime = function (d) {
    const p = WA.zonedParts(d);
    return WA.fmtComps(p) + " · " + WA.hourRange(p.hour);
  };

  WA.timezoneName = function () { return WA.getTz().replace(/_/g, " "); };

  WA.toast = function (msg, kind) {
    let box = document.getElementById("wa-toasts");
    if (!box) {
      box = document.createElement("div");
      box.id = "wa-toasts";
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.className = "toast " + (kind || "info");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 4200);
  };

  /* ---------- role metadata ---------- */

  /* The club's roles. `group` splits the picker into the rotating roles that
     form the ladder into presenting (question reader → methods checker →
     presenter) and the standing organizer roles. `slots` is the number of
     people the format expects — informational, not enforced. */
  WA.ROLES = {
    presenter: {
      label: "Presenter",
      icon: "📄",
      badge: "badge-presenter",
      group: "rotating",
      slots: 1,
      prep: "2–4h prep",
      hint: "Best after you've attended at least one session.",
      blurb: "Chooses the article, posts it here at least 72h ahead, presents it in English and leads the discussion.",
    },
    methods_checker: {
      label: "Methods checker",
      icon: "🔎",
      badge: "badge-methods",
      group: "rotating",
      slots: 1,
      prep: "30–45min prep",
      hint: "The natural next step before presenting — and the presenter's backup.",
      blurb: "Reads the article for design, sample, analysis and limitations, and brings 3–5 written critical points.",
    },
    question_reader: {
      label: "Question reader",
      icon: "🙋",
      badge: "badge-reader",
      group: "rotating",
      slots: 2,
      prep: "5–10min prep",
      hint: "No prerequisites — the easiest way to start.",
      blurb: "Reads one Step question out loud and defends an answer before the group reveals it.",
    },
    attendee: {
      label: "Attendee",
      icon: "👥",
      badge: "badge-attendee",
      group: "rotating",
      slots: null,
      blurb: "Joins the call, listens and takes part in the discussion.",
    },
    host: {
      label: "Host / coordination",
      icon: "⭐",
      badge: "badge-host",
      group: "organizer",
      slots: 1,
      usually: "Marcos Vilela",
      hint: "Usually Marcos Vilela — sign up here if you're covering for him.",
      blurb: "Opens the room, provides the meeting link, keeps time and publishes the report afterwards.",
    },
    scientific_lead: {
      label: "Scientific lead",
      icon: "🧪",
      badge: "badge-scilead",
      group: "organizer",
      slots: 1,
      usually: "Fernando Vasconcellos",
      hint: "Usually Dr. Fernando Vasconcellos.",
      blurb: "Leads the methodology and statistics discussion and validates research ideas.",
    },
    clinical_lead: {
      label: "Clinical lead",
      icon: "🩺",
      badge: "badge-clinlead",
      group: "organizer",
      slots: 1,
      usually: "Iria da Costa",
      hint: "Usually Dra. Iria da Costa.",
      blurb: "Runs the Step question block and brings the bedside reading of the article.",
    },
  };
  /* Rotating roles in ladder order — used for the picker and the queue copy. */
  WA.ROLE_LADDER = ["question_reader", "methods_checker", "presenter"];
  WA.ROLE_KEYS = Object.keys(WA.ROLES);

  WA.roleBadge = function (role) {
    const r = WA.ROLES[role] || { label: role, badge: "badge-attendee" };
    return '<span class="badge ' + r.badge + '">' + WA.esc(r.label) + "</span>";
  };
  WA.roleLabel = function (role) {
    const r = WA.ROLES[role];
    return r ? r.label : role;
  };
  WA.roleIcon = function (role) {
    const r = WA.ROLES[role];
    return r && r.icon ? r.icon : "•";
  };
  /* Compact icon strip for a slot — one icon per staffed role, attendees aside,
     in a stable order. Shared by the calendar cells and the hour grid so the
     small indicators can't drift out of sync with the role list. */
  WA.SLOT_MARK_ORDER = ["host", "presenter", "methods_checker", "question_reader",
    "scientific_lead", "clinical_lead"];
  WA.slotMarks = function (byRole) {
    const by = byRole || {};
    return WA.SLOT_MARK_ORDER.filter((r) => (by[r] || []).length).map((r) => WA.roleIcon(r)).join("");
  };
  /* Legend line describing those icons, so every page explains them the same way. */
  WA.slotMarkLegend = function () {
    return WA.SLOT_MARK_ORDER.map((r) => WA.roleIcon(r) + " " + WA.ROLES[r].label.toLowerCase())
      .join(" · ") + " · 👥 members in the slot";
  };

  WA.STUDY_DESIGNS = [
    "Randomized Controlled Trial",
    "Non-randomized Trial",
    "Prospective Cohort",
    "Retrospective Cohort",
    "Case-Control",
    "Cross-Sectional",
    "Systematic Review & Meta-Analysis",
    "Systematic Review",
    "Narrative Review",
    "Diagnostic Accuracy Study",
    "Case Report / Case Series",
    "Clinical Guideline",
    "Basic / Translational Science",
    "Other",
  ];

  /* ---------- recurring-slot time math ----------
     Recurring availabilities are stored as (weekday_utc, hour_utc)
     and single ones as a UTC timestamp; everything is converted to
     the member's chosen timezone for display. Note: recurring slots
     keep their UTC time, so for members in countries with daylight
     saving time the displayed hour may shift by 1h across DST changes. */

  WA.localRecurringToUtc = function (weekdayLocal, hourLocal, tz) {
    tz = tz || WA.getTz();
    // Find the next date (in the member's timezone) with that weekday,
    // then read what UTC weekday/hour that wall-clock time lands on.
    const p = WA.zonedParts(new Date(), tz);
    let dayMs = Date.UTC(p.y, p.m, p.d);
    while (new Date(dayMs).getUTCDay() !== weekdayLocal) dayMs += 86400000;
    const c = new Date(dayMs);
    const utc = WA.zonedToUtc(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), hourLocal, tz);
    return { weekday_utc: utc.getUTCDay(), hour_utc: utc.getUTCHours() };
  };

  WA.utcRecurringToLocal = function (weekdayUtc, hourUtc, tz) {
    const now = new Date();
    const d = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0
    ));
    while (d.getUTCDay() !== weekdayUtc) d.setUTCDate(d.getUTCDate() + 1);
    const p = WA.zonedParts(d, tz);
    return { weekday: p.weekday, hour: p.hour };
  };

  /* ---------- occurrence expansion ----------
     Turns availability rows into concrete 1-hour occurrences
     between rangeStart and rangeEnd (Date objects, inclusive).
     Each occurrence: { iso, date, avail }. */

  WA.isRowActiveAt = function (row, when) {
    if (row.kind === "single") return true; // single rows carry their own datetime
    const created = new Date(row.created_at);
    // A recurring slot only generates occurrences from its creation onward…
    if (when < created) return false;
    // …and, unless open-ended, until its expiry (~1 month).
    if (!row.open_ended && row.expires_at && when > new Date(row.expires_at)) return false;
    return true;
  };

  WA.expandAvailabilities = function (rows, rangeStart, rangeEnd) {
    const out = [];
    for (const row of rows) {
      if (row.kind === "single") {
        const d = new Date(row.slot_start);
        if (d >= rangeStart && d <= rangeEnd) {
          out.push({ iso: d.toISOString(), date: d, avail: row });
        }
      } else {
        // Walk UTC days across the range and emit matching weekday/hour.
        const cursor = new Date(Date.UTC(
          rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate()
        ));
        const endDay = new Date(Date.UTC(
          rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth(), rangeEnd.getUTCDate()
        ));
        while (cursor <= endDay) {
          if (cursor.getUTCDay() === row.weekday_utc) {
            const occ = new Date(cursor.getTime());
            occ.setUTCHours(row.hour_utc, 0, 0, 0);
            if (occ >= rangeStart && occ <= rangeEnd && WA.isRowActiveAt(row, occ)) {
              out.push({ iso: occ.toISOString(), date: occ, avail: row });
            }
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }
    }
    return out;
  };

  /* Groups occurrences by slot. Returns an array of
     { iso, date, hosts, presenters, attendees, byRole, all } sorted by time,
     de-duplicating a user who appears twice in the same slot+role.
     `byRole` holds every role (including the newer rotating/organizer ones);
     hosts/presenters/attendees stay as aliases so existing pages keep working. */
  WA.groupOccurrences = function (occurrences) {
    const map = new Map();
    for (const occ of occurrences) {
      let g = map.get(occ.iso);
      if (!g) {
        g = { iso: occ.iso, date: occ.date, byRole: {}, all: [] };
        WA.ROLE_KEYS.forEach((k) => { g.byRole[k] = []; });
        g.hosts = g.byRole.host;
        g.presenters = g.byRole.presenter;
        g.attendees = g.byRole.attendee;
        map.set(occ.iso, g);
      }
      const bucket = g.byRole[occ.avail.role] || g.byRole.attendee;
      const dupe = bucket.some((a) => a.user_id === occ.avail.user_id);
      if (!dupe) {
        bucket.push(occ.avail);
        g.all.push(occ.avail);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date - b.date);
  };

  /* ---------- participation stats ----------
     A slot in the past counts as a "session held" when it had at
     least one presenter. Every member signed up for that slot gets
     credit for the role they signed up with. Looks back `days`. */
  WA.computeStats = function (allRows, days) {
    const now = new Date();
    const start = new Date(now.getTime() - (days || 180) * 86400000);
    const occs = WA.expandAvailabilities(allRows, start, now);
    const groups = WA.groupOccurrences(occs);
    const stats = {}; // user_id -> {host, presenter, attendee, sessions}
    for (const g of groups) {
      if (g.date > now) continue;
      if (!g.presenters.length) continue; // no presenter → no session happened
      for (const a of g.all) {
        // (no logical-assignment operator here — older iOS Safari lacks it)
        if (!stats[a.user_id]) {
          const blank = { sessions: 0 };
          WA.ROLE_KEYS.forEach((k) => { blank[k] = 0; });
          stats[a.user_id] = blank;
        }
        const s = stats[a.user_id];
        if (typeof s[a.role] !== "number") s[a.role] = 0;
        s[a.role] += 1;
        s.sessions += 1;
      }
    }
    return stats;
  };

  /* ---------- session staffing ----------
     Three tiers, matching how the club actually runs:
       complete — presenter + host + methods checker + 2 readers
       viable   — coordination (host) + a presenter with an article: it happens
       at-risk  — no presenter yet; only this blocks the session
     The smaller rotating roles are never blocking. */
  WA.SESSION_ROLE_TARGETS = [
    ["presenter", 1], ["host", 1], ["methods_checker", 1], ["question_reader", 2],
  ];
  WA.sessionStaffing = function (g) {
    const by = g.byRole || {};
    const count = (r) => (by[r] || []).length;
    const missing = WA.SESSION_ROLE_TARGETS
      .filter(([role, want]) => count(role) < want)
      .map(([role, want]) => ({ role, missing: want - count(role) }));
    const hasPresenter = count("presenter") > 0;
    const hasHost = count("host") > 0;
    // Any organizing role present — a slot with a lead but no host is still
    // "the team can make this happen", not an empty slot.
    const hasTeam = hasHost || count("scientific_lead") > 0 || count("clinical_lead") > 0;
    const hoursAway = (g.date - new Date()) / 3600000;
    return {
      hasPresenter, hasHost, hasTeam, missing,
      complete: missing.length === 0,
      viable: hasPresenter && hasHost,
      // The club's cutoff: a session this close with no presenter needs the queue.
      urgent: !hasPresenter && hoursAway > 0 && hoursAway <= 72,
      hoursAway,
    };
  };

  /* How worth joining an open slot is, as a single score. Three signals, each
     capped so none of them dominates:
       team   (0–3) the organizing team is already there, so a presenter is all
                    it takes — the strongest signal, but capped so a distant
                    team slot can't bury a session happening this week;
       crowd  (0–2) more members means more likely to actually run, with
                    diminishing returns after a handful;
       soon   (0–2) sooner is better, inside a sensible horizon.
     Max ≈ 7, with team worth at most ~40% — enough to steer people towards
     slots the team can staff without making everything else invisible. */
  WA.slotJoinScore = function (g) {
    const by = g.byRole || {};
    const has = (r) => (by[r] || []).length > 0;
    const team = Math.min(3, (has("host") ? 2 : 0) + (has("scientific_lead") ? 1 : 0) +
      (has("clinical_lead") ? 1 : 0));
    const crowd = Math.min(2, (g.all || []).length * 0.4);
    const days = (g.date - new Date()) / 86400000;
    if (days < 0) return 0;
    const soon = days <= 3 ? 2 : days <= 7 ? 1.5 : days <= 14 ? 0.75 : 0;
    // Who's already in matters less the further away the slot is — otherwise a
    // fully-staffed slot next month would permanently outrank a session that
    // needs someone this week.
    const decay = days <= 7 ? 1 : days <= 14 ? 0.8 : days <= 30 ? 0.55 : 0.35;
    return (team + crowd) * decay + soon;
  };

  /* ---------- presenter queue ----------
     Who is up next: members who have taken part in at least `minSessions`
     sessions and have never presented, most-experienced first. Computed from
     the same signup history as the stats — no extra bookkeeping. */
  WA.presenterQueue = function (allRows, profilesById, opts) {
    const o = opts || {};
    const minSessions = o.minSessions == null ? 2 : o.minSessions;
    const stats = WA.computeStats(allRows, o.days || 365);
    // Anyone already signed up to present a future slot is off the queue.
    const upcoming = WA.groupOccurrences(
      WA.expandAvailabilities(allRows, new Date(), new Date(Date.now() + 90 * 86400000))
    );
    const committed = new Set();
    upcoming.forEach((g) => (g.presenters || []).forEach((a) => committed.add(a.user_id)));
    return Object.keys(stats)
      .filter((id) => !stats[id].presenter && !committed.has(id) && stats[id].sessions >= minSessions)
      .map((id) => ({
        user_id: id,
        profile: (profilesById && profilesById[id]) || null,
        sessions: stats[id].sessions,
        methods_checker: stats[id].methods_checker || 0,
        question_reader: stats[id].question_reader || 0,
      }))
      .sort((a, b) => b.sessions - a.sessions ||
        (b.methods_checker - a.methods_checker) ||
        String((a.profile && a.profile.full_name) || "").localeCompare(
          String((b.profile && b.profile.full_name) || "")));
  };

  /* ---------- calendar export & deep links ---------- */

  const icsStamp = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const icsEscape = (s) => String(s || "")
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

  WA.gcalLink = function (start, title, details, location) {
    const end = new Date(start.getTime() + 3600000);
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: icsStamp(start) + "/" + icsStamp(end),
      details: details || "",
      location: location || "",
    });
    return "https://calendar.google.com/calendar/render?" + p.toString();
  };

  WA.downloadIcs = function (start, title, details, location) {
    const end = new Date(start.getTime() + 3600000);
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "PRODID:-//Ward Academy//Journal Club//EN", "BEGIN:VEVENT",
      "UID:" + icsStamp(start) + "@wardacademy-journalclub",
      "DTSTAMP:" + icsStamp(new Date()),
      "DTSTART:" + icsStamp(start),
      "DTEND:" + icsStamp(end),
      "SUMMARY:" + icsEscape(title),
      "DESCRIPTION:" + icsEscape(details),
      "LOCATION:" + icsEscape(location),
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "journal-club-" + icsStamp(start).slice(0, 8) + ".ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  };

  /* Deep link into availability.html with the slot pre-selected
     (date/hour expressed in the member's active timezone). */
  WA.slotHref = function (date, role) {
    const z = WA.zonedParts(date);
    const p = new URLSearchParams({
      date: z.y + "-" + WA.pad(z.m + 1) + "-" + WA.pad(z.d),
      hour: String(z.hour),
    });
    if (role) p.set("role", role);
    return "availability.html?" + p.toString();
  };

  /* Turns an uploaded image File into a tiny square base64 data URL:
     centre-cropped, downscaled to `size` px, JPEG, with quality stepped
     down until it is comfortably small. Typically 4–8 KB of text. */
  WA.imageFileToTinyDataUrl = function (file, size, maxBytes) {
    size = size || 128;
    maxBytes = maxBytes || 22000; // ~16 KB of image → base64 text
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error("Please choose an image file."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That image could not be loaded."));
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const cx = canvas.getContext("2d");
          cx.imageSmoothingQuality = "high";
          cx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          let q = 0.72, out = canvas.toDataURL("image/jpeg", q);
          while (out.length > maxBytes && q > 0.35) {
            q -= 0.1; out = canvas.toDataURL("image/jpeg", q);
          }
          if (out.length > maxBytes && size > 96) {
            // last resort: shrink further
            return WA.imageFileToTinyDataUrl(file, 96, maxBytes).then(resolve, reject);
          }
          resolve(out);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  /* Compresses an already-sized square canvas to a tiny JPEG data URL,
     stepping quality down until it fits. */
  WA.canvasToTinyJpeg = function (canvas, maxBytes) {
    maxBytes = maxBytes || 22000;
    let q = 0.72, out = canvas.toDataURL("image/jpeg", q);
    while (out.length > maxBytes && q > 0.35) { q -= 0.1; out = canvas.toDataURL("image/jpeg", q); }
    return out;
  };

  WA.copyText = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      WA.toast("Copied to clipboard.", "success");
    } catch (e) {
      WA.toast("Could not copy — copy it manually.", "error");
    }
  };

  /* ---------- rich-text sanitizer (shared board) ----------
     Keeps the structure of text pasted from anywhere (Claude, ChatGPT,
     Word, web pages) but strips ALL styling — inline styles, classes,
     colors and backgrounds — so dark-mode copies don't paste with a
     dark background or white-on-white text. Also removes anything
     executable, so member-written HTML is safe to render. */

  WA.sanitizeHtml = function (html) {
    const ALLOWED = {
      P: 1, BR: 1, DIV: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1,
      H1: 1, H2: 1, H3: 1, H4: 1, UL: 1, OL: 1, LI: 1, A: 1,
      CODE: 1, PRE: 1, BLOCKQUOTE: 1, HR: 1,
      TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TH: 1, TD: 1,
    };
    const DROP = {
      SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, FORM: 1,
      INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1, IMG: 1, VIDEO: 1,
      AUDIO: 1, LINK: 1, META: 1, HEAD: 1, TITLE: 1, SVG: 1, CANVAS: 1,
    };
    const src = new DOMParser().parseFromString(String(html || ""), "text/html");

    function cleanNode(node) {
      if (node.nodeType === 3) return document.createTextNode(node.nodeValue);
      if (node.nodeType !== 1) return null; // comments etc.
      let tag = node.tagName;
      if (DROP[tag]) return null;
      if (tag === "STRIKE" || tag === "DEL") tag = "S";
      if (!ALLOWED[tag]) {
        // Unknown wrapper (span, font, article…) → keep only its children.
        const frag = document.createDocumentFragment();
        for (const c of node.childNodes) {
          const n = cleanNode(c);
          if (n) frag.appendChild(n);
        }
        return frag;
      }
      const el = document.createElement(tag);
      if (tag === "A") {
        const href = WA.safeUrl(node.getAttribute("href"));
        if (href) {
          el.setAttribute("href", href);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
      for (const c of node.childNodes) {
        const n = cleanNode(c);
        if (n) el.appendChild(n);
      }
      return el;
    }

    const out = document.createElement("div");
    for (const c of src.body.childNodes) {
      const n = cleanNode(c);
      if (n) out.appendChild(n);
    }
    return out.innerHTML;
  };

  /* Turns bare http(s) URLs in the text into clickable links that open
     in a new tab. Skips text already inside an <a>, and only emits links
     that pass safeUrl. Safe to run before or after sanitizeHtml. */
  WA.linkifyHtml = function (html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const urlRe = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/g;
    function walk(node) {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          const text = child.nodeValue;
          urlRe.lastIndex = 0;
          if (!urlRe.test(text)) continue;
          urlRe.lastIndex = 0;
          const frag = document.createDocumentFragment();
          let last = 0, m;
          while ((m = urlRe.exec(text))) {
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            const safe = WA.safeUrl(m[0]);
            if (safe) {
              const a = document.createElement("a");
              a.href = safe; a.target = "_blank"; a.rel = "noopener noreferrer";
              a.textContent = m[0];
              frag.appendChild(a);
            } else {
              frag.appendChild(document.createTextNode(m[0]));
            }
            last = m.index + m[0].length;
          }
          if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== "A") {
          walk(child);
        }
      }
    }
    walk(doc.body);
    return doc.body.innerHTML;
  };

  /* ---------- data access ---------- */

  WA.fetchAllAvailabilities = async function () {
    const { data, error } = await WA.client
      .from("availabilities")
      .select("*, profile:profiles(id, full_name, specialty, avatar), article:articles(*)")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  };

  /* Host confirmations that a session actually took place, keyed by the
     slot's ISO timestamp. Returns { map, missing } — missing=true when the
     table hasn't been created yet (migration pending). */
  WA.fetchConfirmations = async function () {
    const res = await WA.client
      .from("session_confirmations")
      .select("*, confirmer:profiles(full_name)");
    if (res.error) {
      const msg = res.error.message || "";
      if (res.error.code === "42P01" || res.error.code === "PGRST205" ||
          /session_confirmations/.test(msg)) {
        return { map: new Map(), missing: true };
      }
      throw res.error;
    }
    const map = new Map();
    for (const r of res.data || []) map.set(new Date(r.slot_start).toISOString(), r);
    return { map, missing: false };
  };

  WA.fetchMeetingsBetween = async function (startIso, endIso) {
    const { data, error } = await WA.client
      .from("meetings")
      .select("*, host:profiles(id, full_name)")
      .gte("slot_start", startIso)
      .lte("slot_start", endIso);
    if (error) throw error;
    const map = new Map();
    for (const m of data || []) map.set(new Date(m.slot_start).toISOString(), m);
    return map;
  };

  /* ---------- page bootstrap ---------- */

  WA.renderConfigWarning = function () {
    const main = document.querySelector("main") || document.body;
    const div = document.createElement("div");
    div.className = "container";
    div.innerHTML =
      '<div class="card setup-warning">' +
      "<h2>⚙️ Setup needed</h2>" +
      "<p>This site is not connected to Supabase yet. Open <code>js/config.js</code> " +
      "and paste your Supabase project URL and anon key, then follow the steps in " +
      "<code>README.md</code> (create the project and run <code>supabase/schema.sql</code>).</p>" +
      "</div>";
    main.prepend(div);
  };

  WA.renderNav = function (active, profile) {
    const el = document.getElementById("nav");
    if (!el) return;
    const links = [
      ["home.html", "Home", "home"],
      ["availability.html", "My Availability", "availability"],
      ["calendar.html", "Calendar", "calendar"],
      ["history.html", "History", "history"],
      ["certificates.html", "Certificates", "certificates"],
      ["research.html", "Research", "research"],
      ["members.html", "Members", "members"],
    ];
    const name = profile ? profile.full_name || "My Profile" : "";
    el.innerHTML =
      '<div class="nav-inner container">' +
      '<a class="brand" href="home.html">' +
      '<span class="brand-mark">WA</span>' +
      '<span class="brand-text"><strong>Ward Academy</strong><em>Journal Club</em></span></a>' +
      '<div class="nav-links" id="nav-links">' +
      links.map(([href, label, key]) =>
        '<a href="' + href + '"' + (key === active ? ' class="active"' : "") + ">" + label + "</a>"
      ).join("") +
      '<a href="profile.html"' + (active === "profile" ? ' class="active"' : "") + ' title="My profile">' +
      WA.avatarHtml(profile, "avatar-sm", "") + " " +
      WA.esc((name || "Profile").split(" ")[0]) + "</a>" +
      '<a href="#" id="nav-signout">Sign out</a>' +
      "</div>" +
      '<div class="nav-bell-wrap" id="nav-bell-wrap">' +
      '<button class="nav-bell" id="nav-bell" aria-label="Notifications" title="Notifications">🔔' +
      '<span class="nav-bell-badge" id="nav-bell-badge"></span></button></div>' +
      '<button class="nav-toggle" id="nav-toggle" aria-label="Menu">☰</button>' +
      "</div>";
    document.getElementById("nav-toggle").addEventListener("click", () => {
      document.getElementById("nav-links").classList.toggle("open");
    });
    document.getElementById("nav-signout").addEventListener("click", async (e) => {
      e.preventDefault();
      await WA.client.auth.signOut();
      window.location.href = "index.html";
    });
  };

  /* Guards an app page: redirects to login when signed out.
     Resolves { user, profile } and renders the nav bar. */
  WA.initAppPage = async function (activeNav) {
    if (!WA.configured() || !WA.client) {
      WA.renderConfigWarning();
      throw new Error("not configured");
    }
    const { data: { session } } = await WA.client.auth.getSession();
    if (!session) {
      window.location.replace("index.html");
      throw new Error("not signed in");
    }
    const user = session.user;
    let profile = null;
    const { data } = await WA.client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    profile = data;
    if (!profile) {
      // Fallback if the DB trigger did not run (e.g. schema applied after signup).
      const ins = await WA.client.from("profiles").insert({
        id: user.id,
        full_name: (user.user_metadata && user.user_metadata.full_name) || "",
      }).select().single();
      profile = ins.data || { id: user.id, full_name: "" };
    }
    WA.renderNav(activeNav, profile);
    if (WA.notifications) WA.notifications.init({ user, profile });
    return { user, profile };
  };

  /* Compact "time ago" for notifications. */
  WA.timeAgo = function (iso) {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return "just now";
    if (s < 90) return "1 min ago";
    const m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    const d = Math.round(h / 24);
    if (d < 7) return d + (d === 1 ? " day ago" : " days ago");
    const w = Math.round(d / 7);
    if (d < 30) return w + (w === 1 ? " week ago" : " weeks ago");
    return new Date(iso).toLocaleDateString();
  };

  /* ============================================================
     Notification bell. Runs lightweight per-category collectors
     (RLS keeps them scoped to the current member), diffs against a
     "last opened" timestamp in localStorage, and renders a badge +
     dropdown. Fails silently if a table isn't there yet.
     ============================================================ */
  WA.notifications = (function () {
    let ctx = null, items = [], wired = false;
    const esc = (s) => WA.esc(s);
    const seenKey = () => "wa_notifs_last_opened_" + (ctx && ctx.user ? ctx.user.id : "x");
    const cacheKey = () => "wa_notifs_cache_" + (ctx && ctx.user ? ctx.user.id : "x");
    function getLastOpened() {
      const v = localStorage.getItem(seenKey());
      if (v) return v;
      // First ever load: start clean (don't flood with all history).
      const now = new Date().toISOString();
      try { localStorage.setItem(seenKey(), now); } catch (e) {}
      return now;
    }
    function markRead() { try { localStorage.setItem(seenKey(), new Date().toISOString()); } catch (e) {} }
    const me = () => ctx.user.id;
    const mk = (ts, icon, html, href, key, ext) => ({ ts, icon, html, href, key, ext: !!ext });
    /* Deep link that opens the session's details modal on the home page. */
    const slotHref = (iso) => "home.html?slot=" + encodeURIComponent(new Date(iso).toISOString());

    async function safe(fn) { try { return (await fn()) || []; } catch (e) { return []; } }

    async function cSessions() {
      const { data } = await WA.client.from("availabilities")
        .select("id, role, kind, slot_start, created_at, user_id, profile:profiles(full_name), article:articles(title)")
        .eq("role", "presenter").order("created_at", { ascending: false }).limit(15);
      return (data || []).filter((a) => a.user_id !== me()).map((a) => {
        const who = a.profile ? a.profile.full_name || "A member" : "A member";
        const art = a.article ? a.article.title : "an article";
        const single = a.kind === "single" && a.slot_start;
        const when = single ? " · " + WA.fmtDateTime(new Date(a.slot_start)) : "";
        return mk(a.created_at, "📄", "<b>" + esc(who) + "</b> will present <b>" + esc(art) + "</b>" + esc(when),
          single ? slotHref(a.slot_start) : "home.html", "sess-" + a.id);
      });
    }
    async function cMeetings() {
      const { data } = await WA.client.from("meetings")
        .select("slot_start, meeting_url, updated_at, host_id").order("updated_at", { ascending: false }).limit(15);
      const floor = Date.now() - 3600000;
      return (data || []).filter((m) => m.host_id !== me() && m.meeting_url && new Date(m.slot_start).getTime() >= floor)
        .map((m) => mk(m.updated_at, "🎥", "Meeting link posted for <b>" + esc(WA.fmtDateTime(new Date(m.slot_start))) + "</b> — tap to join",
          slotHref(m.slot_start), "meet-" + m.slot_start));
    }

    /* Session reminders. One item per upcoming session, escalating through
       tiers as it approaches — each tier has its own key + activation time,
       so a fresh unread pops when the session moves into "starting soon"
       and again when it goes live. */
    async function cReminders() {
      const nowT = Date.now();
      const winStart = new Date(nowT - 3600000);        // include a session already running
      const winEnd = new Date(nowT + 36 * 3600000);
      const rows = await WA.fetchAllAvailabilities();
      const groups = WA.groupOccurrences(WA.expandAvailabilities(rows, winStart, winEnd));
      let meetings = new Map();
      try { meetings = await WA.fetchMeetingsBetween(winStart.toISOString(), winEnd.toISOString()); } catch (e) {}
      const out = [];
      for (const g of groups) {
        if (!g.presenters.length) continue;             // only sessions that will actually happen
        const start = g.date.getTime();
        if (start + 3600000 <= nowT) continue;          // already over
        const art = g.presenters[0] && g.presenters[0].article ? g.presenters[0].article.title : "";
        const label = art ? " — <b>" + esc(art) + "</b>" : "";
        const m = meetings.get(g.iso);
        const link = m && WA.safeUrl(m.meeting_url) ? m.meeting_url : null;
        const mine = g.all.some((a) => a.user_id === me());
        if (nowT >= start) {
          out.push(mk(new Date(start).toISOString(), "🔴",
            "Live now" + label + (link ? " · tap to join" : ""),
            link || slotHref(g.iso), "live-" + g.iso, !!link));
        } else if (start - nowT <= 3600000) {
          const mins = Math.max(1, Math.round((start - nowT) / 60000));
          out.push(mk(new Date(start - 3600000).toISOString(), "⏰",
            "Starting in <b>" + mins + " min</b>" + label + (link ? " · link is up" : ""),
            link || slotHref(g.iso), "soon-" + g.iso, !!link));
        } else if (start - nowT <= 24 * 3600000) {
          out.push(mk(new Date(start - 24 * 3600000).toISOString(), "📅",
            (mine ? "You're in a session soon: " : "Coming up: ") + esc(WA.fmtDateTime(g.date)) + label,
            slotHref(g.iso), "soon24-" + g.iso));
        }
      }
      return out;
    }
    async function cCertificates() {
      const [av, confs] = await Promise.all([
        WA.client.from("availabilities").select("slot_start, article:articles(title)").eq("user_id", me()).eq("role", "presenter").eq("kind", "single"),
        WA.client.from("session_confirmations").select("slot_start, confirmed_at"),
      ]);
      if (!av.data || !confs.data) return [];
      const cmap = new Map(confs.data.map((c) => [new Date(c.slot_start).toISOString(), c]));
      const out = [];
      for (const a of av.data) {
        if (!a.slot_start) continue;
        const c = cmap.get(new Date(a.slot_start).toISOString());
        if (c) {
          const art = a.article ? a.article.title : "your presentation";
          out.push(mk(c.confirmed_at, "🎓", "Your certificate for <b>" + esc(art) + "</b> is ready", "certificates.html", "cert-" + new Date(a.slot_start).toISOString()));
        }
      }
      return out;
    }
    async function cResearchProjects() {
      const { data } = await WA.client.from("research_projects")
        .select("id, title, created_at, updated_at").order("updated_at", { ascending: false }).limit(15);
      return (data || []).filter((p) => p.updated_at && (new Date(p.updated_at) - new Date(p.created_at)) > 3000)
        .map((p) => mk(p.updated_at, "🔬", "Project <b>" + esc(p.title || "Untitled") + "</b> was updated", "research.html?project=" + p.id, "proj-" + p.id + "-" + p.updated_at));
    }
    async function cResearchApps() {
      const { data } = await WA.client.from("research_applications")
        .select("id, status, created_at, updated_at, applicant_id, recruitment_id, applicant:applicant_id(full_name), recruitment:recruitment_id(created_by, project_id)")
        .order("created_at", { ascending: false }).limit(25);
      const out = [];
      for (const a of data || []) {
        const rec = a.recruitment || {};
        if (rec.created_by === me() && a.applicant_id !== me()) {
          const who = a.applicant ? a.applicant.full_name || "Someone" : "Someone";
          // Opens the review modal for that call, so the owner can decide right away.
          out.push(mk(a.created_at, "📨", "<b>" + esc(who) + "</b> applied to co-author your project — tap to review",
            "research.html?applications=" + encodeURIComponent(a.recruitment_id), "app-" + a.id));
        }
        if (a.applicant_id === me() && (a.status === "accepted" || a.status === "rejected")) {
          const accepted = a.status === "accepted";
          out.push(mk(a.updated_at || a.created_at, accepted ? "✅" : "ℹ️",
            accepted ? "You're now a co-author on a research project! 🎉" : "A co-author application wasn't selected this time",
            accepted ? "research.html?project=" + rec.project_id : "research.html", "appdec-" + a.id));
        }
      }
      return out;
    }
    async function cOpenPositions() {
      const { data } = await WA.client.from("research_recruitments")
        .select("id, specialty, created_at, created_by").eq("status", "open").order("created_at", { ascending: false }).limit(15);
      return (data || []).filter((r) => r.created_by !== me()).map((r) => {
        const spec = (r.specialty || "").trim();
        const where = spec ? " in <b>" + esc(spec) + "</b>" : "";
        return mk(r.created_at, "🤝",
          "A research project" + where + " is looking for co-authors — tap to volunteer",
          "research.html?apply=" + encodeURIComponent(r.id), "rec-" + r.id);
      });
    }

    async function load() {
      const groups = await Promise.all([
        safe(cReminders), safe(cSessions), safe(cMeetings), safe(cCertificates),
        safe(cResearchProjects), safe(cResearchApps), safe(cOpenPositions),
      ]);
      const seen = new Set();
      const all = [];
      for (const g of groups) for (const it of g) {
        if (!it || !it.ts || seen.has(it.key)) continue;
        seen.add(it.key); all.push(it);
      }
      all.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
      items = all.slice(0, 40);
      try { sessionStorage.setItem(cacheKey(), JSON.stringify(items)); } catch (e) {}
      render();
    }

    function unseenCount() {
      const last = getLastOpened();
      return items.filter((it) => it.ts > last).length;
    }
    function updateBadge() {
      const b = document.getElementById("nav-bell-badge");
      if (!b) return;
      const n = unseenCount();
      if (n > 0) { b.textContent = n > 9 ? "9+" : String(n); b.classList.add("on"); }
      else { b.textContent = ""; b.classList.remove("on"); }
    }
    function panelHtml() {
      const last = getLastOpened();
      const rows = items.length ? items.map((it) => {
        const unseen = it.ts > last ? " unseen" : "";
        // Meeting links point off-site: open them in a new tab.
        const target = it.ext ? ' target="_blank" rel="noopener noreferrer"' : "";
        const href = it.ext ? (WA.safeUrl(it.href) || "home.html") : it.href;
        return '<a class="notif-item' + unseen + '" href="' + esc(href) + '"' + target + ">" +
          '<span class="notif-ic">' + it.icon + "</span>" +
          '<span class="notif-body"><span class="notif-text">' + it.html + "</span>" +
          '<span class="notif-time">' + esc(WA.timeAgo(it.ts)) + "</span></span></a>";
      }).join("") : '<div class="notif-empty"><span class="big">🔔</span>You\'re all caught up</div>';
      const n = unseenCount();
      return '<div class="notif-head"><strong>Notifications</strong>' +
        '<button class="notif-mark" id="notif-mark"' + (n ? "" : " disabled") + ">Mark all read</button></div>" +
        '<div class="notif-list">' + rows + "</div>";
    }
    function render() {
      updateBadge();
      const panel = document.getElementById("notif-panel");
      if (panel && panel.classList.contains("open")) panel.innerHTML = panelHtml();
    }
    function ensurePanel() {
      let panel = document.getElementById("notif-panel");
      if (!panel) {
        const wrap = document.getElementById("nav-bell-wrap");
        if (!wrap) return null;
        panel = document.createElement("div");
        panel.className = "notif-panel"; panel.id = "notif-panel";
        wrap.appendChild(panel);
      }
      return panel;
    }
    function closePanel() { const p = document.getElementById("notif-panel"); if (p) p.classList.remove("open"); }
    function openPanel() {
      const panel = ensurePanel(); if (!panel) return;
      panel.innerHTML = panelHtml();
      panel.classList.add("open");
      const mark = document.getElementById("notif-mark");
      if (mark) mark.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); markRead(); updateBadge(); const mk2 = document.getElementById("notif-mark"); if (mk2) mk2.setAttribute("disabled", ""); panel.querySelectorAll(".notif-item.unseen").forEach((el) => el.classList.remove("unseen")); });
      // Acknowledge: badge clears now, but the list keeps this render's highlights.
      markRead(); updateBadge();
    }
    function togglePanel() {
      const p = document.getElementById("notif-panel");
      if (p && p.classList.contains("open")) closePanel(); else openPanel();
    }
    function wire() {
      if (wired) return; wired = true;
      const bell = document.getElementById("nav-bell");
      if (bell) bell.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); togglePanel(); });
      document.addEventListener("click", (e) => {
        const p = document.getElementById("notif-panel");
        if (!p || !p.classList.contains("open")) return;
        if (!p.contains(e.target) && e.target.id !== "nav-bell" && !(e.target.closest && e.target.closest("#nav-bell"))) closePanel();
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
    }

    function init(context) {
      ctx = context;
      wire();
      try { const c = sessionStorage.getItem(cacheKey()); if (c) { items = JSON.parse(c) || []; render(); } } catch (e) {}
      load();
      // Re-run periodically so time-based reminders ("starting in 20 min",
      // "live now") arrive even if the tab is left open, and refresh as soon
      // as the member comes back to the tab.
      setInterval(() => { if (!document.hidden) load(); }, 120000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
    }
    return { init, reload: load };
  })();

  /* ============================================================
     Co-author recruitment board ("open positions").
     Self-contained + page-agnostic: injects its own styles and
     modals (wapo-* class names) so it renders identically on the
     Home and Research pages. Reads/writes research_recruitments
     and research_applications; degrades to hidden if those tables
     don't exist yet.
     ============================================================ */
  WA.positions = (function () {
    let ctx = null, container = null, onChange = null;
    let recruitments = [], applications = [], myApps = {}, showHidden = false, wired = false;
    const HIDDEN_KEY = "wa_research_hidden_positions";
    const esc = (s) => WA.esc(s);
    const $ = (id) => document.getElementById(id);
    const openM = (id) => { const e = $(id); if (e) e.classList.add("active"); };
    const closeM = (id) => { const e = $(id); if (e) e.classList.remove("active"); };
    function getHidden() { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]") || []; } catch (e) { return []; } }
    function setHidden(a) { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(a)); } catch (e) {} }
    function initials(name) { const p = String(name || "?").trim().split(/\s+/).filter(Boolean); return (p.map((w) => w[0]).slice(0, 2).join("").toUpperCase()) || "?"; }
    function wc(s) { return ((s || "").trim().match(/\S+/g) || []).length; }

    const STYLE = [
      "<style id='wapo-styles'>",
      ".wapo-section{margin:20px 0;}",
      ".wapo-card{background:#fff;border:1px solid #e2e8f2;border-radius:14px;box-shadow:0 1px 2px rgba(10,49,97,.06);padding:18px 20px;}",
      ".wapo-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}",
      ".wapo-title{margin:0;font-size:1.15rem;color:#0a3161;font-weight:800;}",
      ".wapo-intro{color:#64748b;font-size:.85rem;margin:.35rem 0 1rem;}",
      ".wapo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;}",
      ".wapo-item{border:1px solid #e2e8f2;border-radius:14px;padding:1rem;background:#fff;display:flex;flex-direction:column;gap:.6rem;}",
      ".wapo-item.mine{border-color:#0a3161;background:linear-gradient(180deg,#f8faff,#fff);}",
      ".wapo-cardhead{display:flex;align-items:center;gap:.6rem;}",
      ".wapo-avatar{flex-shrink:0;width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;color:#fff;background:#0a3161;}",
      ".wapo-name{font-weight:700;color:#0a3161;font-size:.95rem;}",
      ".wapo-you{font-size:.66rem;font-weight:700;text-transform:uppercase;color:#fff;background:#b31942;padding:1px 6px;border-radius:999px;margin-left:.25rem;}",
      ".wapo-spec{font-size:.82rem;color:#8e1434;font-weight:600;}",
      ".wapo-help{font-size:.85rem;color:#334155;line-height:1.4;}",
      ".wapo-help strong{color:#0a3161;}",
      ".wapo-cap{font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;}",
      ".wapo-frow{display:flex;gap:.4rem;align-items:baseline;font-size:.85rem;line-height:1.4;flex-wrap:wrap;}",
      ".wapo-flabel{flex-shrink:0;font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;}",
      ".wapo-fval{color:#334155;}",
      ".wapo-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:auto;}",
      ".wapo-btn{display:inline-flex;align-items:center;justify-content:center;gap:.3rem;padding:.45rem .8rem;border-radius:8px;border:0;cursor:pointer;font:inherit;font-weight:600;font-size:.85rem;text-decoration:none;line-height:1.2;}",
      ".wapo-btn.primary{background:#b31942;color:#fff;}.wapo-btn.primary:hover{background:#8e1434;}",
      ".wapo-btn.ghost{background:#fff;border:1.5px solid #e2e8f2;color:#0a3161;}.wapo-btn.ghost:hover{background:#f7f8fb;}",
      ".wapo-btn.danger{background:#fff;border:1.5px solid #dc2626;color:#dc2626;}.wapo-btn.danger:hover{background:#fef2f2;}",
      ".wapo-status{font-size:.8rem;font-weight:700;padding:.3rem .6rem;border-radius:999px;}",
      ".wapo-status.pending{background:#fef3c7;color:#92400e;}.wapo-status.accepted{background:#dcfce7;color:#15803d;}.wapo-status.rejected{background:#eef1f6;color:#64748b;}",
      ".wapo-overlay{position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(10,22,40,.6);z-index:1000;display:none;align-items:flex-start;justify-content:center;padding:24px 14px;overflow-y:auto;-webkit-overflow-scrolling:touch;}",
      ".wapo-overlay.active{display:flex;}",
      ".wapo-modal{background:#fff;border-radius:14px;width:100%;max-width:560px;box-shadow:0 16px 50px rgba(0,0,0,.32);}",
      ".wapo-mhead{display:flex;align-items:center;justify-content:space-between;padding:1.1rem 1.25rem;background:#0a3161;color:#fff;border-radius:14px 14px 0 0;}",
      ".wapo-mtitle{font-size:1.1rem;font-weight:700;}",
      ".wapo-mclose{background:rgba(255,255,255,.15);border:0;color:#fff;width:34px;height:34px;border-radius:8px;font-size:1.4rem;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;}",
      ".wapo-mclose:hover{background:rgba(255,255,255,.28);}",
      ".wapo-mbody{padding:1.25rem;}",
      ".wapo-mfoot{display:flex;justify-content:flex-end;gap:.6rem;padding:1rem 1.25rem;border-top:1px solid #e2e8f2;background:#f7f8fb;border-radius:0 0 14px 14px;flex-wrap:wrap;}",
      ".wapo-field{margin-bottom:1rem;}",
      ".wapo-label{display:block;font-weight:600;font-size:.88rem;color:#0a3161;margin-bottom:.35rem;}",
      ".wapo-input,.wapo-textarea{width:100%;padding:.6rem .7rem;border:1.5px solid #e2e8f2;border-radius:10px;font:inherit;font-size:16px;background:#fff;color:#1c2536;box-sizing:border-box;}",
      ".wapo-textarea{min-height:96px;resize:vertical;}",
      ".wapo-hint{display:block;font-size:.78rem;color:#64748b;margin-top:.3rem;}",
      ".wapo-optional{font-weight:400;color:#64748b;font-size:.82rem;}",
      ".wapo-summary{background:#f7f8fb;border:1px solid #e2e8f2;border-radius:12px;padding:.75rem .9rem;margin-bottom:1rem;}",
      ".wapo-appitem{border:1px solid #e2e8f2;border-radius:12px;padding:.9rem 1rem;margin-bottom:.85rem;display:flex;flex-direction:column;gap:.6rem;}",
      ".wapo-row{display:flex;justify-content:space-between;align-items:center;gap:.6rem;flex-wrap:wrap;}",
      ".wapo-pitch{background:#f7f8fb;border-radius:8px;padding:.6rem .75rem;font-size:.88rem;color:#334155;line-height:1.5;white-space:pre-wrap;}",
      ".wapo-meta{font-size:.85rem;color:#475569;}",
      ".wapo-wa{color:#16a34a;font-weight:600;text-decoration:none;}.wapo-wa:hover{text-decoration:underline;}",
      ".wapo-note{background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;border-radius:10px;padding:.7rem .85rem;font-size:.83rem;line-height:1.5;margin-bottom:1rem;}",
      ".wapo-empty{color:#94a3b8;font-size:.85rem;}",
      "@media (max-width:640px){.wapo-modal{max-height:96vh;overflow-y:auto;}}",
      "</style>",
    ].join("");

    const MODALS =
      "<div id='wapo-apply' class='wapo-overlay'><div class='wapo-modal'>" +
      "<div class='wapo-mhead'><span class='wapo-mtitle'>✋ Apply to join</span><button type='button' class='wapo-mclose' data-close='wapo-apply'>&times;</button></div>" +
      "<div class='wapo-mbody'><div id='wapo-apply-summary' class='wapo-summary'></div><input type='hidden' id='wapo-apply-rid'>" +
      "<p class='wapo-hint'>The owner will see your name, specialty, WhatsApp and note, and decide whether to add you as a co-author.</p>" +
      "<div class='wapo-field'><label class='wapo-label'>WhatsApp number *</label><input type='text' id='wapo-apply-wa' class='wapo-input' placeholder='+55 11 90000-0000'></div>" +
      "<div class='wapo-field'><label class='wapo-label'>How can you help? <span class='wapo-optional'>(up to 100 words)</span></label><textarea id='wapo-apply-pitch' class='wapo-textarea' placeholder='Your relevant experience and how you can contribute...'></textarea><span class='wapo-hint'><span id='wapo-apply-count'>0</span>/100 words</span></div></div>" +
      "<div class='wapo-mfoot'><button type='button' class='wapo-btn ghost' data-close='wapo-apply'>Cancel</button><button type='button' class='wapo-btn primary' id='wapo-apply-send'>Send application</button></div>" +
      "</div></div>" +
      "<div id='wapo-apps' class='wapo-overlay'><div class='wapo-modal' style='max-width:720px;'>" +
      "<div class='wapo-mhead'><span class='wapo-mtitle'>📨 Applications</span><button type='button' class='wapo-mclose' data-close='wapo-apps'>&times;</button></div>" +
      "<div class='wapo-mbody'><div id='wapo-apps-list'></div></div>" +
      "<div class='wapo-mfoot'><button type='button' class='wapo-btn ghost' data-close='wapo-apps'>Close</button></div>" +
      "</div></div>" +
      "<div id='wapo-recruit' class='wapo-overlay'><div class='wapo-modal'>" +
      "<div class='wapo-mhead'><span class='wapo-mtitle'>🤝 Recruit Co-authors</span><button type='button' class='wapo-mclose' data-close='wapo-recruit'>&times;</button></div>" +
      "<div class='wapo-mbody'><div id='wapo-recruit-existing' style='display:none;'></div><div id='wapo-recruit-form'>" +
      "<p class='wapo-hint'>Post an anonymous call. Members see only your name, specialty and what you need — not the project title or links. When you accept someone, they become a co-author and can see the project.</p>" +
      "<input type='hidden' id='wapo-recruit-pid'>" +
      "<div class='wapo-field'><label class='wapo-label'>Your specialty *</label><input type='text' id='wapo-recruit-spec' class='wapo-input' placeholder='e.g. Cardiology'></div>" +
      "<div class='wapo-field'><label class='wapo-label'>What help do you need? <span class='wapo-optional'>(optional)</span></label><input type='text' id='wapo-recruit-help' class='wapo-input' placeholder='e.g. statistical analysis, study screening, writing Methods'></div></div></div>" +
      "<div class='wapo-mfoot'><button type='button' class='wapo-btn ghost' data-close='wapo-recruit'>Cancel</button><button type='button' class='wapo-btn primary' id='wapo-recruit-send'>Post position</button></div>" +
      "</div></div>";

    function ensureDom() {
      if (!document.getElementById("wapo-styles")) document.head.insertAdjacentHTML("beforeend", STYLE);
      if (!document.getElementById("wapo-apply")) {
        document.body.insertAdjacentHTML("beforeend", MODALS);
        // dismissal: backdrop click + Esc
        Array.prototype.forEach.call(document.querySelectorAll(".wapo-overlay"), (ov) => {
          ov.addEventListener("mousedown", (e) => { ov._d = e.target === ov; });
          ov.addEventListener("click", (e) => { if (e.target === ov && ov._d) ov.classList.remove("active"); });
        });
        Array.prototype.forEach.call(document.querySelectorAll(".wapo-mclose,[data-close]"), (b) => {
          b.addEventListener("click", () => closeM(b.getAttribute("data-close")));
        });
        document.addEventListener("keydown", (e) => {
          if (e.key !== "Escape") return;
          const open = document.querySelectorAll(".wapo-overlay.active");
          if (open.length) open[open.length - 1].classList.remove("active");
        });
        $("wapo-apply-send").addEventListener("click", submitApply);
        $("wapo-apply-pitch").addEventListener("input", () => {
          const n = wc($("wapo-apply-pitch").value); const el = $("wapo-apply-count");
          el.textContent = n; el.style.color = n > 100 ? "#dc2626" : "";
        });
        $("wapo-recruit-send").addEventListener("click", submitRecruit);
        $("wapo-apps-list").addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-act]"); if (!btn) return;
          const id = Number(btn.getAttribute("data-id"));
          if (btn.getAttribute("data-act") === "accept") acceptApp(id);
          else if (btn.getAttribute("data-act") === "reject") rejectApp(id);
        });
      }
    }

    async function load() {
      try {
        const { data: recs, error } = await WA.client.from("research_recruitments")
          .select("*, owner:created_by(id, full_name, specialty)").eq("status", "open").order("created_at", { ascending: false });
        if (error) throw error;
        recruitments = recs || [];
        const { data: apps } = await WA.client.from("research_applications")
          .select("*, applicant:applicant_id(id, full_name, specialty)");
        applications = apps || [];
        myApps = {}; applications.forEach((a) => { if (a.applicant_id === ctx.user.id) myApps[a.recruitment_id] = a; });
        render();
        handleDeepLink();
      } catch (e) {
        console.warn("Open-positions board unavailable (run schema.sql sections 8-9):", (e && e.message) || e);
        if (container) container.innerHTML = "";
      }
    }

    /* Notification deep links:
         ?apply=<id>        → open the "apply to join" form for that call
         ?applications=<id> → open the owner's review list for that call
       Runs once, after the board's data is in, then strips the param so a
       refresh doesn't reopen the modal. */
    let deepLinkDone = false;
    function handleDeepLink() {
      if (deepLinkDone) return;
      deepLinkDone = true;
      const params = new URLSearchParams(window.location.search);
      const applyId = params.get("apply");
      const appsId = params.get("applications");
      if (!applyId && !appsId) return;
      const id = Number(applyId || appsId);
      const r = recruitments.find((x) => String(x.id) === String(id));
      if (!r) {
        WA.toast("That position is no longer open.", "info");
      } else if (appsId || r.created_by === ctx.user.id) {
        if (r.created_by !== ctx.user.id) WA.toast("Only the project owner can review applications.", "info");
        else openApps(id);
      } else if (myApps[id]) {
        WA.toast("You already applied to this position.", "info");
      } else {
        openApply(id);
      }
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("apply"); url.searchParams.delete("applications");
        window.history.replaceState({}, "", url);
      } catch (e) {}
    }

    function render() {
      if (!container) return;
      if (!recruitments.length) { container.innerHTML = ""; return; }
      const hidden = getHidden();
      const hiddenCount = recruitments.filter((r) => r.created_by !== ctx.user.id && hidden.includes(r.id)).length;
      const toShow = showHidden ? recruitments : recruitments.filter((r) => r.created_by === ctx.user.id || !hidden.includes(r.id));
      const toggle = hiddenCount > 0
        ? "<button type='button' class='wapo-btn ghost' data-toggle-hidden>" + (showHidden ? "Hide hidden (" + hiddenCount + ")" : "Show hidden (" + hiddenCount + ")") + "</button>"
        : "";
      const cards = toShow.length ? toShow.map((r) => cardHtml(r, hidden.includes(r.id))).join("") : "<p class='wapo-empty'>No open positions right now.</p>";
      container.innerHTML =
        "<section class='wapo-section'><div class='wapo-card'>" +
        "<div class='wapo-head'><h2 class='wapo-title'>🤝 Open positions — co-authors wanted</h2>" + toggle + "</div>" +
        "<p class='wapo-intro'>Members looking for co-authors. Project titles and links stay private — you'll see the full project only if the owner accepts you.</p>" +
        "<div class='wapo-grid'>" + cards + "</div></div></section>";
      const tg = container.querySelector("[data-toggle-hidden]");
      if (tg) tg.addEventListener("click", () => { showHidden = !showHidden; render(); });
      Array.prototype.forEach.call(container.querySelectorAll("button[data-act]"), (btn) => {
        btn.addEventListener("click", () => {
          const id = Number(btn.getAttribute("data-id")); const act = btn.getAttribute("data-act");
          if (act === "apply") openApply(id);
          else if (act === "hide") { const h = getHidden(); if (!h.includes(id)) h.push(id); setHidden(h); render(); }
          else if (act === "unhide") { setHidden(getHidden().filter((x) => x !== id)); render(); }
          else if (act === "apps") openApps(id);
          else if (act === "close") closeRecruitment(id);
        });
      });
    }

    function cardHtml(r, isHidden) {
      const owner = r.owner || {}; const name = owner.full_name || "Member";
      const mine = r.created_by === ctx.user.id; const app = myApps[r.id]; let actions = "";
      if (mine) {
        const n = applications.filter((a) => a.recruitment_id === r.id).length;
        actions = "<button type='button' class='wapo-btn primary' data-act='apps' data-id='" + r.id + "'>📨 Applications (" + n + ")</button>" +
          "<button type='button' class='wapo-btn ghost' data-act='close' data-id='" + r.id + "'>Close position</button>";
      } else if (app) {
        actions = app.status === "accepted" ? "<span class='wapo-status accepted'>✓ Accepted — you're a co-author</span>"
          : (app.status === "rejected" ? "<span class='wapo-status rejected'>Not selected</span>" : "<span class='wapo-status pending'>⏳ Application sent</span>");
      } else {
        actions = "<button type='button' class='wapo-btn primary' data-act='apply' data-id='" + r.id + "'>✋ Apply to join</button>" +
          (isHidden ? "<button type='button' class='wapo-btn ghost' data-act='unhide' data-id='" + r.id + "'>Unhide</button>"
                    : "<button type='button' class='wapo-btn ghost' data-act='hide' data-id='" + r.id + "'>Hide</button>");
      }
      return "<div class='wapo-item" + (mine ? " mine" : "") + "'>" +
        "<div class='wapo-cardhead'><span class='wapo-avatar'>" + esc(initials(name)) + "</span><div><div class='wapo-cap'>Posted by</div><div class='wapo-name'>" + esc(name) + (mine ? " <span class='wapo-you'>you</span>" : "") + "</div></div></div>" +
        "<div class='wapo-frow'><span class='wapo-flabel'>Specialty</span><span class='wapo-fval wapo-spec'>" + esc(r.specialty || "—") + "</span></div>" +
        (r.help_area ? "<div class='wapo-frow'><span class='wapo-flabel'>Needs help with</span><span class='wapo-fval'>" + esc(r.help_area) + "</span></div>" : "") +
        "<div class='wapo-actions'>" + actions + "</div></div>";
    }

    function openApply(recId) {
      const r = recruitments.find((x) => x.id === recId); if (!r) return;
      const owner = r.owner || {}; const name = owner.full_name || "Member";
      $("wapo-apply-rid").value = recId;
      $("wapo-apply-summary").innerHTML = "<div class='wapo-cardhead'><span class='wapo-avatar'>" + esc(initials(name)) + "</span><div><div class='wapo-cap'>Posted by</div><div class='wapo-name'>" + esc(name) + "</div></div></div>" +
        "<div class='wapo-frow'><span class='wapo-flabel'>Specialty</span><span class='wapo-fval wapo-spec'>" + esc(r.specialty || "—") + "</span></div>" +
        (r.help_area ? "<div class='wapo-frow'><span class='wapo-flabel'>Needs help with</span><span class='wapo-fval'>" + esc(r.help_area) + "</span></div>" : "");
      $("wapo-apply-wa").value = ""; $("wapo-apply-pitch").value = ""; $("wapo-apply-count").textContent = "0"; $("wapo-apply-count").style.color = "";
      openM("wapo-apply");
    }
    async function submitApply() {
      const recId = Number($("wapo-apply-rid").value);
      const whatsapp = $("wapo-apply-wa").value.trim(); const pitch = $("wapo-apply-pitch").value.trim();
      if (!whatsapp) { WA.toast("Enter your WhatsApp number", "info"); return; }
      if (wc(pitch) > 100) { WA.toast("Please keep your note under 100 words", "info"); return; }
      const r = recruitments.find((x) => x.id === recId); if (!r) return;
      const { error } = await WA.client.from("research_applications").insert({ recruitment_id: recId, project_id: r.project_id, applicant_id: ctx.user.id, whatsapp, pitch: pitch || null, status: "pending" });
      if (error) {
        if (error.code === "23505" || /duplicate/i.test(error.message || "")) { WA.toast("You already applied to this position", "info"); closeM("wapo-apply"); }
        else { console.error(error); WA.toast("Failed to send application", "error"); }
        return;
      }
      closeM("wapo-apply"); WA.toast("Application sent!", "success"); await load();
    }

    function openApps(recId) {
      const apps = applications.filter((a) => a.recruitment_id === recId);
      $("wapo-apps-list").innerHTML = apps.length ? apps.map(appItemHtml).join("") : "<p class='wapo-empty'>No applications yet.</p>";
      openM("wapo-apps");
    }
    function appItemHtml(a) {
      const ap = a.applicant || {}; const name = ap.full_name || "Member";
      const wa = a.whatsapp ? String(a.whatsapp) : ""; const digits = wa.replace(/[^0-9]/g, "");
      const badge = a.status === "accepted" ? "<span class='wapo-status accepted'>✓ Accepted</span>"
        : (a.status === "rejected" ? "<span class='wapo-status rejected'>Rejected</span>" : "<span class='wapo-status pending'>Pending</span>");
      let btns = "";
      if (a.status === "pending") btns = "<button type='button' class='wapo-btn primary' data-act='accept' data-id='" + a.id + "'>✓ Accept as co-author</button><button type='button' class='wapo-btn danger' data-act='reject' data-id='" + a.id + "'>Reject</button>";
      else if (a.status === "rejected") btns = "<button type='button' class='wapo-btn primary' data-act='accept' data-id='" + a.id + "'>✓ Accept anyway</button>";
      return "<div class='wapo-appitem'>" +
        "<div class='wapo-row'><div class='wapo-cardhead'><span class='wapo-avatar'>" + esc(initials(name)) + "</span><div><div class='wapo-cap'>Applicant</div><div class='wapo-name'>" + esc(name) + "</div>" + (ap.specialty ? "<div class='wapo-spec'>" + esc(ap.specialty) + "</div>" : "") + "</div></div>" + badge + "</div>" +
        (a.pitch ? "<div class='wapo-frow' style='flex-direction:column;align-items:flex-start;gap:.2rem;'><span class='wapo-flabel'>How they can help</span><div class='wapo-pitch'>" + esc(a.pitch) + "</div></div>" : "") +
        "<div class='wapo-meta'>" + (wa ? "<span class='wapo-flabel'>WhatsApp</span> " + esc(wa) + (digits ? " &nbsp;<a href='https://wa.me/" + digits + "' target='_blank' rel='noopener noreferrer' class='wapo-wa'>Open WhatsApp ↗</a>" : "") : "<span class='wapo-empty'>No WhatsApp provided</span>") + "</div>" +
        "<div class='wapo-actions'>" + btns + "</div></div>";
    }
    async function acceptApp(appId) {
      const a = applications.find((x) => x.id === appId); if (!a) return;
      if (!confirm("Accept this member as a co-author? They will get full access to the project.")) return;
      try {
        const { data: pr } = await WA.client.from("research_projects").select("participants").eq("id", a.project_id).single();
        const participants = Array.from(new Set([].concat((pr && pr.participants) || [], [a.applicant_id])));
        const { error: pe } = await WA.client.from("research_projects").update({ participants, updated_at: new Date().toISOString() }).eq("id", a.project_id); if (pe) throw pe;
        const { error: ae } = await WA.client.from("research_applications").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", appId); if (ae) throw ae;
        WA.toast("Accepted! Added as co-author.", "success");
        await load(); openApps(a.recruitment_id); if (onChange) try { onChange(); } catch (e) {}
      } catch (e) { console.error(e); WA.toast("Failed to accept application", "error"); }
    }
    async function rejectApp(appId) {
      const a = applications.find((x) => x.id === appId); if (!a) return;
      if (!confirm("Reject this application?")) return;
      const { error } = await WA.client.from("research_applications").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", appId);
      if (error) { WA.toast("Failed to reject", "error"); return; }
      WA.toast("Application rejected", "info"); await load(); openApps(a.recruitment_id);
    }

    /* Owner posts / manages a call for a specific project (used by the Research page). */
    function openRecruitForProject(project) {
      if (!project) return;
      ensureDom();
      const existing = recruitments.find((r) => r.project_id === project.id && r.created_by === ctx.user.id);
      const form = $("wapo-recruit-form"), ex = $("wapo-recruit-existing"), send = $("wapo-recruit-send");
      $("wapo-recruit-pid").value = project.id;
      if (existing) {
        const n = applications.filter((a) => a.recruitment_id === existing.id).length;
        ex.style.display = "block"; form.style.display = "none"; send.style.display = "none";
        ex.innerHTML = "<div class='wapo-note'>This project already has an open position — <strong>" + esc(existing.specialty) + "</strong>" + (existing.help_area ? " · " + esc(existing.help_area) : "") + ". <strong>" + n + "</strong> application" + (n === 1 ? "" : "s") +
          ".<div style='margin-top:.7rem;display:flex;gap:.5rem;flex-wrap:wrap;'><button type='button' class='wapo-btn primary' data-open-apps='" + existing.id + "'>📨 View applications</button><button type='button' class='wapo-btn ghost' data-close-rec='" + existing.id + "'>Close position</button></div></div>";
        ex.querySelector("[data-open-apps]").addEventListener("click", () => { closeM("wapo-recruit"); openApps(existing.id); });
        ex.querySelector("[data-close-rec]").addEventListener("click", () => closeRecruitment(existing.id));
      } else {
        ex.style.display = "none"; form.style.display = "block"; send.style.display = "inline-flex";
        $("wapo-recruit-spec").value = (ctx.profile && ctx.profile.specialty) || ""; $("wapo-recruit-help").value = "";
      }
      openM("wapo-recruit");
    }
    async function submitRecruit() {
      const projectId = Number($("wapo-recruit-pid").value);
      const specialty = $("wapo-recruit-spec").value.trim(); const help = $("wapo-recruit-help").value.trim();
      if (!specialty) { WA.toast("Enter your specialty", "info"); return; }
      const { error } = await WA.client.from("research_recruitments").insert({ project_id: projectId, created_by: ctx.user.id, specialty, help_area: help || null, status: "open" });
      if (error) { console.error(error); WA.toast("Failed to post position", "error"); return; }
      closeM("wapo-recruit"); WA.toast("Position posted!", "success"); await load();
    }
    async function closeRecruitment(recId) {
      if (!confirm("Close this position? It will be removed from the board.")) return;
      const { error } = await WA.client.from("research_recruitments").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", recId);
      if (error) { WA.toast("Failed to close position", "error"); return; }
      closeM("wapo-recruit"); closeM("wapo-apps"); WA.toast("Position closed", "info"); await load();
    }

    /* Post a call for a freshly-created project (used by the Research create flow). */
    async function postForProject(projectId, specialty, helpArea) {
      const spec = (specialty || (ctx.profile && ctx.profile.specialty) || "").trim();
      if (!spec) return { error: "no-specialty" };
      const { error } = await WA.client.from("research_recruitments").insert({ project_id: projectId, created_by: ctx.user.id, specialty: spec, help_area: (helpArea || "").trim() || null, status: "open" });
      return { error };
    }

    function mount(el, context, opts) {
      container = el; ctx = context; onChange = (opts && opts.onChange) || null;
      ensureDom();
      load();
    }
    return { mount, reload: load, openRecruitForProject, postForProject };
  })();
})();
