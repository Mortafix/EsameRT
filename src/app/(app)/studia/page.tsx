import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  Check,
  Compass,
  Download,
  FileText,
  LockKeyhole,
} from "lucide-react";

import {
  moduleStudyMaterials,
  studyGuide,
} from "@/lib/study-materials";
import styles from "./studia.module.css";

export const metadata: Metadata = {
  title: "Studia",
  description: "Dispense teoriche RT Lab per preparare i moduli d’esame.",
  robots: { index: false, follow: false },
};

export default function StudyPage() {
  const availableCount = moduleStudyMaterials.filter(
    (material) => material.available,
  ).length;

  return (
    <div className={`page-shell ${styles.page}`}>
      <header className={styles.pageHeader}>
        <span className="eyebrow">Biblioteca RT Lab</span>
        <h1 className="font-editorial">
          Studia la teoria, poi <em>mettila alla prova.</em>
        </h1>
      </header>

      <section className={styles.guide} aria-labelledby="study-guide-title">
        <div className={styles.guideCopy}>
          <span className={styles.guideKicker}>
            <Compass size={16} aria-hidden /> Inizia da qui
          </span>
          <h2 id="study-guide-title" className="font-editorial">
            {studyGuide.title}
          </h2>
          <p>{studyGuide.description}</p>
          <div className={styles.guideMeta}>
            <span>
              <FileText size={16} aria-hidden /> PDF · {studyGuide.pages} pagine
            </span>
            <span>
              <Check size={16} aria-hidden /> Metodo e orientamento
            </span>
          </div>
          <div className={styles.actions}>
            <Link
              href={`/studia/${studyGuide.slug}`}
              className={styles.primaryAction}
            >
              Consulta la guida <ArrowRight size={17} aria-hidden />
            </Link>
            <a
              href={studyGuide.fileUrl}
              download={studyGuide.fileName}
              className={styles.darkSecondaryAction}
            >
              <Download size={17} aria-hidden /> Scarica PDF
            </a>
          </div>
        </div>
        <div className={styles.guideStack}>
          <span
            className={`${styles.guidePage} ${styles.guidePageBack}`}
            aria-hidden
          >
            <Image
              src="/dispense/covers/guida-pagina-3.jpg"
              alt=""
              fill
              unoptimized
              sizes="(max-width: 760px) 80vw, 30vw"
            />
          </span>
          <span
            className={`${styles.guidePage} ${styles.guidePageMiddle}`}
            aria-hidden
          >
            <Image
              src="/dispense/covers/guida-pagina-2.jpg"
              alt=""
              fill
              unoptimized
              sizes="(max-width: 760px) 80vw, 30vw"
            />
          </span>
          <Link
            href={`/studia/${studyGuide.slug}`}
            className={styles.guideCover}
            aria-label={`Consulta ${studyGuide.title}`}
          >
            <Image
              src={studyGuide.coverUrl}
              alt={`Copertina di ${studyGuide.title}`}
              fill
              priority
              unoptimized
              sizes="(max-width: 760px) 80vw, 30vw"
            />
          </Link>
        </div>
      </section>

      <section className={styles.library} aria-labelledby="modules-title">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionKicker}>Percorso per moduli</span>
            <h2 id="modules-title" className="font-editorial">
              Dispense d’esame
            </h2>
          </div>
          <span className={styles.libraryCount}>
            {availableCount} {availableCount === 1 ? "disponibile" : "disponibili"}
          </span>
        </div>

        <div className={styles.grid}>
          {moduleStudyMaterials.map((material) =>
            material.available ? (
              <article key={material.slug} className={styles.materialCard}>
                <Link
                  href={`/studia/${material.slug}`}
                  className={styles.cover}
                  aria-label={`Consulta ${material.title}`}
                >
                  <Image
                    src={material.coverUrl}
                    alt={`Copertina di ${material.title}`}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 92vw, (max-width: 1100px) 44vw, 28vw"
                  />
                </Link>
                <div className={styles.materialBody}>
                  <div className={styles.materialHeading}>
                    <h3 className="font-editorial">{material.title}</h3>
                    <span>{material.pages} pagine</span>
                  </div>
                  <p>{material.description}</p>
                  <div className={styles.cardActions}>
                    <Link href={`/studia/${material.slug}`}>
                      <BookOpenText size={17} aria-hidden /> Consulta
                    </Link>
                    <a href={material.fileUrl} download={material.fileName}>
                      <Download size={17} aria-hidden /> Scarica
                    </a>
                  </div>
                </div>
              </article>
            ) : (
              <article
                key={material.slug}
                className={`${styles.materialCard} ${styles.upcomingCard}`}
              >
                <div className={styles.upcomingVisual} aria-hidden>
                  <LockKeyhole size={24} />
                  <span>In preparazione</span>
                </div>
                <div className={styles.materialBody}>
                  <div className={styles.materialHeading}>
                    <h3 className="font-editorial">{material.title}</h3>
                    <span>Prossimamente</span>
                  </div>
                  <p>{material.description}</p>
                </div>
              </article>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
