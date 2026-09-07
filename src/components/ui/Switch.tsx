import clsx from '../../lib/clsx'

interface SwitchProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  label: string
  size?: 'default' | 'sm'
  disabled?: boolean
}

export default function Switch({ checked, onChange, label, size = 'default', disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={clsx('switch', size === 'sm' && 'switch-sm')}
      style={disabled ? { opacity: 0.5, cursor: 'default' } : undefined}
      onClick={() => onChange?.(!checked)}
    />
  )
}
