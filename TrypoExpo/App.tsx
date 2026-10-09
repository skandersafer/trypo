import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as ExpoLinking from "expo-linking";
import * as Location from "expo-location";
import * as Network from "expo-network";
import * as WebBrowser from "expo-web-browser";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
  WebViewNavigation,
} from "react-native-webview/lib/WebViewTypes";

// Port of the existing Vite web app dev server (see ../trypo-web/vite.config.ts).
const WEB_PORT = 8443;
// Fallback when the Expo dev host can't be auto-detected (same Wi-Fi as this PC).
const FALLBACK_LAN_HOST = __DEV__ ? "192.168.100.4" : "0.0.0.0";

/** Production URL resolution order: env > app config extra > null (dev LAN). */
function productionWebUrl(): string | null {
  const fromEnv = (process.env.EXPO_PUBLIC_WEB_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fromExtra = (
    Constants.expoConfig?.extra as { webUrl?: string } | undefined
  )?.webUrl?.trim();
  if (fromExtra) return fromExtra.replace(/\/$/, "");
  return null;
}

function lanHostFromExpo(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(":")[0]?.trim();
  if (host && host !== "localhost" && host !== "127.0.0.1") return host;
  return null;
}

function resolveWebUrl(initialUrl: string | null): string {
  // 1. Explicit production override (EAS build / `expo start --web` prod test).
  const prod = productionWebUrl();
  if (prod) return prod;

  // 2. Deep-link override: trypo://?webUrl=https://staging.trypo.app
  if (initialUrl) {
    try {
      const parsed = ExpoLinking.parse(initialUrl);
      const param = parsed.queryParams?.webUrl;
      if (typeof param === "string" && /^https?:\/\//.test(param)) {
        return param.replace(/\/$/, "");
      }
    } catch {
      // ignore malformed deep link
    }
  }

  // 3. Expo web (Metro serves the shell): reuse the same host for the Vite dev server.
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const host = window.location?.hostname;
    if (host) return `http://${host}:${WEB_PORT}`;
  }

  // 4. Expo dev on device: hostUri looks like "192.168.100.4:8081" — reuse the LAN host.
  const lan = lanHostFromExpo();
  if (lan) return `http://${lan}:${WEB_PORT}`;

  return `http://${FALLBACK_LAN_HOST}:${WEB_PORT}`;
}

/** Origin (scheme + host + port) used to decide what stays inside the WebView. */
function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

// Runs before page scripts: flags the native shell so the Vite app can go
// full-bleed (no 390px phone frame) and report viewport metrics. Also sets
// up the native-location bridge consumed by Find Crew ("Share my location").
const INJECTED_BEFORE_LOAD = `
(function () {
  try {
    window.__TRYPO_NATIVE__ = true;
    window.__TRYPO_PLATFORM__ = ${JSON.stringify(Platform.OS)};
    window.__TRYPO_NATIVE_LOCATION__ = window.__TRYPO_NATIVE_LOCATION__ || null;
    document.documentElement.classList.add('trypo-native');
    var meta = document.querySelector('meta[name="viewport"]');
    var content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    if (meta) meta.setAttribute('content', content);
    else {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
    }
    var style = document.getElementById('trypo-native-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'trypo-native-style';
      style.textContent = 'html,body{overscroll-behavior:none;-webkit-text-size-adjust:100%;touch-action:manipulation;} img,video,canvas{max-width:100%;height:auto;}';
      document.head.appendChild(style);
    }
  } catch (e) {}
})();
true;
`;

// Re-asserted after load (some bundles rewrite the viewport meta).
const INJECTED_AFTER_LOAD = `
(function () {
  try {
    window.__TRYPO_NATIVE__ = true;
    document.documentElement.classList.add('trypo-native');
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  } catch (e) {}
})();
true;
`;

/** Pushes a native GPS fix into the web app (Find Crew listens for it). */
function nativeLocationJS(
  lat: number,
  lng: number,
  accuracy: number | null,
  heading: number | null
): string {
  return `(function(){try{var p={latitude:${lat},longitude:${lng},accuracy:${accuracy ?? "null"},heading:${heading ?? "null"},timestamp:Date.now()};window.__TRYPO_NATIVE_LOCATION__=p;window.dispatchEvent(new CustomEvent('trypo:native-location',{detail:p}));}catch(e){}} )();true;`;
}

// Deep link the system browser returns to after Google/Apple login.
// MUST also be allow-listed in Supabase Auth > URL Configuration.
const OAUTH_CALLBACK = "trypo://auth-callback";

/** Supabase PKCE returns the token code as ?code=... on the callback URL. */
function extractOAuthCode(returnUrl: string | null | undefined): string | null {
  if (!returnUrl) return null;
  const m = returnUrl.match(/[?#&]code=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Provider-side failure (?error=...&error_description=...) on the return URL. */
function extractOAuthError(returnUrl: string | null | undefined): string | null {
  if (!returnUrl) return null;
  const desc = returnUrl.match(/[?#&]error_description=([^&]+)/);
  if (desc) {
    try {
      return decodeURIComponent(desc[1].replace(/\+/g, " "));
    } catch {
      return desc[1];
    }
  }
  const kind = returnUrl.match(/[?#&]error=([^&]+)/);
  if (kind) {
    try {
      return `Login failed (${decodeURIComponent(kind[1])}). Please try again.`;
    } catch {
      return "Google login failed. Please try again.";
    }
  }
  return null;
}

/** Forwards an OAuth failure into the web app (shown on the login screen). */
function oauthErrorJS(message: string): string {
  return `(function(){try{window.dispatchEvent(new CustomEvent('trypo:oauth-error',{detail:{message:${JSON.stringify(
    message
  )}}}));}catch(e){}} )();true;`;
}

/** Tells the web app the browser was closed before login finished. */
function oauthCancelledJS(): string {
  return `(function(){try{window.dispatchEvent(new CustomEvent('trypo:oauth-cancelled'));}catch(e){}} )();true;`;
}

/** Delivers an OAuth code into the web app (AuthProvider exchanges it). */
function oauthCodeJS(code: string): string {
  const safe = code.replace(/[^A-Za-z0-9\-_~.]/g, "");
  return `(function(){try{window.__TRYPO_PENDING_OAUTH_CODE=${JSON.stringify(
    safe
  )};window.dispatchEvent(new CustomEvent('trypo:oauth-code',{detail:{code:${JSON.stringify(
    safe
  )}}}));}catch(e){}} )();true;`;
}

/** Forwards a deep link (trypo://… or https applink) into the web app router. */
function deepLinkJS(url: string): string {
  return `(function(){try{var u=${JSON.stringify(
    url
  )};window.__TRYPO_PENDING_DEEP_LINK=u;window.dispatchEvent(new CustomEvent('trypo:deep-link',{detail:{url:u}}));}catch(e){}} )();true;`;
}

// On Expo web, react-native-web doesn't render <WebView> — an iframe does the job.
const IFrame = "iframe" as unknown as React.ComponentType<any>;

function Shell() {
  const insets = useSafeAreaInsets();
  const [initialUrl, setInitialUrl] = useState<string | null>(null);
  const url = useMemo(() => resolveWebUrl(initialUrl), [initialUrl]);
  const webOrigin = useMemo(() => originOf(url), [url]);
  const [loading, setLoading] = useState(Platform.OS !== "web");
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [oauthInProgress, setOauthInProgress] = useState(false);
  const [showSplash, setShowSplash] = useState(Platform.OS !== "web");
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const webviewRef = useRef<WebView>(null);
  // Latest OAuth code not yet consumed by the web app (re-injected on load).
  const pendingOAuthCode = useRef<string | null>(null);
  // Latest deep link not yet consumed by the web app (re-injected on load).
  const pendingDeepLink = useRef<string | null>(null);

  /** Push an OAuth code into the page; kept until the page consumes it. */
  const deliverOAuthCode = useCallback((code: string | null) => {
    if (!code) return;
    pendingOAuthCode.current = code;
    webviewRef.current?.injectJavaScript(oauthCodeJS(code));
  }, []);

  /** Push a deep link into the page; kept until the page consumes it. */
  const deliverDeepLink = useCallback((deepUrl: string | null) => {
    if (!deepUrl) return;
    pendingDeepLink.current = deepUrl;
    webviewRef.current?.injectJavaScript(deepLinkJS(deepUrl));
  }, []);

  /**
   * Google/Apple login in the phone's real browser (Chrome Custom Tab shares
   * the Gmail session — usually one tap, no password). Google blocks sign-in
   * inside the embedded WebView, so this must never run there.
   *
   * Every outcome is reported back to the web app: success delivers the auth
   * code, while cancel/error inject an event so the login screen explains
   * what happened instead of sitting silent with the user stuck outside.
   */
  const runOAuthFlow = useCallback(
    async (providerUrl: string) => {
      const notifyError = (message: string) => {
        webviewRef.current?.injectJavaScript(oauthErrorJS(message));
      };
      setOauthInProgress(true);
      try {
        try {
          await WebBrowser.warmUpAsync();
        } catch {
          // warm-up is best-effort (Android only)
        }
        const result = await WebBrowser.openAuthSessionAsync(
          providerUrl,
          OAUTH_CALLBACK,
          { showInRecents: true }
        );
        try {
          await WebBrowser.coolDownAsync();
        } catch {
          // ignore
        }
        if (result.type === "success" && result.url) {
          const code = extractOAuthCode(result.url);
          if (code) {
            deliverOAuthCode(code);
            return;
          }
          // Returned without a code: provider refused, or Supabase did not
          // redirect to trypo://auth-callback (allow-list it in Supabase
          // Auth > URL Configuration > Redirect URLs).
          notifyError(
            extractOAuthError(result.url) ??
              "Google login finished without a session. Make sure trypo://auth-callback is allowed in Supabase Auth > URL Configuration, then retry."
          );
          return;
        }
        // cancel | dismiss | locked — user left before finishing all steps.
        webviewRef.current?.injectJavaScript(oauthCancelledJS());
      } catch {
        notifyError("Could not open the browser login. Please retry.");
      } finally {
        setOauthInProgress(false);
      }
    },
    [deliverOAuthCode]
  );
  // Expo web is a dev/test shell around the Vite app — never iframe
  // ourselves (Expo web export hosted on the same origin as EXPO_PUBLIC_WEB_URL).
  const isSelfEmbed =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    (() => {
      try {
        return new URL(url).origin === window.location.origin;
      } catch {
        return false;
      }
    })();

  useEffect(() => {
    ExpoLinking.getInitialURL().then((u) => setInitialUrl(u ?? null));
    const sub = ExpoLinking.addEventListener("url", (e) => {
      // OAuth return (system browser -> trypo://auth-callback?code=...).
      if (e.url.startsWith(OAUTH_CALLBACK)) {
        deliverOAuthCode(extractOAuthCode(e.url));
        return;
      }
      // Staging override via deep link without restarting the app.
      try {
        const parsed = ExpoLinking.parse(e.url);
        const param = parsed.queryParams?.webUrl;
        if (typeof param === "string" && /^https?:\/\//.test(param)) {
          setReloadKey((k) => k + 1);
          return;
        }
      } catch {
        // not a webUrl override — treat as an in-app deep link below
      }
      // In-app deep link (trypo://trip/…, https applink, …) -> web router.
      if (/^trypo:\/\//i.test(e.url) || /^https?:\/\//i.test(e.url)) {
        // Cold start before the page exists: remember it, deliver on load.
        if (!webviewRef.current) {
          pendingDeepLink.current = e.url;
        } else {
          deliverDeepLink(e.url);
        }
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshNetworkState = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    } catch {
      // expo-network unavailable (Expo Go web) — ignore.
    }
  }, []);

  // Pre-grant foreground location so WebView geolocation + the native
  // bridge both work inside the APK (Find Crew "Share my location").
  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: Location.LocationSubscription | null = null;
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;
        if (status !== "granted") return;
        // Push the last known fix immediately so the map centres fast.
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (last && mounted) {
            webviewRef.current?.injectJavaScript(
              nativeLocationJS(
                last.coords.latitude,
                last.coords.longitude,
                last.coords.accuracy,
                last.coords.heading
              )
            );
          }
        } catch {
          // ignore
        }
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 5,
          },
          (pos) => {
            webviewRef.current?.injectJavaScript(
              nativeLocationJS(
                pos.coords.latitude,
                pos.coords.longitude,
                pos.coords.accuracy,
                pos.coords.heading
              )
            );
          }
        );
      } catch {
        // location unavailable — web geolocation fallback still applies.
      }
    })();
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, [reloadKey]);

  // One-shot sync with the OS network state on mount (external system).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot OS sync on mount
    void refreshNetworkState();
  }, [refreshNetworkState]);

  // Android hardware back button -> web history first.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const onBack = () => {
      if (canGoBack) {
        webviewRef.current?.goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [canGoBack]);

  const openExternal = useCallback(async (target: string) => {
    try {
      // Maps / directions should leave the shell for the system Maps app.
      if (/google\.com\/maps|maps\.apple\.com|maps\/dir|geo:/i.test(target)) {
        await Linking.openURL(target);
        return;
      }
      await WebBrowser.openBrowserAsync(target, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      try {
        await Linking.openURL(target);
      } catch {
        // ignore
      }
    }
  }, []);

  /** Keep first-party + Supabase auth inside; push everything else out. */
  const shouldAllowNavigation = useCallback(
    (nav: WebViewNavigation): boolean => {
      const target = nav.url;
      // Google/Apple login pages must NEVER render inside the WebView:
      // Google blocks embedded sign-in (stuck at email, no password step).
      // Route them to the system browser with a deep-link return instead.
      if (
        /accounts\.google\.com|appleid\.apple\.com|signin\.apple\.com/i.test(
          target
        )
      ) {
        void runOAuthFlow(target);
        return false;
      }
      if (!/^https?:/.test(target) && !target.startsWith("about:")) {
        // tel:, mailto:, trypo: deep links -> system handler.
        void Linking.openURL(target).catch(() => {});
        return false;
      }
      if (target.startsWith("about:") || target.startsWith("data:")) return true;
      const targetOrigin = originOf(target);
      if (!webOrigin || !targetOrigin) return true;
      if (targetOrigin === webOrigin) return true;
      // OAuth providers + external stays usable via in-app browser.
      if (nav.navigationType === "click") {
        void openExternal(target);
        return false;
      }
      return true;
    },
    [webOrigin, openExternal, runOAuthFlow]
  );

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(e.nativeEvent.data);
        if (data?.type === "ready") {
          setShowSplash(false);
          if (splashTimer.current) {
            clearTimeout(splashTimer.current);
            splashTimer.current = null;
          }
          return;
        }
        if (data?.type === "openExternal" && typeof data.url === "string") {
          void openExternal(data.url);
          return;
        }
        // Web hands us a Google/Apple provider URL -> system browser.
        if (data?.type === "oauth" && typeof data.url === "string") {
          void runOAuthFlow(data.url);
          return;
        }
        // Web asks for the latest native GPS fix (Find Crew share fallback).
        if (data?.type === "getNativeLocation") {
          void (async () => {
            try {
              if (Platform.OS === "web") return;
              const { status } =
                await Location.getForegroundPermissionsAsync();
              if (status !== "granted") return;
              const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
              });
              webviewRef.current?.injectJavaScript(
                nativeLocationJS(
                  pos.coords.latitude,
                  pos.coords.longitude,
                  pos.coords.accuracy,
                  pos.coords.heading
                )
              );
            } catch {
              // ignore — web falls back to navigator.geolocation
            }
          })();
        }
      } catch {
        // plain string messages ignored
      }
    },
    [openExternal, runOAuthFlow]
  );

  const handleError = (e: WebViewErrorEvent) => {
    setLoading(false);
    void refreshNetworkState();
    setError(
      e?.nativeEvent?.description || "Impossible de joindre l'application web."
    );
  };

  const handleHttpError = (e: WebViewHttpErrorEvent) => {
    setLoading(false);
    setError(
      `Erreur HTTP ${e?.nativeEvent?.statusCode} — impossible de joindre l'application web.`
    );
  };

  const retry = () => {
    setError(null);
    setLoading(Platform.OS !== "web");
    setShowSplash(Platform.OS !== "web");
    if (splashTimer.current) {
      clearTimeout(splashTimer.current);
      splashTimer.current = null;
    }
    void refreshNetworkState();
    setReloadKey((k) => k + 1);
    webviewRef.current?.reload();
  };

  return (
    <View
      style={[
        styles.root,
        Platform.OS !== "web"
          ? {
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              paddingLeft: insets.left,
              paddingRight: insets.right,
            }
          : undefined,
      ]}
    >
      <StatusBar style="light" />

      {Platform.OS === "web" ? (
        isSelfEmbed ? (
          <View style={styles.overlay}>
            <Text style={styles.errorTitle}>Trypo tourne déjà ici</Text>
            <Text style={styles.overlayText}>
              Cette page est le shell Expo web — l&apos;app est servie par la
              même origine (<Text style={styles.mono}>{url}</Text>). Ouvre
              directement l&apos;URL ci-dessus au lieu de l&apos;imbriquer.
            </Text>
          </View>
        ) : (
          <IFrame
            key={reloadKey}
            src={url}
            title="Trypo"
            style={styles.frame}
            allow="geolocation; camera; microphone"
            allowFullScreen
          />
        )
      ) : (
        <WebView
          key={reloadKey}
          ref={webviewRef}
          source={{ uri: url }}
          style={styles.webview}
          originWhitelist={["*"]}
          injectedJavaScriptBeforeContentLoaded={INJECTED_BEFORE_LOAD}
          injectedJavaScript={INJECTED_AFTER_LOAD}
          onMessage={handleMessage}
          onShouldStartLoadWithRequest={shouldAllowNavigation}
          onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
          // App needs these: routing, storage, media, WebGL (Mapbox), geolocation.
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          allowsAirPlayForMediaPlayback
          allowsFullscreenVideo
          geolocationEnabled
          allowsBackForwardNavigationGestures={false}
          startInLoadingState={false}
          cacheEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          allowsLinkPreview={false}
          pullToRefreshEnabled={false}
          bounces={false}
          overScrollMode="never"
          androidLayerType="hardware"
          // True mobile rendering: no desktop scaling, no font inflation.
          scalesPageToFit={false}
          textZoom={100}
          contentMode="mobile"
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          automaticallyAdjustContentInsets={false}
          setSupportMultipleWindows={false}
          onLoadStart={() => {
            setLoading(true);
            setError(null);
          }}
          onLoadEnd={() => {
            setLoading(false);
            // Give the SPA time to hydrate; web app can dismiss earlier via postMessage({type:"ready"})
            splashTimer.current = setTimeout(() => setShowSplash(false), 2000);
            // OAuth code may have arrived before the page was ready.
            if (pendingOAuthCode.current) {
              webviewRef.current?.injectJavaScript(
                oauthCodeJS(pendingOAuthCode.current)
              );
            }
            // Cold-start deep link (tap notification/link while closed).
            if (pendingDeepLink.current) {
              webviewRef.current?.injectJavaScript(
                deepLinkJS(pendingDeepLink.current)
              );
            } else if (initialUrl && !initialUrl.startsWith(OAUTH_CALLBACK)) {
              try {
                const parsed = ExpoLinking.parse(initialUrl);
                const param = parsed.queryParams?.webUrl;
                const isWebUrlOverride =
                  typeof param === "string" && /^https?:\/\//.test(param);
                if (!isWebUrlOverride) {
                  webviewRef.current?.injectJavaScript(deepLinkJS(initialUrl));
                }
              } catch {
                // ignore malformed initial URL
              }
            }
          }}
          onError={handleError}
          onHttpError={handleHttpError}
        />
      )}

      {isOffline && !error && (
        <View
          style={[styles.offlineBar, { top: Platform.OS !== "web" ? insets.top : 0 }]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Text style={styles.offlineText}>📡 Hors connexion — vérifie ton réseau</Text>
        </View>
      )}

      {(loading || showSplash) && !error && Platform.OS !== "web" && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#3B41C8" accessibilityLabel="Chargement en cours" />
          <Text style={styles.overlayText}>Chargement de Trypo…</Text>
          {__DEV__ && <Text style={styles.overlaySub}>{url}</Text>}
        </View>
      )}

      {oauthInProgress && !error && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator
            size="large"
            color="#3B41C8"
            accessibilityLabel="Connexion en cours"
          />
          <Text style={styles.overlayText}>Connexion en cours…</Text>
          <Text style={styles.overlaySub}>Reviens dans l&apos;app après validation</Text>
        </View>
      )}

      {error && (
        <View
          style={[styles.overlay, { paddingBottom: Math.max(insets.bottom, 32) }]}
        >
          <Text style={styles.errorTitle}>⚠️ Connexion impossible</Text>
          <Text style={styles.overlayText}>
            {__DEV__ ? (
              <>
                Vérifie que l&apos;app web tourne sur{"\n"}
                <Text style={styles.mono}>{url}</Text>
                {"\n"}et que le téléphone est sur le même Wi-Fi.{"\n"}En
                production, définis EXPO_PUBLIC_WEB_URL.
              </>
            ) : (
              "Impossible de charger Trypo. Vérifie ta connexion internet et réessaye."
            )}
          </Text>
          <Pressable
            style={styles.retryButton}
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Réessayer le chargement"
          >
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0c2e",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0a0c2e",
  },
  frame: {
    flex: 1,
    width: "100%",
    height: "100%",
    borderWidth: 0,
  } as any,
  offlineBar: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#ef4444",
    paddingVertical: 6,
    alignItems: "center",
    zIndex: 10,
  },
  offlineText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0a0c2e",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  overlayText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  overlaySub: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    textAlign: "center",
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
  },
  errorTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: "#3B41C8",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
});
