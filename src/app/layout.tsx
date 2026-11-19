import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaRegister from "@/components/pwa/PwaRegister";
import ThemeProvider from "@/components/theme/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "TaskFlow AI",
  title: {
    default: "TaskFlow AI",
    template: "%s · TaskFlow AI",
  },
  description: "A secure AI agent for the TaskFlow workforce management system.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TaskFlow AI",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F8FF" },
    { media: "(prefers-color-scheme: dark)", color: "#07112B" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the stored theme before first paint so the page never flashes the
 * wrong colour scheme. Kept inline and dependency-free on purpose.
 */
const themeScript = `(function(){try{var k="taskflow-theme";var v=localStorage.getItem(k);var t=(v==="light"||v==="dark")?v:"system";var d=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var r=document.documentElement;r.classList.toggle("dark",d==="dark");r.style.colorScheme=d;}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  );
}

