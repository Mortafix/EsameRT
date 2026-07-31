import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import loginLogo from "../../../../public/apple-touch-icon.png";
import { LoginForm } from "@/components/auth/login-form";
import styles from "./login.module.css";
import { BookOpenCheck, Leaf, ShieldCheck, TimerReset } from "lucide-react";

export const metadata: Metadata = {
  title: "Accedi",
};

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-labelledby="login-title">
        <div className={styles.brandTop}>
          <div className={styles.logoMark} aria-hidden>
            <Image
              src={loginLogo}
              alt=""
              width={48}
              height={48}
              priority
            />
          </div>
          <div>
            <span className={styles.brandName}>RT Lab</span>
            <span className={styles.brandDescriptor}>Responsabile Tecnico</span>
          </div>
        </div>

        <div className={styles.heroCopy}>
          <span className={styles.heroKicker}>
            <Leaf size={15} aria-hidden />
            Quiz ufficiali, metodo personale
          </span>
          <h1 id="login-title" className="font-editorial">
            Preparati con
            <br />
            <em>consapevolezza.</em>
          </h1>
          <p>
            Simulazioni fedeli, progressi leggibili e un ripasso che parte dai
            tuoi errori reali.
          </p>
        </div>

        <div className={styles.featureGrid}>
          <div>
            <BookOpenCheck size={19} aria-hidden />
            <span>9 banche ufficiali 2026</span>
          </div>
          <div>
            <TimerReset size={19} aria-hidden />
            <span>Pausa e ripresa sicure</span>
          </div>
          <div>
            <ShieldCheck size={19} aria-hidden />
            <span>Storico personale protetto</span>
          </div>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formWrap}>
          <span className="eyebrow">Area riservata</span>
          <h2 className="font-editorial">Bentornato in laboratorio.</h2>
          <p className={styles.formIntro}>
            Inserisci il codice personale assegnato dall’amministratore.
          </p>
          <Suspense
            fallback={
              <p className={styles.disclaimer} role="status">
                Caricamento accesso…
              </p>
            }
          >
            <LoginForm />
          </Suspense>
          <p className={styles.disclaimer}>
            RT Lab è uno strumento di esercitazione indipendente basato sui quiz
            pubblicati dall’Albo Nazionale Gestori Ambientali.
          </p>
        </div>
      </section>
    </main>
  );
}
