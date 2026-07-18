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
        // (no logical-assignment operator here — older iOS Safari lacks it)
        if (!stats[a.user_id]) stats[a.user_id] = { host: 0, presenter: 0, attendee: 0, sessions: 0 };
        const s = stats[a.user_id];
        s[a.role] += 1;
        s.sessions += 1;
      }
    }
    return stats;
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
      '<button class="nav-toggle" id="nav-toggle" aria-label="Menu">☰</button>' +
      '<div class="nav-links" id="nav-links">' +
      links.map(([href, label, key]) =>
        '<a href="' + href + '"' + (key === active ? ' class="active"' : "") + ">" + label + "</a>"
      ).join("") +
      '<a href="profile.html"' + (active === "profile" ? ' class="active"' : "") + ' title="My profile">' +
      WA.avatarHtml(profile, "avatar-sm", "") + " " +
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
