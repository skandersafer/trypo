import type { Metadata } from "next";
import ContactForm from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact the Trypo team — support, partnerships, TestFlight invites and feedback.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="text-3xl font-black md:text-4xl">Contact us</h1>
      <p className="mt-3 text-white/60">
        Support, partnerships, TestFlight invites or feedback — we read
        everything.
      </p>
      <ContactForm />
      <p className="mt-6 text-sm text-white/50">
        Prefer email? Write to{" "}
        <a href="mailto:hello@trypo.app" className="font-bold text-[#06C4D4]">
          hello@trypo.app
        </a>
      </p>
    </article>
  );
}
