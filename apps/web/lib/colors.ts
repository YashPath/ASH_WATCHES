const MAP: Record<string, string> = {
  black: '#16181c', white: '#f1efe9', silver: '#c9ccd1', steel: '#b7bcc4', grey: '#7b818b', gray: '#7b818b', gold: '#c9a54f', 'rose gold': '#c98f7a', rose: '#c98f7a', bronze: '#8a6a3c',
  blue: '#1d3a6b', navy: '#14264a', green: '#1f4d3a', red: '#7a1f27', brown: '#4a2f1d', tan: '#a67c52', champagne: '#d8c394', cream: '#e9e0c9', ivory: '#ece4d0', teal: '#1c5a5f', purple: '#3d2760', orange: '#b5541d', pink: '#d4a0a8', titanium: '#8f949b'
};
/** Variant colour names are free text from the catalogue; map them to a render colour with a safe fallback. */
export function colorFromName(name: string | undefined, fallback = '#2a2f38'): string {
  if (!name) return fallback;
  const key = name.toLowerCase().trim();
  if (MAP[key]) return MAP[key]!;
  for (const [word, hex] of Object.entries(MAP)) if (key.includes(word)) return hex;
  return fallback;
}

/** Picks a procedural look from catalogue data so different watches do not all look the same. */
export function watchStyleFor(p: { name: string; category?: { slug?: string } | null; tags?: string[] }): import('@/components/ProceduralWatch').WatchStyle {
  const text = `${p.name} ${(p.tags ?? []).join(' ')}`.toLowerCase();
  if (p.category?.slug === 'diver' || /dive|diver/.test(text)) return 'diver';
  if (/chrono/.test(text)) return 'chrono';
  if (/skeleton/.test(text)) return 'skeleton';
  if (/field|trek|outdoor/.test(text)) return 'field';
  return 'dress';
}
