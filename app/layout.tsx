import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { Providers } from "@/components/Providers";
import { SWRegister } from "@/components/SWRegister";
import { AuthProvider } from "@/components/AuthProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { SyncProvider } from "@/components/SyncProvider";
import { OfflineBadge } from "@/components/OfflineBadge";
import { InstallBanner } from "@/components/InstallBanner";

export const metadata: Metadata = {
  title: "FitSec",
  description: "Seu caderno de treino. Sem assinatura.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FitSec",
    startupImage: ["/apple-touch-icon.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#040607",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <SWRegister />
        <Providers>
          <AuthProvider>
            <ProfileProvider>
              <SyncProvider>
                <OfflineBadge />
                <main
                  className="max-w-md mx-auto px-5 pt-6 pb-28"
                  style={{ minHeight: "100vh" }}
                >
                  {children}
                </main>
                <BottomNav />
                <InstallBanner />
              </SyncProvider>
            </ProfileProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
