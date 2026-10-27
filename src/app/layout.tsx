import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ordering",
  description: "Restaurant & Café QR Ordering and Management System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
