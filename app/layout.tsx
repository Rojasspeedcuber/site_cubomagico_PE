import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";
import { SITE_URL, OFFICIAL_LOGO_PATH } from "@/lib/community-config";
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  icons: { icon: OFFICIAL_LOGO_PATH },
  openGraph: { siteName: "Cubo Mágico PE", locale: "pt_BR", type: "website", images: [{ url: OFFICIAL_LOGO_PATH, alt: "Logotipo do Cubo Mágico PE com as cores da bandeira de Pernambuco" }] },
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
