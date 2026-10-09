import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { SUPPORTED_CURRENCIES, getStoredRates } from "./currencyApi"

export type LanguageCode = "en" | "fr" | "es" | "de" | "it"
export type UnitsSetting = "metric" | "imperial"

export interface NotificationPrefs {
  trip: boolean
  booking: boolean
  crew: boolean
  promo: boolean
}

export interface AppSettings {
  currency: string
  language: LanguageCode
  units: UnitsSetting
  darkMode: boolean
  offlineMode: boolean
  locationAccess: boolean
  notifications: NotificationPrefs
}

const STORAGE_KEY = "trypo_settings_v1"
export const SETTINGS_EVENT = "trypo:settings_changed"

const DEFAULTS: AppSettings = {
  currency: "EUR",
  language: "en",
  units: "metric",
  darkMode: false,
  offlineMode: true,
  locationAccess: true,
  notifications: { trip: true, booking: true, crew: true, promo: false },
}

export const LANGUAGES: Array<{ code: LanguageCode; label: string }> = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
]

export function languageLabel(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? "English"
}

function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULTS,
      ...parsed,
      notifications: { ...DEFAULTS.notifications, ...(parsed.notifications || {}) },
    }
  } catch {
    return DEFAULTS
  }
}

function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: { settings: s } }))
  } catch {
    // ignore
  }
}

/** Synchronous read helper for non-React code (e.g. API helpers). */
export function getSettingsSnapshot(): AppSettings {
  return loadSettings()
}

export function isOfflineModeEnabled(): boolean {
  try {
    return loadSettings().offlineMode
  } catch {
    return true
  }
}

// ---------------------------------------------------------------------------
// i18n dictionary (Settings + shared chrome). Other screens fall back to EN.
// ---------------------------------------------------------------------------

type Dict = Record<string, string>

const STRINGS: Record<LanguageCode, Dict> = {
  en: {
    settings: "Settings",
    account: "Account",
    edit: "Edit",
    preferences: "Preferences",
    currency: "Currency",
    language: "Language",
    units: "Units",
    metric: "Metric (°C, km)",
    imperial: "Imperial (°F, mi)",
    notifications: "Notifications",
    tripReminders: "Trip reminders",
    bookingUpdates: "Booking updates",
    crewActivity: "Crew activity",
    dealsPromo: "Deals & promotions",
    app: "App",
    darkMode: "Dark mode",
    offlineAccess: "Offline access",
    offlineSub: "Download trips for offline use",
    offlineReady: "Offline ready — trips saved on this device",
    offlineOff: "Offline cache cleared",
    locationAccess: "Location access",
    locationSub: "Used for nearby recommendations",
    privacySecurity: "Privacy & Security",
    changePassword: "Change password",
    changePasswordSub: "Last changed 3 months ago",
    twoFactor: "Two-factor authentication",
    twoFactorOn: "Enabled",
    twoFactorOff: "Not enabled",
    privacyPolicy: "Privacy policy",
    terms: "Terms of service",
    dangerZone: "Danger Zone",
    deleteAccount: "Delete account",
    deleteAccountSub: "Permanently delete all your data",
    logout: "Logout",
    version: "Trypo v1.0.0 · Made with ❤️ for travelers",
    home: "Home",
    explore: "Explore",
    trips: "Trips",
    profile: "Profile",
    saved: "Saved",
    offlineBanner: "You are offline — showing saved data",
    notifEnabled: "Notifications enabled",
    notifBlocked: "Browser blocked notifications — enable them in site settings",
    locationSaved: "Location enabled",
    locationBlocked: "Location blocked — enable it in browser settings",
    confirmDelete: "Type DELETE to confirm account deletion",
    deleted: "Local data cleared",
    passwordSent: "Password reset email sent — check your inbox",
    close: "Close",
    cancel: "Cancel",
    confirm: "Confirm",
    save: "Save",
  },
  fr: {
    settings: "Paramètres",
    account: "Compte",
    edit: "Modifier",
    preferences: "Préférences",
    currency: "Devise",
    language: "Langue",
    units: "Unités",
    metric: "Métrique (°C, km)",
    imperial: "Impérial (°F, mi)",
    notifications: "Notifications",
    tripReminders: "Rappels de voyage",
    bookingUpdates: "Mises à jour des réservations",
    crewActivity: "Activité de l'équipage",
    dealsPromo: "Offres et promotions",
    app: "Application",
    darkMode: "Mode sombre",
    offlineAccess: "Accès hors ligne",
    offlineSub: "Télécharger les voyages pour une utilisation hors ligne",
    offlineReady: "Prêt hors ligne — voyages enregistrés sur cet appareil",
    offlineOff: "Cache hors ligne effacé",
    locationAccess: "Accès à la localisation",
    locationSub: "Utilisé pour les recommandations à proximité",
    privacySecurity: "Confidentialité et sécurité",
    changePassword: "Changer le mot de passe",
    changePasswordSub: "Dernière modification il y a 3 mois",
    twoFactor: "Authentification à deux facteurs",
    twoFactorOn: "Activée",
    twoFactorOff: "Non activée",
    privacyPolicy: "Politique de confidentialité",
    terms: "Conditions d'utilisation",
    dangerZone: "Zone dangereuse",
    deleteAccount: "Supprimer le compte",
    deleteAccountSub: "Supprimer définitivement toutes vos données",
    logout: "Déconnexion",
    version: "Trypo v1.0.0 · Fait avec ❤️ pour les voyageurs",
    home: "Accueil",
    explore: "Explorer",
    trips: "Voyages",
    profile: "Profil",
    saved: "Enregistré",
    offlineBanner: "Vous êtes hors ligne — données enregistrées affichées",
    notifEnabled: "Notifications activées",
    notifBlocked: "Le navigateur a bloqué les notifications",
    locationSaved: "Localisation activée",
    locationBlocked: "Localisation bloquée — activez-la dans le navigateur",
    confirmDelete: "Tapez DELETE pour confirmer la suppression",
    deleted: "Données locales effacées",
    passwordSent: "E-mail de réinitialisation envoyé — vérifiez votre boîte",
    close: "Fermer",
    cancel: "Annuler",
    confirm: "Confirmer",
    save: "Enregistrer",
  },
  es: {
    settings: "Ajustes",
    account: "Cuenta",
    edit: "Editar",
    preferences: "Preferencias",
    currency: "Moneda",
    language: "Idioma",
    units: "Unidades",
    metric: "Métrico (°C, km)",
    imperial: "Imperial (°F, mi)",
    notifications: "Notificaciones",
    tripReminders: "Recordatorios de viaje",
    bookingUpdates: "Actualizaciones de reservas",
    crewActivity: "Actividad del grupo",
    dealsPromo: "Ofertas y promociones",
    app: "Aplicación",
    darkMode: "Modo oscuro",
    offlineAccess: "Acceso sin conexión",
    offlineSub: "Descargar viajes para usar sin conexión",
    offlineReady: "Listo sin conexión — viajes guardados en este dispositivo",
    offlineOff: "Caché sin conexión borrada",
    locationAccess: "Acceso a la ubicación",
    locationSub: "Se usa para recomendaciones cercanas",
    privacySecurity: "Privacidad y seguridad",
    changePassword: "Cambiar contraseña",
    changePasswordSub: "Último cambio hace 3 meses",
    twoFactor: "Autenticación en dos pasos",
    twoFactorOn: "Activada",
    twoFactorOff: "No activada",
    privacyPolicy: "Política de privacidad",
    terms: "Términos del servicio",
    dangerZone: "Zona de peligro",
    deleteAccount: "Eliminar cuenta",
    deleteAccountSub: "Eliminar permanentemente todos tus datos",
    logout: "Cerrar sesión",
    version: "Trypo v1.0.0 · Hecho con ❤️ para viajeros",
    home: "Inicio",
    explore: "Explorar",
    trips: "Viajes",
    profile: "Perfil",
    saved: "Guardado",
    offlineBanner: "Estás sin conexión — mostrando datos guardados",
    notifEnabled: "Notificaciones activadas",
    notifBlocked: "El navegador bloqueó las notificaciones",
    locationSaved: "Ubicación activada",
    locationBlocked: "Ubicación bloqueada — actívala en el navegador",
    confirmDelete: "Escribe DELETE para confirmar la eliminación",
    deleted: "Datos locales borrados",
    passwordSent: "Correo de restablecimiento enviado — revisa tu bandeja",
    close: "Cerrar",
    cancel: "Cancelar",
    confirm: "Confirmar",
    save: "Guardar",
  },
  de: {
    settings: "Einstellungen",
    account: "Konto",
    edit: "Bearbeiten",
    preferences: "Präferenzen",
    currency: "Währung",
    language: "Sprache",
    units: "Einheiten",
    metric: "Metrisch (°C, km)",
    imperial: "Imperial (°F, mi)",
    notifications: "Benachrichtigungen",
    tripReminders: "Reiseerinnerungen",
    bookingUpdates: "Buchungsupdates",
    crewActivity: "Crew-Aktivität",
    dealsPromo: "Angebote & Aktionen",
    app: "App",
    darkMode: "Dunkelmodus",
    offlineAccess: "Offline-Zugriff",
    offlineSub: "Reisen für Offline-Nutzung herunterladen",
    offlineReady: "Offline bereit — Reisen auf diesem Gerät gespeichert",
    offlineOff: "Offline-Cache gelöscht",
    locationAccess: "Standortzugriff",
    locationSub: "Für Empfehlungen in der Nähe verwendet",
    privacySecurity: "Datenschutz & Sicherheit",
    changePassword: "Passwort ändern",
    changePasswordSub: "Zuletzt vor 3 Monaten geändert",
    twoFactor: "Zwei-Faktor-Authentifizierung",
    twoFactorOn: "Aktiviert",
    twoFactorOff: "Nicht aktiviert",
    privacyPolicy: "Datenschutzerklärung",
    terms: "Nutzungsbedingungen",
    dangerZone: "Gefahrenzone",
    deleteAccount: "Konto löschen",
    deleteAccountSub: "Alle Daten dauerhaft löschen",
    logout: "Abmelden",
    version: "Trypo v1.0.0 · Mit ❤️ für Reisende gemacht",
    home: "Start",
    explore: "Entdecken",
    trips: "Reisen",
    profile: "Profil",
    saved: "Gespeichert",
    offlineBanner: "Du bist offline — gespeicherte Daten werden angezeigt",
    notifEnabled: "Benachrichtigungen aktiviert",
    notifBlocked: "Browser hat Benachrichtigungen blockiert",
    locationSaved: "Standort aktiviert",
    locationBlocked: "Standort blockiert — im Browser aktivieren",
    confirmDelete: "Zum Bestätigen DELETE eingeben",
    deleted: "Lokale Daten gelöscht",
    passwordSent: "E-Mail zum Zurücksetzen gesendet — Postfach prüfen",
    close: "Schließen",
    cancel: "Abbrechen",
    confirm: "Bestätigen",
    save: "Speichern",
  },
  it: {
    settings: "Impostazioni",
    account: "Account",
    edit: "Modifica",
    preferences: "Preferenze",
    currency: "Valuta",
    language: "Lingua",
    units: "Unità",
    metric: "Metrico (°C, km)",
    imperial: "Imperiale (°F, mi)",
    notifications: "Notifiche",
    tripReminders: "Promemoria di viaggio",
    bookingUpdates: "Aggiornamenti prenotazioni",
    crewActivity: "Attività del gruppo",
    dealsPromo: "Offerte e promozioni",
    app: "App",
    darkMode: "Modalità scura",
    offlineAccess: "Accesso offline",
    offlineSub: "Scarica i viaggi per l'uso offline",
    offlineReady: "Pronto offline — viaggi salvati su questo dispositivo",
    offlineOff: "Cache offline cancellata",
    locationAccess: "Accesso alla posizione",
    locationSub: "Usato per consigli nelle vicinanze",
    privacySecurity: "Privacy e sicurezza",
    changePassword: "Cambia password",
    changePasswordSub: "Ultima modifica 3 mesi fa",
    twoFactor: "Autenticazione a due fattori",
    twoFactorOn: "Attivata",
    twoFactorOff: "Non attivata",
    privacyPolicy: "Informativa sulla privacy",
    terms: "Termini di servizio",
    dangerZone: "Zona pericolosa",
    deleteAccount: "Elimina account",
    deleteAccountSub: "Elimina definitivamente tutti i tuoi dati",
    logout: "Esci",
    version: "Trypo v1.0.0 · Fatto con ❤️ per i viaggiatori",
    home: "Home",
    explore: "Esplora",
    trips: "Viaggi",
    profile: "Profilo",
    saved: "Salvati",
    offlineBanner: "Sei offline — vengono mostrati i dati salvati",
    notifEnabled: "Notifiche attivate",
    notifBlocked: "Il browser ha bloccato le notifiche",
    locationSaved: "Posizione attivata",
    locationBlocked: "Posizione bloccata — attivala nel browser",
    confirmDelete: "Digita DELETE per confermare l'eliminazione",
    deleted: "Dati locali cancellati",
    passwordSent: "Email di reset inviata — controlla la posta",
    close: "Chiudi",
    cancel: "Annulla",
    confirm: "Conferma",
    save: "Salva",
  },
}

export function translate(lang: LanguageCode, key: string): string {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key
}

// ---------------------------------------------------------------------------
// Formatting helpers driven by settings
// ---------------------------------------------------------------------------

export function currencySymbol(code: string): string {
  const info = (SUPPORTED_CURRENCIES as Record<string, { symbol: string }>)[code]
  if (info?.symbol) return info.symbol
  if (code === "EUR") return "€"
  if (code === "GBP") return "£"
  if (code === "TND") return "د.ت"
  if (code === "JPY") return "¥"
  return "$"
}

/** Convert amount from its own currency into the display currency using cached rates. */
export function convertToDisplayCurrency(amount: number, fromCode: string, displayCode: string): number {
  if (!amount || fromCode === displayCode) return amount
  try {
    const { rates } = getStoredRates()
    const fromRate = rates[fromCode] || 1
    const toRate = rates[displayCode] || 1
    return (amount / fromRate) * toRate
  } catch {
    return amount
  }
}

export function formatMoney(amount: number, opts?: { from?: string; display?: string }): string {
  const display = opts?.display ?? loadSettings().currency ?? "EUR"
  const from = opts?.from ?? display
  const converted = convertToDisplayCurrency(Number(amount) || 0, from, display)
  const sym = currencySymbol(display)
  const formatted = converted.toLocaleString(undefined, { maximumFractionDigits: converted >= 1000 ? 0 : 2 })
  // symbol-first for $,€,£,¥ — suffix for DT-style codes
  if (["$", "€", "£", "¥"].includes(sym)) return `${sym}${formatted}`
  return `${formatted} ${sym}`
}

export function formatTemp(celsius: number, units?: UnitsSetting): string {
  const u = units ?? loadSettings().units ?? "metric"
  if (u === "imperial") return `${Math.round((celsius * 9) / 5 + 32)}°F`
  return `${Math.round(celsius)}°C`
}

export function formatWind(kmh: number, units?: UnitsSetting): string {
  const u = units ?? loadSettings().units ?? "metric"
  if (u === "imperial") return `${Math.round(kmh * 0.621371)} mph`
  return `${Math.round(kmh)} km/h`
}

export function formatDistance(km: number, units?: UnitsSetting): string {
  const u = units ?? loadSettings().units ?? "metric"
  if (u === "imperial") return `${(km * 0.621371).toFixed(1)} mi`
  return `${km.toFixed(1)} km`
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SettingsContextValue {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  updateNotifications: (patch: Partial<NotificationPrefs>) => void
  t: (key: string) => string
  reset: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  // Apply side effects: dark class + html lang
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", settings.darkMode)
      document.documentElement.setAttribute("lang", settings.language)
    }
  }, [settings.darkMode, settings.language])

  // Keep state in sync when another tab / component writes settings
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail?.settings as AppSettings | undefined
      if (detail) setSettings(detail)
      else setSettings(loadSettings())
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettings(loadSettings())
    }
    window.addEventListener(SETTINGS_EVENT, onChange)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(SETTINGS_EVENT, onChange)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  const updateNotifications = useCallback((patch: Partial<NotificationPrefs>) => {
    setSettings((prev) => {
      const next = { ...prev, notifications: { ...prev.notifications, ...patch } }
      saveSettings(next)
      return next
    })
  }, [])

  const t = useCallback((key: string) => translate(settings.language, key), [settings.language])

  const reset = useCallback(() => {
    setSettings(DEFAULTS)
    saveSettings(DEFAULTS)
  }, [])

  const value = useMemo(
    () => ({ settings, update, updateNotifications, t, reset }),
    [settings, update, updateNotifications, t, reset],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    // Fallback outside provider (should not happen once wired): return snapshot-backed stub
    const settings = loadSettings()
    return {
      settings,
      update: (patch) => saveSettings({ ...settings, ...patch }),
      updateNotifications: (patch) =>
        saveSettings({ ...settings, notifications: { ...settings.notifications, ...patch } }),
      t: (key: string) => translate(settings.language, key),
      reset: () => saveSettings(DEFAULTS),
    }
  }
  return ctx
}
