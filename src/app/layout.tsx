import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: process.env.APP_NAME ?? "Product Name Optimiser" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
