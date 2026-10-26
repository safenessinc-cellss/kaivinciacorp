import React from 'react';

interface SoftphoneKeypadProps {
  onDigitPress: (char: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

const KEYPAD_BUTTONS = [
  { key: '1', sub: '—' },
  { key: '2', sub: 'ABC' },
  { key: '3', sub: 'DEF' },
  { key: '4', sub: 'GHI' },
  { key: '5', sub: 'JKL' },
  { key: '6', sub: 'MNO' },
  { key: '7', sub: 'PQRS' },
  { key: '8', sub: 'TUV' },
  { key: '9', sub: 'WXYZ' },
  { key: '*', sub: 'SEC' },
  { key: '0', sub: '+' },
  { key: '#', sub: 'HASH' },
];

export default function SoftphoneKeypad({
  onDigitPress,
  disabled = false,
  compact = false
}: SoftphoneKeypadProps) {
  return (
    <div className={`grid grid-cols-3 ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {KEYPAD_BUTTONS.map((btn) => (
        <button
          key={btn.key}
          type="button"
          disabled={disabled}
          onClick={() => onDigitPress(btn.key)}
          className={`group bg-[#D1D1D6]/60 hover:bg-white active:bg-white border border-white/60 hover:border-[#34C759]/40 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:pointer-events-none select-none ${
            compact ? 'w-14 h-14 py-1.5 px-1' : 'w-[72px] h-[72px] py-2 px-1.5'
          }`}
        >
          <span className="text-2xl font-medium text-black group-hover:text-[#248A3D] transition-colors leading-tight">
            {btn.key}
          </span>
          <span className="text-[9px] font-medium text-[#3C3C43]/60 group-hover:text-[#248A3D] tracking-wider uppercase leading-none mt-0.5">
            {btn.sub}
          </span>
        </button>
      ))}
    </div>
  );
}
