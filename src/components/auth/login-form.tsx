"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/client/api";
import styles from "./login-form.module.css";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      const requested = searchParams.get("returnTo");
      const returnTo =
        requested?.startsWith("/") &&
        !requested.startsWith("//") &&
        !requested.includes("\\")
          ? requested
          : "/dashboard";
      router.replace(returnTo);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Accesso non riuscito. Riprova.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <Field label="Codice personale" error={error}>
        <div className={styles.inputWrap}>
          <KeyRound size={18} aria-hidden />
          <Input
            value={code}
            onChange={(event) =>
              setCode(event.target.value.toLocaleUpperCase("it-IT"))
            }
            placeholder="es. MARCO-RT2026"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            minLength={4}
            maxLength={64}
            required
            aria-invalid={Boolean(error)}
            autoFocus
          />
        </div>
      </Field>
      <Button
        type="submit"
        size="lg"
        loading={loading}
        disabled={code.trim().length < 4}
        className={styles.submit}
      >
        Entra in RT Lab
        <ArrowRight size={18} aria-hidden />
      </Button>
      <p className={styles.help}>
        Il codice non è una password da creare: viene assegnato dal tuo
        amministratore.
      </p>
    </form>
  );
}
