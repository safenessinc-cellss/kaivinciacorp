import { useEffect, useState } from 'react';
import { Palette, Check } from 'lucide-react';

type AppearanceMode = 'system' | 'light' | 'dark';
type Accent = 'blue' | 'purple' | 'pink' | 'red' | 'orange' | 'yellow' | 'green' | 'mint' | 'teal' | 'indigo' | 'graphite';
type Preferences = { mode: AppearanceMode; accent: Accent; reduceTransparency: boolean; density: 'comfortable' | 'compact' };

const STORAGE_KEY = 'kaivincia_macos_preferences';
const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: 'blue', label: 'Azul', color: '#007AFF' },
  { id: 'purple', label: 'Púrpura', color: '#AF52DE' },
  { id: 'pink', label: 'Rosa', color: '#FF2D55' },
  { id: 'red', label: 'Rojo', color: '#FF3B30' },
  { id: 'orange', label: 'Naranja', color: '#FF9500' },
  { id: 'yellow', label: 'Amarillo', color: '#FFCC00' },
  { id: 'green', label: 'Verde', color: '#34C759' },
  { id: 'mint', label: 'Menta', color: '#00C7BE' },
  { id: 'teal', label: 'Teal', color: '#30B0C7' },
  { id: 'indigo', label: 'Índigo', color: '#5856D6' },
  { id: 'graphite', label: 'Grafito', color: '#8E8E93' },
];
const DEFAULTS: Preferences = { mode: 'system', accent: 'blue', reduceTransparency: false, density: 'comfortable' };

function applyPreferences(prefs: Preferences) {
  const root = document.documentElement;
  const dark = prefs.mode === 'dark' || (prefs.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.setAttribute('data-mac-appearance', dark ? 'dark' : 'light');
  root.setAttribute('data-mac-accent', prefs.accent);
  root.setAttribute('data-reduce-transparency', String(prefs.reduceTransparency));
  root.setAttribute('data-mac-density', prefs.density);
}

export default function MacAppearanceControls() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setPrefs({ ...DEFAULTS, ...JSON.parse(stored) });
    } catch { /* Keep accessible defaults when storage is unavailable. */ }
  }, []);

  useEffect(() => {
    applyPreferences(prefs);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* Storage may be disabled. */ }
  }, [prefs]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => { if (prefs.mode === 'system') applyPreferences(prefs); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [prefs]);

  const update = (patch: Partial<Preferences>) => setPrefs(current => ({ ...current, ...patch }));

  return (
    <details className="relative z-30">
      <summary className="list-none cursor-pointer inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm hover:bg-black/5 focus-visible:outline-2" style={{ borderColor: 'var(--mac-border)', color: 'var(--mac-text-primary)' }} aria-label="Preferencias de apariencia">
        <Palette className="h-4 w-4" strokeWidth={1.75} />
        Apariencia
      </summary>
      <div className="macos-popover absolute right-0 top-full mt-2 w-[288px] p-4 space-y-4">
        <div>
          <label htmlFor="mac-appearance-mode" className="block text-xs font-semibold mb-1.5">Apariencia</label>
          <select id="mac-appearance-mode" value={prefs.mode} onChange={e => update({ mode: e.target.value as AppearanceMode })} className="w-full border rounded-md px-2.5 py-2 text-xs bg-transparent" style={{ borderColor: 'var(--mac-border)', color: 'var(--mac-text-primary)' }}>
            <option value="system">Automático</option><option value="light">Claro</option><option value="dark">Oscuro</option>
          </select>
        </div>
        <fieldset>
          <legend className="block text-xs font-semibold mb-2">Color de acento</legend>
          <div className="grid grid-cols-6 gap-2">
            {ACCENTS.map(accent => (
              <button key={accent.id} type="button" onClick={() => update({ accent: accent.id })} title={accent.label} aria-label={accent.label} aria-pressed={prefs.accent === accent.id} className="w-8 h-8 rounded-full flex items-center justify-center border border-black/10 focus-visible:outline-2 focus-visible:outline-offset-2" style={{ backgroundColor: accent.color, outlineColor: 'var(--mac-accent)' }}>
                {prefs.accent === accent.id && <Check className="w-4 h-4 text-white" strokeWidth={2.5} />}
              </button>
            ))}
          </div>
          <p className="text-[11px] mt-2" style={{ color: 'var(--mac-text-secondary)' }}>{ACCENTS.find(item => item.id === prefs.accent)?.label}</p>
        </fieldset>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="mac-reduce-transparency" className="text-xs">Reducir transparencia</label>
          <input id="mac-reduce-transparency" type="checkbox" checked={prefs.reduceTransparency} onChange={e => update({ reduceTransparency: e.target.checked })} className="accent-blue-600 h-4 w-4" />
        </div>
        <fieldset>
          <legend className="text-xs font-semibold mb-1.5">Densidad</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg p-1" style={{ background: 'rgba(127,127,140,.12)' }}>
            {(['comfortable', 'compact'] as const).map(density => (
              <button key={density} type="button" onClick={() => update({ density })} aria-pressed={prefs.density === density} className="rounded-md px-2 py-1.5 text-xs" style={{ background: prefs.density === density ? 'var(--mac-bg-popover)' : 'transparent', color: 'var(--mac-text-primary)', boxShadow: prefs.density === density ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
                {density === 'comfortable' ? 'Cómoda' : 'Compacta'}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  );
}
