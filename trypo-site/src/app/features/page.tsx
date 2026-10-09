import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Shared itineraries, stays, transport, bookings, budget, live crew tracking and hidden gems — everything Trypo does for group trips.",
  alternates: { canonical: "/features" },
};

const groups = [
  {
    title: "Plan",
    items: [
      ["Shared route builder", "Add destinations with dates and stay length. The whole crew sees the same timeline."],
      ["Per-destination hub", "Notes, manual stays, booking links, hotels and hidden gems for every stop."],
      ["Activities & packing", "Day-by-day activities, packing lists and trip memories."],
    ],
  },
  {
    title: "Book",
    items: [
      ["Stay comparison", "Hotels, hostels and private stays with live prices and ratings."],
      ["Transport legs", "Flights, trains, buses and ferries between stops, with tickets and references."],
      ["Booking vault", "Confirmations, PDFs and references stored per trip, online and offline."],
    ],
  },
  {
    title: "Travel",
    items: [
      ["Live crew map", "Real-time GPS sharing so nobody gets lost on day one."],
      ["Budget & split bills", "Expenses per category, split fairly across the group."],
      ["Community trips", "Publish trips, get inspired and let others join."],
    ],
  },
];

export default function FeaturesPage() {
  return (
    <article className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="text-3xl font-black md:text-4xl">Features</h1>
      <p className="mt-3 max-w-2xl text-white/60">
        Everything a group trip needs, from the first idea to the last receipt.
      </p>
      {groups.map((g) => (
        <section key={g.title} className="mt-10">
          <h2 className="text-xl font-black text-[#06C4D4]">{g.title}</h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {g.items.map(([t, d]) => (
              <li key={t} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <h3 className="font-black">{t}</h3>
                <p className="mt-1.5 text-sm text-white/60">{d}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="mt-10 flex gap-3">
        <Link
          href="/download"
          className="rounded-2xl bg-gradient-to-r from-[#3B41C8] to-[#06C4D4] px-6 py-3 font-black"
        >
          Get Trypo
        </Link>
        <Link
          href="/contact"
          className="rounded-2xl border border-white/15 px-6 py-3 font-bold text-white/80"
        >
          Talk to us
        </Link>
      </div>
    </article>
  );
}
