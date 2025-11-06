import {
  Fira_Code as FontMono,
  Figtree as FontSans,
  Sora as FontHeading,
} from 'next/font/google';

export const fontSans = FontSans({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const fontMono = FontMono({
  subsets: ['latin'],
  variable: '--font-mono',
});

// Halenoir font family with all weights
export const fontHeading = FontHeading({
  subsets: ['latin'],
  variable: '--font-heading',
});
