import * as FileSystem from 'expo-file-system/legacy';

import { downloadProgressiveFile } from '@/src/features/downloads/progressive';
import { t } from '@/src/shared/i18n';

describe('downloadProgressiveFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('downloads and reports progress', async () => {
    const downloadAsync = jest.fn(async () => ({
      uri: 'file:///dest/video.mp4',
      status: 200,
    }));
    (FileSystem.createDownloadResumable as jest.Mock).mockImplementation(
      (_url, _dest, _opts, onProgress) => {
        onProgress?.({ totalBytesWritten: 50, totalBytesExpectedToWrite: 100 });
        return { downloadAsync };
      }
    );

    const onProgress = jest.fn();
    const uri = await downloadProgressiveFile(
      'https://cdn.example/v.mp4',
      'file:///dest/video.mp4',
      onProgress
    );

    expect(uri).toBe('file:///dest/video.mp4');
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('caps mid-progress below 1', async () => {
    (FileSystem.createDownloadResumable as jest.Mock).mockImplementation(
      (_url, _dest, _opts, onProgress) => {
        onProgress?.({ totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
        return {
          downloadAsync: jest.fn(async () => ({ uri: 'file:///x', status: 200 })),
        };
      }
    );
    const onProgress = jest.fn();
    await downloadProgressiveFile('https://x', 'file:///x', onProgress);
    expect(onProgress).toHaveBeenCalledWith(0.99);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('skips progress when total is unknown', async () => {
    (FileSystem.createDownloadResumable as jest.Mock).mockImplementation(
      (_url, _dest, _opts, onProgress) => {
        onProgress?.({ totalBytesWritten: 10, totalBytesExpectedToWrite: 0 });
        return {
          downloadAsync: jest.fn(async () => ({ uri: 'file:///x', status: 200 })),
        };
      }
    );
    const onProgress = jest.fn();
    await downloadProgressiveFile('https://x', 'file:///x', onProgress);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(1);
  });

  it('throws when downloadAsync returns null', async () => {
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue({
      downloadAsync: jest.fn(async () => null),
    });
    await expect(downloadProgressiveFile('https://x', 'file:///x')).rejects.toThrow(
      t('store.fileDownloadFailed')
    );
  });

  it('throws on HTTP error status', async () => {
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue({
      downloadAsync: jest.fn(async () => ({ uri: 'file:///x', status: 403 })),
    });
    await expect(downloadProgressiveFile('https://x', 'file:///x')).rejects.toThrow(
      `${t('store.fileDownloadFailed')}: 403`
    );
  });
});
