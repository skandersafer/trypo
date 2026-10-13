import { useEffect, useState, type FormEvent } from "react"
import { useAuth, VERIFY_PENDING } from "../lib/auth"
import { useIsDesktop } from "../lib/useIsDesktop"

interface Props {
  onSuccess: () => void
  navigate?: (s: any) => void
}

export default function AuthScreen({ onSuccess, navigate }: Props) {
  const {
    signIn,
    signUp,
    resendConfirmation,
    signInWithProvider,
    signInWithProviderNative,
    requestPasswordReset,
    updatePassword,
    signOut,
    recovery,
    user,
  } = useAuth()
  const [isSignup, setIsSignup] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Sign-up with email confirmation enabled → wait on this inbox.
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<string | null>(null)
  const isDesktop = useIsDesktop()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)

    const error = recovery
      ? await updatePassword(newPassword)
      : isForgotPassword
        ? await requestPasswordReset(email.trim())
        : isSignup
          ? await signUp(fullName.trim(), email.trim(), password)
          : await signIn(email.trim(), password)

    setSubmitting(false)

    if (error) {
      // Account created, inbox confirmation still pending → dedicated screen.
      if (isSignup && error === VERIFY_PENDING) {
        setVerifyEmail(email.trim())
        setResendStatus(null)
        return
      }
      setMessage(error)
      return
    }

    if (recovery) {
      setMessage("Your password has been updated.")
      setNewPassword("")
      onSuccess()
      return
    }

    if (isForgotPassword) {
      setMessage("Check your email for a secure password reset link.")
      return
    }

    if (isSignup) {
      onSuccess()
      return
    }

    onSuccess()
  }

  async function continueWithProvider(provider: "google" | "apple") {
    setSubmitting(true)
    setMessage(null)
    try {
      const w = window as unknown as Record<string, unknown>
      const isNative = w.__TRYPO_NATIVE__ === true
      if (isNative) {
        // APK: open Google/Apple in the phone's real browser (your Gmail
        // session applies). The app advances automatically on return.
        const result = await signInWithProviderNative(provider)
        setSubmitting(false)
        if (result && result !== "pending") {
          setMessage(result)
          return
        }
        if (result === "pending") {
          setMessage(
            "Finish ALL the Google steps in the browser (email + password), then come back here… 🌍",
          )
        }
        return
      }
      const error = await signInWithProvider(provider)
      if (error) {
        setMessage(error)
        setSubmitting(false)
      } else {
        setSubmitting(false)
        onSuccess()
      }
    } catch {
      setSubmitting(false)
      setMessage("Could not start provider login.")
    }
  }

  // Auto-advance when a session arrives (APK browser OAuth return).
  // Never auto-advance in recovery mode: the user must set the new
  // password first, otherwise the reset link just logs them in and the
  // "Choose a new password" form is skipped.
  useEffect(() => {
    if (user && !recovery) onSuccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, recovery])

  // APK OAuth feedback from the native shell: the system browser was
  // closed early, the provider returned an error, or no session came back.
  // Without this the login screen sits silent while the user is stuck.
  useEffect(() => {
    const onOAuthError = (e: Event) => {
      const msg = (e as CustomEvent).detail?.message as string | undefined
      setMessage(msg || "Google login failed before creating a session. Please try again.")
      setSubmitting(false)
    }
    const onOAuthCancelled = () => {
      setMessage("Login was closed before finishing — tap Google to try again.")
      setSubmitting(false)
    }
    window.addEventListener("trypo:oauth-error", onOAuthError)
    window.addEventListener("trypo:oauth-cancelled", onOAuthCancelled)
    return () => {
      window.removeEventListener("trypo:oauth-error", onOAuthError)
      window.removeEventListener("trypo:oauth-cancelled", onOAuthCancelled)
    }
  }, [])

  async function resendVerifyEmail() {
    if (!verifyEmail || resending) return
    setResending(true)
    setResendStatus(null)
    const error = await resendConfirmation(verifyEmail)
    setResending(false)
    setResendStatus(
      error ? error : "New confirmation email sent — check your inbox ✉️",
    )
  }

  // ── Verify-your-inbox screen (sign-up with email confirmation) ──
  if (verifyEmail) {
    return (
      <div
        className="h-full flex flex-col justify-end px-6 pb-10 text-white md:justify-center md:items-center"
        style={{
          background:
            "linear-gradient(160deg, #0a0a2e 0%, #1e2094 58%, #0891b2 100%)",
        }}
      >
        <div className="mb-auto pt-16 text-center w-full md:max-w-md md:mb-8">
          <p className="text-6xl mb-4">✉️</p>
          <h1 className="text-3xl font-black">Check your inbox</h1>
          <p className="text-white/65 mt-3 text-sm leading-relaxed">
            We sent a confirmation link to{" "}
            <span className="font-bold text-white">{verifyEmail}</span>.
            <br />
            Open it to activate your account, then come back and log in.
          </p>
        </div>

        <div className="rounded-[28px] bg-white p-5 text-[#0D0F2E] shadow-2xl w-full md:max-w-md">
          <p className="text-xs text-slate-500 leading-relaxed mb-1">
            No email after a minute? Check spam, then resend it below.
          </p>
          {resendStatus && (
            <p className="text-xs font-bold text-[#3B41C8] mb-1">
              {resendStatus}
            </p>
          )}
          <button
            disabled={resending}
            onClick={() => void resendVerifyEmail()}
            className="w-full mt-3 rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #3B41C8, #06C4D4)" }}
          >
            {resending ? "Sending…" : "Resend confirmation email"}
          </button>
          <button
            onClick={() => {
              setVerifyEmail(null)
              setIsSignup(false)
              setMessage(null)
              setResendStatus(null)
            }}
            className="w-full mt-2 rounded-xl border border-slate-200 py-3.5 text-sm font-bold text-slate-700"
          >
            I verified — Log in
          </button>
          <button
            onClick={() => {
              setVerifyEmail(null)
              setIsSignup(true)
              setMessage(null)
              setResendStatus(null)
            }}
            className="w-full mt-3 text-xs font-bold text-slate-500 hover:text-navy cursor-pointer text-center"
          >
            ← Use another email
          </button>
        </div>
      </div>
    )
  }

  const resetToLogin = async () => {
    if (recovery) await signOut()
    setIsForgotPassword(false)
    setIsSignup(false)
    setMessage(null)
  }

  return (
    <div
      className="h-full flex flex-col justify-end px-6 pb-10 text-white md:justify-center md:items-center"
      style={{
        background:
          "linear-gradient(160deg, #0a0a2e 0%, #1e2094 58%, #0891b2 100%)",
      }}
    >
      <div className="mb-auto pt-16 w-full md:max-w-md md:mb-8">
        <p className="text-cyan-300 text-xs tracking-[0.25em] font-bold uppercase">
          Plan it. Live it. Remember it.
        </p>
        <h1 className={isDesktop ? "font-black mt-4 text-5xl md:text-6xl" : "text-5xl font-black mt-4"}>
          Welcome to
          <br />
          trypo
        </h1>
        <p className="text-white/65 mt-4 text-sm leading-relaxed">
          Keep every destination, plan and memory in one secure place.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="rounded-[28px] bg-white p-5 text-[#0D0F2E] shadow-2xl w-full md:max-w-md"
      >
        {!recovery && !isForgotPassword && (
          <div className="flex rounded-xl bg-slate-100 p-1 mb-5">
            {[
              { value: false, label: "Log in" },
              { value: true, label: "Sign up" },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => {
                  setIsSignup(tab.value)
                  setMessage(null)
                }}
                className="flex-1 rounded-lg py-2 text-sm font-bold"
                style={{
                  background: isSignup === tab.value ? "white" : "transparent",
                  color: isSignup === tab.value ? "#3B41C8" : "#64748b",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {!recovery && !isForgotPassword && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                disabled={submitting}
                onClick={() => continueWithProvider("google")}
                className="rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 disabled:opacity-60"
              >
                Google
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => continueWithProvider("apple")}
                className="rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 disabled:opacity-60"
              >
                Apple
              </button>
            </div>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[10px] font-bold uppercase text-slate-400">
                or continue with email
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}

        {recovery ? (
          <>
            <h2 className="text-xl font-black mb-1">Choose a new password</h2>
            <p className="text-xs text-slate-500 mb-4">
              Use at least 6 characters to secure your account.
            </p>
            <input
              required
              minLength={6}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#3B41C8]"
            />
          </>
        ) : (
          <>
            {isForgotPassword ? (
              <p className="text-sm font-bold text-slate-700 mb-4">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            ) : isSignup ? (
              <input
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Full name"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 mb-3 outline-none focus:border-[#3B41C8]"
              />
            ) : null}
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email address"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#3B41C8]"
            />
            {!isForgotPassword && (
              <>
                <input
                  required
                  minLength={6}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 mt-3 outline-none focus:border-[#3B41C8]"
                />
                {!isSignup && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true)
                      setMessage(null)
                    }}
                    className="mt-2 text-xs font-bold text-[#3B41C8]"
                  >
                    Forgot password?
                  </button>
                )}
              </>
            )}
          </>
        )}

        {message && (
          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            {message}
          </p>
        )}
        <button
          disabled={submitting}
          className="w-full mt-5 rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #3B41C8, #06C4D4)" }}
        >
          {submitting
            ? "Please wait…"
            : recovery
              ? "Update password"
              : isForgotPassword
                ? "Send reset link"
                : isSignup
                  ? "Create my account"
                  : "Log in to Trypo"}
        </button>

        {(isForgotPassword || recovery) && (
          <button
            type="button"
            onClick={resetToLogin}
            className="w-full mt-4 text-xs font-bold text-slate-500 hover:text-navy cursor-pointer text-center"
          >
            ← Back to log in
          </button>
        )}
      </form>
    </div>
  )
}
