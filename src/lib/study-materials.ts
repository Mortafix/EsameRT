export type AvailableStudyMaterial = {
  available: true;
  slug: string;
  title: string;
  description: string;
  pages: number;
  fileName: string;
  fileUrl: string;
  coverUrl: string;
};

export type UpcomingStudyMaterial = {
  available: false;
  slug: string;
  title: string;
  description: string;
};

export type StudyMaterial = AvailableStudyMaterial | UpcomingStudyMaterial;

export const studyGuide: AvailableStudyMaterial = {
  available: true,
  slug: "guida-alle-dispense",
  title: "Guida alle dispense",
  description:
    "Il punto di partenza per capire il metodo RT Lab, leggere riquadri e tabelle e passare dalla teoria alle simulazioni.",
  pages: 16,
  fileName: "00_Guida_metodo_di_studio_RT_Lab.pdf",
  fileUrl: "/dispense/00_Guida_metodo_di_studio_RT_Lab.pdf",
  coverUrl: "/dispense/covers/guida.jpg",
};

export const moduleStudyMaterials: StudyMaterial[] = [
  {
    available: true,
    slug: "modulo-generale",
    title: "Modulo generale",
    description:
      "La base comune: rifiuti, autorizzazioni, responsabilità, Albo, Responsabile Tecnico, sicurezza e certificazioni.",
    pages: 46,
    fileName: "01_Modulo_generale_RT_Lab.pdf",
    fileUrl: "/dispense/01_Modulo_generale_RT_Lab.pdf",
    coverUrl: "/dispense/covers/modulo-generale.jpg",
  },
  {
    available: true,
    slug: "categorie-1-4-5",
    title: "Categorie 1 · 4 · 5",
    description:
      "Raccolta e trasporto: impresa, veicoli, documenti, rifiuti, ADR e controllo operativo.",
    pages: 33,
    fileName: "02_Categorie_1-4-5_RT_Lab.pdf",
    fileUrl: "/dispense/02_Categorie_1-4-5_RT_Lab.pdf",
    coverUrl: "/dispense/covers/categorie-1-4-5.jpg",
  },
  {
    available: true,
    slug: "categoria-8",
    title: "Categoria 8",
    description:
      "Intermediazione e commercio senza detenzione: filiera, tracciabilità, spedizioni, intermodalità e diritto commerciale.",
    pages: 37,
    fileName: "03_Categoria_8_RT_Lab.pdf",
    fileUrl: "/dispense/03_Categoria_8_RT_Lab.pdf",
    coverUrl: "/dispense/covers/categoria-8.jpg",
  },
  {
    available: true,
    slug: "categoria-9",
    title: "Categoria 9",
    description:
      "Bonifica di siti: procedura, caratterizzazione, analisi di rischio, tecnologie, materiali e sicurezza di cantiere.",
    pages: 39,
    fileName: "04_Categoria_9_RT_Lab.pdf",
    fileUrl: "/dispense/04_Categoria_9_RT_Lab.pdf",
    coverUrl: "/dispense/covers/categoria-9.jpg",
  },
  {
    available: true,
    slug: "categoria-10",
    title: "Categoria 10",
    description:
      "Bonifica dei beni contenenti amianto: normativa, progettazione, tecniche operative, rifiuti e sicurezza.",
    pages: 40,
    fileName: "05_Categoria_10_RT_Lab.pdf",
    fileUrl: "/dispense/05_Categoria_10_RT_Lab.pdf",
    coverUrl: "/dispense/covers/categoria-10.jpg",
  },
];

export const availableStudyMaterials = [
  studyGuide,
  ...moduleStudyMaterials.filter(
    (material): material is AvailableStudyMaterial => material.available,
  ),
];

export function getStudyMaterial(slug: string) {
  return availableStudyMaterials.find((material) => material.slug === slug);
}
