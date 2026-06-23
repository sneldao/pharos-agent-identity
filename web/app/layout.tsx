import type { Metadata } from "next";
import { Hanken_Grotesk, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ligis — trust, made portable for autonomous agents",
  description:
    "Portable identity and verifiable credentials for AI agents. Issue, verify, rotate, and revoke on Pharos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${hanken.variable} ${fraunces.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
