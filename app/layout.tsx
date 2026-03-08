import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE GOLDCHAIN — Ghana Gold Board",
  description:
    "Blockchain gold supply chain traceability platform for Ghana's Gold Board under the Ghana Gold Board Act 2025 (Act 1140)",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="gc-scanlines gc-vignette animate-flicker min-h-screen">
        <div className="gc-scan-line" />
        {children}
      </body>
    </html>
  );
}
