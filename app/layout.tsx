import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Cubo PE · Cubo mágico em Pernambuco",
    template: "%s · Cubo PE",
  },
  description:
    "Acervo de algoritmos, campeonatos online e comunidade de cubo mágico em Pernambuco.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
