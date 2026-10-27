/* Shared helpers + subject loader.
   To add a new subject: create yoursubject.js (copy an existing one)
   and add its path to REVIEWER_FILES below. */
(function () {
  "use strict";

  const REVIEWER_FILES = ["cardio.js", "renal.js"];

  window.REVIEWERS = window.REVIEWERS || [];

  window.SECTIONS = [
    { key: "mcq", label: "Multiple Choice", type: "choice", hint: "Choose the best answer." },
    { key: "ident", label: "Identification", type: "text", hint: "Type your answer, then press Check." },
    { key: "enumer", label: "Enumeration", type: "list", hint: "List your answers — one per line or separated by commas." },
    { key: "sit", label: "Situational", type: "choice", hint: "Read the scenario and choose the best nursing action." }
  ];

  window.loadReviewers = function () {
    return Promise.all(
      REVIEWER_FILES.map(
        (f) =>
          new Promise((res) => {
            const s = document.createElement("script");
            s.src = f;
            s.onload = res;
            s.onerror = () => { console.warn("Could not load", f); res(); };
            document.head.appendChild(s);
          })
      )
    ).then(() => window.REVIEWERS.slice().sort((a, b) => (a.order || 99) - (b.order || 99)));
  };

  /* ---------- text helpers ---------- */
  window.esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  window.norm = (s) =>
    String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

  window.lev = function (a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  };

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  window.seededShuffle = function (arr, seedStr) {
    const r = rng(hash(seedStr));
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* ---------- answer checking ---------- */
  window.checkText = function (val, accept) {
    const v = norm(val);
    if (!v) return false;
    return accept.split("|").some((a) => {
      const n = norm(a);
      if (!n) return false;
      if (v === n) return true;
      const tol = n.length >= 12 ? 2 : n.length >= 6 ? 1 : 0;
      if (lev(v, n) <= tol) return true;
      return n.length >= 5 && v.includes(n) && v.length <= n.length + 8;
    });
  };

  window.checkEnum = function (val, items) {
    const entries = val.split(/[\n,;]+/).map(norm).filter(Boolean);
    const joined = norm(val);
    return items.map((it) =>
      it.split("|").some((a) => {
        const n = norm(a);
        if (!n) return false;
        if (entries.some((e) => e === n)) return true;
        const tol = n.length >= 9 ? 2 : n.length >= 5 ? 1 : 0;
        if (n.length >= 4 && entries.some((e) => lev(e, n) <= tol)) return true;
        if (n.length >= 4 && entries.some((e) => e.includes(n) && e.length <= n.length + 10)) return true;
        return n.length >= 5 && joined.includes(n);
      })
    );
  };

  /* ---------- storage ---------- */
  window.storeKey = (id) => "pharmreviewer:" + id;
  window.loadState = function (id) {
    try {
      const raw = localStorage.getItem(storeKey(id));
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  };
  window.saveState = function (id, st) {
    try { localStorage.setItem(storeKey(id), JSON.stringify(st)); } catch (e) {}
  };

  /* ---------- randomize setting (set on the home page) ---------- */
  window.QUIZ_FRACTION = 0.4;   // share of each question bank used in one randomized attempt
  window.getRandomize = function () {
    try { return localStorage.getItem("pharmreviewer:randomize") === "1"; } catch (e) { return false; }
  };
  window.setRandomize = function (on) {
    try { localStorage.setItem("pharmreviewer:randomize", on ? "1" : "0"); } catch (e) {}
  };
  window.quizSize = (n) => Math.min(n, Math.max(5, Math.ceil(n * QUIZ_FRACTION)));

  /* ---------- scoring ---------- */
  window.pointsOf = function (type, a) {
    if (!a) return 0;
    if (type === "list") return Math.min(a.found, a.need) / a.need;
    return a.ok ? 1 : 0;
  };

  window.progressOf = function (subj) {
    const st = loadState(subj.id);
    let total = 0, answered = 0, points = 0;
    SECTIONS.forEach((s) => {
      const items = subj[s.key] || [];
      const ans = (st && st.ans && st.ans[s.key]) || {};
      const set = st && st.set && st.set[s.key];
      if (set) {
        total += set.length;
        set.forEach((oi) => { if (ans[oi]) { answered++; points += pointsOf(s.type, ans[oi]); } });
      } else {
        total += getRandomize() ? quizSize(items.length) : items.length;
        Object.keys(ans).forEach((k) => {
          if (+k < items.length) { answered++; points += pointsOf(s.type, ans[k]); }
        });
      }
    });
    return { total, answered, points };
  };

  /* ---------- theme ---------- */
  (function theme() {
    let t = null;
    try { t = localStorage.getItem("pharmreviewer:theme"); } catch (e) {}
    if (!t) t = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    document.addEventListener("DOMContentLoaded", () => {
      const btn = document.getElementById("themeBtn");
      if (!btn) return;
      const paint = () => (btn.textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "☀️" : "🌙");
      paint();
      btn.addEventListener("click", () => {
        const n = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", n);
        try { localStorage.setItem("pharmreviewer:theme", n); } catch (e) {}
        paint();
      });
    });
  })();
})();
