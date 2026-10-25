import { useState, type CSSProperties } from 'react';
import { Check, ChevronDown, Eye, EyeOff, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { MAC_ACCENTS, useMacTheme, type MacAppearanceMode } from '../contexts/MacThemeContext';

export default function MacAppearancePopover() {
  const [open, setOpen] = useState(false);
  const { mode, setMode, accent, setAccent, reduceTransparency, setReduceTransparency, density, setDensity } = useMacTheme();

  const modeOptions: { value: MacAppearanceMode; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Oscuro', icon: Moon },
    { value: 'auto', label: 'Automático', icon: Monitor },
  ];

  return (
    <div className="mac-appearance-control">
      <button type="button" className="mac-toolbar-icon" aria-label="Preferencias de apariencia" aria-expanded={open} onClick={() => setOpen(value => !value)} title="Apariencia">
        <Palette size={16} strokeWidth={1.75} />
        <ChevronDown size={11} strokeWidth={1.8} />
      </button>
      {open && <>
        <button type="button" className="mac-popover-dismiss" aria-label="Cerrar preferencias de apariencia" onClick={() => setOpen(false)} />
        <section className="mac-appearance-popover" aria-label="Preferencias de apariencia">
          <header className="mac-popover-heading">
            <div><strong>Apariencia</strong><span>Personaliza tu espacio de trabajo</span></div>
          </header>
          <div className="mac-setting-row">
            <span className="mac-setting-label">Modo</span>
            <div className="mac-segmented-control">
              {modeOptions.map(option => {
                const Icon = option.icon;
                return <button key={option.value} type="button" className={mode === option.value ? 'is-selected' : ''} onClick={() => setMode(option.value)}>
                  <Icon size={13} strokeWidth={1.8} /><span>{option.label}</span>
                </button>;
              })}
            </div>
          </div>
          <div className="mac-setting-block">
            <div className="mac-setting-label">Color de acento</div>
            <div className="mac-accent-grid">
              {MAC_ACCENTS.map(item => <button key={item.id} type="button" className={accent === item.id ? 'is-selected' : ''} style={{ '--swatch': item[document.documentElement.dataset.macosTheme === 'dark' ? 'dark' : 'light'] } as CSSProperties} onClick={() => setAccent(item.id)} aria-label={item.label} title={item.label}>
                {accent === item.id && <Check size={13} strokeWidth={2.5} />}
              </button>)}
            </div>
            <div className="mac-accent-name">{MAC_ACCENTS.find(item => item.id === accent)?.label}</div>
          </div>
          <div className="mac-setting-row">
            <div><span className="mac-setting-label">Reducir transparencia</span><small>Fondos sólidos para mejorar la legibilidad</small></div>
            <button type="button" role="switch" aria-checked={reduceTransparency} className={`mac-switch ${reduceTransparency ? 'is-on' : ''}`} onClick={() => setReduceTransparency(!reduceTransparency)}><span /></button>
          </div>
          <div className="mac-setting-row">
            <span className="mac-setting-label">Densidad</span>
            <div className="mac-segmented-control compact">
              <button type="button" className={density === 'comfortable' ? 'is-selected' : ''} onClick={() => setDensity('comfortable')}>Cómoda</button>
              <button type="button" className={density === 'compact' ? 'is-selected' : ''} onClick={() => setDensity('compact')}>Compacta</button>
            </div>
          </div>
          <footer className="mac-popover-footer">Los cambios se guardan automáticamente en este dispositivo.</footer>
        </section>
      </>}
    </div>
  );
}
