import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nachlassleitstand",
  description: "Lokale Next.js MVP-Plattform für digitale Nachlassvorsorge mit SQLite, Tresor, Rollen und Anfrageprüfung.",
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
