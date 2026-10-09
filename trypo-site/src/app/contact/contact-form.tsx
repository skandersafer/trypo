"use client";

import { useState } from "react";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("Support");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`[Trypo contact] ${topic} — ${name}`);
    const body = encodeURIComponent(`${message}\n\n— ${name} (${email})`);
    window.location.href = `mailto:hello@trypo.app?subject=${subject}&body=${body}`;
    setSent(true);
  };

  const input =
    "w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#06C4D4]";

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
            Name
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={input}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
            Email
          </span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={input}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
          Topic
        </span>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-[#14163a] px-4 py-3 text-sm text-white outline-none"
        >
          {["Support", "Partnership", "TestFlight invite", "Feedback", "Other"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
          Message
        </span>
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          className={input}
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-2xl bg-gradient-to-r from-[#3B41C8] to-[#06C4D4] py-3.5 font-black"
      >
        Send message
      </button>
      {sent && (
        <p className="text-sm font-bold text-emerald-400">
          Opening your email app — talk soon.
        </p>
      )}
    </form>
  );
}
