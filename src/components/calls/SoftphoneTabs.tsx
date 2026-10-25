import React from 'react';
import { Phone, Sliders, Settings2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

interface SoftphoneTabsProps {
  activeTab: 'dialer' | 'config' | 'settings';
  onTabChange: (tab: 'dialer' | 'config' | 'settings') => void;
  role?: string | null;
  selectedCarrierName?: string;
  hasValidSip?: boolean;
  authorizedCallerId?: string;
  isFloating?: boolean;
}

export default function SoftphoneTabs({
  activeTab,
  onTabChange,
  selectedCarrierName,
  hasValidSip = true,
  authorizedCallerId,
  isFloating = false,
  role
}: SoftphoneTabsProps) {
  const { t } = useLanguage();
  const showSettings = ['admin', 'superadmin', 'owner', 'ceo', 'gestor', 'supervisor'].includes(String(role || '').toLowerCase());

  return (
    <div className="flex items-center justify-between bg-slate-900/90 p-1 rounded-2xl border border-slate-800/80 mb-3 shadow-inner">
      <div className={`grid ${showSettings ? "grid-cols-3" : "grid-cols-2"} gap-1 w-full`}>
        {/* Pestaña 1: Marcador */}
        <button
          type="button"
          onClick={() => onTabChange('dialer')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'dialer'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-[0_0_12px_rgba(0,240,255,0.3)]'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Phone className={`w-3.5 h-3.5 ${activeTab === 'dialer' ? 'fill-current' : ''}`} />
          <span>{t('voip.tab_dialer', 'Marcador')}</span>
        </button>

        {/* Pestaña 2: Configuración */}
        <button
          type="button"
          onClick={() => onTabChange('config')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
            activeTab === 'config'
              ? 'bg-white text-black shadow-sm'
              : 'text-[#3C3C43]/70 hover:bg-black/5'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{t('voip.tab_config', 'Configuración')}</span>

          {/* Indicador de estado de línea */}
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              hasValidSip ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
            }`}
            title={hasValidSip ? 'Línea SIP configurada' : 'Configuración pendiente'}
          />
        </button>
        {showSettings && (
          <button
            type="button"
            aria-label="Abrir ajustes de telefonía"
            aria-pressed={activeTab === 'settings'}
            onClick={() => onTabChange('settings')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'settings' ? 'bg-white text-black shadow-sm' : 'text-[#3C3C43]/70 hover:bg-black/5'}`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Ajustes</span>
          </button>
        )}
      </div>
    </div>
  );
}
