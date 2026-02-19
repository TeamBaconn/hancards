import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  STORAGE_KEY, LANG_KEY, SCORE, scoreColor,
  LANGUAGES, LANG_CYCLE, LANG_MAP,
  theme as makeTheme, styles as makeStyles,
  CARD_FONT_STEPS, SCROLLBAR_CSS, CSV_HINT,
} from "./config";

/* ════════════════════════════════════════════════════════════
   Data helpers
   ════════════════════════════════════════════════════════════ */

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { packs: [], scores: {}, isNew: true };
    const parsed = JSON.parse(raw);
    return { packs: parsed.packs || [], scores: parsed.scores || {}, isNew: false };
  } catch {
    return { packs: [], scores: {}, isNew: true };
  }
}

async function importDefaultPacks(langCode) {
  const base = import.meta.env.BASE_URL || "/";
  const langDef = LANG_MAP[langCode];
  const csvFiles = langDef ? langDef.packs : (LANG_MAP.en?.packs || []);
  const allPacks = [];
  for (const csvFile of csvFiles) {
    try {
      const res = await fetch(`${base}packs/${csvFile}`);
      if (!res.ok) continue;
      const csvText = await res.text();
      const rows = parseCSV(csvText);
      const grouped = {};
      rows.forEach(({ pack_category, pack_name, korean, english }) => {
        if (!pack_name || !korean || !english) return;
        const key = (pack_category || "") + "|||" + pack_name;
        if (!grouped[key]) grouped[key] = { category: pack_category || "Uncategorized", name: pack_name, words: [] };
        grouped[key].words.push({ korean, english });
      });
      for (const dp of Object.values(grouped)) {
        allPacks.push({
          id: `pack-default-${dp.category}-${dp.name}`.replace(/\s+/g, "_"),
          name: dp.name, category: dp.category, words: dp.words, enabled: true,
        });
      }
    } catch (e) { console.warn(`Could not load pack ${csvFile}`, e); }
  }
  return allPacks;
}

function saveData(d) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }
  catch (e) { console.error("Save failed", e); }
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase().replace(/\s/g, "");
  let data = lines, hasCategory = false;
  if (header.startsWith("pack_category,pack_name")) { data = lines.slice(1); hasCategory = true; }
  else if (header.startsWith("pack_name")) { data = lines.slice(1); }
  return data.map(line => {
    if (!line.trim()) return null;
    const fields = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { fields.push(cur); cur = ""; }
      else cur += ch;
    }
    fields.push(cur);
    const clean = (s) => s.trim().replace(/^"|"$/g, "").trim();
    if (hasCategory) {
      if (fields.length < 4) return null;
      return { pack_category: clean(fields[0]), pack_name: clean(fields[1]), korean: clean(fields[2]), english: clean(fields[3]) };
    }
    if (fields.length < 3) return null;
    return { pack_category: "", pack_name: clean(fields[0]), korean: clean(fields[1]), english: clean(fields[2]) };
  }).filter(Boolean);
}

/* ────────────────────── Card picking (score-weighted) ────── */

function pickCard(words, scores, lastIdx) {
  if (!words.length) return null;
  if (words.length === 1) return 0;
  const weights = words.map((w, i) => {
    const s = scores[w.korean] ?? SCORE.defaultScore;
    const weight = SCORE.max + 1 - s;
    return i === lastIdx ? weight * 0.1 : weight;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return 0;
}

/* ────────────────────── Font sizing — auto-shrink, never split word ── */

function getCardFontSize(text) {
  const len = (text || "").length;
  for (const step of CARD_FONT_STEPS) {
    if (len <= step.maxLen) return step.size;
  }
  return CARD_FONT_STEPS[CARD_FONT_STEPS.length - 1].size;
}

/* ────────────────────── Score helpers ────────────────────── */

function medianOf(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* ────────────────────── Icons ────────────────────────────── */

const EditIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

/* ════════════════════════════════════════════════════════════
   Progress Chart
   ════════════════════════════════════════════════════════════ */

function ProgressChart({ packs, scores, dark }) {
  const { t: tr } = useTranslation();
  const t = makeTheme(dark);

  const byCategory = {};
  packs.forEach(p => {
    const cat = p.category || p.pack_category || "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  });
  const categories = Object.entries(byCategory);
  if (!categories.length) return null;

  const packData = categories.map(([cat, catPacks]) => ({
    cat,
    packs: catPacks.map(p => {
      const wordScores = p.words.map(w => scores[w.korean] ?? SCORE.defaultScore);
      const med = Math.round(medianOf(wordScores));
      return { name: p.name, median: med, color: scoreColor(med) };
    })
  }));

  const barWidth = 4;
  const barGap = 2;
  const groupGap = 10;
  const chartHeight = 36;
  const topPad = 6;
  const bottomPad = 16;

  let x = 16;
  const groups = packData.map(group => {
    const gx = x;
    const bars = group.packs.map(p => {
      const bx = x;
      x += barWidth + barGap;
      return { ...p, x: bx };
    });
    x -= barGap;
    const gw = x - gx;
    x += groupGap;
    return { ...group, x: gx, width: gw, bars };
  });
  const svgWidth = Math.max(x - groupGap + 16, 120);
  const svgHeight = chartHeight + topPad + bottomPad;

  return (
    <div style={{ background: t.rowBg, borderRadius: 12, border: `1px solid ${t.border}`, padding: "0.6rem 0.8rem", overflowX: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ fontSize: "0.58rem", color: t.subText, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 3 }}>{tr('manage.progress')}</div>
      <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMinYMid meet" style={{ display: "block" }}>
        {[0, 50, 100].map(v => {
          const y = topPad + chartHeight - (v / 100) * chartHeight;
          return (
            <g key={v}>
              <line x1={12} x2={svgWidth - 2} y1={y} y2={y} stroke={dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)"} strokeDasharray={v === 0 ? "none" : "2,4"} strokeWidth="0.4" />
              <text x={1} y={y + 1.5} fontSize="3.5" fill={t.subText}>{v}</text>
            </g>
          );
        })}
        {groups.map((group, gi) => (
          <g key={gi}>
            {group.bars.map((p, pi) => {
              const height = (p.median / 100) * chartHeight;
              const y = topPad + chartHeight - height;
              const barH = p.median === 0 ? 0.5 : height;
              return (
                <rect key={pi} x={p.x} y={topPad + chartHeight - barH} width={barWidth} height={barH} rx={0} ry={0} fill={p.color} opacity={0.9}>
                  <title>{`${p.name}: ${p.median}%`}</title>
                </rect>
              );
            })}
            <text x={group.x + group.width / 2} y={topPad + chartHeight + 9} textAnchor="middle" fontSize="4.5" fontWeight="600" fill={t.subText}>{group.cat}</text>
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: "0.72rem", color: t.subText, justifyContent: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#ff5566" }} />{tr('manage.learning')}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#ffb830" }} />{tr('manage.familiar')}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#58cc02" }} />{tr('manage.mastered')}</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   FlipCard — text NEVER splits mid-word; it auto-shrinks.
   Uses a ref to measure and shrink font until text fits.
   ════════════════════════════════════════════════════════════ */

function FlipCard({ front, back, flipped, onFlip, onNext, dark }) {
  const HALF = 110;
  const { t: tr } = useTranslation();
  const t = makeTheme(dark);

  const [text, setText] = useState(front || "");
  const [label, setLabel] = useState("prompt");
  const labelText = label === "answer" ? tr("study.answer") : tr("study.prompt");
  const [phase, setPhase] = useState("idle");
  const timerRef = useRef(null);
  const prevFlipped = useRef(flipped);
  const prevFront = useRef(front);
  const textRef = useRef(null);
  const cardRef = useRef(null);
  const [fontSize, setFontSize] = useState(() => getCardFontSize(front));

  /* Auto-shrink: scale font so text never splits mid-word, max 2 lines */
  const recalcFontSize = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    const initial = getCardFontSize(text);
    let size = parseFloat(initial);
    const unit = initial.replace(/[\d.]/g, "");
    const minSize = 0.7;

    // Apply measurement styles
    el.style.fontSize = size + unit;
    el.style.wordBreak = "keep-all";
    el.style.overflowWrap = "normal";
    el.style.whiteSpace = "normal";
    el.style.lineHeight = "1.3";

    const MAX_LINES = 2;
    let attempts = 0;
    while (attempts < 25 && size > minSize) {
      const computedFs = parseFloat(getComputedStyle(el).fontSize);
      const maxH = computedFs * 1.3 * MAX_LINES + 4;
      const overflowsV = el.scrollHeight > maxH;
      const overflowsH = el.scrollWidth > el.clientWidth + 2;
      if (!overflowsV && !overflowsH) break;
      size = Math.max(minSize, size * 0.88);
      el.style.fontSize = size + unit;
      attempts++;
    }
    setFontSize(size + unit);
  }, [text]);

  useEffect(() => { recalcFontSize(); }, [recalcFontSize]);

  /* Re-calc font size immediately when card is resized (resolution change) */
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => recalcFontSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [recalcFontSize]);

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    if (clickY < rect.height / 2) onFlip?.();
    else onNext?.();
  };

  useEffect(() => {
    if (prevFront.current !== front) {
      prevFront.current = front;
      clearTimeout(timerRef.current);
      setPhase("idle"); setText(front || ""); setLabel("prompt");
    }
  }, [front]);

  useEffect(() => {
    if (prevFlipped.current === flipped) return;
    prevFlipped.current = flipped;
    clearTimeout(timerRef.current);
    setPhase("out");
    timerRef.current = setTimeout(() => {
      setText(flipped ? (back || "") : (front || ""));
      setLabel(flipped ? "answer" : "prompt");
      setPhase("in");
      timerRef.current = setTimeout(() => setPhase("idle"), HALF);
    }, HALF);
    return () => clearTimeout(timerRef.current);
  }, [flipped, front, back]);

  const isBack = flipped ? (phase !== "out") : (phase === "out");
  const bgColor    = isBack ? t.cardBack : t.cardFront;
  const borderClr  = isBack ? t.cardBorder : t.cardFrontBorder;
  const boxShadow  = isBack ? t.cardShadow : t.cardFrontShadow;
  const labelClr   = isBack ? t.labelAnswer : t.labelPrompt;
  const textClr    = isBack ? t.textAnswer  : t.textPrompt;

  return (
    <div ref={cardRef} onClick={handleClick} style={{
      cursor: "pointer", width: "100%", maxWidth: 680, margin: "0 auto", height: 340,
      userSelect: "none", background: bgColor, borderRadius: 28,
      border: `3px solid ${borderClr}`, boxShadow,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "1.875rem 2.625rem", boxSizing: "border-box",
      transition: `background 0.2s, border 0.2s, box-shadow 0.2s, transform ${HALF}ms cubic-bezier(.4,0,.2,1)`,
      transform: `scaleX(${phase === "out" ? 0 : 1})`,
      overflow: "hidden",
    }}>
      <div style={{ fontSize: "0.85rem", letterSpacing: 3, color: labelClr, marginBottom: 20, textTransform: "uppercase", fontWeight: 500 }}>{labelText}</div>
      <div ref={textRef} style={{
        fontSize, fontWeight: 700, color: textClr,
        textAlign: "center", lineHeight: 1.3, width: "100%",
        wordBreak: "keep-all", overflowWrap: "normal", whiteSpace: "normal",
        overflow: "hidden",
      }}>{text}</div>
    </div>
  );
}

/* ────────────────────── Modal ────────────────────────────── */

function Modal({ title, onClose, children, dark }) {
  const t = makeTheme(dark);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ background: dark ? "#1c1c1c" : "#fff", borderRadius: 14, width: "100%", maxWidth: 800, maxHeight: "86vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.28)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.4rem 1.8rem", borderBottom: `1px solid ${dark ? "#262626" : "#efefef"}`, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: t.text }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: t.subText, lineHeight: 1 }}>✕</button>
        </div>
        <div className="ps" style={{ overflowY: "auto", padding: "1.6rem 1.8rem", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   App
   ════════════════════════════════════════════════════════════ */

export default function App() {
  const { t: tr, i18n } = useTranslation();

  const [screen, setScreen]           = useState("loading");
  const [packs, setPacks]             = useState([]);
  const [scores, setScores]           = useState({});
  const [mode, setMode]               = useState("eng");
  const [cardIdx, setCardIdx]         = useState(null);
  const [flipped, setFlipped]         = useState(false);
  const [dark, setDark]               = useState(true);
  const [editingPackId, setEditingPackId] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [promptModal, setPromptModal] = useState(false);
  const [langModal, setLangModal]     = useState(false);
  const [newPackName, setNewPackName] = useState("");
  const [importText, setImportText]   = useState("");
  const [importMsg, setImportMsg]     = useState("");
  const [wordInput, setWordInput]     = useState({ korean: "", english: "" });
  const [editWordIdx, setEditWordIdx] = useState(null);
  const [addWordMsg, setAddWordMsg]   = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [expandedCats, setExpandedCats] = useState({});

  const lastIdxRef  = useRef(null);
  const packsRef    = useRef(packs);
  const scoresRef   = useRef(scores);
  const didFlipRef  = useRef(false);
  const screenRef   = useRef(screen);

  useEffect(() => { packsRef.current = packs; }, [packs]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  useEffect(() => {
    const id = "ps-style";
    if (!document.getElementById(id)) {
      const s = document.createElement("style"); s.id = id; s.textContent = SCROLLBAR_CSS;
      document.head.appendChild(s);
    }
  }, []);

  const activeWords = useCallback((ps = packsRef.current) =>
    ps.filter(p => p.enabled).flatMap(p => p.words), []);

  const persist = useCallback((ps, s) => { saveData({ packs: ps, scores: s }); }, []);

  /* ── Initial load ── */
  useEffect(() => {
    const { packs: p, scores: s, isNew } = loadData();
    setPacks(p); setScores(s);
    packsRef.current = p; scoresRef.current = s;
    if (isNew) {
      setLangModal(true);
      setScreen("manage");
    } else {
      const words = activeWords(p);
      setScreen(words.length ? "study" : "manage");
      if (words.length) setCardIdx(pickCard(words, s, null));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Language selection (first visit) ── */
  const handleLangSelect = async (lang) => {
    i18n.changeLanguage(lang);
    const imported = await importDefaultPacks(lang);
    setPacks(imported); packsRef.current = imported;
    const words = activeWords(imported);
    setCardIdx(words.length ? pickCard(words, scores, null) : null);
    persist(imported, scores);
    setLangModal(false);
    setScreen(words.length ? "study" : "manage");
  };

  /* ── Next card with scoring ── */
  const nextCard = useCallback(() => {
    const words = activeWords(packsRef.current);
    const s = { ...scoresRef.current };
    const currentWord = words[lastIdxRef.current];
    if (currentWord) {
      const key = currentWord.korean;
      const oldScore = s[key] ?? SCORE.defaultScore;
      if (didFlipRef.current) {
        s[key] = Math.max(SCORE.min, oldScore - SCORE.flipPenalty);
      } else {
        s[key] = Math.min(SCORE.max, oldScore + SCORE.skipBonus);
      }
    }
    didFlipRef.current = false;
    const idx = pickCard(words, s, lastIdxRef.current);
    lastIdxRef.current = idx;
    setScores(s); scoresRef.current = s;
    setCardIdx(idx); setFlipped(false);
    persist(packsRef.current, s);
  }, [activeWords, persist]);

  /* ── Keyboard ── */
  useEffect(() => {
    const handler = (e) => {
      if (screenRef.current !== "study") return;
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (["ArrowUp", "ArrowDown", "Space"].includes(e.code)) {
        e.preventDefault(); setFlipped(f => !f); didFlipRef.current = true;
      }
      if (["ArrowRight", "Enter"].includes(e.code)) { e.preventDefault(); nextCard(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nextCard]);

  /* ── Auto-collapse disabled categories when entering manage tab ── */
  useEffect(() => {
    if (screen === "manage") {
      const currentPacks = packsRef.current;
      const byCategory = {};
      currentPacks.forEach(p => {
        const cat = p.category || p.pack_category || "Uncategorized";
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p);
      });
      setExpandedCats(prev => {
        const next = { ...prev };
        Object.entries(byCategory).forEach(([cat, catPacks]) => {
          const hasEnabled = catPacks.some(p => p.enabled);
          if (!hasEnabled) {
            next[cat] = false;
          }
        });
        return next;
      });
    }
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Pack management ── */
  const togglePack = (id) => {
    const np = packs.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p);
    setPacks(np);
    setCardIdx(activeWords(np).length ? pickCard(activeWords(np), scores, null) : null);
    setFlipped(false); didFlipRef.current = false;
    lastIdxRef.current = null; persist(np, scores);
  };

  const toggleCategory = (cat) => {
    const catPacks = packs.filter(p => (p.category || p.pack_category || "Uncategorized") === cat);
    const allEnabled = catPacks.length > 0 && catPacks.every(p => p.enabled);
    const np = packs.map(p => (catPacks.includes(p) ? { ...p, enabled: !allEnabled } : p));
    setPacks(np);
    setCardIdx(activeWords(np).length ? pickCard(activeWords(np), scores, null) : null);
    setFlipped(false); didFlipRef.current = false;
    lastIdxRef.current = null; persist(np, scores);
    // When enabling the category, expand it
    if (!allEnabled) {
      setExpandedCats(prev => ({ ...prev, [cat]: true }));
    }
  };

  const deleteCategory = (cat) => {
    if (!confirm(tr('manage.deleteCategoryConfirm', { cat }))) return;
    const np = packs.filter(p => (p.category || p.pack_category || "Uncategorized") !== cat);
    setPacks(np);
    setCardIdx(activeWords(np).length ? pickCard(activeWords(np), scores, null) : null);
    setFlipped(false); didFlipRef.current = false;
    lastIdxRef.current = null; persist(np, scores);
  };

  const addPack = () => {
    const name = newPackName.trim();
    if (!name) { window.alert(tr('manage.addPackError')); return; }
    const np = [...packs, { id: `pack-${Date.now()}`, name, words: [], enabled: false }];
    setPacks(np); setNewPackName(""); persist(np, scores);
  };

  const renamePack = (id, name) => {
    const np = packs.map(p => p.id === id ? { ...p, name } : p);
    setPacks(np); persist(np, scores);
  };

  const deletePack = (id) => {
    const np = packs.filter(p => p.id !== id);
    setPacks(np);
    setCardIdx(activeWords(np).length ? pickCard(activeWords(np), scores, null) : null);
    persist(np, scores);
  };

  const deleteUserData = () => {
    if (!confirm(tr('manage.deleteUserDataConfirm'))) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LANG_KEY);
    window.location.reload();
  };

  const editPack = packs.find(p => p.id === editingPackId);

  const saveWord = () => {
    if (!wordInput.korean.trim() || !wordInput.english.trim()) return;
    const np = packs.map(p => {
      if (p.id !== editingPackId) return p;
      const words = [...p.words];
      if (editWordIdx !== null) words[editWordIdx] = { korean: wordInput.korean.trim(), english: wordInput.english.trim() };
      else words.push({ korean: wordInput.korean.trim(), english: wordInput.english.trim() });
      return { ...p, words };
    });
    setPacks(np); persist(np, scores);
    setWordInput({ korean: "", english: "" }); setEditWordIdx(null);
    setAddWordMsg(editWordIdx !== null ? tr('editPack.updated') : tr('editPack.added'));
    setTimeout(() => setAddWordMsg(""), 1500);
  };

  const removePackWord = (idx) => {
    const np = packs.map(p => p.id !== editingPackId ? p : { ...p, words: p.words.filter((_, i) => i !== idx) });
    setPacks(np); persist(np, scores);
  };

  const doImport = () => {
    if (!importText.trim()) return;
    const rows = parseCSV(importText);
    if (!rows.length) { setImportMsg(tr('csvImport.noRows')); return; }
    const grouped = {};
    rows.forEach(({ pack_category, pack_name, korean, english }) => {
      if (!pack_name || !korean || !english) return;
      const key = pack_category + "|||" + pack_name;
      if (!grouped[key]) grouped[key] = { category: pack_category, name: pack_name, words: [] };
      grouped[key].words.push({ korean, english });
    });
    let np = [...packs], added = 0, updated = 0, total = 0;
    Object.values(grouped).forEach(({ category, name, words }) => {
      const ex = np.find(p => p.name === name && p.category === category);
      if (ex) {
        const m = [...ex.words];
        words.forEach(w => { const i = m.findIndex(x => x.korean === w.korean); if (i >= 0) m[i] = w; else m.push(w); });
        np = np.map(p => (p.name === name && p.category === category) ? { ...p, words: m } : p); updated++;
      } else {
        np.push({ id: `pack-${Date.now()}-${Math.random().toString(36).slice(2)}`, name, category, words, enabled: false }); added++;
      }
      total += words.length;
    });
    setPacks(np); persist(np, scores);
    const details = [added > 0 ? tr('csvImport.created', { count: added }) : "", updated > 0 ? tr('csvImport.updated', { count: updated }) : ""].filter(Boolean).join(", ");
    setImportMsg(tr('csvImport.importResult', { details, total }));
    setImportText("");
  };

  const generatePrompt = () => {
    if (!promptInput.trim()) return;
    const prompt = `Convert the following Korean study material into a CSV with exactly 4 columns: pack_category, pack_name, korean, english.

Rules:
- First row must be exactly: pack_category,pack_name,korean,translation
- Use the lesson/topic title as pack_name (same value for all words in the same lesson). Shorten the pack_name — keep the same language as the original title. Use shortcodes for common things that don't need to be fully spelled out (e.g. "Bài 1" instead of "Bài học số 1", "Ch2" instead of "Chapter 2", "L3" instead of "Lesson 3").
- Use the course/book/overall group as pack_category (same value for all packs in the same group)
- korean = the Korean word or phrase
- translation = the English or Vietnamese translation (keep it concise, under 80 chars)
- If a value contains a comma, wrap it in double quotes
- Output ONLY the raw CSV. No explanation, no markdown fences, no extra text.

Naming rules:
- If pack_category or pack_name is long, shorten it to only the essential part (e.g. drop generic words like "Chapter", "Unit", "Lesson", "Bài", "과", "단원" unless they are the only identifier)
- IMPORTANT: Keep the same language as the original title. If the title is in Vietnamese, keep it in Vietnamese. If it is in Korean, keep it in Korean. If it is in English, keep it in English. Do NOT translate or transliterate.
- If a value contains a comma, wrap it in double quotes

Material:
${promptInput.trim()}`;
    navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 3000);
  };

  /* ── Floating lang cycle ── */
  const cycleLang = () => {
    const cur = i18n.language;
    const idx = LANG_CYCLE.indexOf(cur);
    const next = LANG_CYCLE[(idx + 1) % LANG_CYCLE.length];
    i18n.changeLanguage(next);
  };
  const nextLang = LANG_MAP[LANG_CYCLE[(LANG_CYCLE.indexOf(i18n.language) + 1) % LANG_CYCLE.length]];

  /* ── Derived values ── */
  const allWords = activeWords(packs);
  const card = allWords[cardIdx];
  const front = card ? (mode === "eng" ? card.english : card.korean) : "";
  const back  = card ? (mode === "eng" ? card.korean  : card.english) : "";

  const packsByCategory = {};
  packs.forEach(p => {
    const cat = p.category || p.pack_category || "Uncategorized";
    if (!packsByCategory[cat]) packsByCategory[cat] = [];
    packsByCategory[cat].push(p);
  });
  const enabledCount = packs.filter(p => p.enabled).length;
  const avgScore = allWords.length ? Math.round(allWords.reduce((a, w) => a + (scores[w.korean] ?? SCORE.defaultScore), 0) / allWords.length) : 0;
  const cardScore = card ? (scores[card.korean] ?? SCORE.defaultScore) : 0;

  /* ── Theme & styles ── */
  const D = dark;
  const t = makeTheme(D);
  const st = makeStyles(t);

  if (screen === "loading") return (
    <div style={{ fontFamily: "system-ui", background: t.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", boxSizing: "border-box" }}>
      <p style={{ color: t.subText }}>{tr('loading')}</p>
    </div>
  );

  /* ════════════════════════  RENDER  ════════════════════════ */
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: t.bg, height: "100vh", color: t.text, width: "100%", maxWidth: "100%", overflowX: "hidden", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <div style={{ background: t.headerBg, borderBottom: `1px solid ${t.headerBorder}`, zIndex: 50, width: "100%", boxSizing: "border-box", flexShrink: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", minHeight: 54, width: "100%", boxSizing: "border-box" }}>
          <div style={{ padding: "0 1.2rem", display: "flex", alignItems: "center", fontWeight: 700, fontSize: "1rem", flex: "1 1 auto", minHeight: 48 }}>
            <img src={(import.meta.env.BASE_URL || '/') + 'icon.png'} alt="App Icon" style={{ width: 28, height: 28, marginRight: 10, verticalAlign: "middle", flexShrink: 0 }} />
            한카드 <span style={{ color: t.subText, fontWeight: 400, marginLeft: 6 }}>HanCards</span>
          </div>
          <div style={{ display: "flex", flexShrink: 0, minHeight: 42 }}>
            {[["study", tr('nav.study')], ["manage", tr('nav.manage')]].map(([s, lbl]) => (
              <button key={s} onClick={() => setScreen(s)} style={{
                ...st.btnBase, borderRadius: 0, padding: "0 1.2rem", fontSize: "0.88rem",
                background: "transparent", color: screen === s ? t.text : t.subText,
                borderBottom: screen === s ? `2px solid ${t.primaryBg}` : "2px solid transparent",
                fontWeight: screen === s ? 600 : 400, whiteSpace: "nowrap",
              }}>{lbl}</button>
            ))}
            <button onClick={() => setScreen("about")} style={{
              ...st.btnBase, borderRadius: 0, padding: "0 1.2rem", fontSize: "0.88rem",
              background: "transparent", color: screen === "about" ? t.text : t.subText,
              borderBottom: screen === "about" ? `2px solid ${t.primaryBg}` : "2px solid transparent",
              fontWeight: screen === "about" ? 600 : 400, whiteSpace: "nowrap",
            }}>{tr('nav.about')}</button>
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>

        {/* ── ABOUT ── */}
        {screen === "about" && (
          <div style={{ padding: "3rem 2rem", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
            <img src={(import.meta.env.BASE_URL || '/') + 'icon.png'} alt="App Icon" style={{ width: 300, height: 300 }} />
            <h2 style={{ fontWeight: 800, fontSize: "2rem", marginBottom: 10 }}>HanCards</h2>
            <p style={{ fontSize: "1.1rem", color: t.subText, marginBottom: 24 }}>
              {tr('about.description')}
              <a href="https://bacongamedev.com/posts/portfolio/" target="_blank" rel="noopener noreferrer" style={{ color: t.text, textDecoration: "underline", marginLeft: 4 }}>Bacon</a>
            </p>
            <div style={{ fontSize: "0.95rem", color: t.mutedText, marginTop: 30 }}>
              {tr('about.copyright', { year: new Date().getFullYear() })}
            </div>
          </div>
        )}

        {/* ── STUDY ── */}
        {screen === "study" && (
          <div style={{ padding: "2rem 2rem", margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "2.5rem" }}>
              <div style={{ display: "flex", background: t.toggleBg, borderRadius: 10, padding: 3 }}>
                {[['eng', tr('study.toKorean')], ['kor', tr('study.fromKorean')]].map(([v, label]) => (
                  <button key={v} onClick={() => { setMode(v); setFlipped(false); }}
                    title={v === 'eng' ? tr('study.toKoreanTitle') : tr('study.fromKoreanTitle')}
                    style={{ ...st.btnBase, padding: "0.5rem 1.1rem", fontSize: "1.05rem", lineHeight: 1, display: "flex", alignItems: "center", gap: 4, background: mode === v ? t.toggleActive : "transparent", color: mode === v ? t.text : t.subText, boxShadow: mode === v ? "0 1px 4px rgba(0,0,0,0.25)" : "none" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {allWords.length === 0 ? (
              <div style={{ textAlign: "center", color: t.subText, marginTop: "5rem" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>📚</div>
                <p>{tr('study.noPacks')} <strong style={{ color: t.text, cursor: "pointer" }} onClick={() => setScreen("manage")}>{tr('study.noPacksManage')}</strong> {tr('study.noPacksEnd')}</p>
              </div>
            ) : card ? (
              <>
                <FlipCard front={front} back={back} flipped={flipped}
                  onFlip={() => { setFlipped(f => !f); didFlipRef.current = true; }}
                  onNext={nextCard} dark={dark} />
                <div style={{ textAlign: "center", marginTop: 14, lineHeight: 2 }}>
                  <div style={{ fontSize: "0.82rem", color: t.subText, fontWeight: 500 }}>
                    {tr('study.cardTipTap')} <strong style={{ color: t.text }}>{tr('study.cardTipUpper')}</strong> {tr('study.cardTipFlip')} <span style={{ margin: "0 0.5em" }}>·</span> {tr('study.cardTipTap')} <strong style={{ color: t.text }}>{tr('study.cardTipLower')}</strong> {tr('study.cardTipNext')}
                  </div>
                  <div style={{ fontSize: "0.82rem", color: t.subText, fontWeight: 500 }}>
                    <kbd style={st.kbdStyle}>↑</kbd> <kbd style={st.kbdStyle}>↓</kbd> <kbd style={st.kbdStyle}>Space</kbd> <strong style={{ color: t.text }}>{tr('study.flip')}</strong> <span style={{ margin: "0 0.5em" }}>·</span> <kbd style={st.kbdStyle}>→</kbd> <kbd style={st.kbdStyle}>Enter</kbd> <strong style={{ color: t.text }}>{tr('study.next')}</strong>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: "1.5rem", fontSize: "0.78rem", color: t.mutedText }}>
                  <span>{allWords.length} {tr('study.words')} · {enabledCount} {enabledCount !== 1 ? tr('study.packs') : tr('study.pack')}</span>
                  <span>{tr('study.avgScore')}: <strong style={{ color: scoreColor(avgScore) }}>{avgScore}%</strong></span>
                  <span>{tr('study.cardScore')}: <strong style={{ color: scoreColor(cardScore) }}>{cardScore}%</strong></span>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ── MANAGE ── */}
        {screen === "manage" && (
          <div style={{ padding: "1.5rem 2rem", margin: 0 }}>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem", alignItems: "stretch" }}>
              {packs.length > 0 && (
                <div style={{ flex: "1 1 380px", minWidth: 0 }}>
                  <ProgressChart packs={packs} scores={scores} dark={dark} />
                </div>
              )}
              <div
  style={{
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    flex: "1 1 260px",
    alignContent: "stretch",
    alignItems: "stretch",
  }}
>
  {[
    [tr("manage.categories"), `${Object.keys(packsByCategory).length}`],
    [tr("manage.packs"), `${packs.length}`],
    [tr("manage.activePacks"), `${enabledCount} / ${packs.length}`],
    [tr("manage.words"), `${packs.reduce((a, p) => a + p.words.length, 0)}`],
    [tr("manage.activeWords"), `${allWords.length}`],
  ].map(([lbl, val]) => (
    <div
      key={lbl}
      style={{
        background: t.rowBg,
        borderRadius: 10,
        padding: "0.7rem 0.6rem",
        border: `1px solid ${t.border}`,
        flex: "1 1 25%",
        minWidth: 90,

        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "clamp(1rem, 1.5vw, 1.6rem)",
          fontWeight: 700,
          color: t.text,
          lineHeight: 1,
        }}
      >
        {val}
      </div>

      <div
        style={{
          fontSize: "clamp(0.55rem, 0.7vw, 0.75rem)",
          color: t.subText,
          marginTop: 4,
        }}
      >
        {lbl}
      </div>
    </div>
  ))}
</div>

            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginBottom: "2rem", flexWrap: "wrap", alignItems: "center" }}>
              <input value={newPackName} onChange={e => setNewPackName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addPack()}
                placeholder={tr('manage.newPackPlaceholder')} style={{ ...st.inputStyle, flex: "1 1 180px", width: "auto" }} />
              <button style={st.primaryBtn} onClick={addPack}>{tr('manage.addPack')}</button>
              <button style={st.ghostBtn} onClick={() => { setImportModal(true); setImportMsg(""); setImportText(""); }}>{tr('manage.csvImport')}</button>
              <button style={{ ...st.ghostBtn, color: t.danger, borderColor: D ? "#3a1515" : "#fdd" }} onClick={deleteUserData}>{tr('manage.deleteUserData')}</button>
            </div>

            {/* Pack grid */}
            {packs.length === 0 ? (
              <div style={{ textAlign: "center", color: t.subText, padding: "4rem 0" }}>{tr('manage.noPacks')}</div>
            ) : (
              <div className="ps" style={{ paddingRight: 4 }}>
                {Object.entries(packsByCategory).map(([cat, catPacks]) => {
                  const hasEnabled = catPacks.some(p => p.enabled);
                  const isExpanded = expandedCats[cat] !== undefined ? expandedCats[cat] : hasEnabled;
                  return (
                    <div key={cat} style={{ marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${t.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", marginBottom: isExpanded ? 8 : 0, gap: 12, cursor: "pointer", userSelect: "none" }}
                        onClick={(e) => { if (e.target.closest('button')) return; setExpandedCats(prev => ({ ...prev, [cat]: !isExpanded })); }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.subText} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: t.text }}>{cat}</span>
                        </span>
                        <button onClick={() => toggleCategory(cat)} style={{
                          cursor: "pointer", width: 38, height: 22, borderRadius: 12,
                          background: catPacks.every(p => p.enabled) ? "#4caf50" : t.border,
                          flexShrink: 0, transition: "background 0.2s", marginLeft: 4,
                          border: 'none', padding: 0, display: 'flex', alignItems: 'center',
                          outline: 'none', position: 'static',
                        }} aria-label={tr('manage.toggleCategory', { cat })}>
                          <div style={{ position: "relative", top: 0, left: catPacks.every(p => p.enabled) ? 18 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
                        </button>
                        <span style={{ fontSize: "0.72rem", color: t.subText, marginLeft: 2 }}>{catPacks.length} {catPacks.length !== 1 ? tr('manage.packPlural') : tr('manage.packSingular')}</span>
                        <button onClick={() => deleteCategory(cat)} title={`Delete all packs in ${cat}`}
                          style={{ ...st.iconBtn, color: t.danger, marginLeft: "auto" }}><TrashIcon /></button>
                      </div>
                      {isExpanded && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                          {catPacks.map(p => {
                            const packMedian = Math.round(medianOf(p.words.map(w => scores[w.korean] ?? SCORE.defaultScore)));
                            return (
                              <div key={p.id} style={{ background: p.enabled ? t.activeBg : t.rowBg, border: `1px solid ${p.enabled ? t.activeBorder : t.border}`, borderRadius: 14, padding: "0.9rem", display: "flex", flexDirection: "column", gap: 8, transition: "background 0.2s, border-color 0.2s", minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: "0.82rem", color: p.enabled ? t.activeText : t.text, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>{p.name}</div>
                                <div style={{ fontSize: "0.7rem", color: t.subText }}>{p.words.length} {p.words.length !== 1 ? tr('manage.wordPlural') : tr('manage.word')}</div>
                                <div style={{ height: 3, borderRadius: 2, background: D ? "#252525" : "#e0e0e0", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${packMedian}%`, minWidth: packMedian > 0 ? 2 : 0, borderRadius: 2, background: scoreColor(packMedian), transition: "width 0.3s" }} />
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <div onClick={() => togglePack(p.id)} style={{ cursor: "pointer", width: 34, height: 20, borderRadius: 10, background: p.enabled ? "#4caf50" : t.border, position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                                    <div style={{ position: "absolute", top: 2, left: p.enabled ? 16 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
                                  </div>
                                  <div style={{ flex: 1 }} />
                                  <button title="Edit" onClick={() => { setEditingPackId(p.id); setWordInput({ korean: "", english: "" }); setEditWordIdx(null); setAddWordMsg(""); }}
                                    style={{ ...st.iconBtn, color: t.subText }}><EditIcon /></button>
                                  <button title="Delete" onClick={() => deletePack(p.id)}
                                    style={{ ...st.iconBtn, color: t.danger }}><TrashIcon /></button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>{/* end content area */}

      {/* ── EDIT PACK MODAL ── */}
      {editingPackId && editPack && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div style={{ background: D ? "#1c1c1c" : "#fff", borderRadius: 14, width: "100%", maxWidth: 800, maxHeight: "86vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.28)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.4rem 1.8rem", borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: "1.05rem", color: t.text }}>{editPack.name}</span>
              <button onClick={() => setEditingPackId(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: t.subText, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: "1.4rem 1.8rem", borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
              <div style={st.sectionLabel}>{tr('editPack.renamePack')}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input defaultValue={editPack.name} id="renameInput" style={{ ...st.inputStyle, flex: 1 }} />
                <button style={st.primaryBtn} onClick={() => { const v = document.getElementById("renameInput").value.trim(); if (v) renamePack(editingPackId, v); }}>{tr('editPack.save')}</button>
              </div>
            </div>
            <div className="ps" style={{ flex: 1, overflowY: "auto", padding: "1.4rem 1.8rem" }}>
              <div style={st.sectionLabel}>{tr('editPack.wordsLabel', { count: editPack.words.length })}</div>
              {editPack.words.length === 0 && <div style={{ color: t.mutedText, fontSize: "0.85rem", padding: "0.5rem 0" }}>{tr('editPack.noWords')}</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {editPack.words.map((w, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: editWordIdx === i ? (D ? "#1a2a1a" : "#f0faf0") : t.rowBg, borderRadius: 8, padding: "0.6rem 0.9rem", fontSize: "0.85rem", border: `1px solid ${editWordIdx === i ? t.activeBorder : t.border}` }}>
                    <span style={{ flex: 1 }}>
                      <strong style={{ color: t.text }}>{w.korean}</strong>
                      <span style={{ color: t.mutedText, margin: "0 8px" }}>·</span>
                      <span style={{ color: t.subText }}>{w.english}</span>
                    </span>
                    <span style={{ fontSize: "0.7rem", color: scoreColor(scores[w.korean] ?? SCORE.defaultScore), fontWeight: 600, minWidth: 28, textAlign: "right" }}>{scores[w.korean] ?? SCORE.defaultScore}%</span>
                    <button onClick={() => { setEditWordIdx(i); setWordInput({ korean: w.korean, english: w.english }); }}
                      style={{ ...st.iconBtn, color: t.subText }}><EditIcon /></button>
                    <button onClick={() => removePackWord(i)}
                      style={{ ...st.iconBtn, color: t.danger }}><TrashIcon /></button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${t.border}`, padding: "1.2rem 1.8rem", flexShrink: 0 }}>
              <div style={st.sectionLabel}>{editWordIdx !== null ? tr('editPack.editWord') : tr('editPack.addWord')}</div>
              <div style={{ display: "grid", gridTemplateColumns: editWordIdx !== null ? "1fr 1.4fr 1fr 0.5fr" : "1fr 1.4fr 1fr", gap: 8, alignItems: "center" }}>
                <input value={wordInput.korean} onChange={e => setWordInput(w => ({ ...w, korean: e.target.value }))}
                  placeholder={tr('editPack.koreanPlaceholder')} style={{ ...st.inputStyle, width: "100%" }} />
                <input value={wordInput.english} onChange={e => setWordInput(w => ({ ...w, english: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveWord()}
                  placeholder={tr('editPack.translationPlaceholder')} style={{ ...st.inputStyle, width: "100%" }} />
                <button style={{ ...st.primaryBtn, whiteSpace: "nowrap", width: "100%" }} onClick={saveWord}>
                  {editWordIdx !== null ? tr('editPack.save') : tr('editPack.addBtn')}
                </button>
                {editWordIdx !== null && (
                  <button style={{ ...st.iconBtn, color: t.subText, fontSize: "1.1rem", padding: "0.4rem", width: "100%" }}
                    onClick={() => { setEditWordIdx(null); setWordInput({ korean: "", english: "" }); }}>✕</button>
                )}
              </div>
              {addWordMsg && <p style={{ marginTop: 8, fontSize: "0.82rem", color: t.success, marginBottom: 0 }}>{addWordMsg}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── CSV IMPORT MODAL ── */}
      {importModal && (
        <Modal title={tr('csvImport.title')} onClose={() => setImportModal(false)} dark={dark}>
          <textarea value={importText} onChange={e => setImportText(e.target.value)}
            placeholder={CSV_HINT + "\n\n" + tr('csvImport.pastePlaceholder')}
            style={{ ...st.inputStyle, minHeight: 160, resize: "vertical", fontFamily: "monospace", fontSize: "0.82rem" }} />
          <div style={{ display: "flex", gap: 10, marginTop: "1rem", alignItems: "center" }}>
            <button style={st.primaryBtn} onClick={doImport}>{tr('csvImport.importBtn')}</button>
            <button style={st.ghostBtn} onClick={() => setImportModal(false)}>{tr('csvImport.cancelBtn')}</button>
            <button style={{
              ...st.ghostBtn, marginLeft: "auto",
              background: dark ? '#d72660' : '#e040fb', color: '#fff',
              border: 'none', boxShadow: '0 2px 8px rgba(215,38,96,0.12)'
            }} onClick={() => { setPromptModal(true); setPromptInput(""); setPromptCopied(false); }}>
              {tr('csvImport.llmPrompt')}
            </button>
          </div>
          {importMsg && <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: importMsg.startsWith("✓") ? t.success : t.danger, marginBottom: 0 }}>{importMsg}</p>}
        </Modal>
      )}

      {/* ── LLM PROMPT MODAL ── */}
      {promptModal && (
        <Modal title={tr('llmPrompt.title')} onClose={() => setPromptModal(false)} dark={dark}>
          <div style={{ marginBottom: 8 }}>
            <textarea value={promptInput} onChange={e => setPromptInput(e.target.value)}
              placeholder={tr('llmPrompt.placeholder')}
              style={{ ...st.inputStyle, minHeight: 220, resize: "vertical", lineHeight: 1.6 }} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: "1rem", alignItems: "center" }}>
            <button style={{ ...st.primaryBtn, opacity: promptInput.trim() ? 1 : 0.5 }}
              disabled={!promptInput.trim()} onClick={generatePrompt}>
              {promptCopied ? tr('llmPrompt.copied') : tr('llmPrompt.generateCopy')}
            </button>
            <button style={st.ghostBtn} onClick={() => setPromptModal(false)}>{tr('llmPrompt.close')}</button>
          </div>
          {promptCopied && (
            <p style={{ marginTop: "1rem", fontSize: "0.83rem", color: t.success, lineHeight: 1.6, marginBottom: 0 }}>
              {tr('llmPrompt.copiedMsg')}
            </p>
          )}
        </Modal>
      )}

      {/* ── Language Selection Modal (first visit) — round flag buttons in grid ── */}
      {langModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div style={{ background: D ? "#1c1c1c" : "#fff", borderRadius: 22, width: "100%", maxWidth: 360, padding: "2.5rem 2rem", textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>
            <img src={(import.meta.env.BASE_URL || '/') + 'icon.png'} alt="HanCards" style={{ width: 72, height: 72, marginBottom: 14 }} />
            <h2 style={{ fontWeight: 800, fontSize: "1.4rem", marginBottom: 4, color: t.text }}>한카드 HanCards</h2>
            <p style={{ color: t.subText, marginBottom: 24, fontSize: "0.88rem" }}>Choose your language</p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
              {LANGUAGES.map(lang => (
                <button key={lang.code} onClick={() => handleLangSelect(lang.code)}
                  style={{
                    cursor: "pointer", borderRadius: 14, fontFamily: "inherit",
                    fontWeight: 600, transition: "all 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    fontSize: "0.92rem", padding: "0.75rem 1.6rem",
                    background: D ? `${lang.color}22` : `${lang.color}18`,
                    color: lang.color,
                    border: `1.5px solid ${lang.borderColor}`,
                    boxShadow: `0 0 0 0 ${lang.color}00`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = D ? `${lang.color}44` : `${lang.color}30`; e.currentTarget.style.boxShadow = `0 2px 12px ${lang.color}33`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = D ? `${lang.color}22` : `${lang.color}18`; e.currentTarget.style.boxShadow = `0 0 0 0 ${lang.color}00`; }}
                >{lang.flag} {lang.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating language switcher ── */}
      <button onClick={cycleLang} style={{
        position: "fixed", bottom: 24, right: 80, zIndex: 200,
        height: 46, borderRadius: 23, paddingInline: 14,
        background: D ? "#e8e8e8" : "#1a1a1a", color: D ? "#111" : "#fff",
        border: "none", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600,
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        {nextLang ? `${nextLang.flag} ${nextLang.code.toUpperCase()}` : "🌐"}
      </button>

      {/* ── Floating dark mode ── */}
      <button onClick={() => setDark(d => !d)} style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 200,
        width: 46, height: 46, borderRadius: "50%",
        background: D ? "#e8e8e8" : "#1a1a1a", color: D ? "#111" : "#fff",
        border: "none", cursor: "pointer", fontSize: "1.1rem",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {dark ? "☀️" : "🌙"}
      </button>
    </div>
  );
}
