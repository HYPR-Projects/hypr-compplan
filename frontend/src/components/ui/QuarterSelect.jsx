import './QuarterSelect.css';

/**
 * Seletor de quarter reutilizável. Discreto, herda a tipografia do contexto.
 *
 * Uso típico com o hook useQuarter:
 *   const { quarter, setQuarter, quarterOptions } = useQuarter();
 *   <QuarterSelect value={quarter} options={quarterOptions} onChange={setQuarter} />
 *
 * Props:
 *   - value: quarter atual (ex: "Q3-2026")
 *   - options: array de quarters (ex: ["Q3-2026", "Q2-2026", ...])
 *   - onChange: callback(novoQuarter)
 *   - variant: "inline" (default, discreto) | "pill" (com borda)
 */
export default function QuarterSelect({ value, options, onChange, variant = 'inline', ...rest }) {
  return (
    <select
      className={`quarter-select quarter-select--${variant}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Escolha o quarter"
      {...rest}
    >
      {options.map((q) => (
        <option key={q} value={q}>{q}</option>
      ))}
    </select>
  );
}
