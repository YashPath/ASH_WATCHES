import { describe, expect, it } from 'vitest';
import { colorFromName } from '../lib/colors';

describe('colorFromName', () => {
  it('maps known names case-insensitively', () => { expect(colorFromName('Blue')).toBe(colorFromName('blue')); expect(colorFromName('Rose Gold')).toBe('#c98f7a'); });
  it('finds a colour word inside longer names', () => expect(colorFromName('Deep ocean blue')).toBe(colorFromName('blue')));
  it('falls back for unknown or missing names', () => { expect(colorFromName('zzz', '#123456')).toBe('#123456'); expect(colorFromName(undefined, '#abcdef')).toBe('#abcdef'); });
});
