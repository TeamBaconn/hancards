import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { SCORE, scoreColor, CARD_FONT_STEPS, QUIZ_DELAY } from "./config";

/* ── Answer generation helpers ── */

function pickDistractors(correctWord, allWords, field, count = 3) {
  const correctText = correctWord[field];
  const correctLen = correctText.length;
  const candidates = allWords.filter(
    (w) => w.korean !== correctWord.korean && w[field] && w[field] !== correctText
  );
  if (candidates.length === 0) return [];

  // Weight by similarity in character length
  const weighted = candidates.map((w) => {
    const len = w[field].length;
    const diff = Math.abs(len - correctLen);
    const weight = 1 / (1 + diff * 0.5);
    return { word: w, weight };
  });

  const picked = [];
  const usedKorean = new Set([correctWord.korean]);

  for (let i = 0; i < count && weighted.length > 0; i++) {
    const available = weighted.filter((w) => !usedKorean.has(w.word.korean));
    if (available.length === 0) break;

    const total = available.reduce((sum, w) => sum + w.weight, 0);
    let r = Math.random() * total;
    let selected = available[0];
    for (const entry of available) {
      r -= entry.weight;
      if (r <= 0) {
        selected = entry;
        break;
      }
    }
    picked.push(selected.word);
    usedKorean.add(selected.word.korean);
  }

  return picked;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


/* ── Font sizing — same as FlipCard ── */
function getCardFontSize(text) {
  const len = (text || "").length;
  for (const step of CARD_FONT_STEPS) {
    if (len <= step.maxLen) return step.size;
  }
  return CARD_FONT_STEPS[CARD_FONT_STEPS.length - 1].size;
}

/* ════════════════════════════════════════════════════════════
   Quiz Component
   ════════════════════════════════════════════════════════════ */

export default function Quiz({ allWords, scores, enabledCount, onScoreUpdate }) {
  const { t: tr } = useTranslation();

  const [quizMode, setQuizMode] = useState("mixed");
  const [currentWord, setCurrentWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [correctIdx, setCorrectIdx] = useState(null);
  const [answered, setAnswered] = useState(false);
  const lastWordRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const promptTextRef = useRef(null);
  const promptCardRef = useRef(null);
  const [promptFontSize, setPromptFontSize] = useState("2.4rem");

  /* Auto-shrink prompt text: never split mid-word, max 2 lines */
  const recalcPromptFont = useCallback((text) => {
    const el = promptTextRef.current;
    if (!el) return;
    const initial = getCardFontSize(text);
    let size = parseFloat(initial);
    const unit = initial.replace(/[\d.]/g, "");
    const minSize = 0.7;

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
    setPromptFontSize(size + unit);
  }, []);

  /* Determine prompt/answer fields based on mode */
  const getFields = useCallback(() => {
    if (quizMode === "toKorean") return { prompt: "english", answer: "korean" };
    if (quizMode === "fromKorean") return { prompt: "korean", answer: "english" };
    return Math.random() < 0.5
      ? { prompt: "english", answer: "korean" }
      : { prompt: "korean", answer: "english" };
  }, [quizMode]);

  /* Generate a new question */
  const generateQuestion = useCallback(() => {
    if (!allWords || allWords.length < 2) return;
    clearTimeout(advanceTimerRef.current);

    const fields = getFields();
    let wordIdx;
    let attempts = 0;
    do {
      wordIdx = Math.floor(Math.random() * allWords.length);
      attempts++;
    } while (
      allWords.length > 1 &&
      allWords[wordIdx].korean === lastWordRef.current &&
      attempts < 20
    );

    const word = allWords[wordIdx];
    lastWordRef.current = word.korean;

    const distractors = pickDistractors(word, allWords, fields.answer, 3);
    const answerOptions = [
      { text: word[fields.answer], correct: true, korean: word.korean },
      ...distractors.map((d) => ({
        text: d[fields.answer],
        correct: false,
        korean: d.korean,
      })),
    ];

    const shuffled = shuffleArray(answerOptions);
    const correctIndex = shuffled.findIndex((o) => o.correct);

    setCurrentWord({ ...word, promptField: fields.prompt, answerField: fields.answer });
    setOptions(shuffled);
    setCorrectIdx(correctIndex);
    setSelectedIdx(null);
    setAnswered(false);
  }, [allWords, getFields]);

  /* Cleanup timer on unmount */
  useEffect(() => {
    return () => clearTimeout(advanceTimerRef.current);
  }, []);

  /* Recalc prompt font when currentWord changes */
  useEffect(() => {
    if (currentWord) {
      recalcPromptFont(currentWord[currentWord.promptField]);
    }
  }, [currentWord, recalcPromptFont]);

  /* Re-calc font size on card resize */
  useEffect(() => {
    const el = promptCardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (currentWord) recalcPromptFont(currentWord[currentWord.promptField]);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentWord, recalcPromptFont]);

  /* Generate first question on mount or when mode/words change */
  useEffect(() => {
    generateQuestion();
  }, [quizMode, allWords]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Handle answer selection */
  const handleAnswer = (idx) => {
    // If already answered, fast-forward to next question
    if (answered) {
      clearTimeout(advanceTimerRef.current);
      generateQuestion();
      return;
    }

    setSelectedIdx(idx);
    setAnswered(true);

    const isCorrect = options[idx].correct;
    const key = currentWord.korean;
    const oldScore = scores[key] ?? SCORE.defaultScore;


    let newScore;
    if (isCorrect) {
      newScore = Math.min(SCORE.max, oldScore + SCORE.quizBonus);
    } else {
      newScore = Math.max(SCORE.min, oldScore - SCORE.quizPenalty);
    }

    onScoreUpdate(key, newScore);

    // Auto-advance after delay
    const delay = isCorrect ? QUIZ_DELAY.correct : QUIZ_DELAY.wrong;
    advanceTimerRef.current = setTimeout(() => {
      generateQuestion();
    }, delay);
  };

  /* Option class based on state */
  const getOptionClass = (idx) => {
    const base = "quiz-option";
    if (!answered) return base;
    if (idx === correctIdx) return `${base} quiz-option--correct`;
    if (idx === selectedIdx && idx !== correctIdx)
      return `${base} quiz-option--wrong quiz-option--shake`;
    return `${base} quiz-option--dimmed`;
  };

  if (!allWords || allWords.length < 2) {
    return (
      <div className="quiz-screen">
        <div className="empty-state">
          <div className="empty-state-icon">🧠</div>
          <p>{tr("quiz.noWords")}</p>
        </div>
      </div>
    );
  }

  if (!currentWord) return null;

  const promptText = currentWord[currentWord.promptField];
  const cardScore = scores[currentWord.korean] ?? SCORE.defaultScore;
  const avgScore = allWords.length ? Math.round(allWords.reduce((a, w) => a + (scores[w.korean] ?? SCORE.defaultScore), 0) / allWords.length) : 0;

  return (
    <div className="quiz-screen">
      {/* Mode selector */}
      <div className="mode-toggle">
        <div className="mode-toggle-group">
          {[
            ["mixed", tr("quiz.mixed")],
            ["toKorean", tr("quiz.toKorean")],
            ["fromKorean", tr("quiz.fromKorean")],
          ].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setQuizMode(v)}
              className={`mode-toggle-btn ${quizMode === v ? "mode-toggle-btn--active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt card */}
      <div ref={promptCardRef} className="quiz-prompt-card">
        <div className="quiz-prompt-label">{tr("quiz.question")}</div>
        <div ref={promptTextRef} className="quiz-prompt-text" style={{ fontSize: promptFontSize }}>{promptText}</div>
      </div>


      {/* Answer options */}
      <div className="quiz-options">
        {options.map((opt, idx) => {
          // Find the full word object for translation
          let translation = null;
          if (answered) {
            // Only show translation for correct or selected (if wrong)
            if (idx === correctIdx || (idx === selectedIdx && idx !== correctIdx)) {
              // Find the word in allWords by korean key
              const wordObj = allWords.find(w => w.korean === opt.korean);
              if (wordObj) {
                // If the answer is in Korean, show English as translation; if answer is in English, show Korean
                if (opt.text === wordObj.korean) {
                  translation = wordObj.english;
                } else if (opt.text === wordObj.english) {
                  translation = wordObj.korean;
                }
              }
            }
          }
          return (
            <button
              key={idx}
              className={getOptionClass(idx)}
              onClick={() => handleAnswer(idx)}
            >
              <span className="quiz-option-letter">
                {String.fromCharCode(65 + idx)}
              </span>
              <span className="quiz-option-text">{opt.text}</span>
              {translation && (
                <span className="quiz-option-translation">{translation}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Stats bar */}
      <div className="quiz-stats">
        <span>{allWords.length} {tr("study.words")} · {enabledCount} {enabledCount !== 1 ? tr("study.packs") : tr("study.pack")}</span>
        <span>{tr("study.avgScore")}: <strong style={{ color: scoreColor(avgScore) }}>{avgScore}%</strong></span>
        <span>
          {tr("study.cardScore")}:{" "}
          <strong style={{ color: scoreColor(cardScore) }}>{cardScore}%</strong>
        </span>
      </div>
    </div>
  );
}
