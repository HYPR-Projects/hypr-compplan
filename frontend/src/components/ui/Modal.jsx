import { useEffect } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', className = '' }) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal__panel modal__panel--${size} ${className}`} role="dialog">
        <header className="modal__header">
          <div>
            {title && <h2 className="modal__title">{title}</h2>}
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function Skeleton({ width = '100%', height = 16, className = '' }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height: typeof height === 'number' ? `${height}px` : height }}
    />
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty">
      {Icon && <div className="empty__icon"><Icon size={28} /></div>}
      {title && <h3 className="empty__title">{title}</h3>}
      {description && <p className="empty__description">{description}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value = 0, max = 100, color = 'cyan', size = 'md', label }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`progress progress--${size}`}>
      {label && <div className="progress__label">{label}</div>}
      <div className="progress__track">
        <div
          className={`progress__fill progress__fill--${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
