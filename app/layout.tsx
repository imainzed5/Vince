import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppearanceController } from "@/components/shared/AppearanceController";
import { Toaster } from "@/components/ui/sonner";
import { getAppearanceBootstrapScript } from "@/lib/appearance";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Vince",
  description: "Focused real-time workspace for small teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          id="vince-appearance"
          dangerouslySetInnerHTML={{
            __html: getAppearanceBootstrapScript(),
          }}
        />
      </head>
      <body>
        <AppearanceController />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
