import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Phone, PhoneOff, Mic, MicOff, Pause, Play, Disc, Volume2, VolumeX, X, Zap, Sparkles, AlertCircle, Maximize2, Minimize2, GripHorizontal, Copy, ClipboardPaste, RotateCcw, Radio, Check, RefreshCw, Settings, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../contexts/LanguageContext';
import { useGlobalContext } from '../../contexts/GlobalContext';
import { VoipProvider, CallRecord, SoftphoneState } from '../../types/calls';
import VoipProviderModal from './VoipProviderModal';

// Subcomponentes modulares del Softphone
import SoftphoneTabs from './SoftphoneTabs';
import SoftphoneDisplay, { sanitizeDialNumber } from './SoftphoneDisplay';
import SoftphoneKeypad from './SoftphoneKeypad';
import SoftphoneConfig from './SoftphoneConfig';
import SoftphoneSettings from './SoftphoneSettings';
import '../../styles/softphone.css';
import SoftphoneSipConsole from './SoftphoneSipConsole';
import { telnyxWebRTCService, normalizeTelnyxE164, validateTelnyxCallerId } from '../../services/telnyxWebRTCService';
import { formatPhoneE164 } from '../../utils/phone';

interface SoftphoneDialerProps {
  mode?: 'embedded' | 'floating';
  initialPhoneNumber?: string;
  onCallStart?: (phoneNumber: string) => void;
  onCallEnd?: (record: Partial<CallRecord>) => void;
  onCloseFloating?: () => void;
  onClose?: () => void;
  className?: string;
}

// Frecuencias DTMF estándar (ITU-T)
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

const DEFAULT_PROVIDERS: VoipProvider[] = [
  {
    id: 'zadarma',
    name: 'Zadarma (SIP Cloud)',
    type: 'sip',
    status: 'enabled',
    costPerMinute: '$0.012',
    credentials: { domain: 'sip.zadarma.com', username: '345678' }
  },
  {
    id: 'telnyx',
    name: 'Telnyx WebRTC',
    type: 'api',
    status: 'available',
    costPerMinute: '$0.010'
  },
  {
    id: 'twilio',
    name: 'Twilio Voice',
    type: 'sdk',
    status: 'available',
    costPerMinute: '$0.015'
  }
];

// Números de Caller ID: se cargan SOLO desde Telnyx (telnyx_phone_numbers en Firestore).
// No hardcodear números aquí para evitar el error 403 "originator number is invalid".
const REAL_TELNYX_CALLER_IDS: string[] = [];

export default function SoftphoneDialer({
  mode = 'embedded',
  initialPhoneNumber = '',
  onCallStart,
  onCallEnd,
  onCloseFloating,
  onClose,
  className = ''
}: SoftphoneDialerProps) {
  const handleClose = onClose || onCloseFloating;
  const { t } = useLanguage();
  const { user, userData, loading: authLoading } = useAuth();
  const { clients = [] } = useGlobalContext();

  const isFloating = mode === 'floating';

  // Detección responsive para móvil vs tablet/desktop
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Modo del dialer: compacto o completo (persistente en localStorage)
  const [dialerMode, setDialerMode] = useState<'compact' | 'full'>(() => {
    try {
      return (localStorage.getItem('kaivincia_dialer_mode') as 'compact' | 'full') || 'compact';
    } catch {
      return 'compact';
    }
  });

  const toggleDialerMode = (mode: 'compact' | 'full') => {
    setDialerMode(mode);
    try {
      localStorage.setItem('kaivincia_dialer_mode', mode);
    } catch {}
  };

  // Estado minimizado persistente en localStorage
  const [isMinimized, setIsMinimized] = useState(() => {
    try { return localStorage.getItem('kaivincia_softphone_minimized') === 'true'; } catch { return false; }
  });

  const toggleMinimized = (val: boolean) => {
    setIsMinimized(val);
    try { localStorage.setItem('kaivincia_softphone_minimized', String(val)); } catch {}
  };

  // Posición flotante persistente en localStorage
  const [savedPosition, setSavedPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem('kaivincia_softphone_pos');
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 0, y: 0 };
  });

  // Notificación tipo toast interna
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // Restablecer posición
  const resetPosition = useCallback(() => {
    setSavedPosition({ x: 0, y: 0 });
    try { localStorage.removeItem('kaivincia_softphone_pos'); } catch {}
    showToast('Posición restablecida');
  }, [showToast]);

  // Navegación por pestañas: Marcador o Configuración
  const [activeTab, setActiveTab] = useState<'dialer' | 'config' | 'settings'>('dialer');
  const [isFloatingExpanded, setIsFloatingExpanded] = useState(false);

  // Estados del discador
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [callStatus, setCallStatus] = useState<SoftphoneState['status']>('idle');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [hasSipAssigned, setHasSipAssigned] = useState<boolean | null>(null);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [selectedCarrier, setSelectedCarrier] = useState<string>('telnyx');
  const [providers, setProviders] = useState<VoipProvider[]>(DEFAULT_PROVIDERS);
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [providerToEdit, setProviderToEdit] = useState<Partial<VoipProvider> | null>(null);
  const [liveLatency, setLiveLatency] = useState(24);
  const [liveJitter, setLiveJitter] = useState(1.1);
  const [sipLogs, setSipLogs] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);

  // Estados de Telnyx: Control de Caller ID autorizado y Campaña / Cliente
  const [authorizedCallerIds, setAuthorizedCallerIds] = useState<string[]>(REAL_TELNYX_CALLER_IDS);
  const [selectedCallerId, setSelectedCallerId] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('Ventas B2B');
  const [selectedClientName, setSelectedClientName] = useState<string>('');
  const [agentAssignment, setAgentAssignment] = useState<any | null>(null);
  const [authorizedZones, setAuthorizedZones] = useState<any[]>([]);

  // Estados de Telnyx WebRTC login_token (JWT)
  const [isTelnyxTokenModalOpen, setIsTelnyxTokenModalOpen] = useState(false);
  const [rtcState, setRtcState] = useState(() => telnyxWebRTCService.getState());
  const tokenHoursRemaining = rtcState.tokenExpiresAt ? Math.max(0, Math.floor((new Date(rtcState.tokenExpiresAt).getTime() - Date.now()) / 3600000)) : null;
  const [isGeneratingBackendToken, setIsGeneratingBackendToken] = useState(false);
  const [currentWebRtcJwt, setCurrentWebRtcJwt] = useState(() => telnyxWebRTCService.getLoginToken());

  // Sincronizar token en vivo con el servicio
  useEffect(() => {
    const unsub = telnyxWebRTCService.subscribe((nextRtcState) => {
      setRtcState(nextRtcState);
      setCurrentWebRtcJwt(nextRtcState.loginToken);
      if (nextRtcState.isConnected) {
        setConnectionStatus('connected');
        setConnectionError(null);
      } else if (nextRtcState.lastError) {
        setConnectionStatus('error');
        setConnectionError(nextRtcState.lastError);
      }
    });
    return unsub;
  }, []);

  // Inicializar el cliente Telnyx automáticamente al cargar el componente
  useEffect(() => {
    let cancelled = false;
    const initTelnyx = async () => {
      if (authLoading || !user) return;
      try {
        setConnectionStatus('connecting');
        setConnectionError(null);
        // El servicio comprueba la asignación antes de llamar al backend.
        const result = await telnyxWebRTCService.fetchFreshTokenFromBackend();
        if (cancelled) return;
        if (result.success) {
          setHasSipAssigned(true);
          setConnectionStatus('connected');
          setConnectionError(null);
          console.log('[SoftphoneDialer] Token obtenido y evento telnyx.ready recibido.');
        } else {
          const noSip = /no tienes (?:línea sip|una línea telefónica) asignada/i.test(result.message);
          setHasSipAssigned(!noSip);
          setConnectionStatus('error');
          setConnectionError(result.message);
          console.warn('[SoftphoneDialer] No se pudo inicializar Telnyx:', result.message);
          showToast(noSip ? 'No tienes línea SIP asignada. Contacta al administrador.' : `Error de conexión con Telnyx: ${result.message}. Reintentar.`);
        }
      } catch (err: any) {
        console.error('[SoftphoneDialer] Error inicializando Telnyx:', err);
      }
    };
    initTelnyx();
    return () => { cancelled = true; };
  }, [user, authLoading, userData?.role, userData?.assignedCallerId, showToast]);

  // ============================================================
  // Renovación automática del JWT cada 24 horas
  // ============================================================
  useEffect(() => {
    if (authLoading || !user) return;

    let isMounted = true;

    const renewTokenIfNeeded = async () => {
      try {
        const currentToken = telnyxWebRTCService.getLoginToken();
        if (currentToken) {
          try {
            const payload = JSON.parse(atob(currentToken.split('.')[1]));
            const expiresAt = payload.exp * 1000;
            const now = Date.now();
            const hoursUntilExpiry = (expiresAt - now) / (1000 * 60 * 60);

            if (hoursUntilExpiry < 2) {
              console.log('[SoftphoneDialer] 🔄 Token por expirar, renovando...');
              const res = await telnyxWebRTCService.fetchFreshTokenFromBackend();
              if (res.success && res.token && isMounted) {
                await telnyxWebRTCService.setLoginToken(res.token, false);
                console.log('[SoftphoneDialer] ✅ Token renovado');
              }
            }
          } catch (e) {
            console.warn('[SoftphoneDialer] Error decodificando token:', e);
          }
        }
      } catch (err) {
        console.error('[SoftphoneDialer] Error en renovación automática:', err);
      }
    };

    renewTokenIfNeeded();
    const interval = setInterval(renewTokenIfNeeded, 60 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user, userData?.role, userData?.assignedCallerId, authLoading]);

  const handleGenerateBackendTelnyxToken = async () => {
    setIsGeneratingBackendToken(true);
    try {
      const res = await telnyxWebRTCService.fetchFreshTokenFromBackend();
      if (res.success && res.token) {
        showToast('Nuevo login_token generado vía API de Telnyx');
        setSipLogs(prev => [
          `[${new Date().toLocaleTimeString()}] Telnyx WebRTC -> JWT temporal generado vía API.`,
          ...prev.slice(0, 30)
        ]);
        setIsTelnyxTokenModalOpen(false);
      } else {
        showToast(res.message || 'No se pudo generar token');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setIsGeneratingBackendToken(false);
    }
  };

  // Referencias para gestión segura de audio y temporizadores
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<any>(null);
  const callDurationIntervalRef = useRef<any>(null);
  const timeoutsRef = useRef<any[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const currentCallStartedAtRef = useRef<string>('');

  useEffect(() => {
    if (initialPhoneNumber) setPhoneNumber(initialPhoneNumber);
  }, [initialPhoneNumber]);

  // Cargar proveedores, números y asignaciones desde Firestore
  useEffect(() => {
    if (authLoading || !user) return;

    let voipList: VoipProvider[] = DEFAULT_PROVIDERS;
    let esimList: VoipProvider[] = [];

    const updateCombined = () => setProviders([...voipList, ...esimList]);

    const unsubVoip = onSnapshot(collection(db, 'voip_providers'), (snapshot) => {
      if (!snapshot.empty) {
        voipList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoipProvider));
      }
      updateCombined();
    }, (err) => console.warn('Could not read voip_providers:', err));

    const unsubEsim = onSnapshot(collection(db, 'esim_profiles'), (snapshot) => {
      if (!snapshot.empty) {
        esimList = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((p: any) => p.isInternalLineActive !== false && p.status !== 'expired')
          .map((p: any) => ({
            id: `esim_${p.id}`,
            name: `📱 ${p.lineName || 'Línea eSIM'} (${p.extension || 'Ext. 101'})`,
            type: 'sip' as const,
            status: 'enabled' as const,
            costPerMinute: '$0.008',
            credentials: {
              domain: p.sipCredentials?.sipDomain || 'sip.zadarma.com',
              username: p.sipCredentials?.sipUsername || p.phone?.replace(/\D/g, '') || '345678',
              callerId: p.phone || ''
            }
          }));
        updateCombined();
      }
    }, (err) => console.warn('Could not read esim_profiles:', err));

    // Caller ID único: siempre procede de la asignación verificada del perfil.
    let assignmentData: any | null = null;
    const recomputeAuthorizedCallerIds = () => {
      const assigned = String(userData?.assignedCallerId || '').trim();
      let authorized: string[] = [];
      if (assigned) {
        try { authorized = [validateTelnyxCallerId(assigned)]; } catch { authorized = []; }
      }
      setAuthorizedCallerIds(authorized);
      setSelectedCallerId(current => current && authorized.includes(current) ? current : (authorized[0] || ''));
    };

    const unsubAssignments = onSnapshot(collection(db, 'telnyx_agent_assignments'), (snapshot) => {
      if (!snapshot.empty) {
        const found = snapshot.docs.find(d => d.id === user.uid || d.data().agentEmail === user.email);
        if (found) {
          assignmentData = found.data();
          setAgentAssignment(assignmentData);
          setAuthorizedZones(assignmentData.authorizedZones || []);
        } else {
          assignmentData = null;
          setAgentAssignment(null);
          setAuthorizedZones([]);
        }
      } else {
        assignmentData = null;
        setAgentAssignment(null);
        setAuthorizedZones([]);
      }
      recomputeAuthorizedCallerIds();
    }, (err) => {
      console.warn('Could not read agent assignments:', err);
      assignmentData = null;
      recomputeAuthorizedCallerIds();
    });

    return () => {
      unsubVoip(); unsubEsim(); unsubAssignments();
    };
  }, [user, authLoading]);

  // ── Auto-selección de Caller ID por código de área del destino ──────────
  useEffect(() => {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    // Solo cuando el destino es un número US completo (11 dígitos: 1 + 10)
    if (digits.length !== 11 || !digits.startsWith('1')) return;
    const destArea = digits.slice(1, 4);
    if (!destArea) return;
    const match = authorizedCallerIds.find((cid) => {
      const cd = String(cid).replace(/\D/g, '');
      return cd.startsWith('1') && cd.slice(1, 4) === destArea;
    });
    if (match && match !== selectedCallerId) {
      setSelectedCallerId(match);
    }
  }, [phoneNumber, authorizedCallerIds]);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(id => clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  const getAudioContext = useCallback((): AudioContext | null => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return null;
        audioCtxRef.current = new AudioContextClass();
      }
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      return audioCtxRef.current;
    } catch (e) {
      console.warn('Web Audio not available:', e);
      return null;
    }
  }, []);

  const playDtmfTone = useCallback((char: string) => {
    const freqs = DTMF_FREQUENCIES[char];
    if (!freqs) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const oscLow = ctx.createOscillator();
      const oscHigh = ctx.createOscillator();
      const gain = ctx.createGain();
      oscLow.frequency.setValueAtTime(freqs[0], now);
      oscHigh.frequency.setValueAtTime(freqs[1], now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + 0.12);
      oscLow.connect(gain);
      oscHigh.connect(gain);
      gain.connect(ctx.destination);
      oscLow.start(now);
      oscHigh.start(now);
      oscLow.stop(now + 0.13);
      oscHigh.stop(now + 0.13);
    } catch (e) { console.warn('Error synthesizing DTMF tone', e); }
  }, [getAudioContext]);

  const stopRingback = useCallback(() => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }, []);

  const startRingback = useCallback(() => {
    stopRingback();
    const ctx = getAudioContext();
    if (!ctx) return;
    const playCycle = () => {
      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return;
        const now = audioCtxRef.current.currentTime;
        const osc1 = audioCtxRef.current.createOscillator();
        const osc2 = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 0.05);
        gain.gain.setValueAtTime(0.06, now + 1.6);
        gain.gain.linearRampToValueAtTime(0, now + 1.7);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.8);
        osc2.stop(now + 1.8);
      } catch (err) { console.warn('Ringback cycle error', err); }
    };
    playCycle();
    ringIntervalRef.current = setInterval(playCycle, 4000);
  }, [getAudioContext, stopRingback]);

  const playConnectBeep = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.1);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {}
  }, [getAudioContext]);

  const playHangupBeep = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(480, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    } catch (e) {}
  }, [getAudioContext]);

  const copyPhoneNumber = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      await navigator.clipboard.writeText(phoneNumber);
      showToast(t('common.copied', 'Número copiado'));
    } catch { showToast('Error al copiar'); }
  }, [phoneNumber, showToast, t]);

  const pastePhoneNumber = useCallback(async () => {
    try {
      if (!navigator.clipboard?.readText) {
        showToast('Pega usando Cmd+V / Ctrl+V');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const cleaned = sanitizeDialNumber(text);
      if (cleaned) {
        setPhoneNumber(cleaned);
        showToast(t('voip.pasted', 'Número pegado'));
      }
    } catch { showToast('Pega directamente en el campo (Cmd+V / Ctrl+V)'); }
  }, [showToast, t]);

  const handleDigitPress = (char: string) => {
    playDtmfTone(char);
    setPhoneNumber(prev => prev + char);
  };

  const handleBackspace = () => setPhoneNumber(prev => prev.slice(0, -1));
  const handleClear = () => setPhoneNumber('');

  const activeCarrierObj = useMemo(() => {
    return providers.find(p => p.id === selectedCarrier) || providers[0] || DEFAULT_PROVIDERS[0];
  }, [providers, selectedCarrier]);

  const hasValidSipCredentials = useMemo(() => {
    if (!activeCarrierObj) return false;
    if (activeCarrierObj.status === 'offline') return false;
    if (activeCarrierObj.type === 'sip') {
      return !!(activeCarrierObj.credentials?.username || activeCarrierObj.credentials?.domain);
    }
    if (activeCarrierObj.id === 'telnyx' || activeCarrierObj.name.toLowerCase().includes('telnyx')) {
      return hasSipAssigned === true;
    }
    return true;
  }, [activeCarrierObj, hasSipAssigned]);

  const handleHangup = useCallback(() => {
    stopRingback();
    clearAllTimeouts();
    playHangupBeep();

    try { telnyxWebRTCService.hangup(); } catch (e) { console.warn('Error colgando Telnyx:', e); }

    if (callDurationIntervalRef.current) {
      clearInterval(callDurationIntervalRef.current);
      callDurationIntervalRef.current = null;
    }

    const finalDuration = duration;
    const endedRecord: any = {
      contactPhone: phoneNumber,
      contactName: selectedClientName ? `${selectedClientName} (${phoneNumber})` : `Contacto ${phoneNumber}`,
      callerId: selectedCallerId || activeCarrierObj?.credentials?.callerId || '',
      duration: finalDuration,
      status: finalDuration > 0 ? 'completed' : 'missed',
      direction: 'outbound',
      startedAt: currentCallStartedAtRef.current || new Date().toISOString(),
      endedAt: new Date().toISOString(),
      provider: activeCarrierObj.name.includes('Telnyx') ? `Telnyx Backbone` : activeCarrierObj.name,
      carrier: activeCarrierObj.id,
      agentId: auth.currentUser?.uid || user?.uid || 'agent_current',
      agentName: user?.displayName || (user as any)?.name || 'Colaboradora Kaivincia',
      agentEmail: auth.currentUser?.email || user?.email || 'agent@kaivincia.com',
      projectName: selectedProject || 'General',
      disposition: finalDuration > 0 ? 'Conectada / Éxito' : 'Sin contestar',
      notes: `Caller ID: ${selectedCallerId || 'N/A'} | Proyecto/Campaña: ${selectedProject || 'General'}`,
      isRecorded: isRecording || Boolean(agentAssignment?.recordCalls)
    };

    addDoc(collection(db, 'voip_call_history'), endedRecord).catch(err => {
      console.warn('Could not write call record to Firestore:', err);
    });

    setSipLogs(prev => [
      `[${new Date().toLocaleTimeString()}] SIP BYE -> Llamada finalizada`,
      ...prev.slice(0, 30)
    ]);

    setCallStatus('ended');
    if (onCallEnd) onCallEnd(endedRecord);

    const resetTimeout = setTimeout(() => {
      setCallStatus('idle');
      setDuration(0);
      setIsMuted(false);
      setIsOnHold(false);
      setIsRecording(false);
    }, 1500);
    timeoutsRef.current.push(resetTimeout);
  }, [duration, phoneNumber, selectedClientName, selectedCallerId, activeCarrierObj, selectedProject, isRecording, agentAssignment, onCallEnd, stopRingback, clearAllTimeouts, playHangupBeep, user]);

  // Reflect real SDK call states; never mark a Telnyx call connected on a timer.
  useEffect(() => {
    if (rtcState.callStatus === 'connected' && callStatus !== 'connected') {
      stopRingback();
      setIsOnHold(false);
      setCallStatus('connected');
      playConnectBeep();
      if (!callDurationIntervalRef.current) {
        callDurationIntervalRef.current = setInterval(() => setDuration(prev => prev + 1), 1000);
      }
    } else if (rtcState.callStatus === 'calling' && callStatus === 'idle') {
      setCallStatus('calling');
    } else if (rtcState.callStatus === 'on_hold' && callStatus !== 'on_hold') {
      setIsOnHold(true);
      setCallStatus('on_hold');
    } else if (rtcState.callStatus === 'ended' && callStatus !== 'idle' && callStatus !== 'ended') {
      handleHangup();
    }
  }, [rtcState.callStatus, callStatus, stopRingback, playConnectBeep, handleHangup]);

  const handleStartCall = async (targetPhone?: string) => {
    let dialNum = targetPhone || phoneNumber;
    if (!dialNum || dialNum.trim().length === 0) return;

    const isTelnyxCarrier = selectedCarrier === 'telnyx' || activeCarrierObj.name.includes('Telnyx');
    if (isTelnyxCarrier) {
      try { dialNum = formatPhoneE164(dialNum, 'MX'); }
      catch (error: any) { showToast(error?.message || 'Escribe un número válido.'); return; }
    }
    if (isTelnyxCarrier && connectionStatus !== 'connected') {
      const message = hasSipAssigned === false
        ? 'No tienes línea SIP asignada. Contacta al administrador.'
        : connectionStatus === 'connecting'
          ? 'Conectando con Telnyx… espera a que aparezca Conectado.'
          : `Error de conexión con Telnyx: ${connectionError || 'sesión no conectada'}. Reintentar.`;
      showToast(message);
      return;
    }

    const cleanDigits = dialNum.replace(/\D/g, '');
    if (cleanDigits.length < 8) {
      showToast(t('voip.min_digits', 'El número debe tener al menos 8 dígitos'));
      return;
    }

    // Validación de zona autorizada
    const areaCode = cleanDigits.substring(0, 3);
    if ((dialNum.startsWith('+1') || cleanDigits.length === 10 || cleanDigits.length === 11) && authorizedZones.length > 0) {
      const isAuthorized = authorizedZones.some((zone: any) => zone.enabled && zone.areaCodes.includes(areaCode));
      if (!isAuthorized) {
        showToast(`⛔ Zona no autorizada. Solo puedes llamar a: ${authorizedZones.map((z: any) => z.zoneName).join(', ')}`);
        return;
      }
    }

    // Validar Caller ID y confirmar que pertenece a la lista autorizada para este agente.
    if (!selectedCallerId) {
      showToast('⚠️ No hay Caller ID seleccionado. Sincroniza números desde Telnyx en el admin.');
      return;
    }

    let normalizedCallerId = selectedCallerId;
    if (isTelnyxCarrier) {
      try {
        normalizedCallerId = validateTelnyxCallerId(selectedCallerId);
        const authorizedNormalized = authorizedCallerIds.map((number) => {
          try { return normalizeTelnyxE164(number, 'Caller ID autorizado'); } catch { return ''; }
        });
        if (!authorizedNormalized.includes(normalizedCallerId)) {
          showToast('⛔ El Caller ID seleccionado no está autorizado para tu usuario. Elige un número asignado desde la configuración del softphone.');
          return;
        }
      } catch (err: any) {
        showToast(err?.message || 'El Caller ID no es válido. Selecciona un número real y autorizado de Telnyx.');
        return;
      }
    }

    currentCallStartedAtRef.current = new Date().toISOString();
    setCallStatus('calling');
    setDuration(0);
    setIsMuted(false);
    setIsOnHold(false);
    setIsRecording(false);

    setSipLogs(prev => [
      `[${new Date().toLocaleTimeString()}] 📞 Iniciando llamada a ${dialNum} vía ${activeCarrierObj.name}`,
      ...(isTelnyxCarrier ? [
        `[${new Date().toLocaleTimeString()}] Telnyx WebRTC SDK -> ${telnyxWebRTCService.getLoginToken() ? 'Sesión de telefonía disponible' : 'Sesión de telefonía no disponible'}`
      ] : []),
      ...prev.slice(0, 30)
    ]);

    if (isTelnyxCarrier) {
      try {
        console.log(`[SoftphoneDialer] Llamando vía Telnyx SDK a ${dialNum} con Caller ID ${selectedCallerId}`);
        const call = await telnyxWebRTCService.makeCall(dialNum, normalizedCallerId);
        setSipLogs(prev => [
          `[${new Date().toLocaleTimeString()}] ✅ Llamada Telnyx iniciada (ID: ${call?.id || 'unknown'})`,
          `[${new Date().toLocaleTimeString()}] Caller ID: ${normalizedCallerId}`,
          ...prev.slice(0, 30)
        ]);
        onCallStart?.(dialNum);
      } catch (err: any) {
        const reason = String(err?.message || 'No se pudo iniciar la llamada.');
        const sipCode = String(err?.code || err?.sipCode || err?.status || '');
        console.error('[SoftphoneDialer] Error en llamada Telnyx:', { sipCode, reason });
        showToast(`No se pudo iniciar la llamada: ${reason}`);
        setSipLogs(prev => [
          `[${new Date().toLocaleTimeString()}] ❌ Error de llamada ${sipCode ? `(${sipCode}) ` : ''}${reason}`,
          ...prev.slice(0, 30)
        ]);
        addDoc(collection(db, 'voip_call_history'), {
          userId: auth.currentUser?.uid || user?.uid || '',
          agentId: auth.currentUser?.uid || user?.uid || '',
          destination: dialNum,
          contactPhone: dialNum,
          callerId: normalizedCallerId,
          direction: 'outbound',
          status: 'failed',
          sipCode: sipCode || null,
          sipReason: reason.slice(0, 500),
          duration: 0,
          timestamp: new Date().toISOString(),
          startedAt: currentCallStartedAtRef.current || new Date().toISOString(),
          endedAt: new Date().toISOString(),
          provider: 'Telnyx'
        }).catch((writeError) => console.warn('[SoftphoneDialer] No se pudo registrar la llamada fallida:', writeError));
        setCallStatus('idle');
        return;
      }
    } else {
      startRingback();
      onCallStart?.(dialNum);
      const ringTimeout = setTimeout(() => {
        stopRingback();
        playConnectBeep();
        setCallStatus('connected');
        setSipLogs(prev => [
          `[${new Date().toLocaleTimeString()}] SIP 200 OK -> Llamada simulada`,
          ...prev.slice(0, 30)
        ]);
        callDurationIntervalRef.current = setInterval(() => setDuration(prev => prev + 1), 1000);
      }, 3500);
      timeoutsRef.current.push(ringTimeout);
    }
  };

  const handleForceConnectNow = () => {
    if (callStatus !== 'calling') return;
    clearAllTimeouts();
    stopRingback();
    playConnectBeep();
    setCallStatus('connected');
    setSipLogs(prev => [
      `[${new Date().toLocaleTimeString()}] FORCED 200 OK -> Sesión de llamada conectada manualmente`,
      ...prev.slice(0, 30)
    ]);
    if (!callDurationIntervalRef.current) {
      callDurationIntervalRef.current = setInterval(() => setDuration(prev => prev + 1), 1000);
    }
  };



  const toggleMute = () => {
    setIsMuted(prev => !prev);
    setSipLogs(prev => [
      `[${new Date().toLocaleTimeString()}] Micrófono ${!isMuted ? 'SILENCIADO' : 'ACTIVADO'}`,
      ...prev.slice(0, 30)
    ]);
  };

  const toggleHold = () => {
    const nextHold = !isOnHold;
    setIsOnHold(nextHold);
    setSipLogs(prev => [
      `[${new Date().toLocaleTimeString()}] SIP ${nextHold ? 'CALL ON HOLD' : 'CALL RETRIEVED'}`,
      ...prev.slice(0, 30)
    ]);
  };

  const toggleRecord = () => {
    if (!isRecording) {
      setIsRecording(true);
      setSipLogs(prev => [
        `[${new Date().toLocaleTimeString()}] Grabación de audio local INICIADA (MediaRecorder)`,
        ...prev.slice(0, 30)
      ]);
    } else {
      setIsRecording(false);
      setSipLogs(prev => [
        `[${new Date().toLocaleTimeString()}] Grabación de audio FINALIZADA`,
        ...prev.slice(0, 30)
      ]);
    }
  };

  // Atajos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (isFloating && handleClose) handleClose();
        return;
      }
      if (isCmdOrCtrl && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copyPhoneNumber();
        return;
      }
      if (isCmdOrCtrl && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pastePhoneNumber();
        return;
      }
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      if (callStatus === 'connected' || callStatus === 'on_hold') {
        if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleMute(); return; }
        if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleHold(); return; }
      }
      if ((e.key >= '0' && e.key <= '9') || e.key === '*' || e.key === '#') {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter' && callStatus === 'idle' && phoneNumber.trim()) {
        e.preventDefault();
        handleStartCall();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (callStatus !== 'idle') handleHangup();
        else if (isFloating && handleClose) handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callStatus, phoneNumber, isFloating, handleClose, copyPhoneNumber, pastePhoneNumber, handleHangup]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      stopRingback();
      clearAllTimeouts();
      if (callDurationIntervalRef.current) clearInterval(callDurationIntervalRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try { audioCtxRef.current.close(); } catch (e) {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
    };
  }, [clearAllTimeouts, stopRingback]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const showTabs = !isFloating || isFloatingExpanded;

  return (
    <motion.div
      drag={isFloating && !isMobile}
      dragMomentum={false}
      dragElastic={0.06}
      animate={isFloating && !isMobile ? { x: savedPosition.x, y: savedPosition.y } : undefined}
      onDragEnd={(_e, info) => {
        if (isFloating && !isMobile) {
          const newX = savedPosition.x + info.offset.x;
          const newY = savedPosition.y + info.offset.y;
          const clampedX = Math.min(24, Math.max(-window.innerWidth + 360, newX));
          const clampedY = Math.min(24, Math.max(-window.innerHeight + 140, newY));
          setSavedPosition({ x: clampedX, y: clampedY });
          try {
            localStorage.setItem('kaivincia_softphone_pos', JSON.stringify({ x: clampedX, y: clampedY }));
          } catch {}
        }
      }}
      className={`softphone-liquid bg-slate-950/95 backdrop-blur-xl text-white border border-slate-800 shadow-2xl transition-all ${
        isFloating
          ? isMobile
            ? 'fixed bottom-0 left-0 right-0 w-full rounded-t-3xl rounded-b-none border-b-0 border-x-0 border-t border-slate-800 p-4 z-50 shadow-[0_-10px_35px_rgba(0,0,0,0.85)]'
            : 'fixed bottom-6 right-6 z-50 w-84 sm:w-92 rounded-3xl p-3.5 sm:p-4 select-none shadow-[0_20px_40px_rgba(0,0,0,0.7)]'
          : 'relative rounded-3xl p-4 sm:p-6'
      } ${className}`}
    >
      <audio id="remote-audio" autoPlay playsInline />
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 z-40 px-3 py-1 bg-cyan-500 text-black text-[10px] font-black uppercase tracking-wider rounded-full shadow-lg backdrop-blur-md flex items-center gap-1.5 pointer-events-none"
          >
            <Sparkles className="w-3 h-3 fill-current" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedCarrier === 'telnyx' && (
        <div aria-live="polite" className={`mb-3 rounded-xl border px-3 py-2 flex items-center justify-between gap-3 text-xs ${
          connectionStatus === 'connected'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : connectionStatus === 'connecting'
              ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        }`}>
          <div className="min-w-0">
            <div className="font-bold">
              {connectionStatus === 'connected' ? 'Conectado a Telnyx' : connectionStatus === 'connecting' ? 'Conectando…' : hasSipAssigned === false ? 'No tienes línea SIP asignada. Contacta al administrador.' : 'Softphone desconectado'}
            </div>
            {connectionStatus === 'error' && hasSipAssigned !== false && connectionError && (
              <div className="mt-1 break-words text-[11px] opacity-90">{connectionError}</div>
            )}
          </div>
          {connectionStatus !== 'connected' && hasSipAssigned !== false && (
            <button
              type="button"
              disabled={connectionStatus === 'connecting'}
              onClick={async () => {
                setConnectionStatus('connecting');
                setConnectionError(null);
                const result = await telnyxWebRTCService.fetchFreshTokenFromBackend();
                if (result.success) {
                  setHasSipAssigned(true);
                  setConnectionStatus('connected');
                  setConnectionError(null);
                } else {
                  const noSip = /no tienes línea sip asignada/i.test(result.message);
                  setHasSipAssigned(!noSip);
                  setConnectionStatus('error');
                  setConnectionError(result.message);
                  showToast(noSip ? 'No tienes línea SIP asignada. Contacta al administrador.' : `Error de conexión con Telnyx: ${result.message}. Reintentar.`);
                }
              }}
              className="shrink-0 rounded-lg border border-current/30 px-3 py-1.5 font-bold disabled:opacity-50"
            >
              {connectionStatus === 'connecting' ? 'Conectando…' : 'Reintentar'}
            </button>
          )}
        </div>
      )}

      {isMinimized ? (
        <div className="flex items-center justify-between gap-2">
          {isFloating && !isMobile && (
            <div onDoubleClick={resetPosition} className="cursor-move text-slate-500 hover:text-cyan-400 p-1 transition-colors rounded" title="Arrastrar barra del discador">
              <GripHorizontal className="w-4 h-4" />
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-900 border border-slate-800 text-[10px] font-mono shrink-0">
            <span className={`w-2 h-2 rounded-full ${
              callStatus === 'idle' ? 'bg-emerald-400' :
              callStatus === 'calling' ? 'bg-cyan-400 animate-ping' :
              callStatus === 'connected' ? 'bg-emerald-400 animate-pulse' :
              callStatus === 'on_hold' ? 'bg-amber-400 animate-bounce' : 'bg-rose-400'
            }`} />
            <span className="font-bold text-white uppercase text-[9px]">
              {callStatus === 'idle' ? 'DISP' :
               callStatus === 'calling' ? 'LLAMANDO' :
               callStatus === 'connected' ? formatTimer(duration) :
               callStatus === 'on_hold' ? 'HOLD' : 'FIN'}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center gap-1.5 px-1 min-w-0">
            <span onClick={copyPhoneNumber} className="truncate font-mono text-xs font-bold text-white text-center cursor-pointer hover:text-cyan-300 transition-colors" title="Clic para copiar número">
              {phoneNumber || <span className="text-slate-500 text-[11px]">Sin número</span>}
            </span>
            {phoneNumber && (
              <button type="button" onClick={copyPhoneNumber} className="p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0" title="Copiar número">
                <Copy className="w-3 h-3" />
              </button>
            )}
            {callStatus === 'idle' && (
              <button type="button" onClick={pastePhoneNumber} className="p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0" title="Pegar número">
                <ClipboardPaste className="w-3 h-3" />
              </button>
            )}
          </div>
          {callStatus === 'idle' ? (
            <button type="button" onClick={() => handleStartCall()} disabled={!phoneNumber.trim() || (selectedCarrier === 'telnyx' && connectionStatus !== 'connected')} className="p-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black disabled:opacity-40 transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.3)] active:scale-95 shrink-0" title="Llamar">
              <Phone className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button type="button" onClick={handleHangup} className="p-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white transition-all cursor-pointer shadow-[0_0_12px_rgba(244,63,94,0.3)] active:scale-95 shrink-0" title="Colgar">
              <PhoneOff className="w-3.5 h-3.5 fill-current" />
            </button>
          )}
          <button type="button" onClick={() => toggleMinimized(false)} className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer shrink-0" title="Expandir discador completo">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          {isFloating && (
            <button type="button" onClick={handleClose} className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors cursor-pointer shrink-0" title="Cerrar discador flotante">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <>
          {isFloating && (
            <div className="absolute top-3 right-3 flex items-center gap-1 z-20">
              <button type="button" onClick={() => toggleMinimized(true)} className="p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer" title="Minimizar discador">
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setIsFloatingExpanded(!isFloatingExpanded)} className="p-1.5 text-slate-400 hover:text-cyan-400 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer" title={isFloatingExpanded ? 'Contraer configuración' : 'Expandir configuración'}>
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={handleClose} className="p-1.5 text-slate-400 hover:text-rose-400 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer" title="Cerrar marcador">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className={`flex items-center justify-between gap-2 border-b border-slate-900 ${isFloating ? 'pb-2.5 mb-2.5' : 'pb-3 mb-3'}`}>
            <div className="flex items-center gap-2.5">
              {isFloating && !isMobile && (
                <div onDoubleClick={resetPosition} className="cursor-move text-slate-500 hover:text-cyan-400 p-1 rounded-lg transition-colors" title="Arrastrar softphone">
                  <GripHorizontal className="w-4 h-4" />
                </div>
              )}
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.25)]">
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-tight italic flex items-center gap-1.5">
                  <span>{t('voip.softphone_title', 'Softphone WebRTC')}</span>
                  {isFloating && (
                    <span className="text-[8px] px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                      {isMobile ? 'MÓVIL' : 'FLOTANTE'}
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[10px] text-slate-400 font-medium truncate max-w-[170px] sm:max-w-none">
                    {activeCarrierObj?.name || 'Telnyx WebRTC'} · OPUS
                  </p>
                  {(selectedCarrier === 'telnyx' || activeCarrierObj?.name?.includes('Telnyx')) && (
                    <button type="button" onClick={() => setIsTelnyxTokenModalOpen(true)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold transition-all cursor-pointer ${currentWebRtcJwt ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-900/60' : 'bg-amber-950/70 text-amber-300 border border-amber-500/30 hover:bg-amber-900/60 animate-pulse'}`} title="Ver estado de la sesión de telefonía">
                      <Radio className="w-2.5 h-2.5 text-cyan-400" />
                      <span>{connectionStatus === 'connected' ? `Sesión activa · ${tokenHoursRemaining === null ? '--' : tokenHoursRemaining + ' h'}` : connectionStatus === 'connecting' ? 'Conectando…' : currentWebRtcJwt ? 'Sesión lista' : 'Regenerar sesión'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {!isFloating && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggleDialerMode(dialerMode === 'compact' ? 'full' : 'compact')} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer" title={dialerMode === 'compact' ? 'Mostrar configuración completa' : 'Modo compacto'}>
                  {dialerMode === 'compact' ? <Settings className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                </button>
                {hasValidSipCredentials ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-[9px] font-mono text-emerald-400 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    SIP OK
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-950/60 border border-amber-500/30 text-[9px] font-mono text-amber-400 font-semibold">
                    <AlertCircle className="w-2.5 h-2.5 text-amber-400" />
                    Pendiente
                  </span>
                )}

              </div>
            )}
          </div>

          {showTabs && (
            <SoftphoneTabs activeTab={activeTab} onTabChange={setActiveTab} role={userData?.role} selectedCarrierName={activeCarrierObj?.name} hasValidSip={hasValidSipAssigned !== false && hasValidSipCredentials} authorizedCallerId={selectedCallerId} isFloating={isFloating} />
          )}

          <SoftphoneDisplay phoneNumber={phoneNumber} callerId={selectedCallerId} onPhoneNumberChange={setPhoneNumber} onBackspace={handleBackspace} onClear={handleClear} callStatus={callStatus} duration={duration} onForceConnect={handleForceConnectNow} compact={isFloating} onCopySuccess={showToast} onPasteSuccess={showToast} onDigitType={playDtmfTone} />

          {activeTab === 'dialer' ? (
            <div className="space-y-2">
              <SoftphoneKeypad onDigitPress={handleDigitPress} disabled={callStatus === 'ended'} compact={isFloating} />
            </div>
          ) : activeTab === 'config' ? (
            <div className="space-y-2">
              <SoftphoneConfig
                providers={providers}
                selectedCarrier={selectedCarrier}
                onSelectCarrier={setSelectedCarrier}
                authorizedCallerIds={authorizedCallerIds}
                selectedCallerId={selectedCallerId}
                onSelectCallerId={setSelectedCallerId}
                selectedProject={selectedProject}
                onSelectProject={setSelectedProject}
                selectedClientName={selectedClientName}
                onSelectClient={(clientName, phone) => {
                  setSelectedClientName(clientName);
                  if (phone && callStatus === 'idle') setPhoneNumber(phone);
                }}
                clients={clients}
                liveLatency={liveLatency}
                liveJitter={liveJitter}
                hasValidSipCredentials={hasValidSipCredentials}
                onOpenProviderModal={(provider) => { setProviderToEdit(provider); setIsProviderModalOpen(true); }}
                callStatus={callStatus}
                agentAssignment={agentAssignment}
              />
            </div>
          ) : (
            <SoftphoneSettings
              role={userData?.role}
              connectionStatus={connectionStatus}
              connectionError={connectionError}
              hasSipAssigned={hasSipAssigned}
              token={currentWebRtcJwt}
              tokenExpiresAt={rtcState.tokenExpiresAt}
              credentialId={agentAssignment?.telnyxCredentialId || rtcState.lastTokenCredentialId}
              callerId={selectedCallerId || agentAssignment?.defaultCallerId}
              onReconnect={async () => {
                if (callStatus !== 'idle' && callStatus !== 'ended') {
                  telnyxWebRTCService.deferTokenRefreshUntilCallEnds();
                  showToast('La sesión se renovará automáticamente al terminar la llamada.');
                  return false;
                }
                setConnectionStatus('connecting');
                setConnectionError(null);
                const result = await telnyxWebRTCService.fetchFreshTokenFromBackend();
                if (result.success) {
                  setHasSipAssigned(true);
                  setConnectionStatus('connected');
                  setConnectionError(null);
                  showToast('Sesión de telefonía renovada.');
                  return true;
                } else {
                  const noSip = /no tienes línea sip asignada/i.test(result.message);
                  setHasSipAssigned(!noSip);
                  setConnectionStatus('error');
                  setConnectionError(result.message);
                  showToast(noSip ? 'No tienes línea SIP asignada. Contacta al administrador.' : 'No se pudo conectar con Telnyx. Vuelve a intentar en unos segundos.');
                  return false;
                }
              }}
              onToast={showToast}
            />
          )}

          <SoftphoneSipConsole logs={sipLogs} isOpen={showConsole} onToggle={() => setShowConsole(!showConsole)} onClearLogs={() => setSipLogs([])} liveLatency={liveLatency} liveJitter={liveJitter} callStatus={callStatus} />
        </>
      )}

      <VoipProviderModal isOpen={isProviderModalOpen} onClose={() => { setIsProviderModalOpen(false); setProviderToEdit(null); }} provider={providerToEdit} allProviders={providers} onSaved={(saved) => { setSelectedCarrier(saved.id); }} />

      <AnimatePresence>
        {isTelnyxTokenModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="softphone-liquid w-full max-w-md p-5 space-y-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="softphone-session-title"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 id="softphone-session-title" className="text-lg font-semibold">Sesión de telefonía</h4>
                  <p className="softphone-muted text-sm">La sesión se genera de forma segura desde el servidor.</p>
                </div>
                <button type="button" aria-label="Cerrar detalles de sesión" onClick={() => setIsTelnyxTokenModalOpen(false)} className="rounded-full bg-white/80 p-2 border border-black/10 focus-visible:ring-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="softphone-glass-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>Estado</span>
                  <strong>{connectionStatus === 'connected' ? 'Conectado' : connectionStatus === 'connecting' ? 'Conectando…' : 'Desconectado'}</strong>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>Sesión</span>
                  <code className="text-xs">{currentWebRtcJwt ? `${currentWebRtcJwt.slice(0, 20)}…` : 'Sin token'}</code>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>Válida hasta</span>
                  <strong className="text-right">{rtcState.tokenExpiresAt ? new Date(rtcState.tokenExpiresAt).toLocaleString('es-MX') : 'No disponible'}</strong>
                </div>
              </div>
              <p className="softphone-muted text-xs">Por seguridad, el token completo no se muestra, copia ni guarda en Firestore desde el softphone.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsTelnyxTokenModalOpen(false)} className="flex-1 rounded-full bg-white border border-black/10 px-4 py-3 text-sm font-semibold focus-visible:ring-2">Cerrar</button>
                <button type="button" onClick={() => { setIsTelnyxTokenModalOpen(false); void handleGenerateBackendTelnyxToken(); }} disabled={isGeneratingBackendToken || (callStatus !== 'idle' && callStatus !== 'ended')} className="flex-1 rounded-full bg-[#007AFF] text-white px-4 py-3 text-sm font-semibold disabled:opacity-50 focus-visible:ring-2">
                  {isGeneratingBackendToken ? 'Generando…' : 'Regenerar sesión'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}