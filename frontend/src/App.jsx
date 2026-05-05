import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme.jsx';
import { auth } from './lib/api.js';

import Login from './pages/Login.jsx';

// CS pages
import CsDashboard from './pages/cs/Dashboard.jsx';
import CsCampaigns from './pages/cs/Campaigns.jsx';
import CampaignDetail from './pages/cs/CampaignDetail.jsx';
import CsHistory from './pages/cs/History.jsx';

// Admin pages
import AdminOverview from './pages/admin/Overview.jsx';
import AdminQuarter from './pages/admin/Quarter.jsx';
import AdminEvidencesReview from './pages/admin/EvidencesReview.jsx';
import AdminTeam from './pages/admin/Team.jsx';
import AdminRules from './pages/admin/Rules.jsx';
import AdminStudies from './pages/admin/Studies.jsx';
import AdminAbsClients from './pages/admin/AbsClients.jsx';
import AdminMentorships from './pages/admin/Mentorships.jsx';
import AdminAudit from './pages/admin/Audit.jsx';
import AdminLegacy from './pages/admin/Legacy.jsx';

/**
 * ProtectedRoute — exige token. Se admin-only, exige role admin.
 * Redireciona pra /login (preservando destino) ou pro dashboard apropriado.
 */
function ProtectedRoute({ children, adminOnly = false }) {
  const location = useLocation();
  const token = auth.getToken();
  const user = auth.getUser();

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

/**
 * RootRedirect — / cai pra dashboard apropriado conforme role.
 */
function RootRedirect() {
  const user = auth.getUser();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<RootRedirect />} />

        {/* ─── Rotas CS ────────────────────────────────────────────── */}
        <Route
          path="/dashboard"
          element={<ProtectedRoute><CsDashboard /></ProtectedRoute>}
        />
        <Route
          path="/campanhas"
          element={<ProtectedRoute><CsCampaigns /></ProtectedRoute>}
        />
        <Route
          path="/campanhas/:token"
          element={<ProtectedRoute><CampaignDetail /></ProtectedRoute>}
        />
        <Route
          path="/historico"
          element={<ProtectedRoute><CsHistory /></ProtectedRoute>}
        />

        {/* ─── Rotas Admin ─────────────────────────────────────────── */}
        <Route
          path="/admin"
          element={<ProtectedRoute adminOnly><AdminOverview /></ProtectedRoute>}
        />
        <Route
          path="/admin/quarter"
          element={<ProtectedRoute adminOnly><AdminQuarter /></ProtectedRoute>}
        />
        <Route
          path="/admin/evidencias"
          element={<ProtectedRoute adminOnly><AdminEvidencesReview /></ProtectedRoute>}
        />
        <Route
          path="/admin/team"
          element={<ProtectedRoute adminOnly><AdminTeam /></ProtectedRoute>}
        />
        <Route
          path="/admin/regras"
          element={<ProtectedRoute adminOnly><AdminRules /></ProtectedRoute>}
        />
        <Route
          path="/admin/estudos"
          element={<ProtectedRoute adminOnly><AdminStudies /></ProtectedRoute>}
        />
        <Route
          path="/admin/abs"
          element={<ProtectedRoute adminOnly><AdminAbsClients /></ProtectedRoute>}
        />
        <Route
          path="/admin/mentorias"
          element={<ProtectedRoute adminOnly><AdminMentorships /></ProtectedRoute>}
        />
        <Route
          path="/admin/auditoria"
          element={<ProtectedRoute adminOnly><AdminAudit /></ProtectedRoute>}
        />
        <Route
          path="/admin/legacy"
          element={<ProtectedRoute adminOnly><AdminLegacy /></ProtectedRoute>}
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
