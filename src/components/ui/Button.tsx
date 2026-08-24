import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from '../../lib/clsx'

type Variant = 'primary' | 'ghost' | 'text' | 'danger-text'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: ReactNode
  block?: boolean
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  text: 'btn-text',
  'danger-text': 'btn-danger-text',
}

export default function Button({
  variant = 'primary',
  icon,
  block,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx('btn', VARIANT_CLASS[variant], block && 'btn-block', className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
