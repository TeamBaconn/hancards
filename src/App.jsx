import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  STORAGE_KEY, LANG_KEY, SCORE, scoreColor,
  LANGUAGES, LANG_CYCLE, LANG_MAP,
  CARD_FONT_STEPS, CSV_HINT,
} from "./config";
import Quiz from "./Quiz";
import "./App.css";

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

function ProgressChart({ packs, scores }) {
  const { t: tr } = useTranslation();

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

  const barWidth = 6;
  const barGap = 2;
  const groupGap = 20;
  const chartHeight = 28;
  const topPad = 5;
  const bottomPad = 10;

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
    <div className="progress-chart">
      <div className="chart-title">{tr('manage.progress')}</div>
      <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMinYMid meet" style={{ display: "block" }}>
        {[0, 50, 100].map(v => {
          const y = topPad + chartHeight - (v / 100) * chartHeight;
          return (
            <g key={v}>
              <line x1={12} x2={svgWidth - 5} y1={y} y2={y} style={{ stroke: "var(--color-chart-line)" }} strokeDasharray={v === 0 ? "none" : "2,4"} strokeWidth="0.4" />
              <text x={1} y={y + 1.5} fontSize="3.5" style={{ fill: "var(--color-text-secondary)" }}>{v}</text>
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
            <text x={group.x + group.width / 2} y={topPad + chartHeight + 9} textAnchor="middle" fontSize="4.5" fontWeight="600" style={{ fill: "var(--color-text-secondary)" }}>{group.cat}</text>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span className="chart-legend-item"><span className="chart-legend-dot" style={{ background: "#ff5566" }} />{tr('manage.learning')}</span>
        <span className="chart-legend-item"><span className="chart-legend-dot" style={{ background: "#ffb830" }} />{tr('manage.familiar')}</span>
        <span className="chart-legend-item"><span className="chart-legend-dot" style={{ background: "#58cc02" }} />{tr('manage.mastered')}</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   FlipCard — text NEVER splits mid-word; it auto-shrinks.
   Uses a ref to measure and shrink font until text fits.
   ════════════════════════════════════════════════════════════ */

function FlipCard({ front, back, flipped, onFlip, onNext }) {
  const HALF = 110;
  const { t: tr } = useTranslation();

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

  const cardClass = [
    "flip-card",
    isBack && "flip-card--back",
    phase === "out" && "flip-card--out",
  ].filter(Boolean).join(" ");

  return (
    <div ref={cardRef} onClick={handleClick} className={cardClass}>
      <div className="flip-card-label">{labelText}</div>
      <div ref={textRef} className="flip-card-text" style={{ fontSize }}>{text}</div>
    </div>
  );
}

/* ────────────────────── Modal ────────────────────────────── */

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>
        <div className="modal-body ps">{children}</div>
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
  const allWords = useMemo(() => activeWords(packs), [packs, activeWords]);
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

  if (screen === "loading") return (
    <div className="app loading-screen" data-theme={dark ? "dark" : "light"}>
      <p className="text-secondary">{tr('loading')}</p>
    </div>
  );

  /* ════════════════════════  RENDER  ════════════════════════ */
  return (
    <div className="app" data-theme={dark ? "dark" : "light"}>

      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <img src={(import.meta.env.BASE_URL || '/') + 'icon.png'} alt="App Icon" className="header-brand-icon" />
            한카드 <span className="header-brand-sub">HanCards</span>
          </div>
          <nav className="nav-tabs">
            {[["quiz", tr('nav.quiz')], ["study", tr('nav.study')], ["manage", tr('nav.manage')], ["about", tr('nav.about')]].map(([s, lbl]) => (
              <button key={s} onClick={() => setScreen(s)} className={`nav-tab ${screen === s ? 'nav-tab--active' : ''}`}>{lbl}</button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Content area ── */}
      <div className="app-content">

        {/* ── ABOUT ── */}
        {screen === "about" && (
          <div className="about-screen">
            <img src={(import.meta.env.BASE_URL || '/') + 'icon.png'} alt="App Icon" className="about-icon" />
            <h2 className="about-title">HanCards</h2>
            <p className="about-description">
              {tr('about.description')}
              <a href="https://bacongamedev.com/posts/portfolio/" target="_blank" rel="noopener noreferrer" className="about-link">Bacon</a>
            </p>
            <div className="about-copyright">
              {tr('about.copyright', { year: new Date().getFullYear() })}
            </div>
          </div>
        )}

        {/* ── QUIZ ── */}
        {screen === "quiz" && (
          <Quiz
            allWords={allWords}
            scores={scores}
            enabledCount={enabledCount}
            onScoreUpdate={(key, newScore) => {
              const s = { ...scores, [key]: newScore };
              setScores(s); scoresRef.current = s;
              persist(packs, s);
            }}
          />
        )}

        {/* ── STUDY ── */}
        {screen === "study" && (
          <div className="study-screen">
            <div className="mode-toggle">
              <div className="mode-toggle-group">
                {[['eng', tr('study.toKorean')], ['kor', tr('study.fromKorean')]].map(([v, label]) => (
                  <button key={v} onClick={() => { setMode(v); setFlipped(false); }}
                    title={v === 'eng' ? tr('study.toKoreanTitle') : tr('study.fromKoreanTitle')}
                    className={`mode-toggle-btn ${mode === v ? 'mode-toggle-btn--active' : ''}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {allWords.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📚</div>
                <p>{tr('study.noPacks')} <strong className="empty-state-link" onClick={() => setScreen("manage")}>{tr('study.noPacksManage')}</strong> {tr('study.noPacksEnd')}</p>
              </div>
            ) : card ? (
              <>
                <FlipCard front={front} back={back} flipped={flipped}
                  onFlip={() => { setFlipped(f => !f); didFlipRef.current = true; }}
                  onNext={nextCard} />
                <div className="study-stats">
                  <span>{allWords.length} {tr('study.words')} · {enabledCount} {enabledCount !== 1 ? tr('study.packs') : tr('study.pack')}</span>
                  <span>{tr('study.avgScore')}: <strong style={{ color: scoreColor(avgScore) }}>{avgScore}%</strong></span>
                  <span>{tr('study.cardScore')}: <strong style={{ color: scoreColor(cardScore) }}>{cardScore}%</strong></span>
                </div>
                {/* Card tips moved to bottom left and split into lines */}
                <div className="card-tips card-tips-bottom-left card-tips-align-left">
                  <div className="card-tip-line">
                    <kbd className="kbd">→</kbd> <kbd className="kbd">Enter</kbd> {tr('study.next')}
                  </div>
                  <div className="card-tip-line">
                    <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> <kbd className="kbd">Space</kbd> {tr('study.flip')}
                  </div>
                  <div className="card-tip-line">
                    {tr('study.cardTipTap')} <kbd className="kbd">{tr('study.cardTipUpper')}</kbd> {tr('study.cardTipFlip')}
                  </div>
                  <div className="card-tip-line">
                    {tr('study.cardTipTap')} <kbd className="kbd">{tr('study.cardTipLower')}</kbd> {tr('study.cardTipNext')}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ── MANAGE ── */}
        {screen === "manage" && (
          <div className="manage-screen">

            <div className="manage-top">
              {packs.length > 0 && (
                <ProgressChart packs={packs} scores={scores} />
              )}
              <div className="stats-grid">
                {[
                  [tr("manage.categories"), `${Object.keys(packsByCategory).length}`],
                  [tr("manage.packs"), `${packs.length}`],
                  [tr("manage.activePacks"), `${enabledCount} / ${packs.length}`],
                  [tr("manage.words"), `${packs.reduce((a, p) => a + p.words.length, 0)}`],
                  [tr("manage.activeWords"), `${allWords.length}`],
                ].map(([lbl, val]) => (
                  <div key={lbl} className="stat-card">
                    <div className="stat-value">{val}</div>
                    <div className="stat-label">{lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="actions-bar">
              <input value={newPackName} onChange={e => setNewPackName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addPack()}
                placeholder={tr('manage.newPackPlaceholder')} className="input" />
              <button className="btn btn-primary" onClick={addPack}>{tr('manage.addPack')}</button>
              <button className="btn btn-ghost" onClick={() => { setImportModal(true); setImportMsg(""); setImportText(""); }}>{tr('manage.csvImport')}</button>
              <button className="btn btn-ghost btn-danger" onClick={deleteUserData}>{tr('manage.deleteUserData')}</button>
            </div>

            {/* Pack grid */}
            {packs.length === 0 ? (
              <div className="no-packs">{tr('manage.noPacks')}</div>
            ) : (
              <div className="ps" style={{ paddingRight: 4 }}>
                {Object.entries(packsByCategory).map(([cat, catPacks]) => {
                  const hasEnabled = catPacks.some(p => p.enabled);
                  const isExpanded = expandedCats[cat] !== undefined ? expandedCats[cat] : hasEnabled;
                  const allCatEnabled = catPacks.every(p => p.enabled);
                  return (
                    <div key={cat} className="category-section">
                      <div className={`category-header ${isExpanded ? 'category-header--expanded' : ''}`}
                        onClick={(e) => { if (e.target.closest('button')) return; setExpandedCats(prev => ({ ...prev, [cat]: !isExpanded })); }}>
                        <span className="category-name-group">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`category-chevron text-secondary ${isExpanded ? 'category-chevron--expanded' : ''}`}><polyline points="9 18 15 12 9 6"/></svg>
                          <span className="category-name">{cat}</span>
                        </span>
                        <button onClick={() => toggleCategory(cat)} className={`toggle-cat ${allCatEnabled ? 'toggle-cat--on' : ''}`} aria-label={tr('manage.toggleCategory', { cat })}>
                          <div className="toggle-cat-knob" />
                        </button>
                        <span className="category-meta">{catPacks.length} {catPacks.length !== 1 ? tr('manage.packPlural') : tr('manage.packSingular')}</span>
                        <button onClick={() => deleteCategory(cat)} title={`Delete all packs in ${cat}`}
                          className="btn-icon text-danger category-delete"><TrashIcon /></button>
                      </div>
                      {isExpanded && (
                        <div className="pack-grid">
                          {catPacks.map(p => {
                            const packMedian = Math.round(medianOf(p.words.map(w => scores[w.korean] ?? SCORE.defaultScore)));
                            return (
                              <div key={p.id} className={`pack-card ${p.enabled ? 'pack-card--active' : ''}`}>
                                <div className="pack-name" title={p.name}>{p.name}</div>
                                <div className="pack-word-count">{p.words.length} {p.words.length !== 1 ? tr('manage.wordPlural') : tr('manage.word')}</div>
                                <div className="pack-progress">
                                  <div className="pack-progress-fill" style={{ width: `${packMedian}%`, minWidth: packMedian > 0 ? 2 : 0, background: scoreColor(packMedian) }} />
                                </div>
                                <div className="pack-actions">
                                  <div onClick={() => togglePack(p.id)} className={`toggle ${p.enabled ? 'toggle--on' : ''}`}>
                                    <div className="toggle-knob" />
                                  </div>
                                  <div className="pack-actions-spacer" />
                                  <button title="Edit" onClick={() => { setEditingPackId(p.id); setWordInput({ korean: "", english: "" }); setEditWordIdx(null); setAddWordMsg(""); }}
                                    className="btn-icon text-secondary"><EditIcon /></button>
                                  <button title="Delete" onClick={() => deletePack(p.id)}
                                    className="btn-icon text-danger"><TrashIcon /></button>
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
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editPack.name}</span>
              <button onClick={() => setEditingPackId(null)} className="modal-close">✕</button>
            </div>
            <div className="modal-section">
              <div className="section-label">{tr('editPack.renamePack')}</div>
              <div className="rename-row">
                <input defaultValue={editPack.name} id="renameInput" className="input" />
                <button className="btn btn-primary" onClick={() => { const v = document.getElementById("renameInput").value.trim(); if (v) renamePack(editingPackId, v); }}>{tr('editPack.save')}</button>
              </div>
            </div>
            <div className="modal-scroll ps">
              <div className="section-label">{tr('editPack.wordsLabel', { count: editPack.words.length })}</div>
              {editPack.words.length === 0 && <div className="no-words">{tr('editPack.noWords')}</div>}
              <div className="words-list">
                {editPack.words.map((w, i) => (
                  <div key={i} className={`word-row ${editWordIdx === i ? 'word-row--editing' : ''}`}>
                    <span className="word-content">
                      <strong className="word-korean">{w.korean}</strong>
                      <span className="word-separator">·</span>
                      <span className="word-translation">{w.english}</span>
                    </span>
                    <span className="word-score" style={{ color: scoreColor(scores[w.korean] ?? SCORE.defaultScore) }}>{scores[w.korean] ?? SCORE.defaultScore}%</span>
                    <button onClick={() => { setEditWordIdx(i); setWordInput({ korean: w.korean, english: w.english }); }}
                      className="btn-icon text-secondary"><EditIcon /></button>
                    <button onClick={() => removePackWord(i)}
                      className="btn-icon text-danger"><TrashIcon /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <div className="section-label">{editWordIdx !== null ? tr('editPack.editWord') : tr('editPack.addWord')}</div>
              <div className={`word-form ${editWordIdx !== null ? 'word-form--edit' : 'word-form--add'}`}>
                <input value={wordInput.korean} onChange={e => setWordInput(w => ({ ...w, korean: e.target.value }))}
                  placeholder={tr('editPack.koreanPlaceholder')} className="input" />
                <input value={wordInput.english} onChange={e => setWordInput(w => ({ ...w, english: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveWord()}
                  placeholder={tr('editPack.translationPlaceholder')} className="input" />
                <button className="btn btn-primary" style={{ whiteSpace: "nowrap", width: "100%" }} onClick={saveWord}>
                  {editWordIdx !== null ? tr('editPack.save') : tr('editPack.addBtn')}
                </button>
                {editWordIdx !== null && (
                  <button className="btn-icon text-secondary word-form-cancel"
                    onClick={() => { setEditWordIdx(null); setWordInput({ korean: "", english: "" }); }}>✕</button>
                )}
              </div>
              {addWordMsg && <p className="word-msg">{addWordMsg}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── CSV IMPORT MODAL ── */}
      {importModal && (
        <Modal title={tr('csvImport.title')} onClose={() => setImportModal(false)}>
          <textarea value={importText} onChange={e => setImportText(e.target.value)}
            placeholder={CSV_HINT + "\n\n" + tr('csvImport.pastePlaceholder')}
            className="textarea textarea-mono" style={{ minHeight: 160 }} />
          <div className="import-actions">
            <button className="btn btn-primary" onClick={doImport}>{tr('csvImport.importBtn')}</button>
            <button className="btn btn-ghost" onClick={() => setImportModal(false)}>{tr('csvImport.cancelBtn')}</button>
            <button className="btn btn-ghost btn-llm" onClick={() => { setPromptModal(true); setPromptInput(""); setPromptCopied(false); }}>
              {tr('csvImport.llmPrompt')}
            </button>
          </div>
          {importMsg && <p className={`import-msg ${importMsg.startsWith("✓") ? 'import-msg--success' : 'import-msg--error'}`}>{importMsg}</p>}
        </Modal>
      )}

      {/* ── LLM PROMPT MODAL ── */}
      {promptModal && (
        <Modal title={tr('llmPrompt.title')} onClose={() => setPromptModal(false)}>
          <div style={{ marginBottom: 8 }}>
            <textarea value={promptInput} onChange={e => setPromptInput(e.target.value)}
              placeholder={tr('llmPrompt.placeholder')}
              className="textarea" style={{ minHeight: 220, lineHeight: 1.6 }} />
          </div>
          <div className="prompt-actions">
            <button className="btn btn-primary" style={{ opacity: promptInput.trim() ? 1 : 0.5 }}
              disabled={!promptInput.trim()} onClick={generatePrompt}>
              {promptCopied ? tr('llmPrompt.copied') : tr('llmPrompt.generateCopy')}
            </button>
            <button className="btn btn-ghost" onClick={() => setPromptModal(false)}>{tr('llmPrompt.close')}</button>
          </div>
          {promptCopied && (
            <p className="prompt-copied-msg">
              {tr('llmPrompt.copiedMsg')}
            </p>
          )}
        </Modal>
      )}

      {/* ── Language Selection Modal (first visit) ── */}
      {langModal && (
        <div className="lang-overlay">
          <div className="lang-modal">
            <img src={(import.meta.env.BASE_URL || '/') + 'icon.png'} alt="HanCards" className="lang-modal-icon" />
            <p className="lang-modal-title">한카드 HanCards</p>
            <p className="lang-modal-subtitle">Choose your language</p>
            <div className="lang-btn-group">
              {LANGUAGES.map(lang => (
                <button key={lang.code} onClick={() => handleLangSelect(lang.code)}
                  className="lang-btn"
                  style={{ '--lang-color': lang.color, '--lang-border': lang.borderColor }}
                >{lang.flag} {lang.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Floating language switcher ── */}
      <button onClick={cycleLang} className="fab fab-lang">
        {nextLang ? `${nextLang.flag} ${nextLang.code.toUpperCase()}` : "🌐"}
      </button>

      {/* ── Floating dark mode ── */}
      <button onClick={() => setDark(d => !d)} className="fab fab-theme">
        {dark ? "☀️" : "🌙"}
      </button>
    </div>
  );
}
