import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Karumbu Ledger — Sales & Customers",
  description: "Cane sugar sales and customer ledger administration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
