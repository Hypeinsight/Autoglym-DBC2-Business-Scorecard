import { useEffect, useRef, useState } from 'react'

/**
 * Animates a pre-formatted display string (e.g. "2.2M", "$37.17", "52.8%")
 * by counting up its leading numeric portion from 0 while leaving any
 * prefix/suffix (currency symbol, unit letter, %) untouched. There's no raw
 * number available client-side - cards only ever receive the server's
 * already-formatted string - so this parses just enough to animate without
 * needing to know the metric's underlying format rules.
 *
 * Non-numeric strings (e.g. "-", "1:48" duration, "Healthy") pass through
 * unanimated, since there's nothing sensible to count up from.
 */
export function useCountUp(target: string, durationMs = 700): string {
  const [display, setDisplay] = useState(target)
  const prevTarget = useRef<string | null>(null)
  const frameRef = useRef<number>()

  useEffect(() => {
    if (target === prevTarget.current) return
    prevTarget.current = target

    const match = target.match(/^([^0-9.-]*)([\d,]*\.?\d+)(.*)$/)
    if (!match) {
      setDisplay(target)
      return
    }
    const [, prefix, numStr, suffix] = match
    const endValue = Number(numStr.replace(/,/g, ''))
    if (Number.isNaN(endValue)) {
      setDisplay(target)
      return
    }
    const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0
    const hasThousandsSeparator = numStr.includes(',')

    const startTime = performance.now()
    if (frameRef.current) cancelAnimationFrame(frameRef.current)

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / durationMs)
      // ease-out cubic - fast start, settles gently rather than a linear count
      const eased = 1 - (1 - progress) ** 3
      const value = endValue * eased
      const formatted = value.toFixed(decimals)
      const withSeparators = hasThousandsSeparator
        ? Number(formatted).toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : formatted
      setDisplay(`${prefix}${withSeparators}${suffix}`)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [target, durationMs])

  return display
}
