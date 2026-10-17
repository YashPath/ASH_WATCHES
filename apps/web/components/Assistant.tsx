'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { api, formatPrice, type ProductCardData } from '@/lib/api';

type Turn = { role: 'user' | 'bot'; text: string; products?: ProductCardData[] };

export function Assistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([{ role: 'bot', text: 'Tell me what you are looking for. For example: “automatic dive watch for men under ₹50,000”.' }]);
  const end = useRef<HTMLDivElement>(null);

  async function send() {
    const message = input.trim();
    if (message.length < 2 || busy) return;
    setInput(''); setBusy(true);
    setTurns(t => [...t, { role: 'user', text: message }]);
    try {
      const { data } = await api<{ reply: string; products: ProductCardData[] }>('/search/assistant', { method: 'POST', body: { message } });
      setTurns(t => [...t, { role: 'bot', text: data.reply, products: data.products }]);
    } catch (error) {
      setTurns(t => [...t, { role: 'bot', text: error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.' }]);
    } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50); }
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="assistant-panel" className="fixed bottom-5 right-5 z-50 rounded-full bg-gold-500 px-5 py-3 text-sm font-medium text-ink-950 shadow-xl hover:bg-gold-400">
        {open ? 'Close' : 'Find my watch'}
      </button>
      {open && (
        <section id="assistant-panel" aria-label="Watch finder" className="fixed bottom-20 right-5 z-50 flex max-h-[70vh] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {turns.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'text-right' : ''}>
                <p className={`inline-block max-w-[90%] rounded-2xl px-4 py-2.5 text-left ${t.role === 'user' ? 'bg-gold-500 text-ink-950' : 'bg-ink-700'}`}>{t.text}</p>
                {t.products && t.products.length > 0 && (
                  <ul className="mt-2 space-y-2 text-left">
                    {t.products.map(p => (
                      <li key={p.id}><Link href={`/product/${p.slug}`} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2 hover:border-gold-400">
                        <span><span className="block text-xs text-white/60">{p.brand.name}</span>{p.name}</span><span className="text-gold-300">{formatPrice(p.basePrice)}</span>
                      </Link></li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {busy && <p className="text-white/60">Looking…</p>}
            <div ref={end} />
          </div>
          <form className="flex gap-2 border-t border-white/10 p-3" onSubmit={e => { e.preventDefault(); void send(); }}>
            <input aria-label="Describe the watch you want" value={input} onChange={e => setInput(e.target.value)} maxLength={300} placeholder="Describe what you want…" className="input !py-2" />
            <button className="btn-gold !px-4 !py-2" disabled={busy}>Ask</button>
          </form>
        </section>
      )}
    </>
  );
}
