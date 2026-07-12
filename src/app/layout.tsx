import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PrintFlow", template: "%s | PrintFlow" },
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
