import { useState, useEffect } from "react"
import type { Screen } from "../App"
import { useAuth } from "../lib/auth"
import { getTripDetails, addExpense, updateTripBudget } from "../lib/trips"
import { useSettings, formatMoney, convertToDisplayCurrency } from "../lib/settings"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  navigate: (s: Screen) => void
  goBack: (fallback?: Screen) => void
}

const defaultCategories = [
  { icon: "🏨", label: "Accommodation", color: "#3B41C8", key: "accommodation" as const },
  { icon: "✈️", label: "Transportation", color: "#06C4D4", key: "transportation" as const },
  { icon: "🍜", label: "Food", color: "#FF6347", key: "food" as const },
  { icon: "🎯", label: "Activities", color: "#059669", key: "activities" as const },
  { icon: "🛍", label: "Shopping", color: "#d97706", key: "shopping" as const },
]

export default function BudgetScreen({ navigate, goBack }: Props) {
  const { settings } = useSettings()
  const isDesktop = useIsDesktop()
  const displayCurrency = settings.currency
  const [tripTitle, setTripTitle] = useState<string>("My Trip")
  const [totalBudget, setTotalBudget] = useState<number>(0)
  const [expensesList, setExpensesList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Add Expense modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newDesc, setNewDesc] = useState("")
  const [newAmount, setNewAmount] = useState("")
  const [newCategory, setNewCategory] = useState<any>("food")
  const [adding, setAdding] = useState(false)

  // Edit total budget state
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [budgetInput, setBudgetInput] = useState("")
  const [savingBudget, setSavingBudget] = useState(false)

  const loadBudget = async () => {
    try {
      setLoading(true)
      const tripData = await getTripDetails()
      if (!tripData) {
        setTotalBudget(0)
        setExpensesList([])
        return
      }
      setTripTitle(tripData.title || "My Trip")
      setTotalBudget(Number(tripData.total_budget) || 1800)
      const items = tripData.expenses || []
      const mappedExpenses = items.map((e: any) => ({
        id: e.id,
        name: e.description || e.title || e.name || "Expense",
        amountNum: convertToDisplayCurrency(Number(e.amount) || Number(e.cost) || 0, e.currency || "EUR", displayCurrency),
        amount: formatMoney(Number(e.amount) || 0, { from: e.currency || "EUR", display: displayCurrency }),
        cat: e.category === "accommodation" ? "🏨" : e.category === "transportation" ? "✈️" : e.category === "food" ? "🍜" : e.category === "activities" ? "🎯" : e.category === "shopping" ? "🛍" : "💸",
        categoryLabel: e.category ? e.category.charAt(0).toUpperCase() + e.category.slice(1) : "Other",
        date: e.expense_date ? new Date(e.expense_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Today",
      }))
      const bookingCosts = (tripData.bookings || [])
        .filter((b: any) => Number(b.amount) > 0)
        .map((b: any) => ({
          id: `booking-${b.id}`,
          name: b.notes || b.provider || "Booking",
          amountNum: convertToDisplayCurrency(Number(b.amount), b.currency || "EUR", displayCurrency),
          amount: formatMoney(Number(b.amount), { from: b.currency || "EUR", display: displayCurrency }),
          cat: b.booking_type === "stay" ? "🏨" : b.booking_type === "activity" ? "🎯" : "✈️",
          categoryLabel: b.booking_type === "stay" ? "Accommodation" : b.booking_type === "activity" ? "Activities" : "Transportation",
          date: b.starts_at ? new Date(b.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Planned",
        }))
      const bookedItineraryIds = new Set((tripData.bookings || []).map((b: any) => b.itinerary_item_id).filter(Boolean))
      const itineraryCosts = (tripData.itinerary_items || [])
        .filter((item: any) => Number(item.estimated_cost) > 0 && !bookedItineraryIds.has(item.id))
        .map((item: any) => ({
          id: `itinerary-${item.id}`,
          name: item.title,
          amountNum: convertToDisplayCurrency(Number(item.estimated_cost), item.currency || "EUR", displayCurrency),
          amount: formatMoney(Number(item.estimated_cost), { from: item.currency || "EUR", display: displayCurrency }),
          cat: item.item_type === "stay" ? "🏨" : item.item_type === "activity" ? "🎯" : "✈️",
          categoryLabel: item.item_type === "stay" ? "Accommodation" : item.item_type === "activity" ? "Activities" : "Transportation",
          date: item.starts_at ? new Date(item.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Planned",
        }))
      setExpensesList([...mappedExpenses, ...bookingCosts, ...itineraryCosts])
    } catch {
      setTotalBudget(0)
      setExpensesList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBudget()
    const onDbChange = () => {
      void loadBudget()
    }
    const onSettings = () => {
      void loadBudget()
    }
    window.addEventListener("trypo:db_changed", onDbChange)
    window.addEventListener("trypo:settings_changed", onSettings)
    return () => {
      window.removeEventListener("trypo:db_changed", onDbChange)
      window.removeEventListener("trypo:settings_changed", onSettings)
    }
  }, [displayCurrency])

  const handleAddExpense = async () => {
    if (!newDesc.trim() || !newAmount.trim()) return
    const amt = parseFloat(newAmount)
    if (isNaN(amt) || amt <= 0) return
    setAdding(true)
    try {
      await addExpense({
        category: newCategory,
        description: newDesc.trim(),
        amount: amt,
        currency: displayCurrency,
      })
      setShowAddModal(false)
      setNewDesc("")
      setNewAmount("")
    } catch {
      // Error handling
    } finally {
      setAdding(false)
    }
  }

  const openBudgetModal = () => {
    setBudgetInput(totalBudget > 0 ? String(Math.round(totalBudget)) : "")
    setShowBudgetModal(true)
  }

  const handleSaveBudget = async () => {
    const amt = parseFloat(budgetInput)
    if (isNaN(amt) || amt < 0) return
    setSavingBudget(true)
    try {
      await updateTripBudget(Math.round(amt))
      setShowBudgetModal(false)
      await loadBudget()
    } catch {
      // Error handling
    } finally {
      setSavingBudget(false)
    }
  }

  const spentTotal = expensesList.reduce((sum, item) => sum + (item.amountNum || 0), 0)
  const total = totalBudget > 0 ? totalBudget : (spentTotal > 0 ? spentTotal : 0)
  const remaining = total > 0 ? Math.max(0, total - spentTotal) : 0
  const spentPct = total > 0 ? Math.min(100, (spentTotal / total) * 100) : 0

  // Category calculation
  const categoryMap = defaultCategories.map((c) => {
    const categorySpent = expensesList
      .filter((e) => e.categoryLabel.toLowerCase().includes(c.label.toLowerCase()) || e.cat === c.icon)
      .reduce((sum, item) => sum + (item.amountNum || 0), 0)
    const categoryBudget = total > 0 ? Math.round(total / defaultCategories.length) : 0
    return {
      ...c,
      spent: categorySpent,
      budget: categoryBudget,
    }
  })

  // Donut chart math
  const R = 54
  const circumference = 2 * Math.PI * R
  const spentDash = total > 0 ? (spentTotal / total) * circumference : 0

  return (
    <div className="min-h-full bg-surface">
      <div className="pt-12" />

      {/* Header */}
      <div className="px-5 md:px-8 flex items-center gap-3 mb-5">
        <button
          onClick={() => goBack("trip-overview")}
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
        <div>
          <h1 className="text-[20px] font-black text-navy">Trip Budget</h1>
          <p className="text-slate-400 text-[12px]">
            {tripTitle}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="ml-auto w-9 h-9 rounded-full bg-white flex items-center justify-center"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1v14M1 8h14"
              stroke="#0D0F2E"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Donut chart + summary */}
      <div
        className="mx-5 md:mx-8 rounded-[24px] p-5 mb-5"
        style={{
          background: "linear-gradient(135deg, #0D0F2E, #1e2080)",
          boxShadow: "0 12px 36px rgba(13,15,46,0.3)",
        }}
      >
        <div className="flex items-center justify-between">
          {/* SVG Donut */}
          <div
            className="relative flex-shrink-0"
            style={{ width: isDesktop ? "160px" : "130px", height: isDesktop ? "160px" : "130px" }}
          >
            <svg width={isDesktop ? "160" : "130"} height={isDesktop ? "160" : "130"} viewBox="0 0 130 130">
              {/* Background ring */}
              <circle
                cx="65"
                cy="65"
                r={R}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="14"
              />
              {/* Spent segment */}
              <circle
                cx="65"
                cy="65"
                r={R}
                fill="none"
                stroke="url(#budgetGrad)"
                strokeWidth="14"
                strokeDasharray={`${spentDash} ${circumference - spentDash}`}
                strokeDashoffset={circumference * 0.25}
                strokeLinecap="round"
              />
              {/* Remaining arc */}
              <circle
                cx="65"
                cy="65"
                r={R}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="14"
                strokeDasharray={`${Math.max(0, circumference - spentDash - 8)} 999`}
                strokeDashoffset={circumference * 0.25 - spentDash - 4}
                strokeLinecap="round"
              />
              <defs>
                <linearGradient
                  id="budgetGrad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#3B41C8" />
                  <stop offset="100%" stopColor="#06C4D4" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-white font-black text-[18px]">
                {Math.round(spentPct)}%
              </span>
              <span className="text-white/40 text-[9px] font-medium">
                spent
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-4 flex-1 pl-5">
            <div>
              <p className="text-white/40 text-[10px] font-medium mb-0.5">
                Total Budget
              </p>
              <button
                onClick={openBudgetModal}
                className="flex items-center gap-1.5 text-left active:opacity-70"
              >
                <p className="text-white font-black text-[22px]">
                  {formatMoney(total, { display: displayCurrency })}
                </p>
                <span className="text-white/40 text-[13px]">✎</span>
              </button>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-white/40 text-[10px] font-medium mb-0.5">
                  Spent
                </p>
                <p className="text-[#06C4D4] font-black text-[16px]">
                  {formatMoney(spentTotal, { display: displayCurrency })}
                </p>
              </div>
              <div>
                <p className="text-white/40 text-[10px] font-medium mb-0.5">
                  Remaining
                </p>
                <p className="text-[#4ade80] font-black text-[16px]">
                  {formatMoney(remaining, { display: displayCurrency })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="px-5 md:px-8 mb-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          By Category
        </p>
        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-2.5"}>
          {categoryMap.map((cat) => {
            const pct = cat.budget > 0 ? Math.min(100, (cat.spent / cat.budget) * 100) : 0
            return (
              <div
                key={cat.label}
                className="bg-white rounded-2xl p-3.5"
                style={{ boxShadow: "0 2px 8px rgba(59,65,200,0.06)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{cat.icon}</span>
                    <span className="text-navy font-semibold text-[13px]">
                      {cat.label}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-navy font-black text-[14px]">
                      {formatMoney(cat.spent, { display: displayCurrency })}
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      {" "}
                      / {formatMoney(cat.budget, { display: displayCurrency })}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: cat.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent expenses */}
      <div className="px-5 md:px-8 pb-6">
        <div className="flex justify-between items-center mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Recent
          </p>
          {expensesList.length > 0 && (
            <button className="text-[11px] font-bold text-brand">See all</button>
          )}
        </div>
        <div className={isDesktop ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "flex flex-col gap-2"}>
          {loading ? (
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <p className="text-slate-400 text-sm">Loading expenses...</p>
            </div>
          ) : expensesList.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <span className="text-3xl mb-2 block">💸</span>
              <p className="text-navy font-bold text-sm">No expenses recorded yet</p>
              <p className="text-slate-400 text-xs mt-1">Tap below to log your first expense</p>
            </div>
          ) : (
            expensesList.map((exp, i) => (
              <div
                key={exp.id || i}
                className="bg-white rounded-2xl px-4 py-3 flex items-center justify-between"
                style={{ boxShadow: "0 2px 6px rgba(59,65,200,0.05)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{exp.cat}</span>
                  <div>
                    <p className="text-navy font-semibold text-[13px]">
                      {exp.name}
                    </p>
                    <p className="text-slate-400 text-[11px]">{exp.date}</p>
                  </div>
                </div>
                <span className="text-navy font-black text-[14px]">
                  {exp.amount}
                </span>
              </div>
            ))
          )}
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full mt-3 py-3.5 rounded-2xl text-white font-bold text-[14px] flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
            boxShadow: "0 8px 20px rgba(59,65,200,0.25)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 2v12M2 8h12"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Add Expense
        </button>
      </div>

      {/* Edit Budget Modal */}
      {showBudgetModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[360px] bg-white rounded-[28px] p-5 shadow-2xl border border-slate-100 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-navy">Trip Budget</h3>
              <button
                onClick={() => setShowBudgetModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block">Total budget ({displayCurrency})</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 1500"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-brand"
                />
              </div>

              <button
                disabled={savingBudget || !budgetInput.trim()}
                onClick={handleSaveBudget}
                className="w-full py-3 rounded-xl text-white font-bold text-sm mt-2 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                }}
              >
                {savingBudget ? "Saving..." : "Save Budget"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[360px] bg-white rounded-[28px] p-5 shadow-2xl border border-slate-100 animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-navy">Add an Expense</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Dinner in Sidi Bou Said"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block">Amount ({displayCurrency})</label>
                <input
                  type="number"
                  placeholder="e.g. 45"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {defaultCategories.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setNewCategory(c.key)}
                      className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border transition-all ${
                        newCategory === c.key
                          ? "border-brand bg-brand/10 text-brand"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-base">{c.icon}</span>
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                disabled={adding || !newDesc.trim() || !newAmount.trim()}
                onClick={handleAddExpense}
                className="w-full py-3 rounded-xl text-white font-bold text-sm mt-2 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #3B41C8, #06C4D4)",
                }}
              >
                {adding ? "Saving..." : "Save Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
