import { pickPreferredQuality } from '@/src/settings/pickPreferredQuality';

describe('pickPreferredQuality', () => {
  it('returns preferred when available list is empty (best → 720)', () => {
    expect(pickPreferredQuality([], 'best')).toBe('720');
    expect(pickPreferredQuality([], '480')).toBe('480');
  });

  it('picks highest for best', () => {
    expect(pickPreferredQuality(['360', '1080', '720'], 'best')).toBe('1080');
  });

  it('picks exact match', () => {
    expect(pickPreferredQuality(['360', '720', '1080'], '720')).toBe('720');
  });

  it('picks closest height at or below preferred', () => {
    expect(pickPreferredQuality(['360', '480', '1080'], '720')).toBe('480');
  });

  it('falls back to highest when all heights exceed preferred', () => {
    expect(pickPreferredQuality(['1080', '2160'], '720')).toBe('2160');
  });

  it('returns first raw key when no numeric heights', () => {
    expect(pickPreferredQuality(['auto', 'source'], '720')).toBe('auto');
  });

  it('ignores non-positive parses among mixed keys', () => {
    expect(pickPreferredQuality(['0', '720', 'abc'], 'best')).toBe('720');
  });
});
