import { useState, useEffect, useMemo } from "react"
import type { Screen } from "../App"
import { useAuth, useMyAvatar } from "../lib/auth"
import {
  getTripDetails,
  addExpense,
  deleteExpense,
  parseExpenseSplit,
  cleanExpenseDescription,
  type DbTripMember,
} from "../lib/trips"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

const currencySymbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  TND: "د.ت",
}

const emojiCategoryMap: Record<string, string> = {
  "💳": "other",
  "🍜": "food",
  "🍸": "food",
  "🏨": "accommodation",
  "🚗": "transportation",
  "✈️": "transportation",
  "🎟": "activities",
  "🛕": "activities",
  "🏖": "activities",
  "🎯": "activities",
  "🛍": "shopping",
}

const categoryEmojiMap: Record<string, string> = {
  accommodation: "🏨",
  transportation: "🚗",
  food: "🍜",
  activities: "🎟",
  shopping: "🛍",
  other: "💳",
}

const crewColors = [
  "#3B41C8",
  "#06C4D4",
  "#FF6347",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
]

type Person = {
  id?: string
  name: string
  email?: string
  avatar: string
  color: string
}

type Expense = {
  id: string
  title: string
  amount: number
  currency: string
  paidBy: string
  paidById?: string
  splitWith: string[]
  emoji: string
  date: string
}

function calcBalances(expenses: Expense[], people: Person[]) {
  const net: Record<string, number> = {}
  for (const p of people) net[p.name] = 0
  for (const e of expenses) {
    if (e.splitWith.length === 0) continue
    const share = e.amount / e.splitWith.length
    if (net[e.paidBy] !== undefined) net[e.paidBy] += e.amount
    for (const p of e.splitWith) {
      if (net[p] !== undefined) net[p] -= share
    }
  }
  return net
}

function settleUp(
  balances: Record<string, number>,
): { from: string; to: string; amount: number }[] {
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < -0.01)
    .sort((a, b) => a[1] - b[1])
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0.01)
    .sort((a, b) => b[1] - a[1])
  const settlements: { from: string; to: string; amount: number }[] = []
  const d = debtors.map(([n, v]) => ({ name: n, amt: Math.abs(v) }))
  const c = creditors.map(([n, v]) => ({ name: n, amt: v }))
  let di = 0,
    ci = 0
  while (di < d.length && ci < c.length) {
    const pay = Math.min(d[di].amt, c[ci].amt)
    settlements.push({
      from: d[di].name,
      to: c[ci].name,
      amount: Math.round(pay * 100) / 100,
    })
    d[di].amt -= pay
    c[ci].amt -= pay
    if (d[di].amt < 0.01) di++
    if (c[ci].amt < 0.01) ci++
  }
  return settlements
}

type Tab = "expenses" | "balances" | "settle"

export default function SplitBillsScreen({ navigate, goBack }: Props) {
  const isDesktop = useIsDesktop()
  const { configured, user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Me"
  // Uploaded profile photo (refreshes app-wide on trypo:db_changed).
  const userAvatar = useMyAvatar()

  const [tripTitle, setTripTitle] = useState("My Trip")
  const [tripId, setTripId] = useState<string | null>(null)
  const [members, setMembers] = useState<DbTripMember[]>([])
  const [serverExpenses, setServerExpenses] = useState<any[]>([])
  const [tab, setTab] = useState<Tab>("expenses")
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newAmount, setNewAmount] = useState("")
  const [newEmoji, setNewEmoji] = useState("💳")
  const [pickedPayerId, setPickedPayerId] = useState<string | undefined>()
  const [splitSelection, setSplitSelection] = useState<string[]>([])
  const [settled, setSettled] = useState<number[]>([])
  const [formError, setFormError] = useState<string | null>(null)

  /** Reset the form and close the sheet — single path so it always closes. */
  const closeAddModal = () => {
    setShowAdd(false)
    setNewTitle("")
    setNewAmount("")
    setNewEmoji("💳")
    setPickedPayerId(undefined)
    setSplitSelection([])
    setFormError(null)
  }

  // Escape key closes the sheet (desktop/web + hardware keyboards).
  useEffect(() => {
    if (!showAdd) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAddModal()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showAdd])

  const loadData = async () => {
    try {
      const tripData = await getTripDetails()
      if (!tripData) return
      setTripTitle(tripData.title || "My Trip")
      setTripId(tripData.id)
      const crew = (tripData.members || []).filter((m) => m.status !== "pending")
      setMembers(crew)
      setServerExpenses((tripData.expenses as any[])?.slice() || [])
    } catch (e) {
      console.warn("Failed to load split bills", e)
    }
  }

  useEffect(() => {
    if (!configured || !user) return
    void loadData()
    const onDbChange = () => {
      void loadData()
    }
    window.addEventListener("trypo:db_changed", onDbChange)
    return () => window.removeEventListener("trypo:db_changed", onDbChange)
  }, [configured, user])

  const people: Person[] = useMemo(() => {
    const list: Person[] = members.map((m, i) => ({
      id: m.user_id,
      name: m.name || (m.email || "").split("@")[0] || "Traveler",
      email: m.email,
      avatar:
        m.avatar ||
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop",
      color: m.color || crewColors[i % crewColors.length],
    }))
    const hasCurrent = list.some((p) => p.name === userName || p.id === user?.id)
    if (!hasCurrent) {
      list.push({
        id: user?.id,
        name: userName,
        email: user?.email,
        avatar: userAvatar,
        color: crewColors[list.length % crewColors.length],
      })
    }
    return list
  }, [members, userName, user, userAvatar])

  const crewNames = people.map((p) => p.name)
  const personById = (id?: string) => people.find((p) => p.id === id || p.id === user?.id)

  const expenses: Expense[] = useMemo(() => {
    return serverExpenses.map((e) => {
      const parsed = e.split_with || parseExpenseSplit(e.description)
      const payer = personById(e.paid_by)
      const splitWith =
        parsed && parsed.length ? parsed : crewNames.length ? crewNames.slice() : [userName]
      return {
        id: e.id,
        title: cleanExpenseDescription(e.description) || "Expense",
        amount: Number(e.amount) || 0,
        currency: e.currency || "USD",
        paidBy: payer?.name || userName,
        paidById: e.paid_by,
        splitWith,
        emoji: categoryEmojiMap[e.category] || "💳",
        date: e.expense_date || "",
      }
    })
  }, [serverExpenses, people])

  const balances = calcBalances(expenses, people)
  const settlements = settleUp(balances)
  const totalSpend = expenses.reduce((s, e) => s + e.amount, 0)

  const money = (v: number, cur: string) =>
    `${currencySymbols[cur] || "$"}${v.toFixed(2)}`

  const handleAddExpense = async () => {
    const amount = parseFloat(newAmount)
    if (!newTitle.trim() || !amount || amount <= 0) {
      setFormError("Add a title and a valid amount.")
      return
    }
    if (!tripId) {
      setFormError("No active trip — open a trip first, then add the expense.")
      return
    }
    const splitWith = splitSelection.length ? splitSelection.slice() : crewNames.slice()
    if (splitWith.length === 0) {
      setFormError("Pick at least one person to split with.")
      return
    }
    try {
      await addExpense({
        tripId,
        title: newTitle.trim(),
        amount,
        category: emojiCategoryMap[newEmoji] || "other",
        currency: "USD",
        paidBy: pickedPayerId || user?.id,
        splitWith,
      })
      closeAddModal()
    } catch (e) {
      console.error("Failed to add expense", e)
      setFormError("Could not save the expense. Check your connection and retry.")
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm("Delete this shared expense?")) return
    try {
      await deleteExpense(id, tripId || undefined)
    } catch (e) {
      console.error("Failed to delete expense", e)
    }
  }

  const toggleSplit = (name: string) =>
    setSplitSelection((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    )

  const emojiOptions = ["💳", "🍜", "🏨", "🚗", "🎟", "🛕", "🏖", "🍸", "✈️", "🛍"]

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-4">
        <button
          onClick={() => goBack("collaborative")}
          className="w-9 h-9 rounded-full bg-white flex items-center justify-center"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M11 14L6 9l5-5"
              stroke="#0D0F2E"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 className="text-[20px] font-black text-navy">Split Bills 💸</h1>
          <p className="text-slate-400 text-[12px] truncate">
            {tripTitle} · {people.length} crew {people.length > 1 ? "members" : "member"}
          </p>
        </div>
        <button
          onClick={() => {
            setSplitSelection(crewNames.slice())
            setPickedPayerId(user?.id)
            setFormError(null)
            setShowAdd(true)
          }}
          className="ml-auto w-9 h-9 rounded-full flex items-center justify-center text-white text-xl flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #3B41C8, #06C4D4)" }}
        >
          +
        </button>
      </div>

      {/* Total strip */}
      <div className="px-5 md:px-8 mb-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { val: money(totalSpend, "USD"), lbl: "Total spent", color: "#3B41C8" },
            {
              val: people.length > 0 ? money(totalSpend / people.length, "USD") : "$0.00",
              lbl: "Per person",
              color: "#06C4D4",
            },
            { val: `${expenses.length}`, lbl: "Expenses", color: "#FF6347" },
          ].map((s) => (
            <div
              key={s.lbl}
              className="bg-white rounded-2xl py-3 flex flex-col items-center"
              style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
            >
              <span className="font-black text-[16px]" style={{ color: s.color }}>
                {s.val}
              </span>
              <span className="text-slate-400 text-[10px]">{s.lbl}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 md:px-8 mb-4">
        {(["expenses", "balances", "settle"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-full text-[12px] font-bold capitalize"
            style={{
              background: tab === t ? "#3B41C8" : "white",
              color: tab === t ? "white" : "#64748b",
              boxShadow:
                tab === t
                  ? "0 4px 12px rgba(59,65,200,0.3)"
                  : "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {t === "expenses"
              ? "📋 List"
              : t === "balances"
                ? "⚖️ Balances"
                : "✅ Settle Up"}
          </button>
        ))}
      </div>

      {/* EXPENSES TAB */}
      {tab === "expenses" && (
        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 pb-8" : "px-5 flex flex-col gap-2 pb-8"}>
          {expenses.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <span className="text-4xl mb-3 block">💸</span>
              <h3 className="text-navy font-bold text-[15px]">No split bills yet</h3>
              <p className="text-slate-400 text-[12px] mt-1">
                Tap + to add the first shared expense — the crew sees it instantly.
              </p>
            </div>
          ) : (
            expenses.map((e) => {
              const share = e.amount / e.splitWith.length
              const isOnMyTab = e.splitWith.includes(userName)
              return (
                <div
                  key={e.id}
                  className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3"
                  style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: "rgba(59,65,200,0.07)" }}
                  >
                    {e.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-navy font-bold text-[13px] truncate">
                      {e.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-slate-400 text-[10px]">
                        {e.paidBy} paid · split {e.splitWith.length} way
                        {e.splitWith.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    {/* Avatar cluster of who's included */}
                    <div className="flex -space-x-1.5 mt-1">
                      {e.splitWith.slice(0, 6).map((name) => {
                        const p = people.find((pp) => pp.name === name)
                        return (
                          <img
                            key={name}
                            src={p?.avatar || userAvatar}
                            alt={name}
                            title={name}
                            className="w-4 h-4 rounded-full object-cover ring-2 ring-white"
                            style={p ? { borderColor: p.color } : undefined}
                          />
                        )
                      })}
                      {e.splitWith.length > 6 && (
                        <span className="w-4 h-4 rounded-full bg-slate-200 text-[7px] font-black text-slate-500 flex items-center justify-center ring-2 ring-white">
                          +{e.splitWith.length - 6}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-navy font-black text-[15px]">
                      {money(e.amount, e.currency)}
                    </p>
                    <p className="text-slate-400 text-[10px]">
                      {isOnMyTab
                        ? `Your share ${money(share, e.currency)}`
                        : "Not on your tab"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteExpense(e.id)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-slate-300 hover:text-red-500 flex-shrink-0"
                    aria-label="Delete expense"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M1.5 2.5h9M4.5 1h3M2.5 2.5l.6 8h5.8l.6-8"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* BALANCES TAB */}
      {tab === "balances" && (
        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 md:px-8 pb-8" : "px-5 flex flex-col gap-3 pb-8"}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
            Who owes what · live with the crew
          </p>
          {people.map((person) => {
            const bal = balances[person.name] ?? 0
            const isOwed = bal > 0
            const isOwes = bal < 0
            const isMe = person.name === userName
            return (
              <div
                key={person.name}
                className="bg-white rounded-2xl p-4"
                style={{
                  boxShadow: isMe
                    ? "0 4px 16px rgba(59,65,200,0.14)"
                    : "0 2px 10px rgba(59,65,200,0.07)",
                  outline: isMe ? "2px solid rgba(59,65,200,0.25)" : "none",
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={person.avatar}
                    className="w-10 h-10 rounded-full object-cover"
                    alt=""
                    style={{ border: `2px solid ${person.color}` }}
                  />
                  <div className="flex-1">
                    <p className="text-navy font-black text-[15px]">
                      {person.name} {isMe && <span className="text-[10px] font-bold text-slate-400">(You)</span>}
                    </p>
                    <p
                      className="text-[11px] font-semibold"
                      style={{
                        color: isOwed
                          ? "#10b981"
                          : isOwes
                            ? "#ef4444"
                            : "#94a3b8",
                      }}
                    >
                      {isOwed
                        ? `Gets back ${money(bal, "USD")}`
                        : isOwes
                          ? `Owes ${money(Math.abs(bal), "USD")}`
                          : "All settled ✓"}
                    </p>
                  </div>
                  <div
                    className="px-3 py-1.5 rounded-full"
                    style={{
                      background: isOwed
                        ? "rgba(16,185,129,0.1)"
                        : isOwes
                          ? "rgba(239,68,68,0.1)"
                          : "rgba(148,163,184,0.1)",
                      color: isOwed
                        ? "#10b981"
                        : isOwes
                          ? "#ef4444"
                          : "#94a3b8",
                    }}
                  >
                    <span className="font-black text-[14px]">
                      {isOwed ? "+" : ""}
                      {bal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* SETTLE UP TAB */}
      {tab === "settle" && (
        <div className="px-5 md:px-8 pb-8">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            Minimum transfers to settle
          </p>
          {settlements.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="text-5xl mb-3">🎉</span>
              <p className="text-navy font-black text-[17px]">All settled!</p>
              <p className="text-slate-400 text-[13px] mt-1">
                No one owes anything
              </p>
            </div>
          ) : (
            <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-3"}>
              {settlements.map((s, i) => {
                const involvesMe = s.from === userName || s.to === userName
                return (
                  <div
                    key={i}
                    className="bg-white rounded-2xl p-4"
                    style={{
                      boxShadow: involvesMe
                        ? "0 4px 16px rgba(59,65,200,0.14)"
                        : "0 2px 10px rgba(59,65,200,0.07)",
                      outline: involvesMe ? "2px solid rgba(59,65,200,0.22)" : "none",
                      opacity: settled.includes(i) ? 0.4 : 1,
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex -space-x-2">
                        <img
                          src={people.find((p) => p.name === s.from)?.avatar || userAvatar}
                          className="w-9 h-9 rounded-full object-cover ring-2 ring-white"
                          alt=""
                          style={{ border: `2px solid ${people.find((p) => p.name === s.from)?.color || "#94a3b8"}` }}
                        />
                        <img
                          src={people.find((p) => p.name === s.to)?.avatar || userAvatar}
                          className="w-9 h-9 rounded-full object-cover ring-2 ring-white"
                          alt=""
                          style={{ border: `2px solid ${people.find((p) => p.name === s.to)?.color || "#94a3b8"}` }}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-navy font-bold text-[13px]">
                          <span style={{ color: people.find((p) => p.name === s.from)?.color || "#3B41C8" }}>
                            {s.from}
                          </span>
                          <span className="text-slate-400"> pays </span>
                          <span style={{ color: people.find((p) => p.name === s.to)?.color || "#06C4D4" }}>
                            {s.to}
                          </span>
                          {involvesMe && (
                            <span className="ml-1 text-[9px] font-black text-brand">· You</span>
                          )}
                        </p>
                      </div>
                      <p className="text-navy font-black text-[18px]">
                        {money(s.amount, "USD")}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Add expense modal */}
      {showAdd && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{
            zIndex: 100,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(4px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
          onClick={closeAddModal}
        >
          <div
            className="w-full max-h-[90%] overflow-y-auto bg-white rounded-t-[32px] p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-navy font-black text-[18px]">Add Expense</h3>
              <button
                onClick={closeAddModal}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 text-2xl leading-none flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all"
              >
                ×
              </button>
            </div>

            {/* What is it for */}
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              What was it for?
            </label>
            <input
              type="text"
              placeholder="Dinner at the medina…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-slate-50 rounded-2xl px-4 py-3 text-navy text-[14px] font-semibold outline-none my-2"
            />
            <input
              type="number"
              placeholder="Amount ($)"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="w-full bg-slate-50 rounded-2xl px-4 py-3 text-navy text-[14px] font-semibold outline-none mb-4"
            />

            {/* Emoji picker (drives category stored on the server) */}
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Category
            </label>
            <div className="flex gap-2 mt-2 mb-4 overflow-x-auto pb-1">
              {emojiOptions.map((e) => (
                <button
                  key={e}
                  onClick={() => setNewEmoji(e)}
                  className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{
                    background:
                      newEmoji === e
                        ? "rgba(59,65,200,0.12)"
                        : "rgba(241,245,249,1)",
                    outline: newEmoji === e ? "2px solid #3B41C8" : "none",
                  }}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* Who paid */}
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Who paid?
            </label>
            <div className="flex flex-wrap gap-2 mt-2 mb-4">
              {people.map((p) => {
                const selected = pickedPayerId
                  ? p.id === pickedPayerId
                  : p.name === userName
                return (
                  <button
                    key={p.name}
                    onClick={() => setPickedPayerId(p.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all"
                    style={{
                      background: selected ? "rgba(59,65,200,0.1)" : "white",
                      borderColor: selected ? "#3B41C8" : "#e2e8f0",
                      color: selected ? "#3B41C8" : "#64748b",
                    }}
                  >
                    <img
                      src={p.avatar}
                      className="w-4 h-4 rounded-full object-cover"
                      alt=""
                    />
                    {p.name}
                  </button>
                )
              })}
            </div>

            {/* Split with */}
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Split with
            </label>
            <div className="flex flex-wrap gap-2 mt-2 mb-2">
              <button
                onClick={() =>
                  setSplitSelection((prev) =>
                    prev.length === people.length ? [] : people.map((p) => p.name),
                  )
                }
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                  splitSelection.length === people.length ? "" : ""
                }`}
                style={{
                  background:
                    splitSelection.length === people.length ? "#10b981" : "white",
                  borderColor:
                    splitSelection.length === people.length ? "#10b981" : "#e2e8f0",
                  color: splitSelection.length === people.length ? "white" : "#64748b",
                }}
              >
                Everyone
              </button>
              {people.map((p) => {
                const selected = splitSelection.includes(p.name)
                return (
                  <button
                    key={p.name}
                    onClick={() => toggleSplit(p.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all"
                    style={{
                      background: selected ? "rgba(59,65,200,0.1)" : "white",
                      borderColor: selected ? "#3B41C8" : "#e2e8f0",
                      color: selected ? "#3B41C8" : "#64748b",
                    }}
                  >
                    <img
                      src={p.avatar}
                      className="w-4 h-4 rounded-full object-cover"
                      alt=""
                    />
                    {p.name}
                  </button>
                )
              })}
            </div>

            <p className="text-[10px] text-slate-400 mb-4">
              {splitSelection.length === 0
                ? "Pick at least one person — that comes to your whole tab."
                : `Splitting equally ${splitSelection.length} way${splitSelection.length > 1 ? "s" : ""} (${money((parseFloat(newAmount) || 0) / splitSelection.length, "USD")} each).`}
            </p>

            {formError && (
              <p className="text-[12px] font-bold text-red-500 mb-3">⚠️ {formError}</p>
            )}

            <button
              onClick={handleAddExpense}
              disabled={!newTitle.trim() || !newAmount || splitSelection.length === 0}
              className="w-full py-4 rounded-2xl text-white font-black text-[15px] disabled:opacity-40 transition-all"
              style={{
                background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                boxShadow: "0 8px 20px rgba(59,65,200,0.3)",
              }}
            >
              Add Expense
            </button>
          </div>
        </div>
      )}
    </div>
  )
}