import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function KaiCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`kai-card p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function KaiButton({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  const styles = variant === 'primary' ? 'kai-button-primary px-4 py-2 font-medium' : variant === 'secondary' ? 'kai-control px-4 py-2 font-medium hover:brightness-95' : 'px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10';
  return <button {...props} className={`${styles} ${className}`}>{children}</button>;
}

export function KaiTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className="w-full overflow-x-auto"><table className={`kai-table ${className}`}>{children}</table></div>;
}

export function KaiModal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = ''; previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="kai-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="kai-modal-title" className="kai-card w-full max-w-xl p-5 sm:p-6">
        <header className="mb-5 flex items-center justify-between gap-4"><h2 id="kai-modal-title" className="text-lg font-semibold">{title}</h2><button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"><X size={18}/></button></header>
        {children}
      </section>
    </div>, document.body
  );
}

export function KaiToast({ message, onDismiss, tone = 'info' }: { message: string; onDismiss: () => void; tone?: 'info' | 'success' | 'error' }) {
  useEffect(() => { const timer = window.setTimeout(onDismiss, 4200); return () => window.clearTimeout(timer); }, [onDismiss]);
  const toneClass = tone === 'success' ? 'border-l-4 border-l-green-500' : tone === 'error' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-blue-500';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`kai-toast fixed bottom-5 right-5 z-[120] max-w-sm px-4 py-3 ${toneClass}`}>{message}<button onClick={onDismiss} aria-label="Cerrar notificación" className="ml-3 inline-flex rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"><X size={14}/></button></div>;
}
