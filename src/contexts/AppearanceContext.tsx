import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { 
  AppearanceConfig, 
  DEFAULT_APPEARANCE, 
  AVAILABLE_FONTS, 
  APPEARANCE_PRESETS,
  saveAppearance as saveAppearanceService,
  resetAppearance as resetAppearanceService 
} from '../services/appearanceService';

interface AppearanceContextType {
  appearance: AppearanceConfig;
  previewAppearance: AppearanceConfig | null;
  setPreviewAppearance: (config: AppearanceConfig | null) => void;
  updateAppearance: (config: Partial<AppearanceConfig>) => Promise<void>;
  resetAppearance: () => Promise<void>;
  applyPreset: (presetKey: string) => Promise<void>;
  loading: boolean;
  canEditAppearance: boolean;
  presets: typeof APPEARANCE_PRESETS;
}

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'kaivincia_appearance_settings';

// Cargar fuente de Google Fonts dinámicamente si no está en el documento
function ensureGoogleFontLoaded(family: string) {
  const fontMeta = AVAILABLE_FONTS.find(f => f.id === family);
  if (!fontMeta) return;

  const linkId = `google-font-${fontMeta.id.toLowerCase().replace(/\s+/g, '-')}`;
  if (!document.getElementById(linkId)) {
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontMeta.googleFamily}&display=swap`;
    document.head.appendChild(link);
  }
}

// Aplicar variables CSS y clases de accesibilidad en el elemento raíz (:root)
function applyCssVariablesToRoot(config: AppearanceConfig) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // 1. Tipografía
  ensureGoogleFontLoaded(config.fonts.family);
  root.style.setProperty('--font-family', `'${config.fonts.family}', sans-serif`);
  root.style.setProperty('--font-size-base', `${config.fonts.baseSize}px`);

  // Escala de encabezados
  const headingScales: Record<string, string> = {
    compact: '0.875',
    normal: '1',
    large: '1.2'
  };
  root.style.setProperty('--heading-scale', headingScales[config.fonts.headingScale] || '1');

  // Peso tipográfico
  const fontWeights: Record<string, string> = {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700'
  };
  root.style.setProperty('--font-weight-base', fontWeights[config.fonts.weight] || '400');

  // 2. Colores principales
  root.style.setProperty('--color-primary', config.colors.primary);
  root.style.setProperty('--color-secondary', config.colors.secondary);
  root.style.setProperty('--color-background', config.colors.background);
  root.style.setProperty('--color-surface', config.colors.surface);
  root.style.setProperty('--color-text-primary', config.colors.textPrimary);
  root.style.setProperty('--color-text-secondary', config.colors.textSecondary);
  root.style.setProperty('--color-sidebar-bg', config.colors.sidebarBg);
  root.style.setProperty('--color-sidebar-text', config.colors.sidebarText);
  root.style.setProperty('--color-sidebar-active', config.colors.sidebarActive);
  root.style.setProperty('--color-header-bg', config.colors.headerBg);

  // 3. Menú y Layout
  const sidebarWidths: Record<string, string> = {
    compact: '64px',
    normal: '256px',
    expanded: '320px'
  };
  root.style.setProperty('--sidebar-width', sidebarWidths[config.layout.sidebarSize] || '256px');
  root.style.setProperty('--border-radius', `${config.layout.borderRadius}px`);

  // Sombras de tarjetas
  const shadowValues: Record<string, string> = {
    none: 'none',
    subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.2), 0 1px 2px -1px rgba(0, 0, 0, 0.2)',
    medium: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',
    strong: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
  };
  root.style.setProperty('--card-shadow', shadowValues[config.layout.cardShadow] || shadowValues.medium);

  // Densidad de padding
  const densityPaddings: Record<string, string> = {
    compact: '0.5rem',
    normal: '1rem',
    spacious: '1.5rem'
  };
  root.style.setProperty('--density-padding', densityPaddings[config.layout.density] || '1rem');

  // 4. Accesibilidad (Clases globales)
  if (config.accessibility.highContrast) {
    root.classList.add('high-contrast');
  } else {
    root.classList.remove('high-contrast');
  }

  if (config.accessibility.reduceMotion) {
    root.classList.add('reduce-motion');
  } else {
    root.classList.remove('reduce-motion');
  }

  // Modos de daltonismo
  root.classList.remove('colorblind-deuteranopia', 'colorblind-protanopia', 'colorblind-tritanopia');
  if (config.accessibility.colorBlindMode !== 'none') {
    root.classList.add(`colorblind-${config.accessibility.colorBlindMode}`);
  }
}

export const AppearanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  // Cargar estado inicial desde localStorage si existe
  const [appearance, setAppearance] = useState<AppearanceConfig>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          ...DEFAULT_APPEARANCE,
          ...parsed,
          fonts: { ...DEFAULT_APPEARANCE.fonts, ...(parsed.fonts || {}) },
          colors: { ...DEFAULT_APPEARANCE.colors, ...(parsed.colors || {}) },
          layout: { ...DEFAULT_APPEARANCE.layout, ...(parsed.layout || {}) },
          accessibility: { ...DEFAULT_APPEARANCE.accessibility, ...(parsed.accessibility || {}) }
        };
      }
    } catch {}
    return DEFAULT_APPEARANCE;
  });

  const [previewAppearance, setPreviewAppearance] = useState<AppearanceConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Permisos: SuperAdmin o Admin
  const canEditAppearance = useMemo(() => {
    if (!user) return false;
    const role = (user as any)?.role;
    const email = user.email || '';
    return role === 'superadmin' || role === 'admin' || email === 'safeness.c.a@gmail.com' || email === 'deuwyrobert@gmail.com';
  }, [user]);

  // Aplicar variables CSS cuando cambia la apariencia activa o la previsualización
  useEffect(() => {
    const targetConfig = previewAppearance || appearance;
    applyCssVariablesToRoot(targetConfig);
  }, [appearance, previewAppearance]);

  // Suscripción en tiempo real a Firestore (settings/appearance)
  useEffect(() => {
    const docRef = doc(db, 'settings', 'appearance');
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      setLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.data() as AppearanceConfig;
        const merged: AppearanceConfig = {
          ...DEFAULT_APPEARANCE,
          ...data,
          fonts: { ...DEFAULT_APPEARANCE.fonts, ...(data.fonts || {}) },
          colors: { ...DEFAULT_APPEARANCE.colors, ...(data.colors || {}) },
          layout: { ...DEFAULT_APPEARANCE.layout, ...(data.layout || {}) },
          accessibility: { ...DEFAULT_APPEARANCE.accessibility, ...(data.accessibility || {}) }
        };
        setAppearance(merged);
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        } catch {}
      } else {
        // Inicializar con valores por defecto
        setAppearance(DEFAULT_APPEARANCE);
      }
    }, (error) => {
      console.warn('Realtime appearance subscription error (fallback to local):', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updateAppearance = useCallback(async (partial: Partial<AppearanceConfig>) => {
    const updated = await saveAppearanceService(partial, user?.uid);
    setAppearance(updated);
    setPreviewAppearance(null);
  }, [user]);

  const resetAppearance = useCallback(async () => {
    const reset = await resetAppearanceService(user?.uid);
    setAppearance(reset);
    setPreviewAppearance(null);
  }, [user]);

  const applyPreset = useCallback(async (presetKey: string) => {
    const preset = APPEARANCE_PRESETS[presetKey];
    if (!preset) return;

    await updateAppearance({
      preset: presetKey,
      colors: preset.colors
    });
  }, [updateAppearance]);

  const contextValue = useMemo(() => ({
    appearance,
    previewAppearance,
    setPreviewAppearance,
    updateAppearance,
    resetAppearance,
    applyPreset,
    loading,
    canEditAppearance,
    presets: APPEARANCE_PRESETS
  }), [appearance, previewAppearance, updateAppearance, resetAppearance, applyPreset, loading, canEditAppearance]);

  return (
    <AppearanceContext.Provider value={contextValue}>
      {children}
    </AppearanceContext.Provider>
  );
};

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearance must be used within an AppearanceProvider');
  }
  return context;
}
