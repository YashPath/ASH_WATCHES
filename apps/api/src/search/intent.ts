export type Gender = 'MEN' | 'WOMEN';
export type Movement = 'AUTOMATIC' | 'QUARTZ' | 'SOLAR' | 'SMART' | 'MANUAL';
export type Intent = {
  /** Prices are integer minor units (paise), like everywhere else in the API. */
  minPrice?: number; maxPrice?: number; gender?: Gender; movement?: Movement;
  semanticQuery: string; notes: string[];
};

const UNIT: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };
const AMOUNT = /(?:(₹|rs\.?|inr)\s*)?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(thousand|lakhs?|lacs?|crores?|cr\b)|(k|l)\b)?(?!\s*(?:mm|cm|m\b|hours?\b|hrs?\b|atm|bar|%))/gi;
const MAX_WORDS = /(under|below|less than|within|upto|up to|maximum|max|at most|not more than|cheaper than|budget(?: of| is| around)?|no more than)\s*$/;
const MIN_WORDS = /(above|over|more than|at least|minimum|min|starting from|starting at|greater than)\s*$/;
const AROUND_WORDS = /(around|about|approx(?:imately)?|roughly|near|close to)\s*$/;
const MEN = new Set(['men', 'man', 'male', 'mens', "men's", 'gents', 'gentleman', 'boy', 'boys', 'boyfriend', 'husband', 'father', 'dad', 'brother', 'him', 'his', 'groom']);
const WOMEN = new Set(['women', 'woman', 'female', 'womens', "women's", 'ladies', 'lady', 'girl', 'girls', 'girlfriend', 'wife', 'mother', 'mom', 'mum', 'sister', 'her', 'bride']);
const OCCASIONS: Array<[RegExp, string]> = [
  [/\b(wedding|party|formal|office|business|interview|dress|ceremony|function)\b/, 'elegant dress watch slim formal leather'],
  [/\b(gym|workout|running|runner|sports?|fitness|trek|trekking|hiking|outdoor|adventure|cycling)\b/, 'sport durable water resistant rugged'],
  [/\b(dive|diving|diver|swim|swimming|beach|snorkel)\b/, 'dive watch water resistance 200m'],
  [/\b(casual|daily|everyday|regular)\b/, 'casual everyday versatile'],
  [/\b(gift|birthday|anniversary|present)\b/, 'classic gift'],
  [/\b(luxury|premium|expensive|high end|high-end)\b/, 'luxury premium']
];

type Candidate = { paise: number; start: number; end: number; explicit: boolean };
function findAmounts(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const match of text.matchAll(AMOUNT)) {
    const raw = Number(match[2]!.replace(/,/g, ''));
    if (!Number.isFinite(raw)) continue;
    const unitKey = (match[3] ?? match[4] ?? '').toLowerCase().replace(/\.$/, '');
    const multiplier = unitKey ? (UNIT[unitKey] ?? 1) : 1;
    const rupees = raw * multiplier;
    const explicit = Boolean(match[1]) || Boolean(unitKey);
    if (!explicit && rupees < 1000) continue; // ignore sizes/counts such as "40" or "3"
    if (rupees <= 0 || rupees > 1e9) continue;
    out.push({ paise: Math.round(rupees * 100), start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, explicit });
  }
  return out;
}

export const formatInr = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);

export function parseIntent(message: string): Intent {
  const text = message.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 300);
  const notes: string[] = [];
  const intent: Intent = { semanticQuery: text, notes };

  const amounts = findAmounts(text);
  const first = amounts[0];
  const second = amounts[1];
  if (first && second && /^\s*(?:and|to|-|–|—)\s*$/.test(text.slice(first.end, second.start))) {
    intent.minPrice = Math.min(first.paise, second.paise); intent.maxPrice = Math.max(first.paise, second.paise);
    notes.push(`Budget ${formatInr(intent.minPrice)} to ${formatInr(intent.maxPrice)}`);
  } else if (first) {
    const before = text.slice(Math.max(0, first.start - 24), first.start);
    if (AROUND_WORDS.test(before)) { intent.minPrice = Math.round(first.paise * 0.8); intent.maxPrice = Math.round(first.paise * 1.2); notes.push(`Around ${formatInr(first.paise)}`); }
    else if (MIN_WORDS.test(before)) { intent.minPrice = first.paise; notes.push(`From ${formatInr(first.paise)}`); }
    else if (MAX_WORDS.test(before) || /\bbudget\b/.test(text) || first.explicit) { intent.maxPrice = first.paise; notes.push(`Up to ${formatInr(first.paise)}`); }
  }

  const words = new Set(text.match(/[a-z']+/g) ?? []);
  const wantsMen = [...words].some(word => MEN.has(word));
  const wantsWomen = [...words].some(word => WOMEN.has(word));
  if (wantsMen !== wantsWomen) { intent.gender = wantsMen ? 'MEN' : 'WOMEN'; notes.push(wantsMen ? 'For men' : 'For women'); }

  if (/\b(automatic|mechanical|self[- ]?winding)\b/.test(text)) intent.movement = 'AUTOMATIC';
  else if (/\b(quartz|battery)\b/.test(text)) intent.movement = 'QUARTZ';
  else if (/\bsolar\b/.test(text)) intent.movement = 'SOLAR';
  else if (/\b(smart ?watch|smart|fitness tracker)\b/.test(text)) intent.movement = 'SMART';
  else if (/\b(manual|hand[- ]?wound)\b/.test(text)) intent.movement = 'MANUAL';
  if (intent.movement) notes.push(`${intent.movement.charAt(0)}${intent.movement.slice(1).toLowerCase()} movement`);

  const hints: string[] = [];
  for (const [pattern, hint] of OCCASIONS) if (pattern.test(text)) hints.push(hint);
  const stripped = amounts.reduceRight((acc, a) => `${acc.slice(0, a.start)} ${acc.slice(a.end)}`, text).replace(/\s+/g, ' ').trim();
  intent.semanticQuery = [stripped, ...hints].join(' ').trim().slice(0, 400);
  return intent;
}
