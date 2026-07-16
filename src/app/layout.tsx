import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PrintX", template: "%s | PrintX" },
  description: "Administration for a sublimation printing business",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
