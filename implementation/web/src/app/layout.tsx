import type { Metadata } from "next";
import { Fira_Code, Urbanist } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

const urbanist = Urbanist({ subsets: ["latin"], variable: "--font-urbanist" });
const firaCode = Fira_Code({ subsets: ["latin"], variable: "--font-fira-code" });

export const metadata: Metadata = {
  title: "Rekordly",
  description: "Say what happened. Review it. Know your numbers.",
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    shortcut: "/favicon.ico",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body
        className={`${urbanist.variable} ${firaCode.variable} flex min-h-full flex-col bg-background text-foreground font-sans`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
