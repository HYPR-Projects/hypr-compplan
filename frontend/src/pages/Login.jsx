import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import Logo from '../components/ui/Logo.jsx';
import Button from '../components/ui/Button.jsx';
import { auth, endpoints } from '../lib/api.js';
import './Login.css';

/**
 * Login com Google OAuth via Google Identity Services.
 * Carrega o script do Google sob demanda e renderiza o botão oficial.
 *
 * Em dev, suporta modo "fake login" pra testes locais sem GIS configurado.
 */
export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Se já tiver token, manda direto pro dashboard
    if (auth.getToken()) {
      const u = auth.getUser();
      navigate(u?.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) return; // dev sem oauth

    // Carrega Google Identity Services
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.google?.accounts?.id?.initialize({
        client_id: clientId,
        callback: handleGoogleResponse,
        ux_mode: 'popup',
      });
      window.google?.accounts?.id?.renderButton(
        document.getElementById('google-btn'),
        {
          theme: document.documentElement.dataset.theme === 'light' ? 'outline' : 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 320,
        }
      );
    };
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, []);

  const handleGoogleResponse = async (response) => {
    setLoading(true);
    setError(null);
    try {
      const data = await endpoints.login(response.credential);
      auth.setToken(data.jwt);
      auth.setUser({ email: data.email, role: data.role, name: data.name });
      navigate(data.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Dev fake login
  const handleDevLogin = (role) => {
    setLoading(true);
    setError(null);
    // Em DEV, o backend pode aceitar um token mock — ajuste conforme combinado
    // Por enquanto, simulamos pra desenvolver UI:
    auth.setToken('dev-fake-token');
    auth.setUser({
      email: role === 'admin' ? 'matheus.machado@hypr.mobi' : 'joao.buzolin@hypr.mobi',
      role,
      name: role === 'admin' ? 'Matheus Machado' : 'João Buzolin',
    });
    navigate(role === 'admin' ? '/admin' : '/dashboard', { replace: true });
  };

  const isDev = import.meta.env.DEV;

  return (
    <div className="login">
      <div className="login__bg" aria-hidden />
      <div className="login__panel fade-up">
        <div className="login__brand">
          <Logo subtitle="Commplan" size="lg" />
        </div>

        <div className="login__intro">
          <span className="login__badge">
            <Sparkles size={11} />
            CS BONUS PLATFORM
          </span>
          <h1 className="login__title">
            Bem-vindo ao<br />
            <span className="login__title-accent">HYPR Commplan</span>
          </h1>
          <p className="login__description">
            Cálculo automático de bônus dos Customer Success baseado nas
            campanhas executadas, evidências aprovadas e acordos firmados.
          </p>
        </div>

        <div className="login__actions">
          <div id="google-btn" className="login__google" />

          {isDev && (
            <div className="login__dev">
              <span className="login__dev-label">Modo desenvolvedor</span>
              <div className="login__dev-buttons">
                <Button variant="secondary" size="sm" onClick={() => handleDevLogin('cs')}>
                  Entrar como CS
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleDevLogin('admin')}>
                  Entrar como Admin
                </Button>
              </div>
            </div>
          )}

          {error && <div className="login__error">⚠ {error}</div>}
        </div>

        <footer className="login__footer">
          <span>Acesso restrito a colaboradores HYPR</span>
          <span className="login__footer-sep">·</span>
          <span>SSO compartilhado com Report Center</span>
        </footer>
      </div>
    </div>
  );
}
