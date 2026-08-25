import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteOrigin = process.env.SITE_ORIGIN ?? "http://localhost:3000";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "천구 좌표계 실험실",
  description: "경도·위도와 지평·적도 좌표계를 조작하며 배우는 교사용 수업 도구",
  openGraph: {
    title: "천구 좌표계 실험실",
    description: "경도·위도부터 지평·적도 좌표계까지 직접 조작하며 배우는 수업 도구",
    type: "website",
    images: [{ url: new URL("/og.png", siteOrigin).toString(), width: 1200, height: 630, alt: "천구 좌표계 실험실" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "천구 좌표계 실험실",
    description: "경도·위도부터 지평·적도 좌표계까지 직접 조작하며 배우는 수업 도구",
    images: [new URL("/og.png", siteOrigin).toString()],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

