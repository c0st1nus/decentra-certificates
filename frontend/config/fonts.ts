import { Fira_Code, Outfit, Press_Start_2P } from "next/font/google";

export const fontSans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const fontMono = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const fontPixel = Press_Start_2P({
  subsets: ["latin", "cyrillic"],
  variable: "--font-pixel",
  weight: ["400"],
});
