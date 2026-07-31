"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Target,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CustomSelect } from "@/components/ui/custom-select";
import { api, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import styles from "./review-feed.module.css";

type ReviewOption = { id: string; text: string };
type ReviewQuestion = {
  id: string;
  ministerialId: string;
  module: string;
  subject: string;
  text: string;
  options: ReviewOption[];
  wrongCount: number;
  seenCount: number;
};
type ReviewMetrics = {
  available: number;
  reviewed: number;
  correct: number;
};
type ReviewPayload = {
  items: ReviewQuestion[];
  metrics?: ReviewMetrics;
};
type Feedback = {
  correct: boolean;
  correctOptionId: string;
};

const moduleLabels: Record<string, string> = {
  all: "Tutti i moduli",
  general: "Modulo generale",
  cat145: "Categorie 1 · 4 · 5",
  cat8: "Categoria 8",
  cat9: "Categoria 9",
  cat10: "Categoria 10",
};

export function ReviewFeed() {
  const [module, setModule] = useState("all");
  const [queue, setQueue] = useState<ReviewQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [metrics, setMetrics] = useState<ReviewMetrics>({
    available: 0,
    reviewed: 0,
    correct: 0,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextModule: string) => {
    setLoading(true);
    setError("");
    setIndex(0);
    setSelected(null);
    setFeedback(null);
    try {
      const payload = await api<ReviewPayload | ReviewQuestion[]>(
        `/api/review?module=${encodeURIComponent(nextModule)}`,
      );
      const items = Array.isArray(payload) ? payload : payload.items;
      setQueue(items);
      setMetrics(
        Array.isArray(payload)
          ? { available: items.length, reviewed: 0, correct: 0 }
          : (payload.metrics ?? {
              available: items.length,
              reviewed: 0,
              correct: 0,
            }),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Non è stato possibile preparare il ripasso.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(module), 0);
    return () => window.clearTimeout(timer);
  }, [load, module]);

  const question = queue[index];

  async function answer() {
    if (!question || !selected || feedback) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await api<Feedback>("/api/review", {
        method: "POST",
        body: JSON.stringify({
          questionId: question.id,
          optionId: selected,
        }),
      });
      setFeedback(response);
      setMetrics((value) => ({
        ...value,
        reviewed: value.reviewed + 1,
        correct: value.correct + (response.correct ? 1 : 0),
      }));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Risposta non salvata. Riprova.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setSelected(null);
    setFeedback(null);
    setIndex((value) => value + 1);
  }

  return (
    <div className={cn("page-shell", styles.page)}>
      <header className={styles.header}>
        <div>
          <span className="eyebrow">Ripasso guidato</span>
          <h1 className="font-editorial">
            Parti dagli errori, <em>non da zero.</em>
          </h1>
        </div>
      </header>

      <section className={styles.metricStrip} aria-label="Metriche ripasso">
        <div className={styles.filterMetric}>
          <CustomSelect
            className={styles.moduleSelect}
            variant="floating"
            label="Filtra modulo"
            value={module}
            onValueChange={setModule}
            options={Object.entries(moduleLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </div>
        <div>
          <Target size={18} aria-hidden />
          <span>Da ripassare</span>
          <strong className="font-editorial">{metrics.available}</strong>
        </div>
        <div>
          <BookOpenCheck size={18} aria-hidden />
          <span>Riviste ora</span>
          <strong className="font-editorial">{metrics.reviewed}</strong>
        </div>
        <div>
          <CheckCircle2 size={18} aria-hidden />
          <span>Corrette ora</span>
          <strong className="font-editorial">{metrics.correct}</strong>
        </div>
      </section>

      {error ? (
        <div className={styles.error} role="alert">
          <XCircle size={17} aria-hidden />
          {error}
          <button type="button" onClick={() => setError("")} aria-label="Chiudi">
            <X size={15} />
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className={styles.loading}>
          <LoaderCircle size={28} aria-hidden />
          <span>Ordino gli errori più utili…</span>
        </div>
      ) : !question ? (
        <Card className={styles.finished}>
          <span className={styles.finishedIcon}>
            <Sparkles size={28} aria-hidden />
          </span>
          <Badge tone="lime">
            {queue.length ? "Sessione completata" : "Nessun errore disponibile"}
          </Badge>
          <h2 className="font-editorial">
            {queue.length
              ? "Hai rivisto tutto il gruppo."
              : "Qui non c’è ancora nulla da ripassare."}
          </h2>
          <p>
            {queue.length
              ? "Puoi cambiare modulo o ricominciare il ciclo quando vuoi."
              : "Concludi almeno una simulazione con una risposta errata: RT Lab costruirà da lì il tuo percorso."}
          </p>
          {queue.length ? (
            <Button variant="secondary" onClick={() => load(module)}>
              <RotateCcw size={17} aria-hidden /> Ricomincia il ciclo
            </Button>
          ) : null}
        </Card>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.context}>
            <Badge tone="lime">
              {index + 1} di {queue.length}
            </Badge>
            <h2 className="font-editorial">
              {moduleLabels[question.module] ?? question.module}
            </h2>
            <p>{question.subject}</p>
            <dl>
              <div>
                <dt>Errori negli esami</dt>
                <dd>{question.wrongCount}</dd>
              </div>
              <div>
                <dt>Volte incontrata</dt>
                <dd>{question.seenCount}</dd>
              </div>
              <div>
                <dt>Accuratezza</dt>
                <dd>
                  {Math.round(
                    ((question.seenCount - question.wrongCount) /
                      question.seenCount) *
                      100,
                  )}
                  %
                </dd>
              </div>
            </dl>
            <div className={styles.queueProgress}>
              <span style={{ width: `${(index / queue.length) * 100}%` }} />
            </div>
          </aside>

          <Card className={styles.question}>
            <div className={styles.questionMeta}>
              <span>Domanda da ripassare</span>
              <code>{question.ministerialId}</code>
            </div>
            <h2 className="font-editorial">{question.text}</h2>
            <div className={styles.options} role="radiogroup">
              {question.options.map((option, optionIndex) => {
                const chosen = selected === option.id;
                const isCorrect = feedback?.correctOptionId === option.id;
                const isWrongChoice = Boolean(
                  feedback && chosen && !feedback.correct,
                );
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={cn(
                      styles.option,
                      chosen && !feedback && styles.optionSelected,
                      isCorrect && styles.optionCorrect,
                      isWrongChoice && styles.optionWrong,
                    )}
                    onClick={() => !feedback && setSelected(option.id)}
                    role="radio"
                    aria-checked={chosen}
                    disabled={Boolean(feedback)}
                  >
                    <span>{String.fromCharCode(65 + optionIndex)}</span>
                    <strong>{option.text}</strong>
                    {isCorrect ? (
                      <Check size={18} aria-hidden />
                    ) : isWrongChoice ? (
                      <X size={18} aria-hidden />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {feedback?.correct ? (
              <div
                className={styles.feedback}
                data-correct="true"
                role="status"
              >
                <CheckCircle2 size={21} aria-hidden />
                <div>
                  <strong>Risposta corretta.</strong>
                </div>
              </div>
            ) : null}

            <div className={styles.actions}>
              {!feedback ? (
                <Button
                  onClick={answer}
                  loading={submitting}
                  disabled={!selected}
                >
                  Verifica risposta <Check size={17} aria-hidden />
                </Button>
              ) : (
                <Button onClick={next}>
                  Prossima domanda <ArrowRight size={17} aria-hidden />
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
