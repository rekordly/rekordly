import { Fira_Code as FontMono, DM_Sans as FontSans } from "next/font/google";
import localFont from "next/font/local";

export const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const fontMono = FontMono({
  subsets: ["latin"],
  variable: "--font-mono",
});

// Halenoir font family with all weights
export const fontHalenoir = localFont({
  src: [
    {
      path: "../fonts/HalenoirThin.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../fonts/HalenoirLight.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/Halenoir.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/HalenoirDemiBold.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/HalenoirBold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../fonts/HalenoirBlack.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-halenoir",
  display: "swap",
});