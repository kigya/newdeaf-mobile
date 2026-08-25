import { DownloadGateError, isDownloadGateError } from '@/src/features/downloads/errors';

describe('downloads errors', () => {
  it('tags wifi/storage gate errors', () => {
    const wifi = new DownloadGateError('wifi', 'wifi blocked');
    const storage = new DownloadGateError('storage', 'cap');
    expect(wifi.name).toBe('DownloadGateError');
    expect(wifi.code).toBe('wifi');
    expect(isDownloadGateError(wifi)).toBe(true);
    expect(isDownloadGateError(storage)).toBe(true);
    expect(isDownloadGateError(new Error('nope'))).toBe(false);
    expect(isDownloadGateError('wifi')).toBe(false);
  });
});
