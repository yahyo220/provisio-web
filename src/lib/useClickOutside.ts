import { useEffect, useRef } from 'react'

/** Calls `onOutside` on any pointerdown outside the returned ref's element. Skips while `active` is false. */
export default function useClickOutside<T extends HTMLElement>(active: boolean, onOutside: () => void) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!active) return
    function handle(event: MouseEvent) {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) {
        onOutside()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [active, onOutside])

  return ref
}
