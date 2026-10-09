import type { Metadata } from "next";
import Link from "next/link";

const APP_URL = "https://trypo-app.vercel.app";

export const metadata: Metadata = {
  title: "Plan group trips together",
  description:
    "Trypo is the group trip planner: shared itineraries, stays, transport, bookings, budget and live crew tracking — on web and mobile.",
  alternates: { canonical: "/" },
};

const features = [
  {
    icon: "🗺️",
    title: "Shared itinerary",
    text: "Build the route stop by stop. Everyone sees the same plan, dates and days per destination.",
  },
  {
    icon: "🏨",
    title: "Stays & bookings",
    text: "Compare hotels, save stays, add bookings manually and keep confirmations in one place.",
  },
  {
    icon: "🚌",
    title: "Transport legs",
    text: "Flights, trains, buses and ferries between stops — with prices, times and references.",
  },
  {
    icon: "💰",
    title: "Budget & split bills",
    text: "Track spending per category and split costs with the crew without spreadsheets.",
  },
  {
    icon: "📍",
    title: "Live crew tracking",
    text: "Share positions in real time and find each other on the map during the trip.",
  },
  {
    icon: "💎",
    title: "Hidden gems",
    text: "Atlas Obscura, Wikivoyage and OpenStreetMap secrets for every destination.",
  },
];

const faqs = [
  {
    q: "Is Trypo free?",
    a: "Yes — planning trips, sharing itineraries and tracking the crew are free. Booking providers (hotels, flights) charge their own prices.",
  },
  {
    q: "Do I need the mobile app?",
    a: "No. The web app works in any browser. The mobile app adds GPS sharing, offline access and push-style deep links for trips.",
  },
  {
    q: "How do I invite friends to my trip?",
    a: "Create a trip, open the share sheet and send the invite code or link. Guests can join from web or mobile.",
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 pb-14 pt-12 md:pt-16">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="text-center md:text-left">
            <p className="mb-4 w-fit rounded-full bg-[#7c3aed] px-3.5 py-1.5 text-xs font-black text-white max-md:mx-auto">
              Group trip planner + crew tracker
            </p>
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
              Plan the trip.
              <br />
              <span className="bg-gradient-to-r from-[#7c3aed] to-[#06C4D4] bg-clip-text text-transparent">
                Track every moment.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/65 md:mx-0 md:text-lg">
              Trypo is a free{" "}
              <Link href="/features" className="font-bold text-[#06C4D4] hover:underline">
                group trip planner
              </Link>{" "}
              with a{" "}
              <Link href="/features" className="font-bold text-[#06C4D4] hover:underline">
                live crew tracker
              </Link>
              . Map your route stop by stop, keep stays, transport and budget in
              one shared itinerary, and turn the journey into{" "}
              <Link href="/features" className="font-bold text-[#06C4D4] hover:underline">
                trip memories
              </Link>
              .
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row md:justify-start justify-center">
              <Link
                href="/download"
                className="w-full rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-center font-bold hover:bg-white/10 sm:w-auto"
              >
                Download the app
              </Link>
              <a
                href={APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded-full px-7 py-3.5 text-center font-bold text-white/90 hover:text-white sm:w-auto"
              >
                Start on web →
              </a>
            </div>
          </div>

          {/* Phone mockup */}
          <div className="relative mx-auto hidden w-[300px] sm:block" aria-hidden="true">
            <div className="relative overflow-hidden rounded-[2.5rem] border-[6px] border-black/80 bg-[#d7efe6] shadow-2xl shadow-black/50">
              <div className="flex items-center justify-between bg-black/85 px-5 py-2 text-[10px] font-bold text-white">
                <span>9:41</span>
                <span className="h-4 w-20 rounded-full bg-black" />
                <span>●●●</span>
              </div>
              <div className="relative h-[420px] overflow-hidden">
                <div
                  className="absolute inset-0 opacity-70"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 46%, #bfe3d4 46% 54%, transparent 54%)," +
                      "linear-gradient(0deg, transparent 30%, #bfe3d4 30% 36%, transparent 36%)," +
                      "linear-gradient(115deg, transparent 60%, #c8e8da 60% 68%, transparent 68%)," +
                      "radial-gradient(120px 90px at 70% 30%, #cdeeda, transparent 70%)," +
                      "linear-gradient(180deg, #dff5ec, #c9e9db)",
                  }}
                />
                <span className="absolute left-8 top-10 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-600 shadow">
                  Tunis
                </span>
                <span className="absolute right-6 top-24 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-600 shadow">
                  Sousse
                </span>
                <span className="absolute bottom-24 left-10 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-600 shadow">
                  Marseille
                </span>
                <span className="absolute left-[38%] top-[30%] flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-indigo-500 to-cyan-400 text-sm shadow-lg">
                  🧑‍🤝‍🧑
                </span>
                <span className="absolute left-[60%] top-[48%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-amber-400 to-rose-400 text-sm shadow-lg">
                  🙂
                </span>
                <span className="absolute bottom-[38%] left-[30%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-emerald-400 to-teal-500 text-sm shadow-lg">
                  😎
                </span>
                <div className="absolute inset-x-3 bottom-3 space-y-2">
                  <div className="rounded-2xl bg-white/95 p-2.5 shadow-lg">
                    <p className="text-[11px] font-black text-slate-800">Sousse Medina Walk</p>
                    <p className="text-[10px] text-slate-500">Today · 2h · 4 going</p>
                  </div>
                  <div className="flex gap-1.5 rounded-2xl bg-[#0a0c2e]/90 p-2 text-center text-[9px] font-bold text-white/70">
                    {["Plan", "Crew", "Budget", "Journal"].map((t, i) => (
                      <span key={t} className={`flex-1 rounded-lg py-1.5 ${i === 3 ? "bg-white/15 text-white" : ""}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating photo card */}
            <div className="absolute -left-20 top-16 w-28 -rotate-12 overflow-hidden rounded-xl border-2 border-white bg-white shadow-xl">
              <div className="flex h-24 items-center justify-center bg-gradient-to-br from-amber-300 via-rose-300 to-indigo-400 text-3xl">
                🏝️
              </div>
              <p className="px-2 py-1.5 text-[9px] font-bold text-slate-600">Djerba laughed too much</p>
            </div>

            {/* Floating comment card */}
            <div className="absolute -right-16 top-56 w-52 rotate-2 rounded-2xl bg-white p-3 shadow-xl">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 text-xs">
                  🙂
                </span>
                <p className="text-[10px] font-black text-slate-800">
                  Amine <span className="font-normal text-slate-400">· 2h</span>
                </p>
                <span className="ml-auto text-xs text-rose-400">♥</span>
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-slate-600">
                Rented scooters and explored Sidi Bou — absolutely amazing!!!
              </p>
            </div>
          </div>
        </div>

        <dl className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-4 text-center">
          {[
            ["1", "shared itinerary"],
            ["2", "web + mobile"],
            ["0 €", "to start"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5">
              <dt className="sr-only">{l}</dt>
              <dd className="text-2xl font-black md:text-3xl">{v}</dd>
              <dd className="mt-1 text-xs text-white/55">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Social proof marquee */}
      <section className="overflow-hidden border-y border-white/10 bg-white/[0.02] py-5" aria-label="Popular destinations">
        <div className="animate-marquee flex w-max gap-3">
          {[...Array(2)].flatMap((_, k) =>
            ["Paris 🗼", "Bali 🏝️", "Tokyo 🍣", "Marrakech 🌴", "Rome 🍕", "Bangkok 🛕", "Barcelona ☀️", "Djerba 🏖️", "New York 🗽", "Santorini 💙"].map((d) => (
              <span
                key={`${k}-${d}`}
                className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/70"
              >
                {d}
              </span>
            )),
          )}
        </div>
        <p className="mt-3 text-center text-xs text-white/40">
          Planned on Trypo by group travelers everywhere
        </p>
      </section>

      {/* Tracker band */}
      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 py-14 md:grid-cols-2">
          <div>
            <p className="w-fit rounded-full bg-[#7c3aed]/20 px-3 py-1 text-xs font-black text-[#b79bff]">
              Live tracker & journal
            </p>
            <h2 className="mt-3 text-2xl font-black md:text-3xl">
              See the crew. Keep the memories.
            </h2>
            <p className="mt-3 leading-relaxed text-white/60">
              Share real-time positions on the trip map, drop notes and photos
              per stop, and look back at the whole journey as a journal —
              day by day, city by city.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-white/75">
              {[
                "Real-time GPS pins for every crew member",
                "Notes, photos and stays attached to each destination",
                "Memories timeline to relive the trip later",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-[11px] font-black text-emerald-300">
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3" aria-hidden="true">
            {[
              ["📍", "Live map", "Crew pins update in real time"],
              ["📝", "Stop journals", "Notes + photos per city"],
              ["🏨", "Stays", "Manual or booked, all synced"],
              ["📸", "Memories", "Timeline of the whole trip"],
            ].map(([icon, t, d]) => (
              <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <span className="text-2xl">{icon}</span>
                <p className="mt-2 text-sm font-black">{t}</p>
                <p className="mt-1 text-xs text-white/55">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-2xl font-black md:text-3xl">Everything a group trip needs</h2>
          <p className="mt-2 text-white/60">
            From the first idea to the last receipt — in one place.
          </p>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            <li className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#3B41C8]/25 to-transparent p-6 md:col-span-2 md:row-span-2">
              <span className="text-3xl" aria-hidden="true">🗺️</span>
              <h3 className="mt-3 text-xl font-black">Shared itinerary</h3>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-white/60">
                Build the route stop by stop. Everyone sees the same plan, dates
                and days per destination — changes sync instantly to the whole crew.
              </p>
              <div className="mt-5 space-y-2" aria-hidden="true">
                {[
                  ["France", "Sep 13 – Sep 15 · 2d", "from-[#3B41C8] to-[#06C4D4]"],
                  ["Marseille", "Sep 16 – Sep 19 · 3d", "from-[#7c3aed] to-[#ec4899]"],
                  ["Barcelona", "Sep 20 – Sep 23 · 3d", "from-[#06C4D4] to-[#10b981]"],
                ].map(([city, dates, grad]) => (
                  <div key={city} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-sm ${grad}`}>
                      📍
                    </span>
                    <div>
                      <p className="text-sm font-black">{city}</p>
                      <p className="text-[11px] text-white/50">{dates}</p>
                    </div>
                  </div>
                ))}
              </div>
            </li>
            <li className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <span className="text-3xl" aria-hidden="true">📍</span>
              <h3 className="mt-3 font-black">Live crew tracking</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">
                Real-time GPS pins so nobody gets lost on day one.
              </p>
            </li>
            <li className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <span className="text-3xl" aria-hidden="true">💰</span>
              <h3 className="mt-3 font-black">Budget & split bills</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">
                Track spending and split costs fairly — no spreadsheets.
              </p>
            </li>
            {features.slice(1).map((f) => (
              <li
                key={f.title}
                className="rounded-3xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/25"
              >
                <span className="text-2xl" aria-hidden="true">{f.icon}</span>
                <h3 className="mt-3 font-black">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/60">{f.text}</p>
              </li>
            ))}
          </ul>
          <Link
            href="/features"
            className="mt-6 inline-block font-bold text-[#06C4D4] hover:underline"
          >
            Explore all features →
          </Link>
        </div>
      </section>

      {/* Showcase */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <p className="w-fit rounded-full bg-[#06C4D4]/15 px-3 py-1 text-xs font-black text-[#06C4D4]">
              Web + mobile, in sync
            </p>
            <h2 className="mt-3 text-2xl font-black md:text-3xl">
              Plan on desktop. Travel with your phone.
            </h2>
            <p className="mt-3 leading-relaxed text-white/60">
              Organize the big picture in the web app, then take the trip in
              your pocket: bookings, tickets and the crew map work on the road —
              even with a shaky connection.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <a
                href={APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-gradient-to-r from-[#3B41C8] to-[#06C4D4] px-6 py-3 text-center font-black"
              >
                Try the web app
              </a>
              <Link
                href="/download"
                className="rounded-2xl border border-white/15 px-6 py-3 text-center font-bold text-white/80"
              >
                Get mobile
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-black/30 p-3 shadow-2xl" aria-hidden="true">
            <div className="flex gap-1.5 px-2 pb-2.5 pt-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            </div>
            <div className="space-y-2 rounded-2xl bg-[#14163a] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black">Summer Tribe Trip</p>
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black text-emerald-300">
                  3 stops · 8 days
                </span>
              </div>
              {[
                ["🚌", "Bus to Marseille", "Ref pp55 · 5h", "€22"],
                ["🏨", "Novotel Marseille", "Sep 16 → Sep 19", "€180"],
                ["🎟️", "Calanques boat tour", "Sep 17 · 4 going", "€35"],
              ].map(([icon, t, d, p]) => (
                <div key={t} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
                  <span className="text-lg">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{t}</p>
                    <p className="text-[10px] text-white/45">{d}</p>
                  </div>
                  <span className="text-xs font-black">{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-center text-2xl font-black md:text-3xl">Crews love Trypo</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["Finally one plan for 8 people. No more 400-message group chats.", "Salma", "Tunis → Djerba, 8 friends"],
              ["The live map saved our first evening — we found everyone in minutes.", "Yassine", "Barcelona, 5 friends"],
              ["Budget split without awkward math at the restaurant. Magic.", "Léa", "Italy road trip, 4 friends"],
            ].map(([quote, name, trip]) => (
              <figure key={name} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="text-amber-300" aria-label="5 out of 5 stars">★★★★★</div>
                <blockquote className="mt-3 text-sm leading-relaxed text-white/75">“{quote}”</blockquote>
                <figcaption className="mt-4">
                  <p className="text-sm font-black">{name}</p>
                  <p className="text-xs text-white/45">{trip}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-center text-2xl font-black md:text-3xl">Simple pricing</h2>
        <p className="mt-2 text-center text-white/60">Start free. Upgrade only if you need more.</p>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h3 className="font-black">Free</h3>
            <p className="mt-1 text-3xl font-black">0 €</p>
            <ul className="mt-4 space-y-2 text-sm text-white/65">
              {["Unlimited trips & stops", "Shared itinerary + notes", "Bookings & budget", "Live crew map"].map((t) => (
                <li key={t} className="flex gap-2"><span className="text-emerald-300">✓</span>{t}</li>
              ))}
            </ul>
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 block rounded-2xl border border-white/20 py-3 text-center font-bold hover:bg-white/10"
            >
              Start free
            </a>
          </div>
          <div className="relative rounded-3xl border border-[#7c3aed]/50 bg-gradient-to-b from-[#7c3aed]/20 to-transparent p-6">
            <span className="absolute -top-3 left-6 rounded-full bg-[#7c3aed] px-3 py-1 text-[11px] font-black">
              Coming soon
            </span>
            <h3 className="font-black">Pro crew</h3>
            <p className="mt-1 text-3xl font-black">3 €<span className="text-sm font-normal text-white/50">/mo</span></p>
            <ul className="mt-4 space-y-2 text-sm text-white/65">
              {["Offline maps & tickets", "Priority sync + backups", "Custom trip themes", "Early new features"].map((t) => (
                <li key={t} className="flex gap-2"><span className="text-[#b79bff]">✓</span>{t}</li>
              ))}
            </ul>
            <Link
              href="/contact"
              className="mt-6 block rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#06C4D4] py-3 text-center font-black"
            >
              Join the waitlist
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-black md:text-3xl">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["1", "Create your trip", "Add destinations, dates and invite the crew with a code."],
            ["2", "Plan together", "Stays, transport, activities and notes — everyone contributes."],
            ["3", "Travel in sync", "Live positions, bookings and budget stay updated on the road."],
          ].map(([n, t, d]) => (
            <li key={n} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-[#3B41C8] to-[#06C4D4] font-black">
                {n}
              </span>
              <h3 className="mt-3 font-black">{t}</h3>
              <p className="mt-1.5 text-sm text-white/60">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ */}
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <h2 className="text-2xl font-black md:text-3xl">Questions, answered</h2>
          <div className="mt-6 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-white/10 bg-white/5 px-5 py-4"
              >
                <summary className="cursor-pointer font-bold">{f.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-10 rounded-2xl bg-gradient-to-r from-[#3B41C8] to-[#06C4D4] p-8 text-center">
            <h2 className="text-2xl font-black">Ready for your next tribe trip?</h2>
            <p className="mt-2 text-white/80">Free to start · Web + mobile · 2 minutes setup</p>
            <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-white px-6 py-3 font-black text-[#0a0c2e]"
              >
                Open the web app
              </a>
              <Link
                href="/download"
                className="rounded-2xl border border-white/40 px-6 py-3 font-bold"
              >
                Download mobile
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
