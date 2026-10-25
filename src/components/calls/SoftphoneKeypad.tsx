import React from 'react';

interface SoftphoneKeypadProps {
  onDigitPress: (char: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

const KEYPAD_BUTTONS = [
  { key: '1', sub: '' },
  { key: '2', sub: 'ABC' },
  { key: '3', sub: 'DEF' },
  { key: '4', sub: 'GHI' },
  { key: '5', sub: 'JKL' },
  { key: '6', sub: 'MNO' },
  { key: '7', sub: 'PQRS' },
  { key: '8', sub: 'TUV' },
  { key: '9', sub: 'WXYZ' },
  { key: '*', sub: '' },
  { key: '0', sub: '+' },
  { key: '#', sub: '' },
];

export default function SoftphoneKeypad({
  onDigitPress,
  disabled = false,
  compact = false
}: SoftphoneKeypadProps) {
  return (
    <div className={`grid grid-cols-3 ${compact ? 'gap-1.5' : 'gap-2'}`} aria-label="Teclado numérico">
      {KEYPAD_BUTTONS.map((btn) => (
        <button
          key={btn.key}
          type="button"
          aria-label={`Marcar ${btn.key}`}
          disabled={disabled}
          onClick={() => {
            onDigitPress(btn.key);
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(10);
          }}
          className={`group bg-slate-900/80 hover:bg-cyan-500/10 active:bg-cyan-500/20 border border-slate-800 hover:border-cyan-500/40 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:pointer-events-none select-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${compact ? 'py-1.5 px-1' : 'py-2 px-1.5'}`}
        >
          <span className="text-base sm:text-lg font-mono font-bold text-white group-hover:text-cyan-400 transition-colors leading-tight">{btn.key}</span>
          {btn.sub && <span className="text-[8px] font-mono text-slate-500 group-hover:text-cyan-300/70 tracking-wider uppercase leading-none mt-0.5">{btn.sub}</span>}
        </button>
      ))}
    </div>
  );
}
