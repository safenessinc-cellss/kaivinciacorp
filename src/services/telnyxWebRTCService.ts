/**
 * Telnyx WebRTC SDK Client Service
 * Gestiona la inicialización de TelnyxRTC mediante JWT (login_token)
 * Documentación oficial: https://developers.telnyx.com/docs/webrtc
 */

import { auth } from '../firebase';
import { TelnyxRTC } from '@telnyx/webrtc';

// Token JWT por defecto para inicialización del SDK de Telnyx WebRTC
export let TELNYX_WEBRTC_LOGIN_TOKEN = '';

export interface TelnyxWebRTCState {
  isInitialized: boolean;
  isConnected: boolean;
  loginToken: string;
  activeCallId: string | null;
  lastError: string | null;
}

class TelnyxWebRTCService {
  private client: any = null;
  private clientToken: string | null = null;
  private isConnecting = false;
  private activeCalls = new Map<string, { call: any; audio: HTMLAudioElement }>();
  private latestCallId: string | null = null;
  private state: TelnyxWebRTCState = {
    isInitialized: false,
    isConnected: false,
    loginToken: TELNYX_WEBRTC_LOGIN_TOKEN,
    activeCallId: null,
    lastError: null
  };

  private listeners: Array<(state: TelnyxWebRTCState) => void> = [];

  constructor() {
    // No leer JWT de Telnyx desde Firestore: el token se obtiene del backend
    // después de validar la sesión y los permisos del operador.
  }

  /**
   * Actualiza el login_token (JWT) en memoria y opcionalmente en Firestore
   */
  public async setLoginToken(newJwt: string, persistToFirestore = false): Promise<void> {
    const cleanToken = (newJwt || '').trim();
    TELNYX_WEBRTC_LOGIN_TOKEN = cleanToken;
    this.state.loginToken = cleanToken;
    this.notify();

    // JWTs son credenciales sensibles: no se almacenan en Firestore desde el cliente.
    // El parámetro se conserva por compatibilidad con llamadas existentes.
    void persistToFirestore;
  }

  /**
   * Solicita un nuevo JWT renovado al backend (/api/telnyx-token)
   */
  public async fetchFreshTokenFromBackend(): Promise<{ success: boolean; token?: string; message: string }> {
    try {
      const currentUser = auth.currentUser;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        if (idToken) {
          headers['Authorization'] = `Bearer ${idToken}`;
        }
      }

      const res = await fetch('/api/telnyx-token', { headers });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (data.token) {
        await this.setLoginToken(data.token, false);
        return {
          success: true,
          token: data.token,
          message: 'Nuevo login_token JWT obtenido y aplicado en el cliente Telnyx.'
        };
      }

      return {
        success: false,
        message: 'Respuesta del backend sin token.'
      };
    } catch (err: any) {
      console.error('[TelnyxWebRTC] Error solicitando token del backend:', err);
      return {
        success: false,
        message: err.message || 'Error al conectar con /api/telnyx-token'
      };
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
      this.notify();
      return { success: false, message: errMsg };
    }

    try {
      console.log('[TelnyxWebRTC] Inicializando TelnyxRTC con login_token:', `${token.slice(0, 15)}...${token.slice(-10)}`);

      // No reiniciar el cliente si ya está conectado: hacerlo corta las llamadas activas
      // y ocurría cuando el marcador embebido y el flotante compartían el servicio.
      if (this.client && this.clientToken === token && this.state.isConnected) {
        return { success: true, message: 'Cliente Telnyx ya conectado; se reutiliza la sesión existente.' };
      }
      if (this.client && this.clientToken === token && this.isConnecting) {
        return { success: true, message: 'La conexión Telnyx ya se está inicializando; se reutiliza la sesión existente.' };
      }
      if (this.client && this.activeCalls.size > 0) {
        if (typeof this.client.updateToken === 'function') {
          this.client.updateToken(token);
          await this.setLoginToken(token, false);
          return { success: true, message: 'Token actualizado sin interrumpir las llamadas activas.' };
        }
        throw new Error('No se puede renovar la sesión mientras hay llamadas activas. Finaliza las llamadas e inténtalo de nuevo.');
      }
      if (this.client) {
        try { this.client.disconnect(); } catch {}
      }

      // Crear cliente usando el SDK importado desde @telnyx/webrtc
      this.state.isConnected = false;
      this.client = new TelnyxRTC({
        login_token: token,
        debug: true,
        debugOutput: 'socket',
        ringbackFile: '/sounds/ringback.mp3',
        ringtoneFile: '/sounds/ringtone.mp3'
      });

      this.clientToken = token;

      this.client.on('telnyx.ready', () => {
        console.log('[TelnyxWebRTC] ✅ Cliente conectado y listo.');
        this.isConnecting = false;
        this.state.isConnected = true;
        this.state.isInitialized = true;
        this.state.lastError = null;
        this.notify();
      });

      this.client.on('telnyx.warning', async (warning: any) => {
        if (warning?.code === 34001) {
          console.log('[TelnyxWebRTC] 🔄 Token por expirar, renovando automáticamente...');
          try {
            const { getAuth } = await import('firebase/auth');
            const user = getAuth().currentUser;
            if (!user) throw new Error('No hay usuario autenticado');
            const firebaseToken = await user.getIdToken();

            const res = await fetch('/api/telnyx-token', {
              headers: { 'Authorization': `Bearer ${firebaseToken}` },
            });
            if (!res.ok) throw new Error(`Backend respondió ${res.status}`);
            const data = await res.json();
            const newToken = data.token;
            if (!newToken) throw new Error('Respuesta sin token');

            this.client!.updateToken(newToken);
            console.log('[TelnyxWebRTC] ✅ Token renovado correctamente');
          } catch (err: any) {
            console.error('[TelnyxWebRTC] ❌ Fallo al renovar token:', err.message);
            try { this.client?.disconnect(); } catch {}
            this.state.isConnected = false;
            this.state.lastError = 'Sesión expirada. Vuelve a autenticarte.';
            this.notify();
          }
        }
      });

      this.client.on('telnyx.error', (error: any) => {
        console.error('[TelnyxWebRTC] ❌ Error en cliente:', error);
        this.isConnecting = false;
        this.state.isConnected = false;
        this.state.lastError = error?.message || 'Error en conexión Telnyx WebRTC';
        this.notify();
      });

      this.client.on('telnyx.notification', (notification: any) => {
        const call = notification?.call;
        if (!call) return;
        const callId = String(call.id || '');
        if (callId) this.latestCallId = callId;
        const callState = String(call.state || notification?.state || '').toLowerCase();
        if (callId && ['hangup', 'ended', 'destroy', 'destroyed', 'disconnected'].includes(callState)) {
          const active = this.activeCalls.get(callId);
          if (active) {
            try { active.audio.pause(); active.audio.srcObject = null; active.audio.remove(); } catch {}
            this.activeCalls.delete(callId);
          }
          if (this.latestCallId === callId) {
            const remainingIds = Array.from(this.activeCalls.keys());
            this.latestCallId = remainingIds.length ? remainingIds[remainingIds.length - 1] : null;
          }
        }
        this.state.activeCallId = this.latestCallId;
        this.notify();
      });

      this.isConnecting = true;
      this.client.connect();

      return {
        success: true,
        message: 'SDK de Telnyx WebRTC inicializado correctamente con el nuevo login_token.'
      };
    } catch (err: any) {
      console.error('[TelnyxWebRTC] ❌ Error inicializando SDK:', err);
      this.isConnecting = false;
      this.state.isConnected = false;
      this.state.lastError = err?.message || 'Error desconocido al inicializar Telnyx';
      this.notify();
      return { success: false, message: err?.message || 'Error al inicializar cliente' };
    }
  }

  /**
   * Realiza una llamada saliente mediante Telnyx WebRTC
   * Incluye remoteElement para reproducir el audio del otro lado
   */
  public async makeCall(destinationNumber: string, callerIdNumber?: string): Promise<any> {
    if (!this.state.loginToken) {
      throw new Error('Falta el login_token de Telnyx WebRTC.');
    }

    const cleanDestination = String(destinationNumber || '').trim();
    if (!cleanDestination) throw new Error('Introduce un número de destino válido.');

    if (!this.client?.newCall) {
      throw new Error('El cliente TelnyxRTC no está inicializado. Ve a la pestaña de configuración del softphone y autentícate con Telnyx.');
    }

    // Cada llamada necesita su propio elemento de audio. El elemento compartido anterior
    // provocaba que una llamada reemplazara el audio de otra en sesiones concurrentes.
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', 'true');
    audio.style.display = 'none';
    audio.dataset.telnyxCallAudio = 'true';
    document.body.appendChild(audio);

    try {
      const call = this.client.newCall({
        destinationNumber: cleanDestination,
        callerNumber: callerIdNumber || undefined,
        remoteElement: audio
      });
      const callId = String(call?.id || `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      this.activeCalls.set(callId, { call, audio });
      this.latestCallId = callId;
      this.state.activeCallId = callId;
      this.state.lastError = null;
      this.notify();
      console.log('[TelnyxWebRTC] Llamada creada:', { callId, destination: cleanDestination, callerId: callerIdNumber || 'default', activeCalls: this.activeCalls.size });
      return call;
    } catch (error) {
      try { audio.pause(); audio.remove(); } catch {}
      throw error;
    }
  }

  /** Número de llamadas que siguen registradas en esta sesión WebRTC. */
  public getActiveCallsCount(): number {
    return this.activeCalls.size;
  }

  /** Cuelga una llamada concreta; sin ID, cuelga la última llamada creada. */
  public hangup(callId?: string): void {
    const targetId = callId || this.latestCallId;
    if (!targetId) return;
    const active = this.activeCalls.get(targetId);
    if (active) {
      try { active.call?.hangup?.(); } catch {}
      try { active.audio.pause(); active.audio.srcObject = null; active.audio.remove(); } catch {}
      this.activeCalls.delete(targetId);
    }
    const remaining = Array.from(this.activeCalls.keys());
    this.latestCallId = remaining.length ? remaining[remaining.length - 1] : null;
    this.state.activeCallId = this.latestCallId;
    this.notify();
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

export const updateTelnyxLoginToken = (jwt: string, persistToFirestore = true) => {
  return telnyxWebRTCService.setLoginToken(jwt, persistToFirestore);
};