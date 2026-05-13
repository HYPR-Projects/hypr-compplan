import { useState } from 'react';
import { fmt } from '../../lib/format.js';
import './Avatar.css';

/**
 * Avatar — círculo com foto real (se houver) OU iniciais coloridas.
 *
 * Props:
 *   name:       nome completo (display)
 *   email:      email (fallback se name vazio)
 *   photoUrl:   URL da foto (Google Workspace). Se falhar, cai pro fallback.
 *   size:       xs | sm | md | lg | xl (default 'md')
 *   tooltip:    bool — mostra title hover (default true)
 *   color:      força um índice específico de cor (1-6)
 */
export default function Avatar({ name, email, photoUrl, size = 'md', tooltip = true, color: forcedColor }) {
  const [imgError, setImgError] = useState(false);

  const display = name || email?.split('@')[0] || '?';
  const initials = fmt.initials(display);
  const colorIdx = forcedColor || fmt.avatarColor(display);
  const showPhoto = photoUrl && !imgError;

  return (
    <div
      className={`avatar avatar--${size} ${!showPhoto ? `avatar--c${colorIdx}` : 'avatar--photo'}`}
      title={tooltip ? (name || email || '') : undefined}
    >
      {showPhoto ? (
        <img
          src={photoUrl}
          alt={display}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      ) : initials}
    </div>
  );
}

/**
 * AvatarGroup — empilhado com leve overlap.
 */
export function AvatarGroup({ members = [], size = 'md', max = 3 }) {
  const visible = members.slice(0, max);
  const overflow = members.length - max;
  return (
    <div className="avatar-group">
      {visible.map((m, i) => (
        <Avatar key={m.email || i} name={m.name} email={m.email} photoUrl={m.photoUrl} size={size} />
      ))}
      {overflow > 0 && (
        <div className={`avatar avatar--${size} avatar--more`}>+{overflow}</div>
      )}
    </div>
  );
}
