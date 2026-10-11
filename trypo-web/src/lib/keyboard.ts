/**
 * Mobile keyboard stability.
 *
 * Two things randomly dismiss the keyboard on phones:
 *
 * 1. Ghost clicks on sheet backdrops. A tap on an input opens the keyboard,
 *    which resizes the layout *between* pointerdown and click. The click then
 *    lands on whatever slid under the finger (usually the dimmed backdrop),
 *    so the sheet instantly closes — and the keyboard with it. We swallow
 *    that single layout-shifted click when a field just took focus.
 *
 * 2. The focused field staying hidden behind the keyboard (iOS won't scroll
 *    it into view inside fixed/absolute sheets), so the next tap lands
 *    outside the field and blurs it. We nudge it into view after focus.
 *
 * Installed once from main.tsx. Never throws, never blocks real taps:
 * taps that don't straddle a resize pass through untouched.
 */

let installed = false

export function initMobileKeyboard(): void {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return
  installed = true

  const viewportHeight = () => window.visualViewport?.height ?? window.innerHeight

  let downHeight = viewportHeight()
  let lastResizeAt = 0

  document.addEventListener(
    "pointerdown",
    () => {
      downHeight = viewportHeight()
    },
    { capture: true, passive: true },
  )

  const markResize = () => {
    lastResizeAt = Date.now()
  }
  try {
    window.visualViewport?.addEventListener("resize", markResize, { passive: true })
  } catch {
    /* older browsers */
  }
  window.addEventListener("resize", markResize, { passive: true })

  const focusedField = (): boolean => {
    const ae = document.activeElement as HTMLElement | null
    if (!ae) return false
    return ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT"
  }

  // Capture phase runs before React's root listeners: stopping propagation
  // here prevents the backdrop onClick from firing on a ghost click.
  document.addEventListener(
    "click",
    (e) => {
      try {
        const shifted = Math.abs(viewportHeight() - downHeight) > 120
        const freshResize = Date.now() - lastResizeAt < 600
        if ((shifted || freshResize) && focusedField()) {
          e.stopPropagation()
        }
      } catch {
        /* never break taps */
      }
    },
    { capture: true },
  )

  document.addEventListener(
    "focusin",
    (e) => {
      const el = e.target as HTMLElement | null
      if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      // Wait for the keyboard to start opening, then ensure visibility.
      // "nearest" never over-scrolls pages that already show the field.
      window.setTimeout(() => {
        try {
          el.scrollIntoView({ block: "nearest", inline: "nearest" })
        } catch {
          /* ignore */
        }
      }, 300)
    },
    { passive: true },
  )
}
