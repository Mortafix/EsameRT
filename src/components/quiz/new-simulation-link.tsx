"use client";

import { type MouseEvent, type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client/api";
import styles from "./new-simulation-link.module.css";

type OpenAttempt = {
  id: string;
  status: "active" | "paused";
};

export function NewSimulationLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<OpenAttempt | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function begin(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    if (checking) return;
    setChecking(true);
    setError("");
    try {
      const payload = await api<{ attempt?: OpenAttempt | null }>(
        "/api/attempts",
      );
      if (payload.attempt) {
        setAttempt(payload.attempt);
        setOpen(true);
        return;
      }
      router.push("/quiz/nuovo");
    } catch {
      // La pagina di configurazione ripete il controllo lato server/API.
      router.push("/quiz/nuovo");
    } finally {
      setChecking(false);
    }
  }

  async function replaceAttempt() {
    if (!attempt) return;
    setDeleting(true);
    setError("");
    try {
      await api(`/api/attempts/${attempt.id}`, { method: "DELETE" });
      localStorage.removeItem(`rtlab-pending-${attempt.id}`);
      setOpen(false);
      setAttempt(null);
      router.push("/quiz/nuovo");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Non è stato possibile eliminare la prova aperta.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Link
        href="/quiz/nuovo"
        className={className}
        onClick={begin}
        data-new-simulation
        aria-busy={checking}
      >
        {children}
      </Link>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.dialog}>
            <Dialog.Close className={styles.close} aria-label="Chiudi">
              <X size={19} />
            </Dialog.Close>
            <span className={styles.icon}>
              <Trash2 size={23} aria-hidden />
            </span>
            <Dialog.Title className="font-editorial">
              Hai già una prova {attempt?.status === "paused" ? "in pausa" : "aperta"}.
            </Dialog.Title>
            <Dialog.Description>
              Per configurare una nuova simulazione devi eliminare quella
              attuale. Le risposte e il tempo salvato andranno persi.
            </Dialog.Description>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Dialog.Close asChild>
                <Button variant="secondary">Chiudi</Button>
              </Dialog.Close>
              <Button
                variant="danger"
                loading={deleting}
                onClick={replaceAttempt}
              >
                Elimina e configura la nuova
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
