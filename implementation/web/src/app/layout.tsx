import type { Metadata } from "next";
import { Figtree, Fira_Code, Sora } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
const firaCode = Fira_Code({ subsets: ["latin"], variable: "--font-fira-code" });

export const metadata: Metadata = {
  title: "Rekordly",
  description: "Say what happened. Review it. Know your numbers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body
        className={`${figtree.variable} ${sora.variable} ${firaCode.variable} flex min-h-full flex-col bg-background text-foreground font-sans`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
