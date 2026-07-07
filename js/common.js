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

  WA.fmtDate = function (d) {
    return WA.WEEKDAYS_SHORT[d.getDay()] + ", " + WA.MONTHS[d.getMonth()].slice(0, 3) +
      " " + d.getDate() + ", " + d.getFullYear();
  };
  WA.fmtDateTime = function (d) {
    return WA.fmtDate(d) + " · " + WA.hourRange(d.getHours());
  };

  WA.timezoneName = function () {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time";
    } catch (e) {
      return "your local time";
    }
  };

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

  WA.ROLES = {
    host: {
      label: "Host",
      badge: "badge-host",
      blurb: "Moderates the session, keeps time, opens the discussion and provides the meeting link.",
    },
    presenter: {
      label: "Presenter",
      badge: "badge-presenter",
      blurb: "Presents and critically appraises the article. Requires attaching the article.",
    },
    attendee: {
      label: "Attendee",
      badge: "badge-attendee",
      blurb: "Joins the call, listens and participates in the discussion.",
    },
  };

  WA.roleBadge = function (role) {
    const r = WA.ROLES[role] || { label: role, badge: "badge-attendee" };
    return '<span class="badge ' + r.badge + '">' + WA.esc(r.label) + "</span>";
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
     the viewer's local timezone for display. Note: for members in
     countries with daylight saving time, recurring slots keep their
     UTC time, so the local time may shift by 1h across DST changes. */

  WA.localRecurringToUtc = function (weekdayLocal, hourLocal) {
    const d = new Date();
    d.setHours(hourLocal, 0, 0, 0);
    while (d.getDay() !== weekdayLocal) d.setDate(d.getDate() + 1);
    return { weekday_utc: d.getUTCDay(), hour_utc: d.getUTCHours() };
  };

  WA.utcRecurringToLocal = function (weekdayUtc, hourUtc) {
    const now = new Date();
    const d = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0
    ));
    while (d.getUTCDay() !== weekdayUtc) d.setUTCDate(d.getUTCDate() + 1);
    return { weekday: d.getDay(), hour: d.getHours() };
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
     { iso, date, hosts, presenters, attendees, all } sorted by time,
     de-duplicating a user who appears twice in the same slot+role. */
  WA.groupOccurrences = function (occurrences) {
    const map = new Map();
    for (const occ of occurrences) {
      let g = map.get(occ.iso);
      if (!g) {
        g = { iso: occ.iso, date: occ.date, hosts: [], presenters: [], attendees: [], all: [] };
        map.set(occ.iso, g);
      }
      const bucket = occ.avail.role === "host" ? g.hosts
        : occ.avail.role === "presenter" ? g.presenters : g.attendees;
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
        const s = (stats[a.user_id] ||= { host: 0, presenter: 0, attendee: 0, sessions: 0 });
        s[a.role] += 1;
        s.sessions += 1;
      }
    }
    return stats;
  };

  /* ---------- data access ---------- */

  WA.fetchAllAvailabilities = async function () {
    const { data, error } = await WA.client
      .from("availabilities")
      .select("*, profile:profiles(id, full_name, specialty), article:articles(*)")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
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
      ["members.html", "Members", "members"],
    ];
    const name = profile ? profile.full_name || "My Profile" : "";
    el.innerHTML =
      '<div class="nav-inner container">' +
      '<a class="brand" href="home.html">' +
      '<img src="LOGO.jpeg" alt="UP Research logo" />' +
      '<span><strong>Ward Academy</strong><em>Journal Club</em></span></a>' +
      '<button class="nav-toggle" id="nav-toggle" aria-label="Menu">☰</button>' +
      '<div class="nav-links" id="nav-links">' +
      links.map(([href, label, key]) =>
        '<a href="' + href + '"' + (key === active ? ' class="active"' : "") + ">" + label + "</a>"
      ).join("") +
      '<a href="profile.html"' + (active === "profile" ? ' class="active"' : "") + ' title="My profile">' +
      '<span class="avatar avatar-sm">' + WA.esc(WA.initials(name)) + "</span> " +
      WA.esc((name || "Profile").split(" ")[0]) + "</a>" +
      '<a href="#" id="nav-signout">Sign out</a>' +
      "</div></div>";
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
    return { user, profile };
  };
})();
