import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing your use of Trypo.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="text-3xl font-black">Terms of Service</h1>
      <p className="mt-2 text-sm text-white/50">Last updated: October 2026</p>
      <div className="mt-6 space-y-5 text-sm leading-relaxed text-white/70">
        <section>
          <h2 className="font-black text-white">1. The service</h2>
          <p className="mt-1">
            Trypo provides group trip planning tools on web and mobile.
            Third-party bookings (hotels, flights) are governed by those
            providers’ own terms.
          </p>
        </section>
        <section>
          <h2 className="font-black text-white">2. Your content</h2>
          <p className="mt-1">
            You keep ownership of trip content. You grant Trypo the license
            needed to store, sync and display it to trip members you invite.
          </p>
        </section>
        <section>
          <h2 className="font-black text-white">3. Acceptable use</h2>
          <p className="mt-1">
            No unlawful content, no abuse of other users, no attempts to disrupt
            the service. Accounts violating this may be suspended.
          </p>
        </section>
        <section>
          <h2 className="font-black text-white">4. Availability</h2>
          <p className="mt-1">
            The service is provided “as is”. We aim for high availability but do
            not guarantee uninterrupted access.
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
