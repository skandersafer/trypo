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
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                type="button"
                disabled={submitting}
                onClick={() => continueWithProvider("google")}
                aria-label="Continue with Google"
                className="rounded-xl border border-slate-200 py-3 flex items-center justify-center disabled:opacity-60 active:scale-95 transition-transform"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => continueWithProvider("apple")}
                aria-label="Continue with Apple"
                className="rounded-xl border border-slate-200 py-3 flex items-center justify-center disabled:opacity-60 active:scale-95 transition-transform"
              >
                <svg width="20" height="20" viewBox="0 0 384 512" fill="#0D0F2E">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                </svg>
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

        {!recovery && !isForgotPassword && (
          <button
            type="button"
            onClick={() => {
              setIsSignup(!isSignup)
              setMessage(null)
            }}
            className="w-full mt-4 text-xs font-bold text-slate-500 text-center"
          >
            {isSignup ? (
              <>Have an account? <span className="text-[#3B41C8]">Log in</span></>
            ) : (
              <>New to Trypo? <span className="text-[#3B41C8]">Create account</span></>
            )}
          </button>
        )}
      </form>
    </div>
  )
}
