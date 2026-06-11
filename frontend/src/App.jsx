import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme.jsx';
import { auth } from './lib/api.js';

import Login from './pages/Login.jsx';

// Admin pages
import AdminOverview from './pages/admin/Overview.jsx';
import AdminPending from './pages/admin/Pending.jsx';
import AdminCampaigns from './pages/admin/Campaigns.jsx';
import AdminTeam from './pages/admin/Team.jsx';
import AdminOverExceptions from './pages/admin/OverExceptions.jsx';
import AdminReviewRequests from './pages/admin/ReviewRequests.jsx';
import AdminStudies from './pages/admin/Studies.jsx';
import AdminAudit from './pages/admin/Audit.jsx';

// CS pages (portal pessoal — também usado pelo admin via impersonação)
import CsDashboard from './pages/cs/CSDashboard.jsx';
import CsCampaignDetail from './pages/cs/CampaignDetail.jsx';
import CsHistory from './pages/cs/History.jsx';

function ProtectedRoute({ children, adminOnly = false, csOnly = false }) {
  const location = useLocation();
  const token = auth.getToken();
  const user = auth.getUser();

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (adminOnly && user.role !== 'admin') return <Navigate to="/cs" replace />;
  if (csOnly && user.role === 'admin')    return <Navigate to="/admin" replace />;
  return children;
}

function RootRedirect() {
  const user = auth.getUser();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/cs'} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RootRedirect />} />

        {/* ── Admin ──────────────────────────────────────────────── */}
        <Route path="/admin"           element={<ProtectedRoute adminOnly><AdminOverview /></ProtectedRoute>} />
        <Route path="/admin/pendentes" element={<ProtectedRoute adminOnly><AdminPending /></ProtectedRoute>} />
        <Route path="/admin/campanhas" element={<ProtectedRoute adminOnly><AdminCampaigns /></ProtectedRoute>} />
        <Route path="/admin/time"      element={<ProtectedRoute adminOnly><AdminTeam /></ProtectedRoute>} />
        <Route path="/admin/pedidos-revisao" element={<ProtectedRoute adminOnly><AdminReviewRequests /></ProtectedRoute>} />
        <Route path="/admin/auditoria" element={<ProtectedRoute adminOnly><AdminAudit /></ProtectedRoute>} />
        <Route path="/admin/excecoes-over" element={<ProtectedRoute adminOnly><AdminOverExceptions /></ProtectedRoute>} />
        <Route path="/admin/estudos"   element={<ProtectedRoute adminOnly><AdminStudies /></ProtectedRoute>} />

        {/* Admin impersonando CS */}
        <Route path="/admin/cs/:csEmail"                       element={<ProtectedRoute adminOnly><CsDashboard /></ProtectedRoute>} />
        <Route path="/admin/cs/:csEmail/campanha/:token"       element={<ProtectedRoute adminOnly><CsCampaignDetail /></ProtectedRoute>} />

        {/* ── CS (portal pessoal) ────────────────────────────────── */}
        <Route path="/cs"                    element={<ProtectedRoute><CsDashboard /></ProtectedRoute>} />
        <Route path="/cs/visao-geral"        element={<ProtectedRoute><AdminOverview /></ProtectedRoute>} />
        <Route path="/cs/campanha/:token"    element={<ProtectedRoute><CsCampaignDetail /></ProtectedRoute>} />
        <Route path="/cs/historico"          element={<ProtectedRoute><CsHistory /></ProtectedRoute>} />
        {/* Estudos: leitura pra todos autenticados (componente esconde botões pra não-admins) */}
        <Route path="/cs/estudos"            element={<ProtectedRoute><AdminStudies /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
