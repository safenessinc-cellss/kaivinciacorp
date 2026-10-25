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
    <div className={`grid grid-cols-3 justify-items-center ${compact ? 'gap-2' : 'gap-3'} py-2`} aria-label="Teclado numérico">
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
          className={`softphone-key group flex flex-col items-center justify-center select-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:pointer-events-none ${compact ? 'h-14 w-14' : ''}`}
        >
          <span className="text-2xl font-normal leading-none">{btn.key}</span>
          {btn.sub && <span className="softphone-muted text-[9px] font-semibold tracking-[.12em] leading-none mt-1">{btn.sub}</span>}
        </button>
      ))}
    </div>
  );
}
