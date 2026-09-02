import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useClickOutside from '../../lib/useClickOutside'

export interface DropdownOption {
  label: string
  value: string
}

interface DropdownProps {
  /** Label shown on the trigger when nothing (or "all") is selected. */
  allLabel: string
  options: DropdownOption[]
  value: string | null
  onChange: (value: string | null) => void
  icon?: ReactNode
  /** Visual style of the trigger button — matches the surrounding toolbar. */
  variant?: 'chip' | 'pill'
  align?: 'left' | 'right'
}

export default function Dropdown({
  allLabel,
  options,
  value,
  onChange,
  icon,
  variant = 'chip',
  align = 'left',
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // The menu portals to document.body (see the comment below), so a click
  // inside it no longer lands inside this wrapper — useClickOutside needs
  // both refs to know a click on an option isn't "outside".
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false), menuRef)

  const selected = options.find((o) => o.value === value)
  const label = selected ? selected.label : allLabel

  // Recomputed every time the menu opens (and on scroll/resize while open)
  // from the trigger button's own position, since the menu itself no
  // longer lives next to the button in the DOM.
  useLayoutEffect(() => {
    if (!open) return
    function measure() {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      setPos(
        align === 'right'
          ? { top: rect.bottom + 8, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 8, left: rect.left },
      )
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align])

  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className={variant === 'pill' ? 'filter-pill' : 'filter-chip'}
        aria-selected={value ? 'true' : undefined}
        aria-current={variant === 'pill' && value ? 'true' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {label}
        <ChevronDown style={{ width: 14, height: 14 }} />
      </button>
      {open &&
        pos &&
        createPortal(
          // Portaled straight to <body> rather than nested under the
          // toolbar/card that opens it — nesting it there put the menu
          // inside an ancestor with its own backdrop-filter, and in testing
          // that combination made every option past the first render blank
          // (a compositing bug, not a CSS mistake: DOM/computed styles were
          // all correct, the pixels just didn't show up). Fixed-position +
          // portaled sidesteps it entirely, and also escapes any ancestor's
          // overflow/z-index instead of fighting it card by card.
          <div
            ref={menuRef}
            className="dropdown-menu"
            role="listbox"
            style={{ position: 'fixed', top: pos.top, left: pos.left, right: pos.right }}
          >
            <button
              type="button"
              className="dropdown-item"
              role="option"
              aria-selected={!value}
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              {allLabel}
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="dropdown-item"
                role="option"
                aria-selected={value === opt.value}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
