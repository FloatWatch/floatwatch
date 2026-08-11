import type { Metadata } from "next";
import "./globals.css";
import { ClearStaleServiceWorker } from "@/components/clear-stale-service-worker";

export const metadata: Metadata = {
  title: "FloatWatch | 바다의 눈",
  description: "부유물 탐지 모델 성능을 영상 기반으로 빠르게 검증하고 모니터링할 수 있는 플랫폼입니다.",
  icons: {
    icon: "/images/main.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <ClearStaleServiceWorker />
        {children}
      </body>
    </html>
  );
}
