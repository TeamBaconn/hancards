import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
  STORAGE_KEY, LANG_KEY, VOICE_SETTINGS_KEY, SCORE, scoreColor,
  LANG_MAP, CSV_HINT,
  KOREAN_TTS_LANG, KOREAN_TTS_SAMPLE, AUTO_SPEAK,
} from "./config";
import { loadData, saveData, parseCSV, importDefaultPacks } from "./utils/storage";
import { pickCard } from "./utils/cards";
import { EditIcon, TrashIcon } from "./components/icons";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import Modal from "./components/Modal";
import LangSelectModal from "./components/LangSelectModal";
import VoiceSettingsModal from "./components/VoiceSettingsModal";
import SettingsModal from "./components/SettingsModal";
import StudyScreen from "./pages/StudyScreen";

/* ── Styles ── */
import "./styles/app.css";
import "./styles/shared.css";
import "./styles/header.css";
import "./styles/flipcard.css";
import "./styles/study.css";
import "./styles/manage.css";
import "./styles/quiz.css";
import "./styles/about.css";
import "./styles/modal.css";
import "./styles/language.css";
import "./styles/settings.css";
import "./styles/bottom-nav.css";

/* ── Lazy-loaded pages ── */
const ManageScreen = lazy(() => import("./pages/ManageScreen"));
const AboutScreen = lazy(() => import("./pages/AboutScreen"));
const QuizScreen = lazy(() => import("./pages/QuizScreen"));

/* ════════════════════════════════════════════════════════════
   App
   ════════════════════════════════════════════════════════════ */

export default function App() {
  const { t: tr, i18n } = useTranslation();

  const [isLoading, setIsLoading]     = useState(true);
  const [screen, setScreen]           = useState("study");
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
  const [langModalClosable, setLangModalClosable] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);

  const [importText, setImportText]   = useState("");
  const [importMsg, setImportMsg]     = useState("");
  const [wordInput, setWordInput]     = useState({ korean: "", english: "" });
  const [editWordIdx, setEditWordIdx] = useState(null);
  const [addWordMsg, setAddWordMsg]   = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [learningLanguage, setLearningLanguage] = useState("Korean");
  const [expandedCats, setExpandedCats] = useState({});
  const [autoSpeak, setAutoSpeak]   = useState(false);
  const [voiceModal, setVoiceModal] = useState(false);
  const [pwaReady, setPwaReady]     = useState(false);
  const [voiceSettings, setVoiceSettings] = useState(() => {
    try { const r = localStorage.getItem(VOICE_SETTINGS_KEY); if (r) return JSON.parse(r); } catch {}
    return { langs: {} };
  });

  const lastIdxRef        = useRef(null);
  const packsRef          = useRef(packs);
  const scoresRef         = useRef(scores);
  const modeRef           = useRef(mode);
  const wakeLockRef       = useRef(null);
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const didFlipRef        = useRef(false);
  const screenRef         = useRef(screen);
  const autoSpeakRef      = useRef(false);
  const voiceSettingsRef  = useRef(voiceSettings);
  const speakerTapTimer   = useRef(null);

  useEffect(() => { packsRef.current = packs; }, [packs]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);
  useEffect(() => { document.documentElement.setAttribute("data-theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { voiceSettingsRef.current = voiceSettings; }, [voiceSettings]);

  /* ── Lazy-load PWA install component ── */
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) return;
    import('@khmyznikov/pwa-install').then(() => setPwaReady(true));
  }, []);

  const saveVoiceSettings = useCallback((s) => {
    setVoiceSettings(s); voiceSettingsRef.current = s;
    try { localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(s)); } catch {}
  }, []);

  /* ── Wake Lock ── */
  const requestWakeLock = useCallback(async () => {
    if (!wakeLockSupported) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null; });
    } catch (err) { /* ignore */ }
  }, [wakeLockSupported]);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; }
  }, []);

  /* ── Speaker tap logic ── */
  const handleSpeakerTap = useCallback(() => {
    if (autoSpeak) { setAutoSpeak(false); releaseWakeLock(); return; }
    if (speakerTapTimer.current) {
      clearTimeout(speakerTapTimer.current); speakerTapTimer.current = null;
      setAutoSpeak(true); requestWakeLock();
    } else {
      speakerTapTimer.current = setTimeout(() => {
        speakerTapTimer.current = null; setVoiceModal(true);
      }, 300);
    }
  }, [autoSpeak, requestWakeLock, releaseWakeLock]);

  /* Wake lock effect */
  useEffect(() => {
    if (autoSpeak) requestWakeLock(); else releaseWakeLock();
    return () => releaseWakeLock();
  }, [autoSpeak, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (wakeLockSupported && autoSpeak && document.visibilityState === 'visible') {
        setTimeout(() => { requestWakeLock(); }, 1000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => { document.removeEventListener('visibilitychange', handleVisibilityChange); };
  }, [autoSpeak, requestWakeLock, wakeLockSupported]);

  const activeWords = useCallback((ps = packsRef.current) =>
    ps.filter(p => p.enabled).flatMap(p => p.words), []);

  const persist = useCallback((ps, s) => { saveData({ packs: ps, scores: s }); }, []);

  /* ── Initial load (async: yields to browser so loading screen paints first) ── */
  useEffect(() => {
    const timer = setTimeout(() => {
      const { packs: p, scores: s, isNew } = loadData();
      setPacks(p); setScores(s);
      packsRef.current = p; scoresRef.current = s;
      if (isNew) { setLangModalClosable(false); setLangModal(true); }
      else {
        const words = activeWords(p);
        if (!words.length) goToManage(p);
        else setCardIdx(pickCard(words, s, null));
      }
      setIsLoading(false);
    }, 0);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Language selection ── */
  const handleLangSelect = async (lang) => {
    i18n.changeLanguage(lang);
    window.gtag?.("event", "select_language", { language: lang });
    const customPacks = packsRef.current.filter(p => !p.id.startsWith("pack-default-"));
    const imported = await importDefaultPacks(lang);
    const merged = [...imported, ...customPacks];
    setPacks(merged); packsRef.current = merged;
    const words = activeWords(merged);
    setCardIdx(words.length ? pickCard(words, scoresRef.current, null) : null);
    setFlipped(false); didFlipRef.current = false; lastIdxRef.current = null;
    persist(merged, scoresRef.current);
    setLangModal(false);
    if (words.length) setScreen("study"); else goToManage(merged);
  };

  /* ── Next card with scoring ── */
  const nextCard = useCallback(() => {
    const words = activeWords(packsRef.current);
    const s = { ...scoresRef.current };
    const currentWord = words[lastIdxRef.current];
    if (currentWord) {
      const key = currentWord.korean;
      const oldScore = s[key] ?? SCORE.defaultScore;
      if (autoSpeakRef.current) s[key] = Math.min(SCORE.max, oldScore + SCORE.autoSpeakBonus);
      else if (didFlipRef.current) s[key] = Math.max(SCORE.min, oldScore - SCORE.flipPenalty);
      else s[key] = Math.min(SCORE.max, oldScore + SCORE.skipBonus);
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
        window.gtag?.("event", "card_flip", { mode: modeRef.current === "eng" ? "toKorean" : "fromKorean" });
      }
      if (["ArrowRight", "Enter"].includes(e.code)) { e.preventDefault(); nextCard(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nextCard]);

  /* ── Auto-speak: stop when leaving study screen ── */
  useEffect(() => {
    if (screen !== "study") {
      autoSpeakRef.current = false; setAutoSpeak(false);
      window.speechSynthesis?.cancel();
    }
  }, [screen]);

  /* ── Auto-speak loop ── */
  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
    if (!autoSpeak || cardIdx === null) {
      if (!autoSpeak) window.speechSynthesis?.cancel();
      return;
    }
    const words = activeWords(packsRef.current);
    const currentCard = words[cardIdx];
    if (!currentCard) return;

    const isEngMode = modeRef.current === "eng";
    const transLang = LANG_MAP[i18n.language]?.ttsLang ?? "en-US";
    const frontText = isEngMode ? currentCard.english : currentCard.korean;
    const backText  = isEngMode ? currentCard.korean  : currentCard.english;
    const frontLang = isEngMode ? transLang      : KOREAN_TTS_LANG;
    const backLang  = isEngMode ? KOREAN_TTS_LANG : transLang;

    let cancelled = false;
    const timers = [];
    const delay = (ms) => new Promise(r => { const id = setTimeout(r, ms); timers.push(id); });
    const speak = (text, lang) => new Promise(resolve => {
      if (!window.speechSynthesis || cancelled) { resolve(); return; }
      window.speechSynthesis.cancel();
      const vs  = voiceSettingsRef.current;
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang  = lang;
      utt.rate  = vs.langs?.[lang]?.rate  ?? AUTO_SPEAK.rate;
      utt.pitch = vs.langs?.[lang]?.pitch ?? AUTO_SPEAK.pitch;
      const uri = vs.langs?.[lang]?.voiceURI;
      if (uri) { const v = window.speechSynthesis.getVoices().find(gv => gv.voiceURI === uri); if (v) utt.voice = v; }
      utt.onend = resolve; utt.onerror = resolve;
      window.speechSynthesis.speak(utt);
    });

    const run = async () => {
      setFlipped(false);
      const flipSpeed = voiceSettingsRef.current?.flipSpeed ?? 1.0;
      await delay(AUTO_SPEAK.startDelay     / flipSpeed);  if (cancelled) return;
      await speak(frontText, frontLang);                   if (cancelled) return;
      await delay(AUTO_SPEAK.postFrontDelay / flipSpeed);  if (cancelled) return;
      setFlipped(true); didFlipRef.current = true;
      await delay(AUTO_SPEAK.preBackDelay   / flipSpeed);  if (cancelled) return;
      await speak(backText, backLang);                     if (cancelled) return;
      await delay(AUTO_SPEAK.postBackDelay  / flipSpeed);  if (cancelled) return;
      nextCard();
    };

    run();
    return () => { cancelled = true; window.speechSynthesis?.cancel(); timers.forEach(clearTimeout); };
  }, [autoSpeak, cardIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Navigate to manage screen ── */
  const goToManage = useCallback((ps = packsRef.current) => {
    const byCategory = {};
    ps.forEach(p => {
      const cat = p.category || p.pack_category || "Uncategorized";
      byCategory[cat] = false;
    });
    setExpandedCats(byCategory);
    setScreen("manage");
  }, []);

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
    if (!allEnabled) { setExpandedCats(prev => ({ ...prev, [cat]: true })); }
  };

  const deleteCategory = (cat) => {
    if (!confirm(tr('manage.deleteCategoryConfirm', { cat }))) return;
    const np = packs.filter(p => (p.category || p.pack_category || "Uncategorized") !== cat);
    setPacks(np);
    setCardIdx(activeWords(np).length ? pickCard(activeWords(np), scores, null) : null);
    setFlipped(false); didFlipRef.current = false;
    lastIdxRef.current = null; persist(np, scores);
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
    if (!confirm(tr('settings.deleteUserDataConfirm'))) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LANG_KEY);
    window.location.reload();
  };

  const editPack = packs.find(p => p.id === editingPackId);

  const handleEditPack = (id) => {
    setEditingPackId(id);
    setWordInput({ korean: "", english: "" });
    setEditWordIdx(null);
    setAddWordMsg("");
  };

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
    const prompt = `Convert the following {learning_language} study material into a CSV with exactly 4 columns: pack_category, pack_name, {learning_language}, translation.

Rules:
- Use the lesson/topic title as pack_name (same value for all words in the same lesson). Shorten the pack_name — keep the same language as the original title. Use shortcodes for common things that don't need to be fully spelled out (e.g. "Bài 1" instead of "Bài học số 1", "Ch2" instead of "Chapter 2", "L3" instead of "Lesson 3").
- Use the course/book/overall group as pack_category (same value for all packs in the same group)
- {learning_language} = the {learning_language} word or phrase
- translation = the translation of the word, if translation exists in the data, use it exactly, if not, translate it into English (keep it concise)
- If a value contains a comma, wrap it in double quotes
- Output ONLY the raw CSV. No explanation, no markdown fences, no extra text.

Naming rules:
- If pack_category or pack_name is long, shorten it to only the essential part. pack_category and pack_name should be created in English (follow context) if not explicitly provided in the original data.
- Put the exact data in the exact column. MUST ALWAYS maintain the column count of every row consistently as the header. If a value is missing, leave it empty but keep the commas.
- If a value contains a comma, wrap it in double quotes
- ULTIMATELY MAINTAIN THE STRUCTURE FOLLOWING THE HEADER SO THE CSV COULD BE PARSED WITHOUT ISSUES. The output MUST be a valid CSV that can be parsed into the 4 columns mentioned above.

Material:
${promptInput.trim()}`;
    const finalPrompt = prompt.replace(/{learning_language}/g, learningLanguage);
    navigator.clipboard.writeText(finalPrompt).then(() => {
      setPromptModal(false);
      try { window.alert(tr('llmPrompt.copiedMsg')); } catch (e) { /* ignore */ }
    }).catch(() => {
      setPromptModal(false);
      try { window.alert(tr('llmPrompt.copiedMsg')); } catch (e) { /* ignore */ }
    });
  };

  /* ── Derived values ── */
  const allWords = useMemo(() => activeWords(packs), [packs, activeWords]);
  const card = allWords[cardIdx];
  const front = card ? (mode === "eng" ? card.english : card.korean) : "";
  const back  = card ? (mode === "eng" ? card.korean  : card.english) : "";
  const enabledCount = packs.filter(p => p.enabled).length;
  const avgScore = allWords.length ? Math.round(allWords.reduce((a, w) => a + (scores[w.korean] ?? SCORE.defaultScore), 0) / allWords.length) : 0;
  const cardScore = card ? (scores[card.korean] ?? SCORE.defaultScore) : 0;

  /* ── Voice lang pairs for the settings modal ── */
  const transEntry    = LANG_MAP[i18n.language];
  const transSide     = { label: transEntry?.label ?? i18n.language, ttsLang: transEntry?.ttsLang ?? "en-US", sample: transEntry?.ttsSample ?? "Hello." };
  const koSide        = { label: "한국어", ttsLang: KOREAN_TTS_LANG, sample: KOREAN_TTS_SAMPLE };
  const voiceLangPairs = mode === "eng" ? [transSide, koSide] : [koSide, transSide];

  /* ── Suspense fallback ── */
  const pageFallback = <div className="loading-screen"><p className="text-secondary">{tr('loading')}</p></div>;

  /* ════════════════════════  RENDER  ════════════════════════ */
  return (
    <div className="app" data-theme={dark ? "dark" : "light"}>
      {isLoading && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "all", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}>
          <p className="text-secondary">{tr('loading')}</p>
        </div>
      )}
      {pwaReady && <pwa-install
        id="pwa-install"
        manifest-url="/manifest.webmanifest"
        install-description={tr('pwa.installDescription')}
        use-local-storage
      ></pwa-install>}

      {/* ── Header ── */}
      <Header screen={screen} onSetScreen={setScreen} onGoToManage={() => goToManage()} />

      {/* ── Content area ── */}
      <main className="app-content">
        {/* ── STUDY (eagerly loaded – default screen / LCP) ── */}
        {screen === "study" && (
          <StudyScreen
            allWords={allWords} card={card} front={front} back={back}
            mode={mode} flipped={flipped} enabledCount={enabledCount}
            avgScore={avgScore} cardScore={cardScore} autoSpeak={autoSpeak}
            onSetMode={(v) => { setMode(v); setFlipped(false); }}
            onFlip={() => { setFlipped(f => !f); didFlipRef.current = true; window.gtag?.("event", "card_flip", { mode: mode === "eng" ? "toKorean" : "fromKorean" }); }}
            onNext={nextCard}
            onSpeakerTap={handleSpeakerTap}
          />
        )}

        <Suspense fallback={pageFallback}>

          {/* ── ABOUT ── */}
          {screen === "about" && (
            <AboutScreen
              onOpenSettings={() => setSettingsModal(true)}
            />
          )}

          {/* ── QUIZ ── */}
          {screen === "quiz" && (
            <QuizScreen
              allWords={allWords}
              scores={scores}
              enabledCount={enabledCount}
              onGoToManage={() => goToManage()}
              onScoreUpdate={(key, newScore) => {
                const s = { ...scores, [key]: newScore };
                setScores(s); scoresRef.current = s;
                persist(packs, s);
              }}
            />
          )}

          {/* ── MANAGE ── */}
          {screen === "manage" && (
            <ManageScreen
              packs={packs} scores={scores} allWords={allWords}
              enabledCount={enabledCount} expandedCats={expandedCats}
              onTogglePack={togglePack} onToggleCategory={toggleCategory}
              onDeleteCategory={deleteCategory} onDeletePack={deletePack}
              onSetExpandedCats={setExpandedCats}
              onEditPack={handleEditPack}
              onOpenImport={() => { setImportModal(true); setImportMsg(""); setImportText(""); }}
            />
          )}

        </Suspense>
      </main>

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
            <button className="btn btn-ghost btn-llm" onClick={() => { setPromptModal(true); setPromptInput(""); }}>
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
            <div style={{ marginBottom: 8 }}>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>{tr('llmPrompt.learningLanguage')}</div>
              <input value={learningLanguage} onChange={e => setLearningLanguage(e.target.value)} className="input" />
            </div>
            <div style={{ marginBottom: 6, fontWeight: 600 }}>{tr('llmPrompt.learningMaterial')}</div>
            <textarea value={promptInput} onChange={e => setPromptInput(e.target.value)}
              placeholder={tr('llmPrompt.placeholder')}
              className="textarea" style={{ minHeight: 220, lineHeight: 1.6 }} />
          </div>
          <div className="prompt-actions">
            <button className="btn btn-primary" style={{ opacity: promptInput.trim() ? 1 : 0.5 }}
              disabled={!promptInput.trim()} onClick={generatePrompt}>
              {tr('llmPrompt.generateCopy')}
            </button>
            <button className="btn btn-ghost" onClick={() => setPromptModal(false)}>{tr('llmPrompt.close')}</button>
          </div>
        </Modal>
      )}

      {/* ── VOICE SETTINGS MODAL ── */}
      {voiceModal && (
        <VoiceSettingsModal
          settings={voiceSettings}
          langPairs={voiceLangPairs}
          onClose={() => setVoiceModal(false)}
          onStart={() => setAutoSpeak(true)}
          onSaveSettings={saveVoiceSettings}
        />
      )}

      {/* ── Settings Modal ── */}
      {settingsModal && (
        <SettingsModal
          dark={dark}
          onToggleDark={() => setDark(d => !d)}
          onChangeLang={() => { setSettingsModal(false); setLangModalClosable(true); setLangModal(true); }}
          onDeleteUserData={deleteUserData}
          onClose={() => setSettingsModal(false)}
        />
      )}

      {/* ── Language Selection Modal ── */}
      {langModal && <LangSelectModal onSelect={handleLangSelect} onClose={langModalClosable ? () => { setLangModal(false); setSettingsModal(true); } : null} />}

      {/* ── Bottom Nav (portrait mode) ── */}
      <BottomNav screen={screen} onSetScreen={setScreen} onGoToManage={() => goToManage()} />
    </div>
  );
}
