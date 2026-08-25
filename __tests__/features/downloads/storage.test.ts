import * as FileSystem from 'expo-file-system/legacy';

import {
  computeDownloadsUsage,
  computePathUsage,
  formatBytes,
  isStorageCapBlocked,
  wouldExceedCap,
} from '@/src/features/downloads/storage';

const getInfo = FileSystem.getInfoAsync as jest.Mock;
const readDir = FileSystem.readDirectoryAsync as jest.Mock;

describe('downloads storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getInfo.mockReset();
    readDir.mockReset();
  });

  it('sums nested directories and files', async () => {
    getInfo.mockImplementation(async (uri: string) => {
      if (uri.endsWith('downloads/') || uri.endsWith('/nested')) {
        return { exists: true, isDirectory: true };
      }
      if (uri.endsWith('clip.mp4')) {
        return { exists: true, isDirectory: false, size: 50 };
      }
      if (uri.endsWith('empty.bin')) {
        return { exists: true, isDirectory: false };
      }
      return { exists: false };
    });
    readDir.mockImplementation(async (uri: string) => {
      if (uri.endsWith('downloads/')) return ['nested', 'clip.mp4'];
      if (uri.endsWith('/nested')) return ['empty.bin'];
      return [];
    });
    expect(await computeDownloadsUsage()).toBe(50);

    const fs = FileSystem as { documentDirectory?: string | null };
    const prev = fs.documentDirectory;
    fs.documentDirectory = null;
    getInfo.mockResolvedValue({ exists: false });
    expect(await computeDownloadsUsage()).toBe(0);
    fs.documentDirectory = prev;
  });

  it('returns 0 when missing or when listing throws', async () => {
    getInfo.mockResolvedValue({ exists: false });
    expect(await computePathUsage('file:///gone')).toBe(0);
    getInfo.mockRejectedValue(new Error('fs'));
    expect(await computePathUsage('file:///boom')).toBe(0);
  });

  it('formatBytes and cap helpers', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(10240)).toBe('10 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
    expect(formatBytes(1024 ** 4)).toBe('1.0 TB');
    expect(formatBytes(1024 ** 5)).toBe('1024 TB');

    expect(wouldExceedCap(0, 1, 0)).toBe(false);
    expect(wouldExceedCap(1024 * 1024, 1, 1)).toBe(true);
    expect(wouldExceedCap(10, 10, 1)).toBe(false);
    expect(isStorageCapBlocked(1024 * 1024, 1)).toBe(true);
    expect(isStorageCapBlocked(10, 1)).toBe(false);
    expect(isStorageCapBlocked(10, 0)).toBe(false);
  });
});
