import { Check, Monitor, Moon, Sun, Eye, EyeOff } from 'lucide-react';
import { MAC_ACCENTS, useMacTheme, type MacAppearanceMode } from '../../contexts/MacThemeContext';

export default function MacAppearanceSettings() {
  const { mode, setMode, accent, setAccent, reduceTransparency, setReduceTransparency, density, setDensity } = useMacTheme();
  const modes: { value: MacAppearanceMode; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Oscuro', icon: Moon },
    { value: 'auto', label: 'Automático', icon: Monitor },
  ];
  return (
    <section className="mac-preferences-panel">
      <header className="mac-preferences-header">
        <div className="mac-preferences-icon"><Eye size={19} strokeWidth={1.75} /></div>
        <div><h2>Apariencia del sistema</h2><p>Personaliza el aspecto de Kaivincia en este dispositivo.</p></div>
      </header>
      <div className="mac-preferences-row">
        <div><strong>Apariencia</strong><small>Adapta el CRM a tu entorno de trabajo.</small></div>
        <div className="mac-segmented-control">
          {modes.map(option => { const Icon = option.icon; return <button key={option.value} type="button" className={mode === option.value ? 'is-selected' : ''} onClick={() => setMode(option.value)}><Icon size={14} />{option.label}</button>; })}
        </div>
      </div>
      <div className="mac-preferences-row accent-row">
        <div><strong>Color de acento</strong><small>Se aplica a la selección, controles y acciones principales.</small></div>
        <div className="mac-accent-settings-grid">
          {MAC_ACCENTS.map(item => <button key={item.id} type="button" className={accent === item.id ? 'is-selected' : ''} style={{ '--swatch': item[document.documentElement.dataset.macosTheme === 'dark' ? 'dark' : 'light'] } as CSSProperties} onClick={() => setAccent(item.id)} aria-label={item.label} title={item.label}>{accent === item.id && <Check size={14} strokeWidth={2.5} />}<span>{item.label}</span></button>)}
        </div>
      </div>
      <div className="mac-preferences-row">
        <div><strong>Reducir transparencia</strong><small>Usa superficies sólidas para mejorar la legibilidad y reducir efectos visuales.</small></div>
        <button type="button" role="switch" aria-checked={reduceTransparency} className={`mac-switch ${reduceTransparency ? 'is-on' : ''}`} onClick={() => setReduceTransparency(!reduceTransparency)}><span /></button>
      </div>
      <div className="mac-preferences-row">
        <div><strong>Densidad de interfaz</strong><small>Elige más espacio o más información visible.</small></div>
        <div className="mac-segmented-control compact">
          <button type="button" className={density === 'comfortable' ? 'is-selected' : ''} onClick={() => setDensity('comfortable')}>Cómoda</button>
          <button type="button" className={density === 'compact' ? 'is-selected' : ''} onClick={() => setDensity('compact')}>Compacta</button>
        </div>
      </div>
      <div className="mac-preferences-note"><EyeOff size={14} /> Las preferencias visuales se guardan localmente y no cambian permisos, datos ni configuración de telefonía.</div>
    </section>
  );
}
