import type { Metadata } from "next";
import { Figtree, Fira_Code, Sora } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
const firaCode = Fira_Code({ subsets: ["latin"], variable: "--font-fira-code" });

export const metadata: Metadata = {
  title: "Rekordly",
  description: "Say what happened. Review it. Know your numbers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${figtree.variable} ${sora.variable} ${firaCode.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
