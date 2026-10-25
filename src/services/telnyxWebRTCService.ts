/**
 * Telnyx WebRTC SDK Client Service
 * Gestiona la inicialización de TelnyxRTC mediante JWT (login_token)
 * Documentación oficial: https://developers.telnyx.com/docs/webrtc
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { TelnyxRTC } from '@telnyx/webrtc';
import { formatPhoneE164 } from '../utils/phone';

// Token JWT por defecto para inicialización del SDK de Telnyx WebRTC
export let TELNYX_WEBRTC_LOGIN_TOKEN = '';

/**
 * Normaliza un número telefónico a E.164. Para destinos de EE. UU. acepta
 * 10 dígitos nacionales o 11 empezando por 1; otros países deben incluir +.
 */
export function normalizeTelnyxE164(value: unknown, label = 'Número'): string {
  try {
    return formatPhoneE164(value, 'MX');
  } catch {
    throw new Error(`${label}: introduce un número válido en formato internacional E.164, por ejemplo +525512345678.`);
  }
}

/**
 * Evita usar Caller IDs ficticios reservados por NANPA (555-0100 a 555-0199).
 * La autorización real del número sigue correspondiendo a Telnyx.
 */
export function validateTelnyxCallerId(value: unknown): string {
  const callerId = normalizeTelnyxE164(value, 'Caller ID');
  if (/^\+1\d{3}55501\d{2}$/.test(callerId)) {
    throw new Error('El Caller ID seleccionado es un número de prueba/ficticio (555-0100 a 555-0199). Selecciona un número real, activo y autorizado en Telnyx.');
  }
  return callerId;
}

function explainTokenError(codeValue: unknown, status = 0): string {
  const code = String(codeValue || '').toUpperCase();
  if (['NO_SIP', 'SIP_ASSIGNMENT_REQUIRED', 'SIP_ASSIGNMENT_INVALID'].includes(code)) {
    return 'No tienes una línea telefónica asignada. Pide a tu administrador que te asigne una.';
  }
  if (['NO_AUTH', 'UNAUTHENTICATED', 'INVALID_TOKEN', 'AUTHENTICATION_REQUIRED'].includes(code) || status === 401) {
    return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
  }
  if (['API_KEY_INVALID', 'TELNYX_TOKEN_FAILED', 'TELNYX_CREDENTIAL_MISSING'].includes(code) || status === 403 || status === 404) {
    return 'La conexión con Telnyx no está configurada correctamente. Contacta al administrador.';
  }
  if (['TELNYX_DOWN', 'TOKEN_DIAGNOSTICS_FAILED'].includes(code) || status >= 500) {
    return 'El servicio de telefonía está tardando. Vuelve a intentar en unos segundos.';
  }
  if (status === 0 || code === 'NETWORK') {
    return 'Parece que no tienes internet. Verifica tu conexión y vuelve a intentar.';
  }
  return 'El servicio de telefonía está tardando. Vuelve a intentar en unos segundos.';
}

function explainTelnyxError(error: any): string {
  const raw = String(error?.message || error?.reason || error?.code || error || '');
  const code = String(error?.code || error?.errorCode || '');
  if (/D1|channel limit|concurrent|user channel limit/i.test(raw + ' ' + code)) {
    return 'Telnyx alcanzó el límite de llamadas/canales simultáneos de la cuenta (403 D1). Finaliza otra llamada o solicita a Telnyx aumentar el límite.';
  }
  if (/D49|originator number is invalid|caller.?id.*invalid/i.test(raw + ' ' + code)) {
    return 'Telnyx rechazó el Caller ID (403 D49). Verifica que el número E.164 esté activo y autorizado en la conexión Telnyx.';
  }
  return raw || 'Error de conexión Telnyx WebRTC.';
}

export interface TelnyxWebRTCState {
  isInitialized: boolean;
  isConnected: boolean;
  loginToken: string;
  activeCallId: string | null;
  lastError: string | null;
  tokenExpiresAt: string | null;
  lastTokenAttemptAt: string | null;
  lastTokenCredentialId: string | null;
  lastTokenStatus: number | null;
  callStatus: 'idle' | 'calling' | 'connected' | 'on_hold' | 'ended';
}

class TelnyxWebRTCService {
  private client: any = null;
  private currentCall: any = null;
  private state: TelnyxWebRTCState = {
    isInitialized: false,
    isConnected: false,
    loginToken: TELNYX_WEBRTC_LOGIN_TOKEN,
    activeCallId: null,
    lastError: null,
    tokenExpiresAt: null,
    lastTokenAttemptAt: null,
    lastTokenCredentialId: null,
    lastTokenStatus: null,
    callStatus: 'idle'
  };

  private currentCredentialId: string | null = null;
  private refreshInProgress = false;
  private pendingTokenRefresh = false;
  private tokenRequestPromise: Promise<{ success: boolean; token?: string; expiresAt?: string; message: string; status?: number }> | null = null;
  private tokenRequestAbortController: AbortController | null = null;

  private listeners: Array<(state: TelnyxWebRTCState) => void> = [];

  /**
   * Actualiza el login_token (JWT) en memoria y opcionalmente en Firestore
   */
  public async setLoginToken(newJwt: string, persistToFirestore = false): Promise<void> {
    const cleanToken = (newJwt || '').trim();
    TELNYX_WEBRTC_LOGIN_TOKEN = cleanToken;
    this.state.loginToken = cleanToken;
    this.notify();

    if (persistToFirestore && cleanToken) {
      try {
        await setDoc(doc(db, 'settings', 'telnyx_config'), {
          login_token: cleanToken,
          webrtcJwt: cleanToken,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log('[TelnyxWebRTC] login_token actualizado y persistido en Firestore (settings/telnyx_config).');
      } catch (err) {
        console.error('[TelnyxWebRTC] Error guardando login_token en Firestore:', err);
      }
    }
  }

  /**
   * Solicita un token al backend usando la asignación SIP del usuario autenticado.
   * No llama al endpoint si no existe una asignación SIP.
   */
  public requestToken(credentialId: string): Promise<{ success: boolean; token?: string; expiresAt?: string; message: string; status?: number }> {
    // Single-flight: multiple UI events reuse the same request and cannot mint
    // parallel sessions for one user.
    if (this.tokenRequestPromise) return this.tokenRequestPromise;
    this.tokenRequestAbortController?.abort();
    const controller = new AbortController();
    this.tokenRequestAbortController = controller;
    const pending = this.performTokenRequest(credentialId, controller.signal).finally(() => {
      if (this.tokenRequestAbortController === controller) this.tokenRequestAbortController = null;
      if (this.tokenRequestPromise === pending) this.tokenRequestPromise = null;
    });
    this.tokenRequestPromise = pending;
    return pending;
  }

  private async performTokenRequest(credentialId: string, signal: AbortSignal): Promise<{ success: boolean; token?: string; expiresAt?: string; message: string; status?: number }> {
    const currentUser = auth.currentUser;
    const attemptAt = new Date().toISOString();
    this.state.lastTokenAttemptAt = attemptAt;
    this.state.lastTokenCredentialId = credentialId || null;
    this.state.lastTokenStatus = null;
    this.state.lastError = null;
    this.notify();

    if (!currentUser) {
      const message = 'Inicia sesión para conectar el softphone.';
      this.state.lastError = message;
      this.notify();
      return { success: false, message, status: 401 };
    }

    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/telnyx-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ credentialId }),
        signal
      });
      const data = await res.json().catch(() => ({}));
      this.state.lastTokenStatus = res.status;

      if (!res.ok || data.error || !data.token) {
        const message = explainTokenError(data.code || data.error, res.status);
        this.state.lastError = message;
        this.state.isConnected = false;
        this.notify();
        return { success: false, message, status: res.status };
      }

      await this.setLoginToken(data.token, false);
      this.state.tokenExpiresAt = data.expiresAt || this.readTokenExpiry(data.token);
      this.currentCredentialId = credentialId;
      this.state.lastError = null;
      this.notify();
      return { success: true, token: data.token, expiresAt: this.state.tokenExpiresAt || undefined, message: 'Token Telnyx generado correctamente.', status: res.status };
    } catch (err: any) {
      const message = explainTokenError('NETWORK', 0);
      this.state.lastError = message;
      this.state.isConnected = false;
      this.notify();
      return { success: false, message, status: 0 };
    }
  }

  /**
   * Obtiene la asignación SIP y solicita el JWT. Si no hay SIP, no llama al backend.
   */
  public async fetchFreshTokenFromBackend(): Promise<{ success: boolean; token?: string; message: string; status?: number }> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      const message = 'Inicia sesión para conectar el softphone.';
      this.state.lastError = message;
      this.notify();
      return { success: false, message, status: 401 };
    }

    try {
      // Read the user's own profile first because existing production Firestore
      // rules already allow self-read. Admin Hub keeps this field synchronized.
      const profileSnap = await getDoc(doc(db, 'users', currentUser.uid));
      const profile = profileSnap.exists() ? profileSnap.data() : {};
      let credentialId = String(profile?.assignedSipCredentialId || '').trim();

      // Prefer the authoritative assignment document when readable. During a
      // rules rollout, a denied self-read must not prevent using the synchronized
      // profile assignment; the backend independently validates the assignment.
      try {
        const assignmentSnap = await getDoc(doc(db, 'telnyx_agent_assignments', currentUser.uid));
        const assignment = assignmentSnap.exists() ? assignmentSnap.data() : null;
        const assignedId = String(assignment?.telnyxCredentialId || '').trim();
        if (assignedId) credentialId = assignedId;
      } catch (assignmentReadError: any) {
        console.warn('[TelnyxWebRTC] No se pudo leer el documento de asignación directamente; usando el perfil sincronizado.', assignmentReadError?.code || '');
      }

      if (!credentialId) {
        const message = 'No tienes línea SIP asignada. Contacta al administrador.';
        this.state.lastError = message;
        this.state.isConnected = false;
        this.state.isInitialized = false;
        this.state.lastTokenCredentialId = null;
        this.state.lastTokenStatus = null;
        this.notify();
        return { success: false, message, status: 0 };
      }

      const result = await this.requestToken(credentialId);
      if (!result.success || !result.token) return result;

      const initialized = await this.initClient(result.token);
      if (!initialized.success) {
        return { success: false, message: initialized.message, status: result.status };
      }
      return { success: true, token: result.token, message: 'Token generado y softphone conectado.', status: result.status };
    } catch (err: any) {
      const message = explainTokenError('NETWORK', 0);
      this.state.lastError = message;
      this.state.isConnected = false;
      this.notify();
      return { success: false, message };
    }
  }

  private readTokenExpiry(token: string): string | null {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return Number.isFinite(payload.exp) ? new Date(payload.exp * 1000).toISOString() : null;
    } catch {
      return null;
    }
  }

  private async refreshCurrentToken(): Promise<void> {
    if (this.refreshInProgress || !this.currentCredentialId || !this.client) return;
    if (this.currentCall) { this.pendingTokenRefresh = true; return; }
    this.refreshInProgress = true;
    try {
      const result = await this.requestToken(this.currentCredentialId);
      if (!result.success || !result.token) throw new Error(result.message);
      if (typeof this.client?.updateToken === 'function') {
        await this.client.updateToken(result.token);
      } else {
        const newToken = result.token;
        try { this.client?.disconnect(); } catch {}
        await this.initClient(newToken);
      }
      console.log('[TelnyxWebRTC] Token renovado automáticamente.');
    } catch (err: any) {
      this.state.lastError = `No se pudo renovar el token de Telnyx: ${err?.message || 'error desconocido'}`;
      this.state.isConnected = false;
      this.notify();
    } finally {
      this.refreshInProgress = false;
    }
  }

  /**
   * Obtiene el estado actual
   */
  public getState(): TelnyxWebRTCState {
    return { ...this.state };
  }

  /**
   * Obtiene el login_token actual
   */
  public getLoginToken(): string {
    return this.state.loginToken || TELNYX_WEBRTC_LOGIN_TOKEN;
  }

  /**
   * Inicializa el cliente TelnyxRTC con el login_token especificado
   */
  public async initClient(tokenOverride?: string): Promise<{ success: boolean; message: string }> {
    const token = tokenOverride || this.getLoginToken();
    if (!token) {
      const errMsg = 'No se ha configurado login_token (JWT) para el SDK de Telnyx WebRTC.';
      this.state.lastError = errMsg;
      this.state.isConnected = false;
      this.notify();
      return { success: false, message: errMsg };
    }

    try {
      if (this.client) {
        try { this.client.disconnect(); } catch {}
      }
      this.state.isConnected = false;
      this.state.isInitialized = false;
      this.notify();

      const client = new TelnyxRTC({
        login_token: token,
        debug: true,
        debugOutput: 'socket',
        ringbackFile: '/sounds/ringback.mp3',
        ringtoneFile: '/sounds/ringtone.mp3'
      });
      this.client = client;

      const readyResult = await new Promise<{ success: boolean; message: string }>((resolve) => {
        let settled = false;
        const finish = (result: { success: boolean; message: string }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(result);
        };
        const timeout = setTimeout(() => finish({
          success: false,
          message: 'Telnyx no confirmó la conexión en 5 segundos. Verifica credencial, conexión y red; pulsa Reintentar.'
        }), 5000);

        client.on('telnyx.ready', () => {
          this.state.isConnected = true;
          this.state.isInitialized = true;
          this.state.lastError = null;
          this.notify();
          finish({ success: true, message: 'Conectado a Telnyx.' });
        });

        client.on('telnyx.warning', (warning: any) => {
          if (String(warning?.code || '') === '34001') void this.refreshCurrentToken();
        });

        client.on('telnyx.notification', (notification: any) => {
          const code = String(notification?.code || notification?.data?.code || '');
          const type = String(notification?.type || '');
          if (type === 'callUpdate') {
            const call = notification?.call || notification?.data?.call || notification?.data;
            if (call?.id) this.state.activeCallId = call.id;
            const callState = String(call?.state || call?.callState || notification?.callState || '').toLowerCase();
            if (['ringing', 'early', 'trying', 'dialing', 'new'].includes(callState)) {
              this.state.callStatus = 'calling';
            } else if (['active', 'connected', 'answered'].includes(callState)) {
              this.state.callStatus = 'connected';
            } else if (['held', 'hold', 'on_hold'].includes(callState)) {
              this.state.callStatus = 'on_hold';
            } else if (['hangup', 'hungup', 'destroy', 'ended', 'terminated', 'rejected', 'failed'].includes(callState)) {
              this.state.callStatus = 'ended';
              this.state.activeCallId = null;
              this.currentCall = null;
            }
            this.notify();
            return;
          }
          if (code === '34001' || type === 'TOKEN_EXPIRING_SOON') {
            void this.refreshCurrentToken();
          }
          if (notification?.call) {
            this.state.activeCallId = notification.call.id;
            this.notify();
          }
        });

        client.on('telnyx.error', (error: any) => {
          const message = explainTelnyxError(error);
          this.state.lastError = message;
          this.state.isConnected = false;
          this.notify();
          finish({ success: false, message });
        });

        client.on('telnyx.socket.close', (event: any) => {
          this.state.isConnected = false;
          if (event?.code) this.state.lastError = `Conexión Telnyx cerrada (${event.code}).`;
          this.notify();
        });

        try {
          const connectResult = client.connect();
          if (connectResult && typeof connectResult.catch === 'function') {
            connectResult.catch((error: any) => finish({ success: false, message: explainTelnyxError(error) }));
          }
        } catch (error: any) {
          finish({ success: false, message: explainTelnyxError(error) });
        }
      });

      if (!readyResult.success) {
        this.state.isConnected = false;
        this.state.lastError = readyResult.message;
        this.notify();
      }
      return readyResult;
    } catch (err: any) {
      const message = explainTelnyxError(err);
      this.state.lastError = message;
      this.state.isConnected = false;
      this.notify();
      return { success: false, message };
    }
  }

  /**
   * Realiza una llamada saliente mediante Telnyx WebRTC
   * Incluye remoteElement para reproducir el audio del otro lado
   */
  public async makeCall(destinationNumber: string, callerIdNumber: string): Promise<any> {
    if (!this.state.loginToken) {
      throw new Error('Falta el login_token de Telnyx WebRTC.');
    }

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Inicia sesión para realizar llamadas.');
    const normalizedDestination = normalizeTelnyxE164(destinationNumber, 'Destino');
    const requestedCallerId = validateTelnyxCallerId(callerIdNumber);
    const profileSnap = await getDoc(doc(db, 'users', currentUser.uid));
    const profile = profileSnap.exists() ? profileSnap.data() : null;
    if (!profile || String(profile.status || '').toLowerCase() !== 'approved') {
      throw new Error('Tu cuenta no está aprobada para realizar llamadas.');
    }

    // The assignment document is authoritative; the user profile is a legacy fallback.
    let assignment: any = null;
    try {
      const assignmentSnap = await getDoc(doc(db, 'telnyx_agent_assignments', currentUser.uid));
      if (assignmentSnap.exists()) assignment = assignmentSnap.data();
    } catch {
      // The token endpoint independently validates ownership before issuing a session.
    }
    const assignedCredentialId = String(assignment?.telnyxCredentialId || profile.assignedSipCredentialId || '').trim();
    const assignedCallerIdValue = String(assignment?.defaultCallerId || profile.assignedCallerId || '').trim();
    const allowedCallerIds = Array.isArray(assignment?.authorizedNumbers)
      ? assignment.authorizedNumbers.map((value: unknown) => {
          try { return validateTelnyxCallerId(value); } catch { return ''; }
        }).filter(Boolean)
      : [];

    if (!assignedCallerIdValue || !assignedCredentialId) {
      throw new Error('Tu línea telefónica no está configurada. Contacta al administrador para asignarte una línea SIP y un Caller ID.');
    }

    const assignedCallerId = validateTelnyxCallerId(assignedCallerIdValue);
    if (requestedCallerId !== assignedCallerId && !allowedCallerIds.includes(requestedCallerId)) {
      throw new Error('El Caller ID no está autorizado para tu usuario. Selecciona un número asignado por tu administrador.');
    }
    if (allowedCallerIds.length > 0 && !allowedCallerIds.includes(requestedCallerId)) {
      throw new Error('El Caller ID seleccionado no está en tu lista de números autorizados.');
    }

    if (!this.client?.newCall) {
      throw new Error('El cliente TelnyxRTC no está inicializado. Ve a la pestaña de configuración del softphone y pulsa "Configurar JWT" para autenticarte con Telnyx.');
    }

    console.log(`[TelnyxWebRTC] Iniciando llamada a ${normalizedDestination}; Caller ID asignado verificado.`);
    try {
      this.currentCall = this.client.newCall({
        destinationNumber: normalizedDestination,
        callerNumber: assignedCallerId,
        remoteElement: 'remote-audio',
        clientState: btoa(JSON.stringify({ userId: currentUser.uid, sipCredentialId: assignedCredentialId || null }))
      });
    } catch (error) {
      const message = explainTelnyxError(error);
      this.state.lastError = message;
      this.notify();
      throw new Error(message);
    }

    console.log('[TelnyxWebRTC] Llamada creada:', this.currentCall);

    this.state.callStatus = 'calling';
    this.notify();

    // Guardar el ID de la llamada activa
    if (this.currentCall?.id) {
      this.state.activeCallId = this.currentCall.id;
      this.notify();
    }

    return this.currentCall;
  }

  /**
   * Cuelga la llamada activa
   */
  public hangup(): void {
    if (this.currentCall?.hangup) {
      try { this.currentCall.hangup(); } catch {}
    }
    this.currentCall = null;
    this.state.activeCallId = null;
    this.state.callStatus = 'idle';
    this.notify();
    if (this.pendingTokenRefresh) {
      this.pendingTokenRefresh = false;
      void this.refreshCurrentToken();
    }
  }

  public subscribe(listener: (state: TelnyxWebRTCState) => void): () => void {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.state));
  }
}

export const telnyxWebRTCService = new TelnyxWebRTCService();

export const updateTelnyxLoginToken = (jwt: string, persistToFirestore = false) => {
  return telnyxWebRTCService.setLoginToken(jwt, persistToFirestore);
};