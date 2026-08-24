import clsx from '../../lib/clsx'

interface SwitchProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  label: string
  size?: 'default' | 'sm'
}

export default function Switch({ checked, onChange, label, size = 'default' }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={clsx('switch', size === 'sm' && 'switch-sm')}
      onClick={() => onChange?.(!checked)}
    />
  )
}
