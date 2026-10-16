import { useState, useRef, useEffect } from "react"

/**
 * useSmoothStream - Throttled smooth stream flow for chat output.
 *
 * Prevents high-frequency React thrashing while ensuring characters flow in steady,
 * natural micro-batches without locking up the UI thread or exceeding call stacks.
 */
export function useSmoothStream(
  targetText: string,
  isStreaming = false,
): string {
  const [displayedText, setDisplayedText] = useState(targetText)
  const displayedRef = useRef(targetText)
  const targetRef = useRef(targetText)
  const isStreamingRef = useRef(isStreaming)
  const timerRef = useRef<number | null>(null)

  targetRef.current = targetText
  isStreamingRef.current = isStreaming

  useEffect(() => {
    // If not actively streaming or text was reset/shortened, sync immediately
    if (!isStreaming || targetText.length <= displayedRef.current.length) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      displayedRef.current = targetText
      setDisplayedText(targetText)
      return
    }

    if (timerRef.current !== null) {
      return
    }

    const stepPace = () => {
      const current = displayedRef.current
      const target = targetRef.current
      const streaming = isStreamingRef.current

      if (!streaming || current.length >= target.length) {
        displayedRef.current = target
        setDisplayedText(target)
        timerRef.current = null
        return
      }

      const diff = target.length - current.length

      // Dynamic pacing capped at ~33 updates/sec (30ms intervals):
      // - Huge backlog (>120 chars): step rapidly to catch up without delay
      // - Medium backlog (>50 chars): step medium
      // - Close to real-time: steady 2-4 chars
      let step = 2
      if (diff > 120) {
        step = Math.max(16, Math.ceil(diff / 4))
      } else if (diff > 50) {
        step = Math.max(8, Math.ceil(diff / 6))
      } else if (diff > 20) {
        step = Math.max(4, Math.ceil(diff / 8))
      } else {
        step = 2
      }

      const nextLength = Math.min(target.length, current.length + step)
      const nextText = target.slice(0, nextLength)
      displayedRef.current = nextText
      setDisplayedText(nextText)

      if (nextLength < target.length) {
        timerRef.current = window.setTimeout(stepPace, 30)
      } else {
        timerRef.current = null
      }
    }

    timerRef.current = window.setTimeout(stepPace, 30)

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [targetText, isStreaming])

  return isStreaming ? displayedText : targetText
}
