import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { isSupabaseConfigured, supabase } from "./supabase"
import { ensureProfile, generateUuid, getUserProfile, getMyAvatarUrl } from "./trips"

type AuthContextValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  recovery: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<string | null>
  /** Re-send the sign-up confirmation email (null = sent). */
  resendConfirmation: (email: string) => Promise<string | null>
  signInWithProvider: (provider: "google" | "apple") => Promise<string | null>
  /**
   * APK flow: Google/Apple login must run in the phone's real browser
   * (Google blocks sign-in inside an embedded WebView, which is why the
   * Gmail screen got stuck with no password step). Builds the provider URL
   * without redirecting and hands it to the native shell, which opens it in
   * a Chrome Custom Tab (your phone's Gmail session applies — usually one
   * tap, no password) and sends the auth code back via `trypo:oauth-code`.
   * Resolves "pending" when the browser was opened, or an error message.
   */
  signInWithProviderNative: (provider: "google" | "apple") => Promise<string | null>
  requestPasswordReset: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const LOCAL_AUTH_KEY = "trypo_local_auth_user"
const LOCAL_ACCOUNTS_KEY = "trypo_local_accounts"

/**
 * Returned by signUp when the account was created but email confirmation is
 * still pending — the UI shows a dedicated "check your inbox" screen.
 */
export const VERIFY_PENDING = "__VERIFY_PENDING__"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [localUser, setLocalUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const saved = localStorage.getItem(LOCAL_AUTH_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let alive = true
    const safetyTimer = setTimeout(() => {
      if (alive) setLoading(false)
    }, 1000)

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) {
          setSession(data?.session || null)
          if (data?.session?.user) {
            const u = data.session.user
            const userObj = {
              id: u.id,
              email: u.email,
              fullName: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Traveler",
              username: `@${u.email?.split("@")[0] || "traveler"}`,
              user_metadata: u.user_metadata,
              created_at: u.created_at,
            }
            localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(userObj))
            void ensureProfile(data.session.user.id)
            window.dispatchEvent(new CustomEvent("trypo:db_changed"))
          }
          setLoading(false)
        }
      })
      .catch((e) => {
        console.warn("Supabase auth getSession error:", e)
        if (alive) setLoading(false)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession)
        setRecovery(event === "PASSWORD_RECOVERY")
if (nextSession?.user) {
          const u = nextSession.user
          const userObj = {
            id: u.id,
            email: u.email,
            fullName: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Traveler",
            username: `@${u.email?.split("@")[0] || "traveler"}`,
            user_metadata: u.user_metadata,
            created_at: u.created_at,
          }
          localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(userObj))
          void ensureProfile(u.id)
        } else if (event === "SIGNED_OUT") {
          localStorage.removeItem(LOCAL_AUTH_KEY)
          localStorage.removeItem("trypo_active_trip_id")
        }
        setLoading(false)
        window.dispatchEvent(new CustomEvent("trypo:db_changed"))
      },
    )

    return () => {
      alive = false
      clearTimeout(safetyTimer)
      subscription?.subscription?.unsubscribe()
    }
  }, [])

  // APK OAuth completion: the native shell opens Google in the system
  // browser and delivers the auth code back via this window event.
  useEffect(() => {
    const client = supabase
    if (!client) return
    const onOAuthCode = (e: Event) => {
      const code = (e as CustomEvent).detail?.code
      if (typeof code !== "string" || !code) return
      void client.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) console.warn("OAuth code exchange failed:", error.message)
      })
    }
    window.addEventListener("trypo:oauth-code", onOAuthCode)
    // The shell may have delivered the code before we subscribed.
    try {
      const w = window as unknown as Record<string, unknown>
      const pending = w.__TRYPO_PENDING_OAUTH_CODE
      if (typeof pending === "string" && pending) {
        w.__TRYPO_PENDING_OAUTH_CODE = null
        onOAuthCode(new CustomEvent("trypo:oauth-code", { detail: { code: pending } }))
      }
    } catch {}
    return () => window.removeEventListener("trypo:oauth-code", onOAuthCode)
  }, [])

  const effectiveUser = (isSupabaseConfigured && session?.user) ? session.user : localUser

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: effectiveUser,
      recovery,
      async signIn(email, password) {
        if (supabase) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })
          if (error) return error.message
          if (data?.user) {
            const u = data.user
            const userObj = {
              id: u.id,
              email: u.email,
              fullName: u.user_metadata?.full_name || u.email?.split("@")[0] || "Traveler",
              username: `@${u.email?.split("@")[0] || "traveler"}`,
              user_metadata: u.user_metadata,
              created_at: u.created_at,
            }
            localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(userObj))
            void ensureProfile(u.id)
            window.dispatchEvent(new CustomEvent("trypo:db_changed"))
          }
          return null
        }
        if (!email.trim() || !password) return "Veuillez renseigner votre email et mot de passe."
        if (password.length < 4) return "Le mot de passe doit comporter au moins 4 caractères."

        const accountsRaw = localStorage.getItem(LOCAL_ACCOUNTS_KEY)
        const accounts = accountsRaw ? JSON.parse(accountsRaw) : []
        const found = accounts.find((a: any) => a.email.toLowerCase() === email.trim().toLowerCase())

        const userObj: any = {
          id: found?.id || generateUuid(),
          email: email.trim(),
          user_metadata: {
            full_name: found?.fullName || email.trim().split("@")[0],
          },
          created_at: found?.created_at || new Date().toISOString(),
        }
        localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(userObj))
        setLocalUser(userObj)
        window.dispatchEvent(new CustomEvent("trypo:db_changed"))
        return null
      },
      async signUp(fullName, email, password) {
        if (supabase) {
          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: { full_name: fullName.trim() },
              emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
            },
          })
          if (error) return error.message

          // Email confirmations may be enabled: the account exists but is not
          // authenticated yet. Tell the UI to show the "check inbox" screen.
          if (data?.user && !data.session) {
            return VERIFY_PENDING
          }

          if (data?.session?.user) {
            setSession(data.session)
            const u = data.session.user
            const userObj = {
              id: u.id,
              email: u.email,
              fullName: fullName.trim() || u.email?.split("@")[0],
              username: `@${u.email?.split("@")[0] || "traveler"}`,
              user_metadata: { full_name: fullName.trim() },
              created_at: u.created_at,
            }
            localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(userObj))
            try {
              await supabase.from("profiles").upsert({
                id: u.id,
                full_name: fullName.trim(),
                username: `@${u.email?.split("@")[0]}`,
                onboarding_completed: true,
              })
            } catch {}
            window.dispatchEvent(new CustomEvent("trypo:db_changed"))
          }
          return null
        }
        if (!email.trim() || !password) return "Veuillez renseigner tous les champs."
        if (password.length < 4) return "Le mot de passe doit comporter au moins 4 caractères."

        const accountsRaw = localStorage.getItem(LOCAL_ACCOUNTS_KEY)
        const accounts = accountsRaw ? JSON.parse(accountsRaw) : []
        const userObj: any = {
          id: generateUuid(),
          email: email.trim(),
          fullName: fullName.trim() || email.trim().split("@")[0],
          created_at: new Date().toISOString(),
        }
        accounts.push({ ...userObj, password })
        localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts))

        const sessionUser: any = {
          id: userObj.id,
          email: userObj.email,
          user_metadata: { full_name: userObj.fullName },
          created_at: userObj.created_at,
        }
        localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(sessionUser))
        setLocalUser(sessionUser)
        window.dispatchEvent(new CustomEvent("trypo:db_changed"))
        return null
      },
      async resendConfirmation(email) {
        if (supabase) {
          const { error } = await supabase.auth.resend({
            type: "signup",
            email: email.trim(),
          })
          return error?.message ?? null
        }
        return null
      },
      async signInWithProvider(provider) {        if (supabase) {
          const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: { redirectTo: window.location.origin },
          })
          return error?.message ?? null
        }
        const userObj: any = {
          id: generateUuid(),
          email: `traveler@${provider}.com`,
          user_metadata: { full_name: `Trypo ${provider.charAt(0).toUpperCase() + provider.slice(1)} User` },
          created_at: new Date().toISOString(),
        }
        localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(userObj))
        setLocalUser(userObj)
        window.dispatchEvent(new CustomEvent("trypo:db_changed"))
        return null
      },
      async signInWithProviderNative(provider) {
        if (!supabase) return "Online login is not configured."
        try {
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
              // Deep link back into the APK (native shell intercepts it).
              // Must be allow-listed in Supabase Auth > URL Configuration.
              redirectTo: "trypo://auth-callback",
              skipBrowserRedirect: true,
            },
          })
          if (error) return error.message
          const url = data?.url
          if (!url) return "Could not start Google login."
          const w = window as unknown as Record<string, unknown>
          const rnw = w.ReactNativeWebView as { postMessage?: (msg: string) => void } | undefined
          if (w.__TRYPO_NATIVE__ === true && rnw?.postMessage) {
            rnw.postMessage(JSON.stringify({ type: "oauth", url }))
            // "pending" is not an error — AuthScreen waits for the session.
            return "pending"
          }
          // Not in the shell after all: fall back to a full redirect.
          window.location.href = url
          return "pending"
        } catch (e) {
          return e instanceof Error ? e.message : "Could not start Google login."
        }
      },
      async requestPasswordReset(email) {
        if (supabase) {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
          })
          return error?.message ?? null
        }
        return null
      },
      async updatePassword(password) {
        if (supabase) {
          const { error } = await supabase.auth.updateUser({ password })
          if (!error) setRecovery(false)
          return error?.message ?? null
        }
        setRecovery(false)
        return null
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut()
        localStorage.removeItem(LOCAL_AUTH_KEY)
        localStorage.removeItem("trypo_active_trip_id")
        setLocalUser(null)
        window.dispatchEvent(new CustomEvent("trypo:db_changed"))
      },
      /**
       * Permanently delete the account: best-effort server cleanup (owned
       * trips cascade to destinations/itinerary/bookings, profile row
       * removed), then wipe every trypo_* key on this device and sign out.
       * Returns an error message, or null on success.
       */
      async deleteAccount() {
        try {
          const uid = session?.user?.id || (localUser as any)?.id || null
          const email = session?.user?.email || (localUser as any)?.email || localUser?.email || null

          if (supabase && session?.user) {
            // Future-proof: use a server-side deleter when it exists.
            try {
              await supabase.rpc("delete_my_account" as any)
            } catch {
              /* not deployed yet — fall through to manual cleanup */
            }
            // Best-effort: owned trips (children cascade) + own profile row.
            try {
              if (uid) await supabase.from("trips").delete().eq("owner_id", uid)
            } catch {}
            try {
              if (uid) await supabase.from("profiles").delete().eq("id", uid)
            } catch {}
            try {
              await supabase.auth.signOut()
            } catch {}
          } else if (email) {
            // Local/offline account: drop it from the on-device registry.
            try {
              const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY)
              const accounts = raw ? JSON.parse(raw) : []
              const kept = (Array.isArray(accounts) ? accounts : []).filter(
                (a: any) => String(a?.email || "").toLowerCase() !== String(email).toLowerCase(),
              )
              localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(kept))
            } catch {}
          }

          // Wipe all Trypo data on this device (trips, crew, settings…).
          try {
            const doomed: string[] = []
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (key && key.startsWith("trypo_")) doomed.push(key)
            }
            doomed.forEach((key) => localStorage.removeItem(key))
          } catch {}

          setLocalUser(null)
          window.dispatchEvent(new CustomEvent("trypo:db_changed"))
          return null
        } catch (e) {
          return e instanceof Error ? e.message : "Could not delete the account."
        }
      },
    }),
    [effectiveUser, loading, recovery, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside AuthProvider.")
  return context
}

/**
 * The current account's photo for EVERY screen: uploaded profile photo
 * first, then the auth provider photo, then a fallback. Refreshes on
 * `trypo:db_changed` so a new upload appears app-wide instantly.
 */
export function useMyAvatar(): string {
  const { user } = useAuth()
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const p = await getUserProfile()
        if (active) setProfileAvatar(p?.avatarUrl || null)
      } catch {
        if (active) setProfileAvatar(null)
      }
    }
    void load()
    const onDb = () => void load()
    window.addEventListener("trypo:db_changed", onDb)
    return () => {
      active = false
      window.removeEventListener("trypo:db_changed", onDb)
    }
  }, [user])

  return getMyAvatarUrl(profileAvatar ? { avatarUrl: profileAvatar } : null, user)
}
