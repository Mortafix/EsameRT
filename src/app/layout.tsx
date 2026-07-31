import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/fraunces";
import "./globals.css";
import "@/components/ui/button.css";
import "@/components/ui/ui.css";

const siteUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");
const siteTitle = "Simulatore esame Responsabile Tecnico | RT Lab";
const siteDescription =
  "Preparati alla verifica di idoneità del Responsabile Tecnico con quiz ufficiali, simulazioni da 40 domande, statistiche e ripasso degli errori.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: siteTitle,
    template: "%s | RT Lab",
  },
  description: siteDescription,
  applicationName: "RT Lab",
  authors: [{ name: "RT Lab" }],
  creator: "RT Lab",
  publisher: "RT Lab",
  category: "education",
  keywords: [
    "esame responsabile tecnico",
    "quiz responsabile tecnico",
    "Albo Nazionale Gestori Ambientali",
    "simulatore responsabile tecnico",
    "verifica idoneità responsabile tecnico",
    "quiz gestori ambientali",
  ],
  alternates: {
    canonical: "/",
  },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: "/",
    siteName: "RT Lab",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/hero.png",
        width: 1663,
        height: 946,
        alt: "RT Lab, simulatore per l’esame del Responsabile Tecnico",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/hero.png",
        width: 1663,
        height: 946,
        alt: "RT Lab, simulatore per l’esame del Responsabile Tecnico",
      },
    ],
  },
  robots: {
    index: process.env.NODE_ENV === "production",
    follow: process.env.NODE_ENV === "production",
    googleBot: {
      index: process.env.NODE_ENV === "production",
      follow: process.env.NODE_ENV === "production",
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123b34",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "RT Lab",
    url: siteUrl.toString(),
    image: new URL("/hero.png", siteUrl).toString(),
    description: siteDescription,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    inLanguage: "it-IT",
    featureList: [
      "Simulazioni da 40 domande",
      "Quiz ufficiali per modulo",
      "Statistiche personali",
      "Ripasso guidato degli errori",
    ],
  };

  return (
    <html lang="it">
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
      </body>
    </html>
  );
}
