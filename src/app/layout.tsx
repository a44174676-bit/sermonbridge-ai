import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SermonBridge AI | 함께 이해하는 말씀",
  description: "교회별 원고 보호와 목회자 검수를 위한 다국어 설교 지원",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
