import {
  coalesceSize,
  coalesceStatus,
  matchAttr,
  orPreferred,
} from '@/src/features/downloads/hlsNumbers';

describe('hlsNumbers', () => {
  it('coalesce helpers', () => {
    expect(coalesceStatus(undefined)).toBe(0);
    expect(coalesceStatus(200)).toBe(200);
    expect(coalesceSize(null)).toBe(0);
    expect(coalesceSize(10)).toBe(10);
  });

  it('matchAttr and orPreferred', () => {
    expect(matchAttr('#EXT-X-STREAM-INF:BANDWIDTH=100', /BANDWIDTH=(\d+)/i)).toBe(100);
    expect(matchAttr('#EXT-X-STREAM-INF:', /BANDWIDTH=(\d+)/i)).toBe(0);
    expect(orPreferred(0, 720)).toBe(720);
    expect(orPreferred(480, 720)).toBe(480);
  });
});
