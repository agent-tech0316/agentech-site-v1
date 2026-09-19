import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, Oxanium } from "next/font/google";
import { AgentCursor } from "@/components/agent-cursor";
import "./globals.css";
const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });
const oxanium = Oxanium({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-brand" });
export const metadata: Metadata = {
  metadataBase: new URL("https://navi-app-download.wesleyfan2015.chatgpt.site"),
  title: "Download Navi | Agentech",
  description: "Download Navi for Windows. The macOS app is coming soon.",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://www.agent-tech.ai/download/app" },
};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en" data-theme="dark" className={`${manrope.variable} ${plexMono.variable} ${oxanium.variable}`}><body className="font-interface antialiased"><AgentCursor /><main>{children}</main></body></html>;
}
