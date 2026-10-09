import { useEffect, useState } from "react"

/** True when the viewport is desktop-wide. Phones + APK shell stay false. */
export function useIsDesktop(breakpoint = 768): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= breakpoint : false,
  )
  useEffect(() => {
    const onResize = () => setDesktop(window.innerWidth >= breakpoint)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [breakpoint])
  return desktop
}
