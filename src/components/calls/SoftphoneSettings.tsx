import React, { useState } from 'react';
import { Activity, CheckCircle2, Copy, RefreshCw, ShieldCheck, Smartphone, Wifi, XCircle } from 'lucide-react';
import { auth } from '../../firebase';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';
type DiagnosticResult = {
  sipAssigned?: boolean;
  sipCredentialId?: string;
  connectionActive?: boolean | null;
  outboundProfileId?: string | null;
  didVerified?: string[];
  tokenValid?: boolean;
  tokenExpiresAt?: string | null;
  checks?: Array<{ id: string; ok: boolean; label: string; detail?: string }>;
  code?: string;
  message?: string;
};

interface SoftphoneSettingsProps {
  role?: string | null;
  connectionStatus: ConnectionStatus;
  connectionError?: string | null;
  hasSipAssigned: boolean | null;
  token: string;
  tokenExpiresAt?: string | null;
  credentialId?: string | null;
  callerId?: string | null;
  onReconnect: () => Promise<boolean | void> | boolean | void;
  onToast: (message: string) => void;
}

const localDate = (value?: string | null) => {
  if (!value) return 'No disponible';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No disponible' : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function SoftphoneSettings({
  role,
  connectionStatus,
  connectionError,
  hasSipAssigned,
  token,
  tokenExpiresAt,
  credentialId,
  callerId,
  onReconnect,
  onToast
}: SoftphoneSettingsProps) {
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [showTokenDetails, setShowTokenDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2 | 3 | -1>(0);

  const isPrivileged = ['admin', 'superadmin', 'owner', 'ceo', 'gestor', 'supervisor'].includes(String(role || '').toLowerCase());
  if (!isPrivileged) return null;

  const statusColor = connectionStatus === 'connected' ? '#34C759' : connectionStatus === 'connecting' ? '#FF9500' : '#FF3B30';
  const statusText = connectionStatus === 'connected' ? 'Conectado' : connectionStatus === 'connecting' ? 'Conectando…' : connectionStatus === 'error' ? 'Error de conexión' : 'Desconectado';
  const tokenPrefix = token ? `${token.slice(0, 20)}…` : 'Sin token';

  const regenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    setStep(1);
    try {
      await new Promise(resolve => window.setTimeout(resolve, 400));
      setStep(2);
      const result = await onReconnect();
      if (result === false) {
        setStep(-1);
        return;
      }
      setStep(3);
      window.setTimeout(() => setStep(current => current === 3 ? 0 : current), 1500);
    } catch {
      setStep(-1);
      onToast('No se pudo conectar con Telnyx. Vuelve a intentar en unos segundos.');
    } finally {
      setRegenerating(false);
    }
  };

  const runDiagnostics = async () => {
    if (diagnosing) return;
    setDiagnosing(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setDiagnostic({ code: 'NO_AUTH', message: 'Tu sesión caducó. Inicia sesión nuevamente.' });
        return;
      }
      const idToken = await currentUser.getIdToken();
      const response = await fetch('/api/telnyx/diagnose', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDiagnostic({ ...data, code: data.code || data.error || 'DIAGNOSTIC_FAILED', message: data.message || 'No se pudo completar el diagnóstico.' });
      } else {
        setDiagnostic(data);
      }
    } catch {
      setDiagnostic({ code: 'NETWORK', message: 'No se pudo contactar el servicio de diagnóstico. Revisa la conexión e inténtalo de nuevo.' });
    } finally {
      setDiagnosing(false);
    }
  };

  const copyDiagnostic = async () => {
    const payload = JSON.stringify(diagnostic || { connectionStatus, hasSipAssigned, credentialId, tokenExpiresAt, connectionError }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      onToast('Diagnóstico copiado');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('No se pudo copiar. Revisa los permisos del navegador.');
    }
  };

  return (
    <section className="softphone-settings space-y-3" aria-label="Ajustes de telefonía">
      <div className="softphone-glass-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3 min-w-0">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor }} aria-label={statusText} />
            <div className="min-w-0">
              <h3 className="text-base font-semibold">Conexión con Telnyx</h3>
              <p className="softphone-muted text-sm mt-1">Estado: {statusText}</p>
              {connectionError && connectionStatus === 'error' && <p className="mt-1 text-sm text-red-600 break-words">{connectionError}</p>}
            </div>
          </div>
          <Wifi className="h-5 w-5 shrink-0" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-label="Reconectar con Telnyx" onClick={() => void regenerate()} disabled={regenerating || connectionStatus === 'connecting'} className="rounded-full bg-white border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:ring-2">
            <span className="inline-flex items-center gap-2"><RefreshCw className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} />{regenerating ? 'Conectando…' : 'Reconectar'}</span>
          </button>
        </div>
      </div>

      <div className="softphone-glass-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3 min-w-0">
            <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold">Sesión segura</h3>
              <p className="softphone-muted text-sm mt-1">Válida hasta: {localDate(tokenExpiresAt)}</p>
              <p className="font-mono text-xs mt-2 break-all">{tokenPrefix}</p>
            </div>
          </div>
          <span className={`text-xs font-semibold ${token ? 'text-green-700' : 'text-red-600'}`}>{token ? 'Activa' : 'Sin token'}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-label="Ver detalles de la sesión" onClick={() => setShowTokenDetails(v => !v)} className="rounded-full bg-white border border-black/10 px-4 py-2 text-sm font-semibold focus-visible:ring-2">{showTokenDetails ? 'Ocultar detalles' : 'Ver detalles'}</button>
          <button type="button" aria-label="Regenerar sesión de telefonía" onClick={() => void regenerate()} disabled={regenerating} className="rounded-full bg-[#007AFF] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:ring-2">{regenerating ? 'Generando…' : 'Regenerar sesión'}</button>
        </div>
        {(regenerating || step !== 0) && (
          <div className="mt-3 rounded-xl bg-white/80 border border-black/5 p-3 space-y-2" aria-live="polite">
            <p className="text-sm font-semibold">{step === 1 ? 'Verificando línea…' : step === 2 ? 'Solicitando sesión segura…' : step === 3 ? '✓ Conectado' : 'No se pudo conectar'}</p>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <span className={step >= 1 ? 'font-semibold text-green-700' : 'softphone-muted'}>1. Verificar línea</span>
              <span className={step >= 2 ? 'font-semibold text-green-700' : 'softphone-muted'}>2. Crear sesión</span>
              <span className={step === 3 ? 'font-semibold text-green-700' : 'softphone-muted'}>3. Conectado</span>
            </div>
            {step === -1 && <p className="text-sm text-red-700">Revisa la línea asignada o ejecuta el diagnóstico. Puedes reintentar cuando quieras.</p>}
          </div>
        )}
        {showTokenDetails && (
          <div className="mt-3 rounded-xl bg-white/80 p-3 text-sm space-y-1">
            <p><strong>Identificador SIP:</strong> {credentialId || 'No disponible'}</p>
            <p><strong>Vencimiento local:</strong> {localDate(tokenExpiresAt)}</p>
            <p className="softphone-muted text-xs">Por seguridad, el token completo no se muestra ni se copia desde esta pantalla.</p>
          </div>
        )}
      </div>

      <div className="softphone-glass-card p-4">
        <div className="flex items-start gap-3">
          <Smartphone className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">Línea SIP asignada</h3>
            <p className="softphone-muted text-sm mt-1">Credencial: {credentialId || 'Sin asignación'}</p>
            <p className="softphone-muted text-sm mt-1">Caller ID: {callerId || 'No disponible'}</p>
            {hasSipAssigned === false && <p className="mt-2 text-sm text-orange-700">No tienes línea telefónica asignada. Pide a tu administrador que te asigne una.</p>}
          </div>
        </div>
      </div>

      <div className="softphone-glass-card p-4">
        <div className="flex items-start gap-3">
          <Activity className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">Diagnóstico de telefonía</h3>
            <p className="softphone-muted text-sm mt-1">Verifica la asignación, la conexión, los números y la generación de sesión. No realiza llamadas.</p>
          </div>
        </div>
        <button type="button" aria-label="Ejecutar diagnóstico de telefonía" onClick={() => void runDiagnostics()} disabled={diagnosing} className="mt-3 rounded-full bg-white border border-black/10 px-4 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:ring-2">
          <span className="inline-flex items-center gap-2"><Activity className={`h-4 w-4 ${diagnosing ? 'animate-pulse' : ''}`} />{diagnosing ? 'Verificando…' : 'Ejecutar diagnóstico'}</span>
        </button>
        {diagnostic && (
          <div className="mt-3 space-y-2" aria-live="polite">
            {(diagnostic.checks || []).map(check => (
              <div key={check.id} className="flex items-start gap-2 text-sm">
                {check.ok ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
                <div><span className="font-medium">{check.label}</span>{check.detail && <p className="softphone-muted text-xs">{check.detail}</p>}</div>
              </div>
            ))}
            {diagnostic.message && <p className="text-sm text-red-700">{diagnostic.message}</p>}
            {diagnostic.code && <p className="softphone-muted text-xs">Referencia: {diagnostic.code}</p>}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="softphone-muted text-xs">{diagnostic.checks?.filter(c => c.ok).length || 0} verificaciones correctas</span>
              <button type="button" aria-label="Copiar diagnóstico" onClick={() => void copyDiagnostic()} className="inline-flex items-center gap-1 rounded-full bg-white border border-black/10 px-3 py-2 text-xs font-semibold focus-visible:ring-2"><Copy className="h-3.5 w-3.5" />{copied ? '✓ Copiado' : 'Copiar diagnóstico'}</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
