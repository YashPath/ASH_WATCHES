/** Lightweight SVG watch used when a product has no photo yet (no WebGL needed in lists). */
const PALETTES = [
  { dial: '#1d3a6b', metal: '#c9ccd1', strap: '#16181c' }, { dial: '#d8c394', metal: '#c9a54f', strap: '#4a2f1d' },
  { dial: '#1f4d3a', metal: '#b7bcc4', strap: '#24473b' }, { dial: '#2a2f38', metal: '#8f949b', strap: '#7b818b' }, { dial: '#f1efe9', metal: '#c98f7a', strap: '#d4a0a8' }
];
export function WatchThumb({ seed }: { seed: string }) {
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = PALETTES[h % PALETTES.length]!;
  const light = c.dial === '#f1efe9' || c.dial === '#d8c394';
  const ink = light ? '#1a1a1a' : '#efe6c8';
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label="Watch illustration">
      <rect x="76" y="0" width="48" height="200" rx="10" fill={c.strap} />
      <rect x="82" y="0" width="1.5" height="200" fill="#ffffff22" /><rect x="116.5" y="0" width="1.5" height="200" fill="#ffffff22" />
      <circle cx="100" cy="100" r="62" fill={c.metal} /><circle cx="100" cy="100" r="56" fill="#0006" /><circle cx="100" cy="100" r="53" fill={c.dial} />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x="98.6" y="51" width="2.8" height={i % 3 === 0 ? 9 : 5} fill={ink} transform={`rotate(${i * 30} 100 100)`} />)}
      <line x1="100" y1="100" x2="100" y2="72" stroke={ink} strokeWidth="3" strokeLinecap="round" transform="rotate(300 100 100)" />
      <line x1="100" y1="100" x2="100" y2="58" stroke={ink} strokeWidth="2.2" strokeLinecap="round" transform="rotate(60 100 100)" />
      <line x1="100" y1="108" x2="100" y2="54" stroke="#c3402f" strokeWidth="1" transform="rotate(150 100 100)" /><circle cx="100" cy="100" r="3" fill="#c3402f" />
      <rect x="162" y="96" width="8" height="8" rx="2" fill={c.metal} />
    </svg>
  );
}
