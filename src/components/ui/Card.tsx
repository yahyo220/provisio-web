import type { HTMLAttributes } from 'react'
import clsx from '../../lib/clsx'

export default function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('card', className)} {...rest} />
}
