import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const siteName = "Nachlassleitstand";
const description =
  "Lokale Next.js Anwendung für digitale Nachlassverwaltung mit SQLite, strukturierter Freigabe-Queue, Tresor und Vertrauensrollen.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${siteName} | Lokale digitale Nachlassverwaltung`,
    template: `%s | ${siteName}`,
  },
  description,
  applicationName: siteName,
  keywords: [
    "digitale Nachlassverwaltung",
    "Nachlassvorsorge",
    "Dokumententresor",
    "Vertrauenspersonen",
    "Next.js",
    "SQLite",
  ],
  authors: [{ name: "Simon Immler" }],
  creator: "Simon Immler",
  publisher: "Simon Immler",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: appUrl,
    siteName,
    title: `${siteName} | Lokale digitale Nachlassverwaltung`,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} | Lokale digitale Nachlassverwaltung`,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
