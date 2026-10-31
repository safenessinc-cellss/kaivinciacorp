import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/kaivincia-design-system.css';
import { AuthProvider } from './contexts/AuthContext';
import { GlobalProvider } from './contexts/GlobalContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { AppearanceProvider } from './contexts/AppearanceContext';
import { applyAppearanceToDOM, DEFAULT_APPEARANCE } from './constants/appearance';

type BoundaryState = { hasError: boolean; message: string };

class StartupErrorBoundary extends React.Component<React.PropsWithChildren, BoundaryState> {
  state: BoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Kaivincia] React startup/render failure:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f7fb', color: '#202124', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <section style={{ width: 'min(100%, 560px)', padding: 32, border: '1px solid #e1e7f0', borderRadius: 20, background: '#fff', boxShadow: '0 16px 48px rgba(30,60,100,.10)' }}>
            <div style={{ color: '#d93025', fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Error de inicio</div>
            <h1 style={{ margin: '12px 0', fontSize: 25, lineHeight: 1.2 }}>Kaivincia no pudo cargar esta pantalla</h1>
            <p style={{ color: '#5f6368', lineHeight: 1.6 }}>Se ha detectado un error de JavaScript. La aplicación ha detenido el renderizado para evitar una pantalla vacía.</p>
            <pre style={{ marginTop: 16, padding: 14, maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderRadius: 10, background: '#f6f8fc', color: '#3c4043', fontSize: 12 }}>{this.state.message}</pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: '12px 18px', border: 0, borderRadius: 10, background: '#1a73e8', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Reintentar carga</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<main style="padding:32px;font:16px system-ui;color:#202124">No se encontró el contenedor principal de Kaivincia (#root).</main>';
} else {
  try {
    applyAppearanceToDOM(DEFAULT_APPEARANCE);
    createRoot(rootElement).render(
      <StrictMode>
        <StartupErrorBoundary>
          <AuthProvider>
            <LanguageProvider>
              <GlobalProvider>
                <AppearanceProvider>
                  <App />
                </AppearanceProvider>
              </GlobalProvider>
            </LanguageProvider>
          </AuthProvider>
        </StartupErrorBoundary>
      </StrictMode>,
    );
  } catch (error) {
    console.error('[Kaivincia] Fatal bootstrap error:', error);
    rootElement.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f5f7fb;color:#202124;font:16px system-ui"><section style="max-width:560px;padding:28px;background:white;border:1px solid #e1e7f0;border-radius:18px"><h1>No se pudo iniciar Kaivincia</h1><p>Ocurrió un error al preparar la aplicación. Recarga la página e inténtalo de nuevo.</p></section></main>';
  }
}
