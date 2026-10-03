import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface AppearanceFonts {
  family: string;
  baseSize: number; // 12px a 20px
  headingScale: 'compact' | 'normal' | 'large';
  weight: 'normal' | 'medium' | 'semibold' | 'bold';
}

export interface AppearanceColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  sidebarBg: string;
  sidebarText: string;
  sidebarActive: string;
  headerBg: string;
}

export interface AppearanceLayout {
  sidebarSize: 'compact' | 'normal' | 'expanded'; // 64px, 256px, 320px
  sidebarPosition: 'left' | 'right';
  sidebarCollapsible: 'auto' | 'always_expanded' | 'always_collapsed';
  borderRadius: number; // 0px a 24px
  cardShadow: 'none' | 'subtle' | 'medium' | 'strong';
  density: 'compact' | 'normal' | 'spacious';
}

export interface AppearanceAccessibility {
  highContrast: boolean;
  colorBlindMode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';
  reduceMotion: boolean;
}

export interface AppearanceConfig {
  fonts: AppearanceFonts;
  colors: AppearanceColors;
  layout: AppearanceLayout;
  accessibility: AppearanceAccessibility;
  preset: string;
  updatedAt?: any;
  updatedBy?: string;
}

export const AVAILABLE_FONTS = [
  { id: 'Inter', name: 'Inter (Modern & Clean)', googleFamily: 'Inter:wght@300;400;500;600;700' },
  { id: 'Rajdhani', name: 'Rajdhani (Cyber / Tech)', googleFamily: 'Rajdhani:wght@300;400;500;600;700' },
  { id: 'Roboto', name: 'Roboto (Google Standard)', googleFamily: 'Roboto:wght@300;400;500;700' },
  { id: 'Open Sans', name: 'Open Sans (Neutral & Legible)', googleFamily: 'Open+Sans:wght@300;400;600;700' },
  { id: 'Lato', name: 'Lato (Corporate & Warm)', googleFamily: 'Lato:wght@300;400;700' },
  { id: 'Poppins', name: 'Poppins (Geometric & Friendly)', googleFamily: 'Poppins:wght@300;400;500;600;700' },
  { id: 'Montserrat', name: 'Montserrat (Urban & Strong)', googleFamily: 'Montserrat:wght@300;400;500;600;700' },
  { id: 'Source Sans Pro', name: 'Source Sans Pro (Adobe UI)', googleFamily: 'Source+Sans+3:wght@300;400;600;700' },
  { id: 'Nunito', name: 'Nunito (Rounded & Soft)', googleFamily: 'Nunito:wght@300;400;600;700' },
  { id: 'Raleway', name: 'Raleway (Elegant & Thin)', googleFamily: 'Raleway:wght@300;400;500;600;700' },
  { id: 'Work Sans', name: 'Work Sans (Crisp & Professional)', googleFamily: 'Work+Sans:wght@300;400;500;600;700' }
];

export const APPEARANCE_PRESETS: Record<string, { name: string; description: string; colors: AppearanceColors }> = {
  'kaivincia-cyan': {
    name: 'Kaivincia Cyan',
    description: 'Estilo cyber-corporativo insignia con acentos cian brillante',
    colors: {
      primary: '#00F0FF',
      secondary: '#1e293b',
      background: '#05070a',
      surface: '#0b1118',
      textPrimary: '#ffffff',
      textSecondary: '#94a3b8',
      sidebarBg: '#070b10',
      sidebarText: '#cbd5e1',
      sidebarActive: '#00F0FF',
      headerBg: '#070b10'
    }
  },
  'dark-elegant': {
    name: 'Dark Elegant',
    description: 'Minimalismo oscuro con acentos dorados champagne y superficies obsidiana',
    colors: {
      primary: '#E2B857',
      secondary: '#27272a',
      background: '#09090b',
      surface: '#18181b',
      textPrimary: '#fafafa',
      textSecondary: '#a1a1aa',
      sidebarBg: '#121215',
      sidebarText: '#e4e4e7',
      sidebarActive: '#E2B857',
      headerBg: '#121215'
    }
  },
  'light-corporate': {
    name: 'Light Corporate',
    description: 'Tema claro de alta claridad, azul ejecutivo y superficies blancas puras',
    colors: {
      primary: '#2563eb',
      secondary: '#e2e8f0',
      background: '#f8fafc',
      surface: '#ffffff',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      sidebarBg: '#ffffff',
      sidebarText: '#334155',
      sidebarActive: '#2563eb',
      headerBg: '#ffffff'
    }
  },
  'neon-purple': {
    name: 'Neon Purple',
    description: 'Vibrante violeta eléctrico con fondo nocturno de alto contraste',
    colors: {
      primary: '#A855F7',
      secondary: '#2e1065',
      background: '#0c061a',
      surface: '#170b2e',
      textPrimary: '#f5f3ff',
      textSecondary: '#c4b5fd',
      sidebarBg: '#130827',
      sidebarText: '#ddd6fe',
      sidebarActive: '#C084FC',
      headerBg: '#130827'
    }
  },
  'emerald-green': {
    name: 'Emerald Green',
    description: 'Verde esmeralda bio-financiero para enfoque y serenidad operativa',
    colors: {
      primary: '#10B981',
      secondary: '#064e3b',
      background: '#04140d',
      surface: '#062417',
      textPrimary: '#ecfdf5',
      textSecondary: '#a7f3d0',
      sidebarBg: '#051b12',
      sidebarText: '#d1fae5',
      sidebarActive: '#34D399',
      headerBg: '#051b12'
    }
  },
  'sunset-orange': {
    name: 'Sunset Orange',
    description: 'Naranja atardecer cálido y dinámico de alta energía comercial',
    colors: {
      primary: '#F97316',
      secondary: '#431407',
      background: '#120905',
      surface: '#20110a',
      textPrimary: '#fff7ed',
      textSecondary: '#fed7aa',
      sidebarBg: '#180d07',
      sidebarText: '#ffedd5',
      sidebarActive: '#FB923C',
      headerBg: '#180d07'
    }
  }
};

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  fonts: {
    family: 'Inter',
    baseSize: 14,
    headingScale: 'normal',
    weight: 'normal'
  },
  colors: APPEARANCE_PRESETS['kaivincia-cyan'].colors,
  layout: {
    sidebarSize: 'normal',
    sidebarPosition: 'left',
    sidebarCollapsible: 'auto',
    borderRadius: 12,
    cardShadow: 'medium',
    density: 'normal'
  },
  accessibility: {
    highContrast: false,
    colorBlindMode: 'none',
    reduceMotion: false
  },
  preset: 'kaivincia-cyan'
};

const SETTINGS_DOC_PATH = 'settings/appearance';
const LOCAL_STORAGE_KEY = 'kaivincia_appearance_settings';

/**
 * Validador de contraste WCAG AA entre dos colores hexadecimales
 */
export function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return 0;
  const rgb = [
    parseInt(cleanHex.slice(0, 2), 16) / 255,
    parseInt(cleanHex.slice(2, 4), 16) / 255,
    parseInt(cleanHex.slice(4, 6), 16) / 255
  ].map(val => val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function getContrastRatio(colorA: string, colorB: string): number {
  const lumA = getLuminance(colorA);
  const lumB = getLuminance(colorB);
  const brightest = Math.max(lumA, lumB);
  const darkest = Math.min(lumA, lumB);
  return parseFloat(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

/**
 * Servicio para persistencia de la configuración visual
 */
export async function getAppearance(): Promise<AppearanceConfig> {
  try {
    const docRef = doc(db, 'settings', 'appearance');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as AppearanceConfig;
      const merged: AppearanceConfig = {
        ...DEFAULT_APPEARANCE,
        ...data,
        fonts: { ...DEFAULT_APPEARANCE.fonts, ...(data.fonts || {}) },
        colors: { ...DEFAULT_APPEARANCE.colors, ...(data.colors || {}) },
        layout: { ...DEFAULT_APPEARANCE.layout, ...(data.layout || {}) },
        accessibility: { ...DEFAULT_APPEARANCE.accessibility, ...(data.accessibility || {}) }
      };
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch (error) {
    console.warn('Could not fetch appearance from Firestore, using cache/fallback:', error);
  }

  // Fallback a localStorage
  try {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (local) return JSON.parse(local);
  } catch {}

  return DEFAULT_APPEARANCE;
}

export async function saveAppearance(
  config: Partial<AppearanceConfig>, 
  userUid?: string
): Promise<AppearanceConfig> {
  const current = await getAppearance();
  const merged: AppearanceConfig = {
    ...current,
    ...config,
    fonts: { ...current.fonts, ...(config.fonts || {}) },
    colors: { ...current.colors, ...(config.colors || {}) },
    layout: { ...current.layout, ...(config.layout || {}) },
    accessibility: { ...current.accessibility, ...(config.accessibility || {}) },
    updatedAt: serverTimestamp(),
    updatedBy: userUid || 'system'
  };

  // Guardar en localStorage inmediatamente
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
  } catch {}

  // Guardar en Firestore
  try {
    const docRef = doc(db, 'settings', 'appearance');
    await setDoc(docRef, merged, { merge: true });
  } catch (error) {
    console.error('Error saving appearance to Firestore:', error);
    throw error;
  }

  return merged;
}

export async function resetAppearance(userUid?: string): Promise<AppearanceConfig> {
  return saveAppearance(DEFAULT_APPEARANCE, userUid);
}
