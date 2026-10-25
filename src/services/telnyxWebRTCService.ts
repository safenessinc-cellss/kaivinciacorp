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
  private currentCall: any = null;
  private state: TelnyxWebRTCState = {
    isInitialized: false,
    isConnected: false,
    loginToken: TELNYX_WEBRTC_LOGIN_TOKEN,
    activeCallId: null,
    lastError: null
  };

  private listeners: Array<(state: TelnyxWebRTCState) => void> = [];
  private callUpdateListeners: Array<(call: any) => void> = [];
  private initializingToken: string | null = null;
  private initializedToken: string | null = null;
  private clientGeneration = 0;

  /** Actualiza el JWT sólo en memoria; los tokens de sesión no se guardan en Firestore. */
  public async setLoginToken(newJwt: string, _persistToFirestore = false): Promise<void> {
    const cleanToken = (newJwt || '').trim();
    TELNYX_WEBRTC_LOGIN_TOKEN = cleanToken;
    this.state.loginToken = cleanToken;
    this.notify();
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
        await this.initClient(data.token);
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
      if (this.initializingToken === token) {
        return { success: true, message: 'La inicialización de Telnyx ya está en curso.' };
      }
      if (this.initializedToken === token && this.client) {
        return { success: true, message: 'El cliente Telnyx ya está inicializado para este token.' };
      }
      this.initializingToken = token;
      const generation = ++this.clientGeneration;
      const isCurrentClient = () => generation === this.clientGeneration;
      console.log('[TelnyxWebRTC] Inicializando cliente TelnyxRTC.');

      // Desconectar cliente existente antes de crear uno nuevo
      if (this.client) {
        try { this.client.disconnect(); } catch {}
      }
      this.state.isConnected = false;
      this.state.isInitialized = false;
      this.state.activeCallId = null;
      this.initializedToken = null;

      // Crear cliente usando el SDK importado desde @telnyx/webrtc
      const client = new TelnyxRTC({
        login_token: token,
        debug: true,
        debugOutput: 'socket',
        ringbackFile: '/sounds/ringback.mp3',
        ringtoneFile: '/sounds/ringtone.mp3'
      });

      this.client = client;
      client.on('telnyx.ready', () => {
        if (!isCurrentClient()) return;
        this.initializedToken = token;
        console.log('[TelnyxWebRTC] ✅ Cliente conectado y listo.');
        this.state.isConnected = true;
        this.state.isInitialized = true;
        this.state.lastError = null;
        this.notify();
      });

      client.on('telnyx.warning', async (warning: any) => {
        if (!isCurrentClient()) return;
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

      client.on('telnyx.error', (error: any) => {
        if (!isCurrentClient()) return;
        console.error('[TelnyxWebRTC] ❌ Error en cliente:', error);
        this.state.lastError = error?.message || 'Error en conexión Telnyx WebRTC';
        this.notify();
      });

      client.on('telnyx.notification', (notification: any) => {
        if (!isCurrentClient()) return;
        if (notification?.type === 'callUpdate' && notification?.call) {
          this.callUpdateListeners.forEach(listener => {
            try { listener(notification.call); } catch {}
          });
        }
        if (notification?.call) {
          this.state.activeCallId = notification.call.id || this.state.activeCallId;
          this.notify();
        }
      });

      client.connect();

      return {
        success: true,
        message: 'SDK de Telnyx WebRTC inicializado correctamente con el nuevo login_token.'
      };
    } catch (err: any) {
      this.initializedToken = null;
      console.error('[TelnyxWebRTC] ❌ Error inicializando SDK:', err);
      this.state.lastError = err?.message || 'Error desconocido al inicializar Telnyx';
      this.notify();
      return { success: false, message: err?.message || 'Error al inicializar cliente' };
    } finally {
      this.initializingToken = null;
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

    const normalizedDestination = String(destinationNumber || '').replace(/[^0-9+]/g, '');
    if (!/^[+]?[1-9][0-9]{7,14}$/.test(normalizedDestination)) {
      throw new Error('El número de destino no tiene un formato internacional válido.');
    }
    if (!this.state.isConnected) {
      throw new Error('Telnyx no está conectado; no se puede iniciar la llamada.');
    }

    if (!this.client?.newCall) {
      throw new Error('El cliente TelnyxRTC no está inicializado. Ve a la pestaña de configuración del softphone y pulsa "Configurar JWT" para autenticarte con Telnyx.');
    }

    // Crear la llamada con remoteElement para reproducir el audio entrante
    this.currentCall = this.client.newCall({
      destinationNumber: normalizedDestination,
      ...(callerIdNumber ? { callerNumber: callerIdNumber } : {}),
      remoteElement: 'remote-audio'
    });

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
    this.notify();
  }

  public subscribeCallUpdates(listener: (call: any) => void): () => void {
    this.callUpdateListeners.push(listener);
    return () => { this.callUpdateListeners = this.callUpdateListeners.filter(item => item !== listener); };
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