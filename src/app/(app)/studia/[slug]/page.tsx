import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";

import {
  availableStudyMaterials,
  getStudyMaterial,
} from "@/lib/study-materials";
import styles from "./viewer.module.css";

type StudyViewerProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return availableStudyMaterials.map((material) => ({ slug: material.slug }));
}

export async function generateMetadata({
  params,
}: StudyViewerProps): Promise<Metadata> {
  const { slug } = await params;
  const material = getStudyMaterial(slug);
  if (!material) return { title: "Dispensa non trovata" };
  return {
    title: material.title,
    description: material.description,
    robots: { index: false, follow: false },
  };
}

export default async function StudyViewer({ params }: StudyViewerProps) {
  const { slug } = await params;
  const material = getStudyMaterial(slug);
  if (!material) notFound();

  return (
    <div className={`page-shell ${styles.page}`}>
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <Link href="/studia" className={styles.back}>
            <ArrowLeft size={17} aria-hidden /> Torna alle dispense
          </Link>
          <h1 className="font-editorial">{material.title}</h1>
          <span>PDF · {material.pages} pagine</span>
        </div>
        <div className={styles.actions}>
          <a href={material.fileUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={17} aria-hidden /> Apri in una scheda
          </a>
          <a
            href={material.fileUrl}
            download={material.fileName}
            className={styles.download}
          >
            <Download size={17} aria-hidden /> Scarica PDF
          </a>
        </div>
      </div>

      <div className={styles.viewer}>
        <iframe
          title={material.title}
          src={`${material.fileUrl}#page=1&zoom=page-width&toolbar=1&navpanes=1`}
        >
          <p>
            Il tuo browser non supporta la consultazione incorporata. Usa il
            collegamento per aprire o scaricare il PDF.
          </p>
        </iframe>
      </div>
    </div>
  );
}
