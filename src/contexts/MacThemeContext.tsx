import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type MacAppearanceMode = 'light' | 'dark' | 'auto';
export type MacAccentId = 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'mint' | 'teal' | 'indigo' | 'graphite';
export type MacDensity = 'comfortable' | 'compact';

export const MAC_ACCENTS: { id: MacAccentId; label: string; light: string; dark: string }[] = [
  { id: 'blue', label: 'Azul', light: '#007AFF', dark: '#0A84FF' },
  { id: 'purple', label: 'Púrpura', light: '#AF52DE', dark: '#BF5AF2' },
  { id: 'pink', label: 'Rosa', light: '#FF2D55', dark: '#FF375F' },
  { id: 'red', label: 'Rojo', light: '#FF3B30', dark: '#FF453A' },
  { id: 'orange', label: 'Naranja', light: '#D96C00', dark: '#FF9F0A' },
  { id: 'yellow', label: 'Amarillo', light: '#946B00', dark: '#FFD60A' },
  { id: 'green', label: 'Verde', light: '#248A3D', dark: '#30D158' },
  { id: 'mint', label: 'Menta', light: '#00A896', dark: '#63E6D2' },
  { id: 'teal', label: 'Teal', light: '#0B8793', dark: '#40C8E0' },
  { id: 'indigo', label: 'Índigo', light: '#5856D6', dark: '#5E5CE6' },
  { id: 'graphite', label: 'Grafito', light: '#636366', dark: '#98989D' },
];

type MacThemeState = {
  mode: MacAppearanceMode;
  accent: MacAccentId;
  reduceTransparency: boolean;
  density: MacDensity;
  resolvedMode: 'light' | 'dark';
  setMode: (mode: MacAppearanceMode) => void;
  setAccent: (accent: MacAccentId) => void;
  setReduceTransparency: (enabled: boolean) => void;
  setDensity: (density: MacDensity) => void;
};

const STORAGE_KEY = 'kaivincia_macos_appearance_v1';
const MacThemeContext = createContext<MacThemeState | null>(null);

export function MacThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<MacAppearanceMode>('auto');
  const [accent, setAccent] = useState<MacAccentId>('blue');
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [density, setDensity] = useState<MacDensity>('comfortable');
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (['light', 'dark', 'auto'].includes(parsed.mode)) setMode(parsed.mode);
        if (MAC_ACCENTS.some(item => item.id === parsed.accent)) setAccent(parsed.accent);
        setReduceTransparency(Boolean(parsed.reduceTransparency));
        if (['comfortable', 'compact'].includes(parsed.density)) setDensity(parsed.density);
      }
    } catch { /* Keep safe defaults when stored settings are invalid. */ }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolvedMode = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    const root = document.documentElement;
    const selected = MAC_ACCENTS.find(item => item.id === accent) || MAC_ACCENTS[0];
    root.dataset.macosTheme = resolvedMode;
    root.dataset.macosDensity = density;
    root.dataset.reduceTransparency = reduceTransparency ? 'true' : 'false';
    root.style.setProperty('--mac-accent', resolvedMode === 'dark' ? selected.dark : selected.light);
    root.style.setProperty('--mac-accent-soft', resolvedMode === 'dark'
      ? `color-mix(in srgb, ${selected.dark} 18%, transparent)`
      : `color-mix(in srgb, ${selected.light} 12%, transparent)`);
    root.style.setProperty('--mac-accent-hover', resolvedMode === 'dark'
      ? `color-mix(in srgb, ${selected.dark} 84%, white)`
      : `color-mix(in srgb, ${selected.light} 84%, black)`);
    root.style.setProperty('--mac-material-blur', reduceTransparency ? '0px' : '40px');
    root.style.setProperty('--mac-material-window', reduceTransparency
      ? (resolvedMode === 'dark' ? '#1c1c1e' : '#f5f5f7')
      : (resolvedMode === 'dark' ? 'rgba(30, 30, 32, .88)' : 'rgba(250, 250, 252, .86)'));
    root.style.setProperty('--mac-material-sidebar', reduceTransparency
      ? (resolvedMode === 'dark' ? '#202023' : '#ededf0')
      : (resolvedMode === 'dark' ? 'rgba(38, 38, 41, .78)' : 'rgba(235, 235, 240, .74)'));
    root.style.setProperty('--mac-material-popover', reduceTransparency
      ? (resolvedMode === 'dark' ? '#2b2b2e' : '#ffffff')
      : (resolvedMode === 'dark' ? 'rgba(42, 42, 46, .96)' : 'rgba(255, 255, 255, .92)'));
    root.style.setProperty('--mac-bg-canvas', resolvedMode === 'dark' ? '#111113' : '#e9e9ed');
    root.style.setProperty('--mac-bg-window', resolvedMode === 'dark' ? '#1c1c1e' : '#f5f5f7');
    root.style.setProperty('--mac-bg-toolbar', resolvedMode === 'dark' ? 'rgba(48,48,52,.72)' : 'rgba(255,255,255,.64)');
    root.style.setProperty('--mac-text-primary', resolvedMode === 'dark' ? '#f5f5f7' : '#1d1d1f');
    root.style.setProperty('--mac-text-secondary', resolvedMode === 'dark' ? '#b5b5bb' : '#64646b');
    root.style.setProperty('--mac-border', resolvedMode === 'dark' ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.11)');
    root.style.setProperty('--mac-row-hover', resolvedMode === 'dark' ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.035)');
    root.style.setProperty('--mac-shadow-window', resolvedMode === 'dark'
      ? '0 24px 80px rgba(0,0,0,.48), 0 2px 10px rgba(0,0,0,.24)'
      : '0 24px 80px rgba(30,35,50,.16), 0 2px 10px rgba(30,35,50,.08)');
    root.style.colorScheme = resolvedMode;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, accent, reduceTransparency, density })); } catch {}
  }, [mode, accent, reduceTransparency, density, resolvedMode]);

  const value = useMemo(() => ({
    mode, accent, reduceTransparency, density, resolvedMode,
    setMode, setAccent, setReduceTransparency, setDensity
  }), [mode, accent, reduceTransparency, density, resolvedMode]);

  return <MacThemeContext.Provider value={value}>{children}</MacThemeContext.Provider>;
}

export function useMacTheme() {
  const value = useContext(MacThemeContext);
  if (!value) throw new Error('useMacTheme must be used inside MacThemeProvider');
  return value;
}
