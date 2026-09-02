import { useEffect, useRef, type RefObject } from 'react'

/** Calls `onOutside` on any pointerdown outside the returned ref's element.
 * Skips while `active` is false. Pass `extraRef` when part of the
 * "inside" area lives elsewhere in the DOM (e.g. a dropdown menu portaled
 * to document.body instead of nesting under the trigger it belongs to) —
 * a click inside either ref counts as inside. */
export default function useClickOutside<T extends HTMLElement>(
  active: boolean,
  onOutside: () => void,
  extraRef?: RefObject<HTMLElement | null>,
) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!active) return
    function handle(event: MouseEvent) {
      if (!(event.target instanceof Node)) return
      const inside = ref.current?.contains(event.target) || extraRef?.current?.contains(event.target)
      if (!inside) onOutside()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [active, onOutside, extraRef])

  return ref
}
