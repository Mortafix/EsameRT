"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Cloud,
  CloudOff,
  Flag,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client/api";
import { cn, formatDuration } from "@/lib/utils";
import styles from "./quiz-runner.module.css";

type QuizOption = { id: string; text: string };
type QuizQuestion = {
  id: string;
  ministerialId: string;
  position: number;
  subject: string;
  text: string;
  options: QuizOption[];
  selectedOptionId: string | null;
  visited: boolean;
  skipped: boolean;
};

type AttemptPayload = {
  id: string;
  status: "active" | "paused" | "completed" | "expired";
  module: string;
  examType: "initial" | "update";
  threshold: number;
  revision: number;
  remainingSeconds: number;
  questions: QuizQuestion[];
};

type SyncState = "idle" | "saving" | "offline" | "saved";

type PendingAnswer = {
  questionId: string;
  optionId: string | null;
  visited: boolean;
  skipped: boolean;
  timeSpentMs: number;
  operationId: string;
};

const moduleLabels: Record<string, string> = {
  general: "Modulo generale",
  cat145: "Categorie 1 · 4 · 5",
  cat8: "Categoria 8",
  cat9: "Categoria 9",
  cat10: "Categoria 10",
};

function normalizeAttempt(payload: AttemptPayload | { attempt: AttemptPayload }) {
  return "attempt" in payload ? payload.attempt : payload;
}

function pendingStorageKey(attemptId: string) {
  return `rtlab-pending-${attemptId}`;
}

function readPendingAnswers(attemptId: string): PendingAnswer[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(pendingStorageKey(attemptId)) ?? "[]",
    ) as unknown;
    return Array.isArray(value)
      ? value.filter(
          (item): item is PendingAnswer =>
            Boolean(
              item &&
                typeof item === "object" &&
                "questionId" in item &&
                "operationId" in item,
            ),
        )
      : [];
  } catch {
    return [];
  }
}

function addPendingAnswer(attemptId: string, change: PendingAnswer) {
  try {
    const pending = readPendingAnswers(attemptId);
    if (!pending.some((item) => item.operationId === change.operationId)) {
      pending.push(change);
    }
    localStorage.setItem(pendingStorageKey(attemptId), JSON.stringify(pending));
  } catch {
    // Il salvataggio server resta disponibile anche se lo storage è disabilitato.
  }
}

function removePendingAnswer(attemptId: string, operationId: string) {
  try {
    const pending = readPendingAnswers(attemptId).filter(
      (item) => item.operationId !== operationId,
    );
    if (pending.length) {
      localStorage.setItem(
        pendingStorageKey(attemptId),
        JSON.stringify(pending),
      );
    } else {
      localStorage.removeItem(pendingStorageKey(attemptId));
    }
  } catch {
    // Nessuna azione: il server ha già confermato la modifica.
  }
}

export function QuizRunner({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptPayload | null>(null);
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(3600);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [error, setError] = useState("");
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const revisionRef = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const timerCompletedRef = useRef(false);
  const questionStartedAtRef = useRef(0);
  const leaveHandledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const payload = await api<AttemptPayload | { attempt: AttemptPayload }>(
        `/api/attempts/${attemptId}`,
      );
      const next = normalizeAttempt(payload);
      if (next.status === "completed" || next.status === "expired") {
        router.replace(`/quiz/${attemptId}/risultato`);
        return;
      }
      setAttempt(next);
      revisionRef.current = next.revision;
      setRemaining(next.remainingSeconds);
      const hasMeaningfulProgress = next.questions.some(
        (question) => question.selectedOptionId !== null || question.skipped,
      );
      const firstUnanswered = hasMeaningfulProgress
        ? next.questions.findIndex((question) => !question.visited)
        : 0;
      if (firstUnanswered >= 0) setCurrent(firstUnanswered);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Non riesco a recuperare questa prova.",
      );
    }
  }, [attemptId, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const questions = attempt?.questions ?? [];
  const question = questions[current];
  const answeredCount = questions.filter(
    (item) => item.selectedOptionId !== null && !item.skipped,
  ).length;
  const omittedCount = questions.filter(
    (item) => item.skipped || item.selectedOptionId === null,
  ).length;

  const saveAnswer = useCallback(
    (
      questionId: string,
      optionId: string | null,
      visited = true,
      skipped = false,
    ) => {
      const now = performance.now();
      const timeSpentMs =
        question?.id === questionId && questionStartedAtRef.current > 0
          ? Math.min(
              600_000,
              Math.max(0, Math.round(now - questionStartedAtRef.current)),
            )
          : 0;
      questionStartedAtRef.current = now;
      const pending: PendingAnswer = {
        questionId,
        optionId,
        visited,
        skipped,
        timeSpentMs,
        operationId: crypto.randomUUID(),
      };
      addPendingAnswer(attemptId, pending);

      setAttempt((previous) =>
        previous
          ? {
              ...previous,
              questions: previous.questions.map((item) =>
                item.id === questionId
                  ? { ...item, selectedOptionId: optionId, visited, skipped }
                  : item,
              ),
            }
          : previous,
      );
      setSyncState("saving");

      saveQueue.current = saveQueue.current
        .then(async () => {
          const response = await api<{ revision?: number }>(
            `/api/attempts/${attemptId}/answer`,
            {
              method: "POST",
              headers: { "Idempotency-Key": pending.operationId },
              body: JSON.stringify({
                questionId,
                optionId,
                visited,
                skipped,
                timeSpentMs,
                revision: revisionRef.current,
              }),
            },
          );
          if (typeof response.revision === "number") {
            revisionRef.current = response.revision;
          } else {
            revisionRef.current += 1;
          }
          setSyncState("saved");
          window.setTimeout(() => setSyncState("idle"), 1200);
          removePendingAnswer(attemptId, pending.operationId);
        })
        .catch((caught) => {
          if (caught instanceof ApiError && caught.status === 409) {
            setError(
              "La prova è stata modificata in un’altra scheda. Ricarico l’ultima versione.",
            );
            setSyncState("offline");
            void load();
            return;
          }
          setSyncState("offline");
        });
    },
    [attemptId, load, question?.id],
  );

  const replayPendingAnswers = useCallback(() => {
    const pending = readPendingAnswers(attemptId);
    if (!pending.length) return;
    setSyncState("saving");

    saveQueue.current = saveQueue.current
      .then(async () => {
        for (const change of readPendingAnswers(attemptId)) {
          const response = await api<{ revision?: number }>(
            `/api/attempts/${attemptId}/answer`,
            {
              method: "POST",
              headers: { "Idempotency-Key": change.operationId },
              body: JSON.stringify({
                questionId: change.questionId,
                optionId: change.optionId,
                visited: change.visited,
                skipped: change.skipped,
                timeSpentMs: change.timeSpentMs,
                revision: revisionRef.current,
              }),
            },
          );
          revisionRef.current =
            typeof response.revision === "number"
              ? response.revision
              : revisionRef.current + 1;
          setAttempt((previous) =>
            previous
              ? {
                  ...previous,
                  questions: previous.questions.map((item) =>
                    item.id === change.questionId
                      ? {
                          ...item,
                          selectedOptionId: change.optionId,
                          visited: change.visited,
                          skipped: change.skipped,
                        }
                      : item,
                  ),
                }
              : previous,
          );
          removePendingAnswer(attemptId, change.operationId);
        }
        setSyncState("saved");
        window.setTimeout(() => setSyncState("idle"), 1200);
      })
      .catch((caught) => {
        setSyncState("offline");
        if (caught instanceof ApiError && caught.status === 409) {
          setError(
            "La prova è stata modificata in un’altra scheda. Ho conservato le modifiche locali.",
          );
          void load();
        }
      });
  }, [attemptId, load]);

  useEffect(() => {
    if (!attempt?.id || attempt.status !== "active") return;
    const replay = () => replayPendingAnswers();
    if (navigator.onLine) replay();
    window.addEventListener("online", replay);
    return () => window.removeEventListener("online", replay);
  }, [attempt?.id, attempt?.status, replayPendingAnswers]);

  useEffect(() => {
    if (
      syncState !== "offline" ||
      attempt?.status !== "active" ||
      !navigator.onLine
    ) {
      return;
    }
    const retry = window.setTimeout(replayPendingAnswers, 3_000);
    return () => window.clearTimeout(retry);
  }, [attempt?.status, replayPendingAnswers, syncState]);

  useEffect(() => {
    questionStartedAtRef.current = performance.now();
  }, [question?.id]);

  const finish = useCallback(
    async (expired = false) => {
      if (finishing || timerCompletedRef.current) return;
      if (expired) timerCompletedRef.current = true;
      setFinishing(true);
      setError("");
      try {
        if (!expired && question) {
          saveAnswer(
            question.id,
            question.selectedOptionId,
            true,
            question.skipped,
          );
        }
        await saveQueue.current;
        if (!expired && readPendingAnswers(attemptId).length) {
          throw new Error("PENDING_OFFLINE_CHANGES");
        }
        await api(`/api/attempts/${attemptId}/complete`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({
            revision: revisionRef.current,
            reason: expired ? "expired" : "submitted",
          }),
        });
        localStorage.removeItem(pendingStorageKey(attemptId));
        router.replace(`/quiz/${attemptId}/risultato`);
        router.refresh();
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 409) {
          await load();
        } else if (
          caught instanceof Error &&
          caught.message === "PENDING_OFFLINE_CHANGES"
        ) {
          setError(
            "Ci sono modifiche non ancora sincronizzate. Torna online prima di consegnare.",
          );
        } else {
          setError(
            caught instanceof ApiError
              ? caught.message
              : "Non è stato possibile concludere la prova.",
          );
        }
        timerCompletedRef.current = false;
      } finally {
        setFinishing(false);
      }
    },
    [attemptId, finishing, load, question, router, saveAnswer],
  );

  useEffect(() => {
    if (!attempt || attempt.status !== "active") return;
    const timer = window.setInterval(() => {
      setRemaining((value) => {
        const next = Math.max(0, value - 1);
        if (next === 0) void finish(true);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attempt, finish]);

  function navigate(next: number) {
    if (!question) return;
    saveAnswer(
      question.id,
      question.selectedOptionId,
      true,
      question.skipped,
    );
    setCurrent(Math.max(0, Math.min(questions.length - 1, next)));
  }

  const pause = useCallback(
    async (destination = "/dashboard") => {
      if (leaveHandledRef.current) return;
      leaveHandledRef.current = true;
      setSyncState("saving");
      try {
        if (question) {
          saveAnswer(
            question.id,
            question.selectedOptionId,
            true,
            question.skipped,
          );
        }
        await saveQueue.current;
        if (readPendingAnswers(attemptId).length) {
          leaveHandledRef.current = false;
          setSyncState("offline");
          setError(
            "La pausa richiede che tutte le modifiche siano sincronizzate. Riprova quando sei online.",
          );
          return;
        }
        const response = await api<{ revision?: number }>(
          `/api/attempts/${attemptId}/pause`,
          {
            method: "POST",
            headers: { "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify({ revision: revisionRef.current }),
          },
        );
        if (response.revision) revisionRef.current = response.revision;
        router.push(destination);
        router.refresh();
      } catch (caught) {
        leaveHandledRef.current = false;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Non è stato possibile mettere in pausa.",
        );
        setSyncState("idle");
      }
    },
    [attemptId, question, router, saveAnswer],
  );

  useEffect(() => {
    if (attempt?.status !== "active") return;

    const pauseOnInternalNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      if (anchor.hasAttribute("data-new-simulation")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const destination = `${url.pathname}${url.search}${url.hash}`;
      const currentDestination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (destination === currentDestination) return;

      event.preventDefault();
      void pause(destination);
    };

    document.addEventListener("click", pauseOnInternalNavigation, true);
    return () =>
      document.removeEventListener("click", pauseOnInternalNavigation, true);
  }, [attempt?.status, pause]);

  useEffect(() => {
    if (attempt?.status !== "active") return;

    const pauseOnPageExit = () => {
      if (leaveHandledRef.current) return;
      leaveHandledRef.current = true;
      void fetch(`/api/attempts/${attemptId}/pause`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ revision: revisionRef.current }),
        credentials: "same-origin",
        keepalive: true,
      });
    };

    window.addEventListener("pagehide", pauseOnPageExit);
    return () => window.removeEventListener("pagehide", pauseOnPageExit);
  }, [attempt?.status, attemptId]);

  async function resume() {
    try {
      const response = await api<AttemptPayload | { attempt: AttemptPayload }>(
        `/api/attempts/${attemptId}/resume`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ revision: revisionRef.current }),
        },
      );
      const next = normalizeAttempt(response);
      setAttempt(next);
      revisionRef.current = next.revision;
      setRemaining(next.remainingSeconds);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Non è stato possibile riprendere.",
      );
    }
  }

  if (error && !attempt) {
    return (
      <div className={cn("page-shell", styles.loadState)}>
        <AlertTriangle size={28} aria-hidden />
        <h1 className="font-editorial">Questa prova non è disponibile.</h1>
        <p>{error}</p>
        <Button variant="secondary" onClick={() => router.push("/dashboard")}>
          Torna alla dashboard
        </Button>
      </div>
    );
  }

  if (!attempt || !question) {
    return (
      <div className={cn("page-shell", styles.loading)} aria-label="Caricamento prova">
        <LoaderCircle size={28} aria-hidden />
        <span>Sto preparando il tavolo di lavoro…</span>
      </div>
    );
  }

  if (attempt.status === "paused") {
    return (
      <div className={cn("page-shell", styles.paused)}>
        <span className={styles.pausedIcon}>
          <Pause size={30} aria-hidden />
        </span>
        <Badge tone="lime">Prova in pausa</Badge>
        <h1 className="font-editorial">
          Il tempo è fermo a {formatDuration(remaining)}.
        </h1>
        <p>
          Quando riprendi, il conto alla rovescia ricomincia esattamente da qui.
        </p>
        <Button size="lg" onClick={resume}>
          <Play size={18} aria-hidden /> Riprendi la prova
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.quizPage}>
      <div className={cn("page-shell", styles.quizHeader)}>
        <div>
          <Badge tone="lime">
            {attempt.examType === "update" ? "Aggiornamento" : "Iniziale"}
          </Badge>
          <strong>{moduleLabels[attempt.module] ?? attempt.module}</strong>
        </div>
        <div className={styles.timer} data-critical={remaining <= 300}>
          <Clock3 size={19} aria-hidden />
          <span>
            <small>Tempo rimasto</small>
            <strong>{formatDuration(remaining)}</strong>
          </span>
          <i
            className={styles.timerProgress}
            style={{
              width: `${Math.max(0, Math.min(100, (remaining / 3600) * 100))}%`,
            }}
            aria-hidden
          />
        </div>
        <div className={styles.headerActions}>
          <SyncIndicator state={syncState} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void pause()}
          >
            <Pause size={16} aria-hidden /> Pausa
          </Button>
          <Button variant="dark" size="sm" onClick={() => setFinishOpen(true)}>
            <Send size={15} aria-hidden /> Termina
          </Button>
        </div>
      </div>

      {error ? (
        <div className={cn("page-shell", styles.inlineError)} role="alert">
          <AlertTriangle size={16} aria-hidden />
          {error}
          <button type="button" onClick={() => setError("")} aria-label="Chiudi">
            <X size={15} />
          </button>
        </div>
      ) : null}

      <div className={cn("page-shell", styles.workspace)}>
        <aside className={styles.navigator} aria-label="Navigatore domande">
          <div className={styles.navigatorHeader}>
            <div>
              <span>Avanzamento</span>
              <strong>
                {answeredCount}<small>/40</small>
              </strong>
            </div>
            <div
              className={styles.progressRing}
              style={{ "--progress": `${(answeredCount / 40) * 360}deg` } as React.CSSProperties}
              aria-hidden
            />
          </div>
          <div className={styles.questionGrid}>
            {questions.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  styles.questionJump,
                  index === current && styles.questionCurrent,
                  item.selectedOptionId && styles.questionAnswered,
                  item.skipped &&
                    item.selectedOptionId &&
                    styles.questionSkippedSelected,
                  item.visited &&
                    !item.selectedOptionId &&
                    styles.questionOmitted,
                )}
                onClick={() => navigate(index)}
                aria-label={`Domanda ${index + 1}${
                  item.skipped && item.selectedOptionId
                    ? ", omessa con risposta selezionata"
                    : item.selectedOptionId
                    ? ", risposta data"
                    : item.visited
                      ? ", omessa"
                      : ""
                }`}
                aria-current={index === current ? "step" : undefined}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className={styles.legend}>
            <span><i data-state="answered" />Risposta</span>
            <span><i data-state="skipped-selected" />Omessa con scelta</span>
            <span><i data-state="omitted" />Omessa</span>
            <span><i data-state="empty" />Da vedere</span>
          </div>
        </aside>

        <section className={styles.questionPanel}>
          <div className={styles.questionMeta}>
            <span>
              Domanda <strong>{current + 1}</strong> di 40
            </span>
            <code>{question.ministerialId}</code>
          </div>
          <div className={styles.subject}>
            <Flag size={14} aria-hidden />
            {question.subject}
          </div>
          <h1 className="font-editorial">{question.text}</h1>

          {question.skipped ? (
            <div className={styles.skippedNotice} role="status">
              <RotateCcw size={17} aria-hidden />
              Domanda saltata: seleziona di nuovo una risposta per confermarla.
            </div>
          ) : null}

          <fieldset
            className={cn(
              styles.options,
              question.skipped && styles.optionsSkipped,
            )}
          >
            <legend className="sr-only">Scegli una risposta</legend>
            {question.options.map((option, index) => {
              const selected = question.selectedOptionId === option.id;
              return (
                <label
                  key={option.id}
                  className={cn(styles.option, selected && styles.optionSelected)}
                  onClick={() => {
                    if (selected && question.skipped) {
                      saveAnswer(question.id, option.id);
                    }
                  }}
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={option.id}
                    checked={selected}
                    onChange={() => saveAnswer(question.id, option.id)}
                  />
                  <span className={styles.optionLetter}>
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className={styles.optionText}>{option.text}</span>
                  {question.skipped && selected ? (
                    <RotateCcw
                      className={styles.optionCheck}
                      size={18}
                      aria-hidden
                    />
                  ) : (
                    <Check
                      className={styles.optionCheck}
                      size={18}
                      aria-hidden
                    />
                  )}
                </label>
              );
            })}
          </fieldset>

          <div className={styles.questionActions}>
            <Button
              variant="ghost"
              onClick={() => navigate(current - 1)}
              disabled={current === 0}
            >
              <ArrowLeft size={17} aria-hidden /> Precedente
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                saveAnswer(
                  question.id,
                  question.selectedOptionId,
                  true,
                  true,
                );
                if (current < 39) setCurrent(current + 1);
              }}
            >
              <RotateCcw size={16} aria-hidden />
              {question.selectedOptionId
                ? "Salta mantenendo la scelta"
                : "Lascia senza risposta"}
            </Button>
            {current < 39 ? (
              <Button onClick={() => navigate(current + 1)}>
                Avanti <ArrowRight size={17} aria-hidden />
              </Button>
            ) : (
              <Button variant="dark" onClick={() => setFinishOpen(true)}>
                Controlla e termina <CheckCircle2 size={17} aria-hidden />
              </Button>
            )}
          </div>
        </section>
      </div>

      <Dialog.Root open={finishOpen} onOpenChange={setFinishOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialog}>
            <Dialog.Close className={styles.dialogClose} aria-label="Chiudi">
              <X size={19} />
            </Dialog.Close>
            <span className={styles.dialogIcon}>
              <Send size={23} aria-hidden />
            </span>
            <Dialog.Title className="font-editorial">
              Vuoi consegnare la prova?
            </Dialog.Title>
            <Dialog.Description>
              Dopo la consegna non potrai più modificare le risposte.
            </Dialog.Description>
            <div className={styles.finishSummary}>
              <span>
                <strong>{answeredCount}</strong>
                Risposte date
              </span>
              <span data-warning={omittedCount > 0}>
                <strong>{omittedCount}</strong>
                Risposte omesse
              </span>
              <span>
                <strong>{formatDuration(remaining)}</strong>
                Tempo residuo
              </span>
            </div>
            {omittedCount > 0 ? (
              <p className={styles.finishWarning}>
                <AlertTriangle size={16} aria-hidden />
                Le risposte omesse valgono 0 punti.
              </p>
            ) : null}
            <div className={styles.dialogActions}>
              <Dialog.Close asChild>
                <Button variant="secondary">Torna alla prova</Button>
              </Dialog.Close>
              <Button variant="dark" loading={finishing} onClick={() => finish(false)}>
                Consegna ora
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function SyncIndicator({ state }: { state: SyncState }) {
  const config = {
    idle: { icon: Cloud, label: "Salvato" },
    saved: { icon: CheckCircle2, label: "Salvato" },
    saving: { icon: LoaderCircle, label: "Salvataggio…" },
    offline: { icon: CloudOff, label: "Da sincronizzare" },
  }[state];
  const Icon = config.icon;
  return (
    <span className={styles.sync} data-state={state} role="status">
      <Icon size={15} aria-hidden />
      {config.label}
    </span>
  );
}
