import './Input.css';

export function Input({ label, hint, error, prefix, suffix, className = '', ...rest }) {
  return (
    <label className={`field ${error ? 'field--error' : ''} ${className}`}>
      {label && <span className="field__label label">{label}</span>}
      <div className="field__wrap">
        {prefix && <span className="field__prefix">{prefix}</span>}
        <input className="field__input" {...rest} />
        {suffix && <span className="field__suffix">{suffix}</span>}
      </div>
      {error && <span className="field__error">{error}</span>}
      {hint && !error && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Textarea({ label, hint, error, className = '', ...rest }) {
  return (
    <label className={`field ${error ? 'field--error' : ''} ${className}`}>
      {label && <span className="field__label label">{label}</span>}
      <textarea className="field__input field__textarea" {...rest} />
      {error && <span className="field__error">{error}</span>}
      {hint && !error && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Select({ label, hint, error, children, className = '', ...rest }) {
  return (
    <label className={`field ${error ? 'field--error' : ''} ${className}`}>
      {label && <span className="field__label label">{label}</span>}
      <div className="field__wrap field__wrap--select">
        <select className="field__input field__select" {...rest}>
          {children}
        </select>
        <span className="field__select-arrow">▾</span>
      </div>
      {error && <span className="field__error">{error}</span>}
      {hint && !error && <span className="field__hint">{hint}</span>}
    </label>
  );
}
