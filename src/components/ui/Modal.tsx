import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import clsx from '../../lib/clsx'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Wider dialog for forms and tables (receipt lines, batch lists). */
  wide?: boolean
}

export default function Modal({ title, onClose, children, footer, wide = false }: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={clsx('modal', wide && 'modal-wide')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
