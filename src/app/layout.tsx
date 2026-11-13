import type { Metadata, Viewport } from "next";
import { Inter, Orbitron } from "next/font/google";
import { Toaster } from "@/components/toaster";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "JARVIS AI",
  description: "Your Business. Your Intelligence. Your Control.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#040a15", width: "device-width", initialScale: 1 };

const themeScript = `try{var t=localStorage.getItem('jarvis-theme');if(!t){t='dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${orbitron.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
