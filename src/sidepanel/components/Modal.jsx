import React, { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const Modal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  placeholder,
  initialValue = '',
  confirmLabel = 'OK',
  children,
}) => {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef(null)

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setValue(initialValue)
    }
  }

  useEffect(() => {
    if (isOpen && !children) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, children])

  if (!isOpen) return null

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim())
      onClose()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && value.trim()) {
      handleConfirm()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="w-full max-w-sm bg-zen-surface rounded-2xl shadow-2xl border border-zen-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zen-border flex items-center justify-between bg-zen-bg/50">
          <h3 className="text-sm font-semibold text-zen-text">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-zen-muted hover:text-zen-text hover:bg-zen-bg rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {children ? (
            children
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full px-4 py-2.5 bg-zen-bg border border-zen-border rounded-xl text-sm text-zen-text focus:outline-none focus:ring-2 focus:ring-zen-accent/50 focus:border-zen-accent transition-all duration-200"
            />
          )}
        </div>

        {confirmLabel && (
          <div className="px-5 py-4 bg-zen-bg/50 border-t border-zen-border flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zen-text-secondary hover:bg-zen-border rounded-lg transition-colors"
            >
              {chrome.i18n.getMessage('cancel') || 'Cancel'}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!value.trim()}
              className="px-5 py-2 text-sm font-semibold text-white bg-zen-accent hover:bg-zen-accent/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm shadow-zen-accent/20 transition-all active:scale-95"
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Modal
