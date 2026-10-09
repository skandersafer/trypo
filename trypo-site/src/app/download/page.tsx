import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Get Trypo on web, Android and iOS. Use the web app instantly or install the mobile app for GPS sharing and offline access.",
  alternates: { canonical: "/download" },
};

const APP_URL = "https://trypo-app.vercel.app";

export default function DownloadPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-3xl font-black md:text-4xl">Get Trypo</h1>
      <p className="mt-3 text-white/60">
        Start in the browser now, then take the trip in your pocket.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-black">🌐 Web app</h2>
          <p className="mt-2 text-sm text-white/60">
            Full planner in any browser — no install. Best for organizing before
            the trip.
          </p>
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block rounded-2xl bg-gradient-to-r from-[#3B41C8] to-[#06C4D4] px-6 py-3 text-center font-black"
          >
            Open app.trypo
          </a>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-black">📱 Mobile app</h2>
          <p className="mt-2 text-sm text-white/60">
            Native shell with live GPS sharing, offline bookings and deep links
            into your trips.
          </p>
          <div className="mt-4 space-y-2">
            <a
              href="#android"
              className="block rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-center font-bold hover:bg-white/10"
            >
              Download for Android (APK)
            </a>
            <a
              href="/contact"
              className="block rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-center font-bold hover:bg-white/10"
            >
              Request iOS TestFlight invite
            </a>
          </div>
        </section>
      </div>

      <section id="android" className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="font-black">Android direct download</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-white/65">
          <li>Download the latest APK from the releases page.</li>
          <li>Open it on your phone and allow “install unknown apps” once.</li>
          <li>Sign in — your trips sync from the web app automatically.</li>
        </ol>
        <p className="mt-3 text-xs text-white/40">
          Store listings (Google Play / App Store) are coming soon — join the
          TestFlight list via the contact page to get notified.
        </p>
      </section>
    </article>
  );
}
