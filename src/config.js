/**
 * ═══════════════════════════════════════════════════════════════
 * HanCards Configuration
 * ═══════════════════════════════════════════════════════════════
 *
 * HOW TO ADD A NEW LANGUAGE:
 *
 * 1. Create locale file:  src/locales/<code>.json   (copy en.json as template)
 * 2. Create word-pack CSVs in  public/packs/  (e.g.  tc3-ja.csv)
 * 3. Register the language below in LANGUAGES array:
 *      { code: "ja", label: "日本語", flag: "🇯🇵",
 *        color: "#dc3545", borderColor: "#b02a37",
 *        packs: ["tc3-ja.csv", "tc4-ja.csv"] }
 * 4. Import the locale in  src/i18n.js  and add it to `resources`.
 * 5. Done — it appears in the first-visit picker and language switcher.
 */

/* ── Storage keys ── */
export const STORAGE_KEY = "HANCARDS";
export const LANG_KEY = "HANCARDS_LANG";

/* ── Scoring ── */
export const SCORE = {
  /** Starting score for every new word (0-100) */
  defaultScore: 0,
  /** Points added when user skips without revealing the answer (knows it) */
  skipBonus: 5,
  /** Points subtracted when user reveals the answer (needs practice) */
  flipPenalty: 20,
  /** Minimum possible score */
  min: 0,
  /** Maximum possible score */
  max: 100,
};

/* ── Score color thresholds ── */
export const SCORE_COLORS = {
  low:    { max: 33, color: "#ff5566" },   // Learning
  mid:    { max: 66, color: "#ffb830" },   // Familiar
  high:   { max: 100, color: "#58cc02" },  // Mastered
};

export function scoreColor(score) {
  if (score <= SCORE_COLORS.low.max)  return SCORE_COLORS.low.color;
  if (score <= SCORE_COLORS.mid.max)  return SCORE_COLORS.mid.color;
  return SCORE_COLORS.high.color;
}

/* ── Languages ────────────────────────────────────────────────
   Each entry drives:
     • First-visit picker button (flag, color, label)
     • Floating language-cycle button
     • Which CSVs to auto-import on first visit
   ───────────────────────────────────────────────────────────── */
export const LANGUAGES = [
  {
    code: "vi",
    label: "Tiếng Việt",
    flag: "🇻🇳",
    color: "#da251d",
    borderColor: "#b01e18",
    packs: ["tc3.csv", "tc4.csv"],
  },
  {
    code: "en",
    label: "English",
    flag: "🇬🇧",
    color: "#1cb0f6",
    borderColor: "#1590c8",
    packs: ["tc3-en.csv", "tc4-en.csv"],
  },
];

/** Ordered list of language codes for the floating cycle button */
export const LANG_CYCLE = LANGUAGES.map(l => l.code);

/** Lookup helpers */
export const LANG_MAP = Object.fromEntries(LANGUAGES.map(l => [l.code, l]));

/* ── Theme (dark / light) ─────────────────────────────────── */
export function theme(dark) {
  const D = dark;
  return {
    bg:           D ? "#0e0e0e" : "#f4f4f2",
    headerBg:     D ? "#111"    : "#fff",
    headerBorder: D ? "#1e1e1e" : "#e8e8e8",
    text:         D ? "#eaeaea" : "#1a1a1a",
    subText:      D ? "#888"    : "#888",
    mutedText:    D ? "#444"    : "#ccc",
    border:       D ? "#252525" : "#e0e0e0",
    toggleBg:     D ? "#181818" : "#ebebeb",
    toggleActive: D ? "#282828" : "#fff",
    inputBg:      D ? "#161616" : "#fff",
    inputColor:   D ? "#eaeaea" : "#1a1a1a",
    rowBg:        D ? "#161616" : "#fff",
    primaryBg:    D ? "#e8e8e8" : "#1a1a1a",
    primaryText:  D ? "#111"    : "#fff",
    ghostBorder:  D ? "#2e2e2e" : "#e0e0e0",
    ghostColor:   D ? "#999"    : "#666",
    kbdBg:        D ? "#222"    : "#e8e8e8",
    kbdText:      D ? "#ccc"    : "#555",
    activeBg:     D ? "#0c1f0c" : "#f0faf0",
    activeBorder: D ? "#1a3a1a" : "#a8daa8",
    activeText:   D ? "#6dde6d" : "#2a7a2a",
    // Card face colors
    cardFront:    D ? "#161616" : "#fff",
    cardBack:     D ? "#0c1f0c" : "#f0faf0",
    cardBorder:   D ? "#1a3a1a" : "#a8daa8",
    cardShadow:   D ? "0 6px 32px rgba(10,40,10,0.85)" : "0 6px 32px rgba(80,160,80,0.18)",
    cardFrontBorder: D ? "#252525" : "#e0e0e0",
    cardFrontShadow: D ? "0 6px 32px rgba(0,0,0,0.45)" : "0 6px 32px rgba(0,0,0,0.10)",
    // Label on card
    labelPrompt:  D ? "#b6b6b6" : "#888",
    labelAnswer:  D ? "#6dde6d" : "#2a7a2a",
    textPrompt:   D ? "#eaeaea" : "#1a1a1a",
    textAnswer:   D ? "#eaffea" : "#1a3a1a",
    // Success message
    success:      D ? "#5ddb9e" : "#2e8a5e",
    danger:       "#ff5566",
  };
}

/* ── Shared inline-style factories ────────────────────────── */
export function styles(t) {
  const btnBase = {
    border: "none", cursor: "pointer", borderRadius: 8,
    fontFamily: "inherit", fontWeight: 500, transition: "all 0.15s",
  };
  return {
    btnBase,
    primaryBtn: { ...btnBase, background: t.primaryBg, color: t.primaryText, padding: "0.6rem 1.3rem", fontSize: "0.88rem" },
    ghostBtn:   { ...btnBase, background: "transparent", color: t.ghostColor, padding: "0.5rem 1rem", fontSize: "0.85rem", border: `1px solid ${t.ghostBorder}` },
    iconBtn:    { ...btnBase, background: "transparent", border: "none", padding: "0.3rem 0.4rem", lineHeight: 0, borderRadius: 6 },
    inputStyle: { width: "100%", padding: "0.65rem 0.9rem", borderRadius: 8, border: `1px solid ${t.border}`, fontFamily: "inherit", fontSize: "0.88rem", outline: "none", boxSizing: "border-box", background: t.inputBg, color: t.inputColor },
    kbdStyle:   { background: t.kbdBg, color: t.kbdText, padding: "2px 7px", borderRadius: 5, fontSize: "0.7rem", fontFamily: "monospace" },
    sectionLabel: { fontSize: "0.7rem", color: t.subText, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 10 },
  };
}

/* ── Card font sizing ─────────────────────────────────────── */
export const CARD_FONT_STEPS = [
  { maxLen: 3,  size: "6rem" },
  { maxLen: 6,  size: "5rem" },
  { maxLen: 10, size: "4rem" },
  { maxLen: 18, size: "3rem" },
  { maxLen: 30, size: "2.2rem" },
  { maxLen: 50, size: "1.6rem" },
  { maxLen: Infinity, size: "1.2rem" },
];

/* ── Scrollbar CSS (injected once) ────────────────────────── */
export const SCROLLBAR_CSS = `
  .ps::-webkit-scrollbar { width: 4px; height: 4px; }
  .ps::-webkit-scrollbar-track { background: transparent; }
  .ps::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.2); border-radius: 99px; }
  .ps::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.4); }
`;

export const CSV_HINT = `Example:

pack_category,pack_name,korean,translation
TC3 🇻🇳,B1,학기,semester
TC3 🇻🇳,B1,과목,subject`;
