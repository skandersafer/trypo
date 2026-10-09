import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://trypo.app";
const APP_URL = "https://trypo-app.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Trypo — Plan group trips together",
    template: "%s · Trypo",
  },
  description:
    "Trypo is the group trip planner: shared itineraries, stays, transport, bookings, budget and live crew tracking — on web and mobile.",
  keywords: [
    "group trip planner",
    "itinerary planner",
    "travel app",
    "shared trips",
    "crew tracker",
    "trip budget",
  ],
  authors: [{ name: "Trypo" }],
  creator: "Trypo",
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Trypo",
    title: "Trypo — Plan group trips together",
    description:
      "Shared itineraries, stays, transport, bookings, budget and live crew tracking — on web and mobile.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trypo — Plan group trips together",
    description:
      "Shared itineraries, stays, transport, bookings, budget and live crew tracking — on web and mobile.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Trypo",
      url: SITE_URL,
    },
    {
      "@type": "WebSite",
      name: "Trypo",
      url: SITE_URL,
    },
    {
      "@type": "MobileApplication",
      name: "Trypo",
      applicationCategory: "TravelApplication",
      operatingSystem: "Android, iOS",
      url: SITE_URL,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0c2e]/90 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
            <Link href="/" className="text-lg font-black tracking-tight">
              Trypo
            </Link>
            <div className="flex items-center gap-1 text-sm font-semibold text-white/70">
              <Link href="/features" className="rounded-lg px-3 py-2 hover:text-white">
                Features
              </Link>
              <Link href="/download" className="rounded-lg px-3 py-2 hover:text-white">
                Get the app
              </Link>
              <Link href="/contact" className="rounded-lg px-3 py-2 hover:text-white">
                Contact
              </Link>
            </div>
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-gradient-to-r from-[#3B41C8] to-[#06C4D4] px-4 py-2 text-sm font-bold"
            >
              Open web app
            </a>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-8 text-sm text-white/60 md:flex-row md:items-center md:justify-between">
            <p className="font-bold text-white">Trypo — plan group trips together.</p>
            <div className="flex flex-wrap gap-4">
              <Link href="/features" className="hover:text-white">Features</Link>
              <Link href="/download" className="hover:text-white">Download</Link>
              <Link href="/contact" className="hover:text-white">Contact</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
