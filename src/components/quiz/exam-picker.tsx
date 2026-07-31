"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock3,
  Layers3,
  Recycle,
  Scale,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import styles from "./exam-picker.module.css";

type ExamType = "initial" | "update";
type Module = "general" | "cat145" | "cat8" | "cat9" | "cat10";

const modules: Array<{
  id: Module;
  label: string;
  short: string;
  description: string;
  icon: typeof BookOpen;
}> = [
  {
    id: "general",
    label: "Modulo generale",
    short: "GEN",
    description: "Legislazione, responsabilità e gestione ambientale.",
    icon: BookOpen,
  },
  {
    id: "cat145",
    label: "Categorie 1 · 4 · 5",
    short: "1·4·5",
    description: "Raccolta e trasporto di rifiuti urbani e speciali.",
    icon: Recycle,
  },
  {
    id: "cat8",
    label: "Categoria 8",
    short: "CAT 8",
    description: "Intermediazione e commercio dei rifiuti.",
    icon: Layers3,
  },
  {
    id: "cat9",
    label: "Categoria 9",
    short: "CAT 9",
    description: "Bonifica dei siti contaminati.",
    icon: Scale,
  },
  {
    id: "cat10",
    label: "Categoria 10",
    short: "CAT 10",
    description: "Bonifica di beni contenenti amianto.",
    icon: Sparkles,
  },
];

export function ExamPicker() {
  const router = useRouter();
  const [examType, setExamType] = useState<ExamType>("initial");
  const [module, setModule] = useState<Module>("general");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openAttempt, setOpenAttempt] = useState<{
    id: string;
    status: "active" | "paused";
  } | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  useEffect(() => {
    api<{
      attempt?: { id: string; status: "active" | "paused" } | null;
    }>("/api/attempts")
      .then(({ attempt }) => {
        if (!attempt) return;
        setOpenAttempt(attempt);
        if (attempt.status === "paused") setConflictOpen(true);
      })
      .catch(() => {
        // Il controllo viene ripetuto dal server alla creazione.
      });
  }, []);

  const availableModules = useMemo(
    () =>
      examType === "update"
        ? modules.filter((item) => item.id !== "general")
        : modules,
    [examType],
  );

  function chooseExamType(next: ExamType) {
    setExamType(next);
    if (next === "update" && module === "general") setModule("cat145");
  }

  async function createAttempt() {
    setError("");
    setLoading(true);
    try {
      const payload = await api<{ id?: string; attempt?: { id: string } }>(
        "/api/attempts",
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ examType, module }),
        },
      );
      const id = payload.id ?? payload.attempt?.id;
      if (!id) throw new Error("Tentativo non creato");
      router.push(`/quiz/${id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        const existing = await api<{
          attempt?: { id: string; status: "active" | "paused" } | null;
        }>("/api/attempts").catch(() => ({ attempt: null }));
        if (existing.attempt) {
          setOpenAttempt(existing.attempt);
          setConflictOpen(true);
        } else {
          setError("Hai già una prova aperta.");
        }
      } else {
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Non è stato possibile preparare la prova.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function start() {
    if (openAttempt) {
      setConflictOpen(true);
      return;
    }
    void createAttempt();
  }

  async function replaceOpenAttempt() {
    if (!openAttempt) return;
    setLoading(true);
    setError("");
    try {
      await api(`/api/attempts/${openAttempt.id}`, { method: "DELETE" });
      localStorage.removeItem(`rtlab-pending-${openAttempt.id}`);
      setOpenAttempt(null);
      setConflictOpen(false);
      await createAttempt();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Non è stato possibile sostituire la prova in pausa.",
      );
      setLoading(false);
    }
  }

  const threshold =
    examType === "update" ? 28 : module === "general" ? 32 : 34;

  return (
    <div className={cn("page-shell", styles.page)}>
      <Link href="/dashboard" className={styles.back}>
        <ArrowLeft size={16} aria-hidden /> Dashboard
      </Link>

      <header className={styles.header}>
        <span className="eyebrow">Nuova simulazione</span>
        <h1 className="font-editorial">
          Componi la tua <em>prossima prova.</em>
        </h1>
      </header>

      <section className={styles.section} aria-labelledby="type-heading">
        <div className={styles.sectionTitle}>
          <span>01</span>
          <div>
            <h2 id="type-heading">Tipo di verifica</h2>
            <p>Iniziale e aggiornamento usano banche domande distinte.</p>
          </div>
        </div>
        <div className={styles.typeGrid}>
          <button
            type="button"
            className={cn(
              styles.typeCard,
              examType === "initial" && styles.selected,
            )}
            onClick={() => chooseExamType("initial")}
            aria-pressed={examType === "initial"}
          >
            <Badge tone={examType === "initial" ? "lime" : "neutral"}>
              Verifica iniziale
            </Badge>
            <strong className="font-editorial">Standard</strong>
            <p>Modulo generale o specialistico, con soglia 32 oppure 34.</p>
            <span className={styles.radio} aria-hidden />
          </button>
          <button
            type="button"
            className={cn(
              styles.typeCard,
              examType === "update" && styles.selected,
            )}
            onClick={() => chooseExamType("update")}
            aria-pressed={examType === "update"}
          >
            <Badge tone={examType === "update" ? "lime" : "neutral"}>
              Aggiornamento
            </Badge>
            <strong className="font-editorial">Rinnovo</strong>
            <p>Solo moduli specialistici, con soglia fissata a 28 punti.</p>
            <span className={styles.radio} aria-hidden />
          </button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="module-heading">
        <div className={styles.sectionTitle}>
          <span>02</span>
          <div>
            <h2 id="module-heading">Modulo</h2>
            <p>Una prova completa riguarda sempre un solo modulo.</p>
          </div>
        </div>
        <div className={styles.moduleGrid}>
          {availableModules.map((item) => {
            const Icon = item.icon;
            const selected = module === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(styles.moduleCard, selected && styles.selected)}
                onClick={() => setModule(item.id)}
                aria-pressed={selected}
              >
                <span className={styles.moduleIcon}>
                  <Icon size={22} aria-hidden />
                </span>
                <span className={styles.moduleShort}>{item.short}</span>
                <strong>{item.label}</strong>
                <p>{item.description}</p>
                <span className={styles.radio} aria-hidden />
              </button>
            );
          })}
        </div>
      </section>

      <Card className={styles.summary}>
        <div>
          <span className="eyebrow">Riepilogo prova</span>
          <h2 className="font-editorial">
            {modules.find((item) => item.id === module)?.label}
          </h2>
          <p>
            {examType === "update"
              ? "Verifica di aggiornamento"
              : "Verifica iniziale"}
          </p>
        </div>
        <dl>
          <div>
            <dt>Domande</dt>
            <dd>40</dd>
          </div>
          <div>
            <dt>Tempo</dt>
            <dd>
              <Clock3 size={17} aria-hidden /> 60 min
            </dd>
          </div>
          <div>
            <dt>Soglia</dt>
            <dd>{threshold} pt</dd>
          </div>
          <div>
            <dt>Punteggio</dt>
            <dd>+1 / −0,5 / 0</dd>
          </div>
        </dl>
        <Button size="lg" onClick={start} loading={loading}>
          Genera la prova
          <ArrowRight size={18} aria-hidden />
        </Button>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </Card>

      <Dialog.Root open={conflictOpen} onOpenChange={setConflictOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialog}>
            <Dialog.Close className={styles.dialogClose} aria-label="Chiudi">
              <X size={19} />
            </Dialog.Close>
            <span className={styles.dialogIcon}>
              <Trash2 size={23} aria-hidden />
            </span>
            <Dialog.Title className="font-editorial">
              Hai già una prova {openAttempt?.status === "paused" ? "in pausa" : "aperta"}.
            </Dialog.Title>
            <Dialog.Description>
              Per iniziare una nuova simulazione devi eliminare quella attuale.
              Le risposte e il tempo salvato andranno persi.
            </Dialog.Description>
            {error ? (
              <p className={styles.dialogError} role="alert">
                {error}
              </p>
            ) : null}
            <div className={styles.dialogActions}>
              <Dialog.Close asChild>
                <Button variant="secondary">Chiudi</Button>
              </Dialog.Close>
              <Button
                variant="danger"
                loading={loading}
                onClick={replaceOpenAttempt}
              >
                Elimina e inizia la nuova
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
