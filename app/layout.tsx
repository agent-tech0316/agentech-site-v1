import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, Oxanium } from "next/font/google";
import Script from "next/script";
import { AgentCursor } from "@/components/agent-cursor";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { canonicalSiteUrl, gaMeasurementId } from "@/lib/site-config";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans"
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

const oxanium = Oxanium({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-brand"
});

export const metadata: Metadata = {
  metadataBase: new URL(canonicalSiteUrl),
  title: {
    default: "Agentech",
    template: "%s | Agentech"
  },
  description: "Agentech is an AI-native robotics and intelligent systems company.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Agentech",
    description: "Agentech is an AI-native robotics and intelligent systems company.",
    url: canonicalSiteUrl,
    siteName: "Agentech",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Agentech",
    description: "Agentech is an AI-native robotics and intelligent systems company."
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${plexMono.variable} ${oxanium.variable}`}
    >
      <body className="font-interface antialiased">
        <Script
          id="agentech-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
        />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaMeasurementId}', {
              page_path: window.location.pathname,
            });
          `}
        </Script>
        <div className="relative flex min-h-screen flex-col">
          <AgentCursor />
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
