import { fmt } from '../../lib/format.js';
import './Avatar.css';

/**
 * Avatar — círculo com iniciais coloridas.
 * Cor é estável baseada no hash do nome (1-6 paleta).
 */
export default function Avatar({ name, email, size = 'md', tooltip = true, color: forcedColor }) {
  const display = name || email?.split('@')[0] || '?';
  const initials = fmt.initials(display);
  const colorIdx = forcedColor || fmt.avatarColor(display);

  return (
    <div
      className={`avatar avatar--${size} avatar--c${colorIdx}`}
      title={tooltip ? (name || email || '') : undefined}
    >
      {initials}
    </div>
  );
}

/**
 * AvatarGroup — empilhado com leve overlap.
 * Bate com a UI do Report Center que mostra "PA JA" empilhados.
 */
export function AvatarGroup({ members = [], size = 'md', max = 3 }) {
  const visible = members.slice(0, max);
  const overflow = members.length - max;
  return (
    <div className="avatar-group">
      {visible.map((m, i) => (
        <Avatar key={m.email || i} name={m.name} email={m.email} size={size} />
      ))}
      {overflow > 0 && (
        <div className={`avatar avatar--${size} avatar--more`}>+{overflow}</div>
      )}
    </div>
  );
}
