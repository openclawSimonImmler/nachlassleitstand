import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nachlassleitstand | Lokale digitale Nachlassverwaltung",
  description:
    "Lokale Next.js Anwendung für digitale Nachlassverwaltung mit SQLite, strukturierter Freigabe-Queue, Tresor und Vertrauensrollen.",
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
