import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "kcards-v15";

const CSV_HINT = `pack_category,pack_name,korean,english
TC3,TC3 - Bài 1,학기,semester
TC3,TC3 - Bài 1,과목,subject
TC3,TC3 - Bài 2,대인 관계,social relations
(wrap comma-containing values in "double quotes")`;

const SCROLLBAR_CSS = `
  .ps::-webkit-scrollbar { width: 4px; height: 4px; }
  .ps::-webkit-scrollbar-track { background: transparent; }
  .ps::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.2); border-radius: 99px; }
  .ps::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.4); }
`;

async function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { packs: [], counts: {} };
  } catch {
    return { packs: [], counts: {} };
  }
}

async function saveData(d) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch (e) {
    console.error("Save failed", e);
  }
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase().replace(/\s/g,"");
  let data = lines;
  let hasCategory = false;
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
    if (hasCategory) {
      if (fields.length < 4) return null;
      return { pack_category: fields[0].trim(), pack_name: fields[1].trim(), korean: fields[2].trim(), english: fields[3].trim() };
    } else {
      if (fields.length < 3) return null;
      return { pack_category: "", pack_name: fields[0].trim(), korean: fields[1].trim(), english: fields[2].trim() };
    }
  }).filter(Boolean);
}

function pickCard(words, counts, lastIdx) {
  if (!words.length) return null;
  if (words.length === 1) return 0;
  const freq = words.map((_, i) => counts[i] ?? 0);
  const maxF = Math.max(...freq);
  const weights = freq.map((f, i) => i === lastIdx ? 0.1 : maxF - f + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return 0;
}

function getFontSize(text) {
  const len = (text || "").length;
  if (len <= 3)  return "6rem";
  if (len <= 6)  return "5rem";
  if (len <= 10) return "4rem";
  if (len <= 18) return "3rem";
  if (len <= 30) return "2.2rem";
  return "1.6rem";
}

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

function FlipCard({ front, back, flipped, onClick, dark }) {
  const HALF = 220;
  const [text, setText] = useState(front || "");
  const [label, setLabel] = useState("Prompt");
  const [phase, setPhase] = useState("idle");
  const timerRef = useRef(null);
  const prevFlipped = useRef(flipped);
  const prevFront = useRef(front);

  useEffect(() => {
    if (prevFront.current !== front) {
      prevFront.current = front;
      clearTimeout(timerRef.current);
      setPhase("idle"); setText(front || ""); setLabel("Prompt");
    }
  }, [front]);

  useEffect(() => {
    if (prevFlipped.current === flipped) return;
    prevFlipped.current = flipped;
    clearTimeout(timerRef.current);
    setPhase("out");
    timerRef.current = setTimeout(() => {
      setText(flipped ? (back || "") : (front || ""));
      setLabel(flipped ? "Answer" : "Prompt");
      setPhase("in");
      timerRef.current = setTimeout(() => setPhase("idle"), HALF);
    }, HALF);
    return () => clearTimeout(timerRef.current);
  }, [flipped, front, back]);

  return (
    <div onClick={onClick} style={{
      cursor: "pointer", width: "100%", maxWidth: 680, margin: "0 auto", height: 340,
      userSelect: "none", background: dark ? "#1e1e1e" : "#fff", borderRadius: 28,
      boxShadow: dark ? "0 4px 16px rgba(0,0,0,0.4)" : "0 4px 16px rgba(0,0,0,0.07)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "2.5rem 3.5rem", boxSizing: "border-box",
      transition: `transform ${HALF}ms cubic-bezier(.4,0,.2,1)`,
      transform: `scaleX(${phase === "out" ? 0 : 1})`,
    }}>
      <div style={{ fontSize: "0.85rem", letterSpacing: 3, color: dark ? "#888" : "#bbb", marginBottom: 20, textTransform: "uppercase", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: getFontSize(text), fontWeight: 700, color: dark ? "#f0f0f0" : "#1a1a1a", textAlign: "center", lineHeight: 1.2, wordBreak: "break-word", width: "100%" }}>{text}</div>
    </div>
  );
}

function Modal({ title, onClose, children, dark, maxWidth = 520 }) {
  const t = dark;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ background: t ? "#1c1c1c" : "#fff", borderRadius: 14, width: "100%", maxWidth: 800, maxHeight: "86vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.28)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.4rem 1.8rem", borderBottom: `1px solid ${t ? "#262626" : "#efefef"}`, flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: t ? "#eee" : "#1a1a1a" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: t ? "#777" : "#aaa", lineHeight: 1 }}>✕</button>
        </div>
        <div className="ps" style={{ overflowY: "auto", padding: "1.6rem 1.8rem", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [packs, setPacks] = useState([]);
  const [counts, setCounts] = useState({});
  const [mode, setMode] = useState("eng");
  const [cardIdx, setCardIdx] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [dark, setDark] = useState(true);
  const [editingPackId, setEditingPackId] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [promptModal, setPromptModal] = useState(false);
  const [newPackName, setNewPackName] = useState("");
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [wordInput, setWordInput] = useState({ korean: "", english: "" });
  const [editWordIdx, setEditWordIdx] = useState(null);
  const [addWordMsg, setAddWordMsg] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);

  const lastIdxRef = useRef(null);
  const packsRef = useRef(packs);
  const countsRef = useRef(counts);
  const flippedRef = useRef(false);
  const screenRef = useRef(screen);

  useEffect(() => { packsRef.current = packs; }, [packs]);
  useEffect(() => { countsRef.current = counts; }, [counts]);
  useEffect(() => { flippedRef.current = flipped; }, [flipped]);
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

  const persist = useCallback(async (ps, c) => { await saveData({ packs: ps, counts: c }); }, []);

  useEffect(() => {
    loadData().then(({ packs: p, counts: c }) => {
      setPacks(p); setCounts(c);
      packsRef.current = p; countsRef.current = c;
      const words = activeWords(p);
      setScreen(words.length ? "study" : "manage");
      if (words.length) setCardIdx(pickCard(words, c, null));
    });
  }, []);

  const nextCard = useCallback(() => {
    const words = activeWords(packsRef.current);
    const c = countsRef.current;
    const idx = pickCard(words, c, lastIdxRef.current);
    lastIdxRef.current = idx;
    const nc = { ...c, [idx]: (c[idx] ?? 0) + 1 };
    setCounts(nc); countsRef.current = nc;
    setCardIdx(idx); setFlipped(false);
    persist(packsRef.current, nc);
  }, [activeWords, persist]);

  useEffect(() => {
    const handler = (e) => {
      if (screenRef.current !== "study") return;
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (["ArrowUp","ArrowDown","Space"].includes(e.code)) { e.preventDefault(); setFlipped(f => !f); }
      if (["ArrowRight","Enter"].includes(e.code)) { e.preventDefault(); nextCard(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nextCard]);

  const togglePack = (id) => {
    const np = packs.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p);
    setPacks(np);
    const nc = {}; setCounts(nc); countsRef.current = nc;
    const words = activeWords(np);
    setCardIdx(words.length ? pickCard(words, nc, null) : null);
    lastIdxRef.current = null;
    persist(np, nc);
  };

  // ✅ FIXED: toggleCategory moved inside the component so it can access packs, activeWords, persist
  const toggleCategory = (cat) => {
    const catPacks = packs.filter(p => (p.category || p.pack_category || "Uncategorized") === cat);
    const allEnabled = catPacks.length > 0 && catPacks.every(p => p.enabled);
    const np = packs.map(p => (catPacks.includes(p) ? { ...p, enabled: !allEnabled } : p));
    setPacks(np);
    const nc = {}; setCounts(nc); countsRef.current = nc;
    const words = activeWords(np);
    setCardIdx(words.length ? pickCard(words, nc, null) : null);
    lastIdxRef.current = null;
    persist(np, nc);
  };

  const deleteCategory = (cat) => {
    if (!confirm(`Delete all packs in "${cat}"?`)) return;
    const np = packs.filter(p => (p.category || p.pack_category || "Uncategorized") !== cat);
    setPacks(np);
    const nc = {}; setCounts(nc); countsRef.current = nc;
    const words = activeWords(np);
    setCardIdx(words.length ? pickCard(words, nc, null) : null);
    lastIdxRef.current = null;
    persist(np, nc);
  };

  const addPack = () => {
    const name = newPackName.trim(); if (!name) return;
    const np = [...packs, { id: `pack-${Date.now()}`, name, words: [], enabled: false }];
    setPacks(np); setNewPackName(""); persist(np, counts);
  };

  const renamePack = (id, name) => {
    const np = packs.map(p => p.id === id ? { ...p, name } : p);
    setPacks(np); persist(np, counts);
  };

  const deletePack = (id) => {
    const np = packs.filter(p => p.id !== id);
    setPacks(np);
    const nc = {}; setCounts(nc);
    setCardIdx(activeWords(np).length ? pickCard(activeWords(np), nc, null) : null);
    persist(np, nc);
  };

  const deleteAllPacks = () => {
    if (!confirm("Delete ALL packs?")) return;
    setPacks([]); setCounts({}); setCardIdx(null); persist([], {});
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
    setPacks(np); persist(np, counts);
    setWordInput({ korean: "", english: "" }); setEditWordIdx(null);
    setAddWordMsg(editWordIdx !== null ? "✓ Updated." : "✓ Added.");
    setTimeout(() => setAddWordMsg(""), 1500);
  };

  const removePackWord = (idx) => {
    const np = packs.map(p => p.id !== editingPackId ? p : { ...p, words: p.words.filter((_, i) => i !== idx) });
    setPacks(np); persist(np, counts);
  };

  const doImport = () => {
    if (!importText.trim()) return;
    const rows = parseCSV(importText);
    if (!rows.length) { setImportMsg("No valid rows found."); return; }
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
    setPacks(np); persist(np, counts);
    setImportMsg(`✓ ${added > 0 ? `${added} created` : ""}${added && updated ? ", " : ""}${updated > 0 ? `${updated} updated` : ""} — ${total} words.`);
    setImportText("");
  };

  const generatePrompt = () => {
    if (!promptInput.trim()) return;
    const prompt = `Convert the following Korean study material into a CSV with exactly 4 columns: pack_category, pack_name, korean, english.

Rules:
- First row must be exactly: pack_category,pack_name,korean,english
- Use the lesson/topic title as pack_name (same value for all words in the same lesson)
- Use the course/book/overall group as pack_category (same value for all packs in the same group)
- korean = the Korean word or phrase
- english = the English or Vietnamese translation (keep it concise, under 80 chars)
- If a value contains a comma, wrap it in double quotes
- Output ONLY the raw CSV. No explanation, no markdown fences, no extra text.

Naming rules (very important):
- Keep pack_category SHORT: max 20 characters. Use only the essential identifier (e.g. "TC3", "TOPIK1", "Book2"). Drop filler words like "Chapter", "Unit", "Lesson".
- Keep pack_name SHORT: max 30 characters. Use only the core topic or lesson number (e.g. "Bài 1", "L3 Family", "Ch2 Food"). Drop long subtitles.
- pack_category and pack_name must NOT contain any of these symbols: " ' , \ / | : ; ( ) [ ] { }
- Use only plain alphanumeric characters, spaces, hyphens, and dots.

Material:
${promptInput.trim()}`;
    navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 3000);
  };

  const allWords = activeWords(packs);
  const card = allWords[cardIdx];
  const front = card ? (mode === "eng" ? card.english : card.korean) : "";
  const back  = card ? (mode === "eng" ? card.korean  : card.english) : "";
  // Group packs by category
  const packsByCategory = {};
  packs.forEach(p => {
    const cat = p.category || p.pack_category || "Uncategorized";
    if (!packsByCategory[cat]) packsByCategory[cat] = [];
    packsByCategory[cat].push(p);
  });
  const enabledCount = packs.filter(p => p.enabled).length;
  const minSeen = allWords.length ? Math.min(...allWords.map((_, i) => counts[i] ?? 0)) : 0;
  const maxSeen = allWords.length ? Math.max(...allWords.map((_, i) => counts[i] ?? 0)) : 0;

  const D = dark;
  const t = {
    bg: D ? "#0e0e0e" : "#f4f4f2",
    headerBg: D ? "#111" : "#fff",
    headerBorder: D ? "#1e1e1e" : "#e8e8e8",
    text: D ? "#eaeaea" : "#1a1a1a",
    subText: D ? "#888" : "#888",
    mutedText: D ? "#444" : "#ccc",
    border: D ? "#252525" : "#e0e0e0",
    toggleBg: D ? "#181818" : "#ebebeb",
    toggleActive: D ? "#282828" : "#fff",
    inputBg: D ? "#161616" : "#fff",
    inputColor: D ? "#eaeaea" : "#1a1a1a",
    rowBg: D ? "#161616" : "#fff",
    primaryBg: D ? "#e8e8e8" : "#1a1a1a",
    primaryText: D ? "#111" : "#fff",
    ghostBorder: D ? "#2e2e2e" : "#e0e0e0",
    ghostColor: D ? "#999" : "#666",
    kbdBg: D ? "#222" : "#e8e8e8",
    kbdText: D ? "#ccc" : "#555",
    activeBg: D ? "#0c1f0c" : "#f0faf0",
    activeBorder: D ? "#1a3a1a" : "#a8daa8",
    activeText: D ? "#6dde6d" : "#2a7a2a",
  };

  const btnBase = { border: "none", cursor: "pointer", borderRadius: 8, fontFamily: "inherit", fontWeight: 500, transition: "all 0.15s" };
  const primaryBtn = { ...btnBase, background: t.primaryBg, color: t.primaryText, padding: "0.6rem 1.3rem", fontSize: "0.88rem" };
  const ghostBtn = { ...btnBase, background: "transparent", color: t.ghostColor, padding: "0.5rem 1rem", fontSize: "0.85rem", border: `1px solid ${t.ghostBorder}` };
  const iconBtn = { ...btnBase, background: "transparent", border: "none", padding: "0.3rem 0.4rem", lineHeight: 0, borderRadius: 6 };
  const inputStyle = { width: "100%", padding: "0.65rem 0.9rem", borderRadius: 8, border: `1px solid ${t.border}`, fontFamily: "inherit", fontSize: "0.88rem", outline: "none", boxSizing: "border-box", background: t.inputBg, color: t.inputColor };
  const kbdStyle = { background: t.kbdBg, color: t.kbdText, padding: "2px 7px", borderRadius: 5, fontSize: "0.7rem", fontFamily: "monospace" };
  const sectionLabel = { fontSize: "0.7rem", color: t.subText, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 10 };

  if (screen === "loading") return (
    <div style={{ fontFamily: "system-ui", background: t.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", width: "100vw" }}>
      <p style={{ color: t.subText }}>Loading…</p>
    </div>
  );

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: t.bg, minHeight: "100vh", color: t.text, width: "100vw" }}>
      {/* Header */}
      <div style={{ background: t.headerBg, borderBottom: `1px solid ${t.headerBorder}`, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "stretch", height: 54 }}>
          <div style={{ padding: "0 1.8rem", display: "flex", alignItems: "center", fontWeight: 700, fontSize: "1rem", flex: 1 }}>
            한국어 <span style={{ color: t.subText, fontWeight: 400, marginLeft: 6 }}>Flash Cards</span>
          </div>
          <div style={{ display: "flex" }}>
            {[["study","Study"],["manage","Manage"]].map(([s, lbl]) => (
              <button key={s} onClick={() => setScreen(s)} style={{
                ...btnBase, borderRadius: 0, padding: "0 1.6rem", fontSize: "0.9rem",
                background: "transparent", color: screen === s ? t.text : t.subText,
                borderBottom: screen === s ? `2px solid ${t.primaryBg}` : "2px solid transparent",
                fontWeight: screen === s ? 600 : 400,
              }}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── STUDY ── */}
      {screen === "study" && (
        <div style={{ padding: "3rem 2rem", margin: 0 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "2.5rem" }}>
            <div style={{ display: "flex", background: t.toggleBg, borderRadius: 10, padding: 3 }}>
              {[["eng", "🇺🇸", "🇰🇷"], ["kor", "🇰🇷", "🇺🇸"]].map(([v, f, t2]) => (
                <button key={v} onClick={() => { setMode(v); setFlipped(false); }}
                  title={v === "eng" ? "English → Korean" : "Korean → English"}
                  style={{ ...btnBase, padding: "0.5rem 1.1rem", fontSize: "1.35rem", lineHeight: 1, display: "flex", alignItems: "center", gap: 4, background: mode === v ? t.toggleActive : "transparent", color: mode === v ? t.text : t.subText, boxShadow: mode === v ? "0 1px 4px rgba(0,0,0,0.25)" : "none" }}>
                  {f}<span style={{ fontSize: "0.75rem", opacity: 0.4, margin: "0 1px" }}>/</span>{t2}
                </button>
              ))}
            </div>
          </div>
          {allWords.length === 0 ? (
            <div style={{ textAlign: "center", color: t.subText, marginTop: "5rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 16 }}>📚</div>
              <p>No active packs. Go to <strong style={{ color: t.text, cursor: "pointer" }} onClick={() => setScreen("manage")}>Manage</strong> and enable some!</p>
            </div>
          ) : card ? (
            <>
              <FlipCard front={front} back={back} flipped={flipped} onClick={() => setFlipped(f => !f)} dark={dark} />
              <div style={{ textAlign: "center", marginTop: 18, fontSize: "0.72rem", color: t.mutedText, display: "flex", justifyContent: "center", gap: 28 }}>
                <span><kbd style={kbdStyle}>↑ ↓ Space</kbd> flip</span>
                <span><kbd style={kbdStyle}>→ Enter</kbd> next</span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: "2.2rem" }}>
                {!flipped
                  ? <button style={primaryBtn} onClick={() => setFlipped(true)}>Show Answer</button>
                  : <button style={primaryBtn} onClick={nextCard}>Next →</button>}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: "2rem", fontSize: "0.78rem", color: t.mutedText }}>
                <span>{allWords.length} words · {enabledCount} pack{enabledCount !== 1 ? "s" : ""}</span>
                <span>Seen {minSeen}–{maxSeen}×</span>
                <span>Card #{(cardIdx ?? 0) + 1}</span>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── MANAGE ── */}
      {screen === "manage" && (
        <div style={{ padding: "2.5rem 2rem", margin: 0 }}>
          {/* Analytics */}
          <div style={{ display: "flex", gap: 14, marginBottom: "2rem", flexWrap: "wrap" }}>
            {[
              ["Categories", `${Object.keys(packsByCategory).length}`],
              ["Packs", `${packs.length}`],
              ["Active Packs", `${enabledCount} / ${packs.length}`],
              ["Words", `${packs.reduce((a, p) => a + p.words.length, 0)}`],
              ["Active Words", `${allWords.length}`],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ background: t.rowBg, borderRadius: 12, padding: "1rem 1.2rem", border: `1px solid ${t.border}`, flex: 1, textAlign: "center", minWidth: 90 }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: t.text, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: "0.72rem", color: t.subText, marginTop: 6 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginBottom: "2rem", flexWrap: "wrap", alignItems: "center" }}>
            <input value={newPackName} onChange={e => setNewPackName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addPack()}
              placeholder="New pack name…" style={{ ...inputStyle, flex: "1 1 180px", width: "auto" }} />
            <button style={primaryBtn} onClick={addPack}>+ Add Pack</button>
            <button style={ghostBtn} onClick={() => { setImportModal(true); setImportMsg(""); setImportText(""); }}>📥 CSV Import</button>
            <button style={{ ...ghostBtn, color: "#ff5566", borderColor: D ? "#3a1515" : "#fdd" }} onClick={deleteAllPacks}>🗑 Delete All</button>
          </div>

          {/* Pack grid grouped by category */}
          {packs.length === 0 ? (
            <div style={{ textAlign: "center", color: t.subText, padding: "4rem 0" }}>No packs yet. Add one above or use CSV Import.</div>
          ) : (
            <div className="ps" style={{ maxHeight: "calc(100vh - 340px)", overflowY: "auto", paddingRight: 4 }}>
              {Object.entries(packsByCategory).map(([cat, catPacks]) => (
                <div key={cat} style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: "1.05rem", color: t.text }}>{cat}</span>
                    <button
                      onClick={() => toggleCategory(cat)}
                      style={{
                        cursor: "pointer",
                        width: 38,
                        height: 22,
                        borderRadius: 12,
                        background: catPacks.every(p => p.enabled) ? "#4caf50" : t.border,
                        flexShrink: 0,
                        transition: "background 0.2s",
                        marginLeft: 4,
                        border: 'none',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        outline: 'none',
                        position: 'static',
                      }}
                      aria-label={`Toggle all packs in ${cat}`}
                    >
                      <div style={{ position: "relative", top: 0, left: catPacks.every(p => p.enabled) ? 18 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
                    </button>
                    <span style={{ fontSize: "0.72rem", color: t.subText, marginLeft: 2 }}>{catPacks.length} pack{catPacks.length !== 1 ? "s" : ""}</span>
                    <button
                      onClick={() => deleteCategory(cat)}
                      title={`Delete all packs in ${cat}`}
                      style={{ ...iconBtn, color: "#ff5566", marginLeft: "auto" }}
                    ><TrashIcon /></button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
                    {catPacks.map(p => (
                      <div key={p.id} style={{ background: p.enabled ? t.activeBg : t.rowBg, border: `1px solid ${p.enabled ? t.activeBorder : t.border}`, borderRadius: 14, padding: "1.1rem", display: "flex", flexDirection: "column", gap: 10, transition: "background 0.2s, border-color 0.2s" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.88rem", color: p.enabled ? t.activeText : t.text, lineHeight: 1.35, wordBreak: "break-word", flex: 1 }}>{p.name}</div>
                        <div style={{ fontSize: "0.73rem", color: t.subText }}>{p.words.length} word{p.words.length !== 1 ? "s" : ""}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div onClick={() => togglePack(p.id)} style={{ cursor: "pointer", width: 34, height: 20, borderRadius: 10, background: p.enabled ? "#4caf50" : t.border, position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                            <div style={{ position: "absolute", top: 2, left: p.enabled ? 16 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
                          </div>
                          <div style={{ flex: 1 }} />
                          <button title="Edit" onClick={() => { setEditingPackId(p.id); setWordInput({ korean: "", english: "" }); setEditWordIdx(null); setAddWordMsg(""); }}
                            style={{ ...iconBtn, color: t.subText }}><EditIcon /></button>
                          <button title="Delete" onClick={() => deletePack(p.id)}
                            style={{ ...iconBtn, color: "#ff5566" }}><TrashIcon /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── EDIT PACK MODAL ── */}
      {editingPackId && editPack && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div style={{ background: D ? "#1c1c1c" : "#fff", borderRadius: 14, width: "100%", maxWidth: 800, maxHeight: "86vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.28)" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.4rem 1.8rem", borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: "1.05rem", color: t.text }}>{editPack.name}</span>
              <button onClick={() => setEditingPackId(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: t.subText, lineHeight: 1 }}>✕</button>
            </div>

            {/* Rename */}
            <div style={{ padding: "1.4rem 1.8rem", borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
              <div style={sectionLabel}>Rename Pack</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input defaultValue={editPack.name} id="renameInput" style={{ ...inputStyle, flex: 1 }} />
                <button style={primaryBtn} onClick={() => { const v = document.getElementById("renameInput").value.trim(); if (v) renamePack(editingPackId, v); }}>Save</button>
              </div>
            </div>

            {/* Word list */}
            <div className="ps" style={{ flex: 1, overflowY: "auto", padding: "1.4rem 1.8rem" }}>
              <div style={sectionLabel}>{editPack.words.length} Words</div>
              {editPack.words.length === 0 && <div style={{ color: t.mutedText, fontSize: "0.85rem", padding: "0.5rem 0" }}>No words yet. Add one below.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {editPack.words.map((w, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: editWordIdx === i ? (D ? "#1a2a1a" : "#f0faf0") : t.rowBg, borderRadius: 8, padding: "0.6rem 0.9rem", fontSize: "0.85rem", border: `1px solid ${editWordIdx === i ? t.activeBorder : t.border}` }}>
                    <span style={{ flex: 1 }}>
                      <strong style={{ color: t.text }}>{w.korean}</strong>
                      <span style={{ color: t.mutedText, margin: "0 8px" }}>·</span>
                      <span style={{ color: t.subText }}>{w.english}</span>
                    </span>
                    <button onClick={() => { setEditWordIdx(i); setWordInput({ korean: w.korean, english: w.english }); }}
                      style={{ ...iconBtn, color: t.subText }}><EditIcon /></button>
                    <button onClick={() => removePackWord(i)}
                      style={{ ...iconBtn, color: "#ff5566" }}><TrashIcon /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add word — pinned bottom */}
            <div style={{ borderTop: `1px solid ${t.border}`, padding: "1.2rem 1.8rem", flexShrink: 0 }}>
              <div style={sectionLabel}>{editWordIdx !== null ? "Edit Word" : "Add Word"}</div>
              <div style={{ display: "grid", gridTemplateColumns: editWordIdx !== null ? "1fr 1.4fr 1fr 0.5fr" : "1fr 1.4fr 1fr", gap: 8, alignItems: "center" }}>
                <input value={wordInput.korean} onChange={e => setWordInput(w => ({ ...w, korean: e.target.value }))}
                  placeholder="Korean" style={{ ...inputStyle, width: "100%" }} />
                <input value={wordInput.english} onChange={e => setWordInput(w => ({ ...w, english: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveWord()}
                  placeholder="Translation" style={{ ...inputStyle, width: "100%" }} />
                <button style={{ ...primaryBtn, whiteSpace: "nowrap", width: "100%" }} onClick={saveWord}>
                  {editWordIdx !== null ? "Save" : "+ Add"}
                </button>
                {editWordIdx !== null && (
                  <button style={{ ...iconBtn, color: t.subText, fontSize: "1.1rem", padding: "0.4rem", width: "100%" }}
                    onClick={() => { setEditWordIdx(null); setWordInput({ korean: "", english: "" }); }}>✕</button>
                )}
              </div>
              {addWordMsg && <p style={{ marginTop: 8, fontSize: "0.82rem", color: D ? "#5ddb9e" : "#2e8a5e", marginBottom: 0 }}>{addWordMsg}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── CSV IMPORT MODAL ── */}
      {importModal && (
        <Modal title="CSV Import" onClose={() => setImportModal(false)} dark={dark}>
          <div style={{ background: t.toggleBg, borderRadius: 10, padding: "1rem 1.1rem", marginBottom: "1.4rem", fontSize: "0.78rem", color: t.subText, fontFamily: "monospace", whiteSpace: "pre", overflowX: "auto", lineHeight: 1.8 }}>{CSV_HINT}</div>
          <p style={{ fontSize: "0.83rem", color: t.subText, marginBottom: "1.2rem", lineHeight: 1.6 }}>
            Same <code style={{ background: t.toggleBg, padding: "1px 5px", borderRadius: 4 }}>pack_name</code> merges into existing pack. Duplicate Korean words are overwritten.
          </p>
          <textarea value={importText} onChange={e => setImportText(e.target.value)}
            placeholder="Paste CSV here…"
            style={{ ...inputStyle, minHeight: 160, resize: "vertical", fontFamily: "monospace", fontSize: "0.82rem" }} />
          <div style={{ display: "flex", gap: 10, marginTop: "1rem", alignItems: "center" }}>
            <button style={primaryBtn} onClick={doImport}>Import</button>
            <button style={ghostBtn} onClick={() => setImportModal(false)}>Cancel</button>
            <button style={{
              ...ghostBtn,
              marginLeft: "auto",
              background: dark ? '#d72660' : '#e040fb',
              color: '#fff',
              border: 'none',
              boxShadow: '0 2px 8px rgba(215,38,96,0.12)'
            }} onClick={() => { setPromptModal(true); setPromptInput(""); setPromptCopied(false); }}>
              🤖 LLM Prompt
            </button>
          </div>
          {importMsg && <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: importMsg.startsWith("✓") ? (D ? "#5ddb9e" : "#2e8a5e") : "#ff5566", marginBottom: 0 }}>{importMsg}</p>}
        </Modal>
      )}

      {/* ── LLM PROMPT MODAL ── */}
      {promptModal && (
        <Modal title="🤖 Generate LLM Prompt" onClose={() => setPromptModal(false)} dark={dark} maxWidth={560}>
          <div style={{ marginBottom: 8 }}>
            <textarea value={promptInput} onChange={e => setPromptInput(e.target.value)}
              placeholder="Paste your study material below. Click Generate & Copy — a ready-to-use prompt will be copied to your clipboard. Then paste it into ChatGPT, Claude, or any LLM to get a CSV you can import."
              style={{ ...inputStyle, minHeight: 220, resize: "vertical", lineHeight: 1.6 }} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: "1rem", alignItems: "center" }}>
            <button style={{ ...primaryBtn, opacity: promptInput.trim() ? 1 : 0.5 }}
              disabled={!promptInput.trim()} onClick={generatePrompt}>
              {promptCopied ? "✓ Copied to clipboard!" : "Generate & Copy"}
            </button>
            <button style={ghostBtn} onClick={() => setPromptModal(false)}>Close</button>
          </div>
          {promptCopied && (
            <p style={{ marginTop: "1rem", fontSize: "0.83rem", color: D ? "#5ddb9e" : "#2e8a5e", lineHeight: 1.6, marginBottom: 0 }}>
              ✓ Prompt copied! Paste it into your LLM, then bring the CSV output back here to import.
            </p>
          )}
        </Modal>
      )}

      {/* Floating dark mode */}
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