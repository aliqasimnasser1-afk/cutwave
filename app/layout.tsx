import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import "./globals.css";

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
});

const latin = Inter({
  subsets: ["latin"],
  variable: "--font-latin",
});

export const metadata: Metadata = {
  title: "Cutwave — قص الفيديو والصوت",
  description:
    "Cutwave: قص مقاطع الفيديو والصوت مباشرة في المتصفح، بدون رفع الملفات، على الجوال والكمبيوتر.",
  applicationName: "Cutwave",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0b10" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
  ],
};

const themeScript = `document.documentElement.classList.add("js");try{var t=localStorage.getItem("cw-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${arabic.variable} ${latin.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
