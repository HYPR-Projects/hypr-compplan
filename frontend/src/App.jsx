import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme.jsx';
import { auth } from './lib/api.js';

import Login from './pages/Login.jsx';

// Admin pages (versão simplificada — só 2 abas)
import AdminOverview from './pages/admin/Overview.jsx';
import AdminCampaigns from './pages/admin/Campaigns.jsx';

/**
 * ProtectedRoute — exige token. Se admin-only, exige role admin.
 */
function ProtectedRoute({ children, adminOnly = false }) {
  const location = useLocation();
  const token = auth.getToken();
  const user = auth.getUser();

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

function RootRedirect() {
  const user = auth.getUser();
  if (!user) return <Navigate to="/login" replace />;
  // Por enquanto, todo mundo vai pro /admin (CS dashboard ainda não foi reconstruído)
  return <Navigate to="/admin" replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RootRedirect />} />

        {/* ─── Rotas Admin (apenas as 2 abas atuais) ──────────────── */}
        <Route
          path="/admin"
          element={<ProtectedRoute adminOnly><AdminOverview /></ProtectedRoute>}
        />
        <Route
          path="/admin/campanhas"
          element={<ProtectedRoute adminOnly><AdminCampaigns /></ProtectedRoute>}
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
