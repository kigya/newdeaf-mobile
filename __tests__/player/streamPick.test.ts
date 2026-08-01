import { qualityOptions } from '@/src/player/streamPick';
import type { HlsSource } from '@/src/api/types';

describe('qualityOptions', () => {
  it('returns empty for undefined', () => {
    expect(qualityOptions(undefined)).toEqual([]);
  });

  it('sorts heights high to low as strings', () => {
    const source: HlsSource = {
      label: 'a',
      quality: { '360': 'u1', '1080': 'u2', '720': 'u3' },
    };
    expect(qualityOptions(source)).toEqual(['1080', '720', '360']);
  });
});
