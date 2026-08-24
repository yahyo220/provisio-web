import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import clsx from '../../lib/clsx'
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
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false))

  const selected = options.find((o) => o.value === value)
  const label = selected ? selected.label : allLabel

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
      {open && (
        <div className={clsx('dropdown-menu', align === 'right' && 'align-right')} role="listbox">
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
        </div>
      )}
    </div>
  )
}
