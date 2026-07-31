"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Filter,
  LoaderCircle,
  Minus,
  RotateCcw,
  Target,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/client/api";
import { cn, formatDuration, formatScore } from "@/lib/utils";
import styles from "./result-view.module.css";

type ResultFilter = "all" | "correct" | "wrong" | "omitted";
type ResultQuestion = {
  id: string;
  position: number;
  ministerialId: string;
  subject: string;
  text: string;
  options: Array<{ id: string; text: string }>;
  selectedOptionId: string | null;
  skipped: boolean;
  correctOptionId: string;
  result: "correct" | "wrong" | "omitted";
};

type ResultPayload = {
  id: string;
  module: string;
  examType: "initial" | "update";
  status: "completed" | "expired";
  score: number;
  threshold: number;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  omittedCount: number;
  activeSeconds: number;
  pausedSeconds: number;
  questions: ResultQuestion[];
};

const moduleLabels: Record<string, string> = {
  general: "Modulo generale",
  cat145: "Categorie 1 · 4 · 5",
  cat8: "Categoria 8",
  cat9: "Categoria 9",
  cat10: "Categoria 10",
};

export function ResultView({ attemptId }: { attemptId: string }) {
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ResultPayload | { attempt: ResultPayload }>(
      `/api/attempts/${attemptId}`,
    )
      .then((payload) => setResult("attempt" in payload ? payload.attempt : payload))
      .catch((caught) =>
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Risultato non disponibile.",
        ),
      );
  }, [attemptId]);

  const visibleQuestions = useMemo(
    () =>
      result?.questions.filter(
        (question) => filter === "all" || question.result === filter,
      ) ?? [],
    [filter, result],
  );

  if (!result) {
    return (
      <div className={cn("page-shell", styles.loading)}>
        {error ? (
          <>
            <XCircle size={28} aria-hidden />
            <p>{error}</p>
            <Link
              href="/storico"
              className="rt-button rt-button--secondary rt-button--md"
            >
              Apri lo storico
            </Link>
          </>
        ) : (
          <>
            <LoaderCircle size={28} aria-hidden />
            <span>Calcolo il risultato…</span>
          </>
        )}
      </div>
    );
  }

  const delta = result.score - result.threshold;

  return (
    <div className={cn("page-shell", styles.page)}>
      <Link href="/dashboard" className={styles.back}>
        <ArrowLeft size={16} aria-hidden /> Dashboard
      </Link>

      <section
        className={styles.hero}
        data-passed={result.passed}
        aria-labelledby="result-title"
      >
        <div className={styles.heroCopy}>
          <div className={styles.resultBadges}>
            <Badge tone={result.passed ? "lime" : "clay"}>
              {result.passed ? "Prova superata" : "Prova non superata"}
            </Badge>
            {result.status === "expired" ? (
              <Badge tone="clay">
                <Clock3 size={13} aria-hidden />
                Tempo terminato
              </Badge>
            ) : null}
          </div>
          <h1 id="result-title" className="font-editorial">
            {result.passed ? (
              <>
                Obiettivo <em>raggiunto.</em>
              </>
            ) : (
              <>
                Un dato da cui <em>ripartire.</em>
              </>
            )}
          </h1>
          <p>
            {moduleLabels[result.module] ?? result.module} ·{" "}
            {result.examType === "update"
              ? "Verifica di aggiornamento"
              : "Verifica iniziale"}
          </p>
        </div>
        <div className={styles.score}>
          <span>Punteggio finale</span>
          <strong className="font-editorial">{formatScore(result.score)}</strong>
          <small>
            soglia {formatScore(result.threshold)} ·{" "}
            {delta >= 0 ? "+" : ""}
            {formatScore(delta)}
          </small>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Dettagli risultato">
        <ResultMetric
          icon={CheckCircle2}
          value={result.correctCount}
          label="Corrette"
          tone="correct"
        />
        <ResultMetric
          icon={XCircle}
          value={result.wrongCount}
          label="Errate"
          tone="wrong"
        />
        <ResultMetric
          icon={Minus}
          value={result.omittedCount}
          label="Omesse"
          tone="omitted"
        />
        <ResultMetric
          icon={Clock3}
          value={formatDuration(result.activeSeconds)}
          label="Tempo attivo"
        />
        <ResultMetric
          icon={RotateCcw}
          value={formatDuration(result.pausedSeconds)}
          label="In pausa"
        />
      </section>

      {result.wrongCount > 0 ? (
        <div className={styles.actions}>
          <Link
            href="/ripasso"
            className="rt-button rt-button--secondary rt-button--md"
          >
            Ripassa gli errori <Target size={17} aria-hidden />
          </Link>
        </div>
      ) : null}

      <section className={styles.review} aria-labelledby="review-title">
        <div className={styles.reviewHeader}>
          <div>
            <span className="eyebrow">Correzione completa</span>
            <h2 id="review-title" className="font-editorial">
              Domanda per domanda
            </h2>
            <p>
              Confronta la tua scelta con la risposta ufficiale. I testi restano
              quelli della banca usata nella prova.
            </p>
          </div>
          <div className={styles.filters}>
            <Filter size={15} aria-hidden />
            {(
              [
                ["all", "Tutte", 40],
                ["correct", "Corrette", result.correctCount],
                ["wrong", "Errate", result.wrongCount],
                ["omitted", "Omesse", result.omittedCount],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? styles.filterActive : undefined}
                onClick={() => setFilter(value)}
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.questionList}>
          {visibleQuestions.map((question) => {
            const open = openId === question.id;
            const selected = question.options.find(
              (option) => option.id === question.selectedOptionId,
            );
            const correct = question.options.find(
              (option) => option.id === question.correctOptionId,
            );
            const skippedOutcome =
              question.skipped && question.selectedOptionId
                ? question.selectedOptionId === question.correctOptionId
                  ? "correct"
                  : "wrong"
                : undefined;
            return (
              <Card
                key={question.id}
                className={styles.questionCard}
                data-result={question.result}
                data-skipped-outcome={skippedOutcome}
                data-open={open}
              >
                <button
                  type="button"
                  className={styles.questionSummary}
                  onClick={() => setOpenId(open ? null : question.id)}
                  aria-expanded={open}
                >
                  <span className={styles.resultIcon}>
                    {question.result === "correct" ? (
                      <Check size={18} aria-hidden />
                    ) : question.result === "wrong" ? (
                      <X size={18} aria-hidden />
                    ) : (
                      <Minus size={18} aria-hidden />
                    )}
                  </span>
                  <span className={styles.questionNumber}>
                    <small>Domanda</small>
                    <strong>{question.position}</strong>
                  </span>
                  <span className={styles.questionText}>
                    <strong>{question.text}</strong>
                    <small>
                      {question.ministerialId} · {question.subject}
                      {skippedOutcome
                        ? ` · Omessa, scelta ${skippedOutcome === "correct" ? "corretta" : "errata"}`
                        : ""}
                    </small>
                  </span>
                  <ArrowRight
                    size={18}
                    className={open ? styles.arrowOpen : undefined}
                    aria-hidden
                  />
                </button>

                {open ? (
                  <div className={styles.questionDetail}>
                    <div
                      data-kind={
                        skippedOutcome
                          ? `skipped-${skippedOutcome}`
                          : "user"
                      }
                    >
                      <span>
                        {question.skipped
                          ? "La tua scelta (risposta omessa)"
                          : "La tua risposta"}
                      </span>
                      <p>{selected?.text ?? "Nessuna risposta"}</p>
                    </div>
                    <div data-kind="correct">
                      <span>Risposta corretta</span>
                      <p>{correct?.text}</p>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ResultMetric({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof CheckCircle2;
  value: string | number;
  label: string;
  tone?: string;
}) {
  return (
    <Card className={styles.metric} data-tone={tone}>
      <Icon size={18} aria-hidden />
      <strong className="font-editorial">{value}</strong>
      <span>{label}</span>
    </Card>
  );
}
