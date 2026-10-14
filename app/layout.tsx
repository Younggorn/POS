import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UP Minimart — ระบบบริหารร้านค้า",
  description: "ระบบ POS สต็อก จัดซื้อ และรายงานสำหรับร้านค้าปลีก",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
