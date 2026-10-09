import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Trypo collects, uses and protects your data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="text-3xl font-black">Privacy Policy</h1>
      <p className="mt-2 text-sm text-white/50">Last updated: October 2026</p>
      <div className="mt-6 space-y-5 text-sm leading-relaxed text-white/70">
        <section>
          <h2 className="font-black text-white">1. Data we collect</h2>
          <p className="mt-1">
            Account data (email, name), trip content you create (destinations,
            bookings, notes), and — only with your permission — location data
            for live crew sharing.
          </p>
        </section>
        <section>
          <h2 className="font-black text-white">2. How we use it</h2>
          <p className="mt-1">
            To run the service: syncing trips across your devices, showing crew
            positions you explicitly share, and improving the product. We never
            sell your data.
          </p>
        </section>
        <section>
          <h2 className="font-black text-white">3. Sharing</h2>
          <p className="mt-1">
            Trip content is visible to members of that trip. Public community
            trips are visible to everyone. Infrastructure providers (hosting,
            database, auth) process data on our behalf.
          </p>
        </section>
        <section>
          <h2 className="font-black text-white">4. Your rights</h2>
          <p className="mt-1">
            Access, correct or delete your data anytime from the app settings or
            by writing to hello@trypo.app.
          </p>
        </section>
        <section>
          <h2 className="font-black text-white">5. Contact</h2>
          <p className="mt-1">Questions: hello@trypo.app</p>
        </section>
      </div>
    </article>
  );
}
