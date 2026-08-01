import * as FileSystem from 'expo-file-system/legacy';

import { t } from '@/src/i18n';

export async function downloadProgressiveFile(
  url: string,
  destPath: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const download = FileSystem.createDownloadResumable(
    url,
    destPath,
    {},
    (data) => {
      const total = data.totalBytesExpectedToWrite;
      if (total > 0) {
        onProgress?.(Math.min(0.99, data.totalBytesWritten / total));
      }
    }
  );

  const result = await download.downloadAsync();
  if (!result) {
    throw new Error(t('store.fileDownloadFailed'));
  }
  if (result.status && result.status >= 400) {
    throw new Error(`${t('store.fileDownloadFailed')}: ${result.status}`);
  }
  onProgress?.(1);
  return result.uri;
}
