import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "FitSec",
  description: "Seu caderno de treino. Sem assinatura.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FitSec",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#040607",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <main
          className="max-w-md mx-auto px-5 pt-6 pb-28"
          style={{ minHeight: "100vh" }}
        >
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
