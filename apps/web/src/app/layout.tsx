import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Seeku - AI Talent Search",
  description: "Find AI talent through evidence-driven matching"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}