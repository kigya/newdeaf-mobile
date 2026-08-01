import { CHROME_ANDROID_USER_AGENT } from '@/src/shared/lib/userAgent';

describe('CHROME_ANDROID_USER_AGENT', () => {
  it('is a non-empty Chrome Android UA string', () => {
    expect(CHROME_ANDROID_USER_AGENT).toContain('Mozilla/5.0');
    expect(CHROME_ANDROID_USER_AGENT).toContain('Android');
    expect(CHROME_ANDROID_USER_AGENT).toContain('Chrome/');
    expect(CHROME_ANDROID_USER_AGENT.length).toBeGreaterThan(40);
  });
});
