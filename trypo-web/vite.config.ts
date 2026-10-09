import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import fs from "node:fs"

import siteConfiguration from "./.figma/make/site.json" with { type: "json" }

// Vite config — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // .figma/make/deploy-preview passes `--mode development` for cached-preview builds.
  const emitSourcemaps = mode === "development"

  return {
    base: process.env.FIGMA_PUBLIC_URL
      ? `${process.env.FIGMA_PUBLIC_URL}/`
      : "/",
    build: {
      sourcemap: emitSourcemaps ? "inline" : false,
      minify: !emitSourcemaps,
    },
    plugins: [
      react(),
      tailwindcss(),
      sharedTripBackendPlugin(),
      figmaSiteConfiguration(siteConfiguration),
      figmaErrorOverlayReplay(),
      figmaReactRefreshBoundaryFallback(),
      figmaMakeKitPlugin({ storiesGlob: "/src/**/*.stories.{ts,tsx,js,jsx}" }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: parseInt(process.env.PORT || "8443"),
      strictPort: true,
      allowedHosts: true,
      watch: { ignored: ["**/.figma/**", "**/.trips-shared-db.json", "**/node_modules/.cache/**"] },
    },
    preview: {
      host: "0.0.0.0",
      port: parseInt(process.env.PORT || "8443"),
      allowedHosts: true,
    },
  }
})

type FigmaSiteConfiguration = {
  title?: string
  description?: string
  language?: string
  robots?: {
    index?: boolean
  }
  icons?: {
    icon?: string
  }
  openGraph?: {
    image?: string
  }
  analytics?: {
    googleAnalyticsId?: string
  }
  customScripts?: {
    headStart?: string
    headEnd?: string
    bodyStart?: string
    bodyEnd?: string
  }
  accessibility?: {
    addBypassLinks?: boolean
  }
}

/** Applies /.figma/make/site.json to the generated document shell. */
function figmaSiteConfiguration(config: FigmaSiteConfiguration): Plugin {
  function sanitizeHtmlValue(value: string | undefined): string {
    return value?.replace(/[^a-zA-Z0-9_-]/g, "") || ""
  }
  function escapeHtmlText(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  }
  function replaceHtmlCommentSlot(
    html: string,
    slotName: string,
    content: string,
  ): string {
    return html.replace(`<!-- ${slotName} -->`, content)
  }

  const title = config.title ?? "Figma Make App"
  const description = config.description ?? ""
  const favicon = config.icons?.icon ?? ""
  const socialImage = config.openGraph?.image ?? ""
  const language = sanitizeHtmlValue(config.language) || "en"
  const googleAnalyticsId = sanitizeHtmlValue(
    config.analytics?.googleAnalyticsId,
  )
  const headStart = config.customScripts?.headStart ?? ""
  const headEnd = config.customScripts?.headEnd ?? ""
  const bodyStart = config.customScripts?.bodyStart ?? ""
  const bodyEnd = config.customScripts?.bodyEnd ?? ""
  const robotsTxt =
    config.robots?.index === false ? "User-agent: *\nDisallow: /\n" : ""

  return {
    name: "figma-site-configuration",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!robotsTxt || req.url?.split("?")[0] !== "/robots.txt")
          return next()

        res.setHeader("Content-Type", "text/plain; charset=utf-8")
        res.end(robotsTxt)
      })
    },
    generateBundle() {
      if (!robotsTxt) return

      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: robotsTxt,
      })
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        let result = html
        result = replaceHtmlCommentSlot(result, "figma:lang", language)
        result = replaceHtmlCommentSlot(
          result,
          "figma:title",
          escapeHtmlText(title),
        )
        result = replaceHtmlCommentSlot(result, "figma:head-start", headStart)
        result = replaceHtmlCommentSlot(result, "figma:head-end", headEnd)
        result = replaceHtmlCommentSlot(result, "figma:body-start", bodyStart)
        result = replaceHtmlCommentSlot(result, "figma:body-end", bodyEnd)

        const tags: HtmlTagDescriptor[] = []
        if (description) {
          tags.push({
            tag: "meta",
            attrs: { name: "description", content: description },
            injectTo: "head",
          })
        }
        if (config.robots?.index === false) {
          tags.push({
            tag: "meta",
            attrs: { name: "robots", content: "noindex, nofollow" },
            injectTo: "head",
          })
        }
        if (favicon) {
          tags.push({
            tag: "link",
            attrs: { rel: "icon", href: favicon },
            injectTo: "head",
          })
        }
        if (title) {
          tags.push({
            tag: "meta",
            attrs: { property: "og:title", content: title },
            injectTo: "head",
          })
        }
        if (description) {
          tags.push({
            tag: "meta",
            attrs: { property: "og:description", content: description },
            injectTo: "head",
          })
        }
        if (socialImage) {
          tags.push(
            {
              tag: "meta",
              attrs: { property: "og:image", content: socialImage },
              injectTo: "head",
            },
            {
              tag: "meta",
              attrs: { name: "twitter:card", content: "summary_large_image" },
              injectTo: "head",
            },
            {
              tag: "meta",
              attrs: { name: "twitter:image", content: socialImage },
              injectTo: "head",
            },
          )
        }

        if (googleAnalyticsId) {
          tags.push(
            {
              tag: "script",
              attrs: {
                async: true,
                src: `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`,
              },
              injectTo: "head",
            },
            {
              tag: "script",
              children: `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', ${JSON.stringify(googleAnalyticsId)});
`,
              injectTo: "head",
            },
          )
        }

        if (config.accessibility?.addBypassLinks) {
          tags.push(
            {
              tag: "style",
              children: `
  .figma-bypass-link {
    position: fixed;
    top: 8px;
    left: 8px;
    z-index: 2147483647;
    transform: translateY(-150%);
    border-radius: 6px;
    background: #111827;
    color: #fff;
    padding: 8px 12px;
    font: 600 14px/1.2 system-ui, sans-serif;
    text-decoration: none;
  }
  .figma-bypass-link:focus {
    transform: translateY(0);
  }
`,
              injectTo: "head",
            },
            {
              tag: "a",
              attrs: { class: "figma-bypass-link", href: "#root" },
              children: "Skip to content",
              injectTo: "body-prepend",
            },
          )
        }

        return {
          html: result,
          tags,
        }
      },
    },
  }
}

/**
 * Replay the most recent build error to clients that connect after
 * it was first broadcast. Vite buffers an error payload only while
 * no clients are connected and clears the buffer on the first
 * reconnect (see `bufferedMessage` in `createWebSocketServer`), so
 * if the preview iframe reloads after Vite already delivered an
 * error to a live socket, the new socket misses the payload and
 * the overlay stays hidden even though the build is still broken.
 * We intercept `ws.send` to remember the latest error and replay
 * it on every new connection; the cache clears on a successful
 * `update` or `full-reload` so a stale overlay can't survive a
 * fixed build.
 */
function figmaErrorOverlayReplay(): Plugin {
  return {
    name: "figma-error-overlay-replay",
    apply: "serve",
    configureServer(server) {
      let lastError: object | null = null

      const origSend = server.ws.send.bind(server.ws) as (
        ...args: any[]
      ) => void
      server.ws.send = (((...args: any[]) => {
        const payload = args[0]
        if (payload && typeof payload === "object" && !Array.isArray(payload)) {
          const type = (payload as { type?: string }).type
          if (type === "error") {
            lastError = (payload as object)
          } else if (type === "update" || type === "full-reload") {
            lastError = null
          }
        }
        return origSend(...args)
      }) as typeof server.ws.send)

      server.ws.on("connection", (socket) => {
        if (lastError !== null) {
          socket.send(JSON.stringify(lastError))
        }
      })
    },
  }
}

/**
 * Reload when a module that previously defined a React Refresh boundary stops
 * defining one. This happens when an agent moves a component into a new file
 * and replaces the old module with a re-export:
 *
 *   export { default } from './app/App'
 *
 * Vite otherwise accepts the update using the previous module's HMR boundary,
 * but the re-export-only transform no longer registers a replacement for the
 * mounted component family. React reports a successful refresh while leaving
 * the old tree mounted until the page is reloaded.
 */
function figmaReactRefreshBoundaryFallback(): Plugin {
  const hadRefreshBoundary = new Map<string, boolean>()
  let sendFullReload: (() => void) | null = null

  return {
    name: "figma-react-refresh-boundary-fallback",
    apply: "serve",
    enforce: "post",
    configureServer(server) {
      sendFullReload = () => server.ws.send({ type: "full-reload", path: "*" })
    },
    transform(code, id) {
      if (!/\.[jt]sx?(?:\?|$)/.test(id) || id.includes("/node_modules/"))
        return null

      const moduleId = id.split("?")[0] ?? id
      const hasRefreshBoundary = code.includes("registerExportsForReactRefresh")
      const previousHadRefreshBoundary = hadRefreshBoundary.get(moduleId)
      hadRefreshBoundary.set(moduleId, hasRefreshBoundary)

      if (previousHadRefreshBoundary && !hasRefreshBoundary) {
        queueMicrotask(() => sendFullReload?.())
      }

      return null
    },
  }
}

/**
 * Serves a blank render-target page at /.figma/make/kit.html that
 * the Figma preview script drives directly. The page exposes a
 * registry of every file matching `storiesGlob` on
 * window.__FIGMA__.stories so the design surface can dynamically
 * import + mount each entry into its own grid view.
 *
 * Dev-only: `apply: 'serve'` gates the plugin to `vite dev`. Prod
 * builds (`vite build`) skip it entirely so the route doesn't leak
 * into shipped bundles.
 */
function figmaMakeKitPlugin(options: {
  storiesGlob: string | string[]
}): Plugin {
  const storiesGlob = Array.isArray(options.storiesGlob)
    ? options.storiesGlob
    : [options.storiesGlob]
  const ROUTE = "/.figma/make/kit.html"
  const VIRTUAL_ID = "virtual:figma-stories"
  const RESOLVED_ID = "\0" + VIRTUAL_ID
  const STORIES_MODULE = `export const stories = import.meta.glob(${JSON.stringify(storiesGlob)})`
  const HTML_BOOTSTRAP = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body>
<div id="figma-make-kit-root"></div>
<script type="module">
  import { stories } from 'virtual:figma-stories'
  window.__FIGMA__ = Object.assign(window.__FIGMA__ ?? {}, { stories })
  window.dispatchEvent(new CustomEvent('figma.ready'))
</script>
</body>
</html>`

  return {
    name: "figma-make-kit",
    apply: "serve",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
      return null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      return STORIES_MODULE
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ""
        if (url.split("?")[0] !== ROUTE) return next()

        try {
          res.setHeader("Content-Type", "text/html")
          res.end(await server.transformIndexHtml(url, HTML_BOOTSTRAP))
        } catch (err) {
          next(err as Error)
        }
      })
    },
  }
}

function sharedTripBackendPlugin(): Plugin {
  const cacheDir = path.resolve(import.meta.dirname, "node_modules", ".cache", "trypo")
  const dbPath = path.resolve(cacheDir, "shared-trips.json")
  const locPath = path.resolve(cacheDir, "shared-locations.json")

  const readDb = (): { trips: any[] } => {
    try {
      if (fs.existsSync(dbPath)) {
        const raw = fs.readFileSync(dbPath, "utf-8")
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.trips)) return parsed
      }
    } catch {}
    return { trips: [] }
  }

  const writeDb = (data: { trips: any[] }) => {
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true })
      }
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf-8")
    } catch (e) {
      console.warn("[shared-trip-backend] write error:", e)
    }
  }

  // Cross-account live GPS relay used by the Find My Crew screen. It mirrors
  // the `crew_locations` table so guest/local accounts (no Supabase session)
  // can still share positions between tabs and devices behind this process.
  const readLocations = (): any[] => {
    try {
      if (fs.existsSync(locPath)) {
        const raw = fs.readFileSync(locPath, "utf-8")
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return []
  }

  const writeLocations = (locations: any[]) => {
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true })
      }
      const now = Date.now()
      const pruned = locations
        .filter((l) => {
          const ts = new Date(l.updatedAt ?? l.updated_at ?? 0).getTime()
          return Number.isFinite(ts) && now - ts < 4 * 60 * 60 * 1000
        })
        .map((l) => ({
          tripId: l.tripId ?? l.trip_id,
          userId: l.userId ?? l.user_id,
          deviceId: l.deviceId ?? l.device_id ?? "default",
          lat: Number(l.lat),
          lng: Number(l.lng),
          heading: l.heading ?? null,
          accuracy: l.accuracy ?? null,
          locationName: l.locationName ?? l.location_name ?? null,
          updatedAt: l.updatedAt ?? l.updated_at ?? new Date().toISOString(),
        }))
      fs.writeFileSync(locPath, JSON.stringify(pruned, null, 2), "utf-8")
    } catch (e) {
      console.warn("[shared-trip-backend] writeLocations error:", e)
    }
  }

  const upsertLocations = (incoming: any): any[] => {
    const locs = readLocations()
    const list = Array.isArray(incoming) ? incoming : [incoming]
    for (const item of list) {
      const loc = {
        tripId: item.tripId ?? item.trip_id,
        userId: item.userId ?? item.user_id ?? "guest",
        deviceId: item.deviceId ?? item.device_id ?? "default",
        lat: Number(item.lat),
        lng: Number(item.lng),
        heading: item.heading ?? null,
        accuracy: item.accuracy ?? null,
        locationName: item.locationName ?? item.location_name ?? null,
        updatedAt: item.updatedAt ?? item.updated_at ?? new Date().toISOString(),
      }
      if (!loc.tripId || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue
      const idx = locs.findIndex(
        (l) => l.tripId === loc.tripId && l.userId === loc.userId && (l.deviceId || "default") === loc.deviceId,
      )
      if (idx >= 0) locs[idx] = loc
      else locs.unshift(loc)
    }
    writeLocations(locs)
    return locs
  }

  return {
    name: "shared-trip-backend",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || ""
        const isTrip = url.startsWith("/api/trips")
        const isLoc = url.startsWith("/api/locations")
        if (!isTrip && !isLoc) {
          return next()
        }

        res.setHeader("Content-Type", "application/json")
        res.setHeader("Access-Control-Allow-Origin", "*")
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type")

        // GET /api/locations  (optionally ?tripId=xxx)
        if (req.method === "GET" && isLoc) {
          try {
            const urlObj = new URL(url, "http://localhost")
            const tripId = urlObj.searchParams.get("tripId")?.trim()
            let rows = readLocations()
            if (tripId) rows = rows.filter((l) => l.tripId === tripId)
            res.statusCode = 200
            return res.end(JSON.stringify(rows))
          } catch (e: any) {
            res.statusCode = 500
            return res.end(JSON.stringify({ success: false, error: e?.message }))
          }
        }

        // POST /api/locations  (single object or array; upsert by trip/user/device)
        if (req.method === "POST" && isLoc) {
          let body = ""
          req.on("data", (chunk: any) => {
            body += chunk
          })
          req.on("end", () => {
            try {
              const incoming = JSON.parse(body)
              const rows = upsertLocations(incoming)
              res.statusCode = 200
              return res.end(JSON.stringify({ success: true, count: rows.length }))
            } catch (err: any) {
              res.statusCode = 400
              return res.end(JSON.stringify({ success: false, error: err?.message }))
            }
          })
          return
        }

        if (req.method === "OPTIONS") {
          res.statusCode = 204
          return res.end()
        }

        // GET /api/trips
        if (req.method === "GET" && (url === "/api/trips" || url === "/api/trips/")) {
          const db = readDb()
          res.statusCode = 200
          return res.end(JSON.stringify(db.trips))
        }

        // GET /api/trips/join?code=XXX
        if (req.method === "GET" && url.startsWith("/api/trips/join")) {
          try {
            const urlObj = new URL(url, "http://localhost")
            const code = (urlObj.searchParams.get("code") || "").trim().toUpperCase()
            const db = readDb()
            const found = db.trips.find(
              (t: any) =>
                (t.invite_code && t.invite_code.toUpperCase() === code) ||
                (t.id && t.id.toUpperCase() === code) ||
                (t.title && t.title.toUpperCase().includes(code))
            )
            if (found) {
              res.statusCode = 200
              return res.end(JSON.stringify({ success: true, trip: found }))
            } else {
              res.statusCode = 404
              return res.end(JSON.stringify({ success: false, message: "Code introuvable sur le serveur." }))
            }
          } catch (e: any) {
            res.statusCode = 500
            return res.end(JSON.stringify({ success: false, message: e?.message }))
          }
        }

        // POST /api/trips (save / sync trip)
        if (req.method === "POST" && url.startsWith("/api/trips")) {
          let body = ""
          req.on("data", (chunk: any) => {
            body += chunk
          })
          req.on("end", () => {
            try {
              const incoming = JSON.parse(body)
              const db = readDb()
              if (Array.isArray(incoming)) {
                incoming.forEach((t) => {
                  const idx = db.trips.findIndex((x) => x.id === t.id)
                  if (idx >= 0) db.trips[idx] = t
                  else db.trips.unshift(t)
                })
              } else if (incoming && incoming.id) {
                const idx = db.trips.findIndex((x) => x.id === incoming.id)
                if (idx >= 0) db.trips[idx] = incoming
                else db.trips.unshift(incoming)
              }
              writeDb(db)
              res.statusCode = 200
              return res.end(JSON.stringify({ success: true }))
            } catch (err: any) {
              res.statusCode = 400
              return res.end(JSON.stringify({ success: false, error: err?.message }))
            }
          })
          return
        }

        next()
      })
    },
  }
}
