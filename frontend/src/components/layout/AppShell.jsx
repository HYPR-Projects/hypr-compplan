import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home, Calendar, FileText, Users, BookOpen, Shield,
  Settings, LogOut, Sun, Moon, History, Sparkles, Archive, MessageSquare,
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.jsx';
import { auth } from '../../lib/api.js';
import Logo from '../ui/Logo.jsx';
import Avatar from '../ui/Avatar.jsx';
import './AppShell.css';

/**
 * Estrutura: sidebar fixo à esquerda + header global + main content.
 *
 * Sidebar tem itens diferentes pra CS vs Admin. CS vê: Dashboard, Campanhas,
 * Histórico. Admin vê tudo + seção administrativa expandida.
 */

const NAV_CS = [
  { to: '/cs',            label: 'Meu painel',  icon: Home },
  { to: '/cs/historico',  label: 'Histórico',   icon: History },
];

const NAV_ADMIN = [
  { to: '/admin',                  label: 'Visão geral',     icon: Home },
  { to: '/admin/pendentes',        label: 'Pendentes',       icon: Sparkles, badge: 'pending' },
  { to: '/admin/pedidos-revisao',  label: 'Pedidos análise', icon: MessageSquare },
  { to: '/admin/campanhas',        label: 'Campanhas',       icon: FileText },
  { to: '/admin/time',             label: 'Time',            icon: Users },
  { to: '/admin/estudos',          label: 'Estudos',         icon: BookOpen },
  { to: '/admin/excecoes-over',    label: 'Exceções OVER',   icon: Shield },
];

export default function AppShell({ children, pendingEvidences = 0, pendingCount = 0 }) {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const user = auth.getUser();
  const isAdmin = user?.role === 'admin';

  // Aceita pendingCount (novo nome) ou pendingEvidences (legado)
  const badgeCount = pendingCount || pendingEvidences || 0;

  const items = isAdmin ? NAV_ADMIN : NAV_CS;

  const handleLogout = () => {
    auth.logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <Logo subtitle="Commplan" size="sm" />
        </div>

        <nav className="shell__nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin' || item.to === '/cs'}
              className={({ isActive }) =>
                `shell__nav-item ${isActive ? 'shell__nav-item--active' : ''}`
              }
            >
              <item.icon size={16} />
              <span>{item.label}</span>
              {item.badge === 'pending' && badgeCount > 0 && (
                <span className="shell__nav-badge mono">{badgeCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="shell__sidebar-footer">
          <button className="shell__theme-toggle" onClick={toggle} title="Alternar tema">
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme === 'dark' ? 'Claro' : 'Escuro'}</span>
          </button>
        </div>
      </aside>

      <div className="shell__content">
        <header className="shell__header">
          <div className="shell__user">
            <Avatar name={user?.name || user?.email} email={user?.email} size="sm" />
            <div className="shell__user-info">
              <div className="shell__user-name">{user?.name || user?.email?.split('@')[0]}</div>
              <div className="shell__user-role">
                {isAdmin ? 'Administrador' : 'Customer Success'}
              </div>
            </div>
          </div>
          <button className="shell__logout" onClick={handleLogout} title="Sair">
            <LogOut size={15} />
            <span>Sair</span>
          </button>
        </header>

        <main className="shell__main">{children}</main>
      </div>
    </div>
  );
}
