import type { Metadata } from "next";
import { Fira_Code, VT323 } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fira-code",
  display: "swap",
});

const vt323 = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-vt323",
  display: "swap",
});

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
    <html lang="en" className={`${firaCode.variable} ${vt323.variable}`}>
      <body className="gc-scanlines gc-vignette animate-flicker min-h-screen">
        <div className="gc-scan-line" />
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
