import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jaipur Rugs Foundation — Forms",
  description: "Internal forms builder and admin panel for Jaipur Rugs Foundation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Light mode only, pinned explicitly (no next-themes, no dark variant) — see AGENTS.md.
    <html
      lang="en"
      className={`light ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="light"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
