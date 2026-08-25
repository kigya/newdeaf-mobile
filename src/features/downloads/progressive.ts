import * as FileSystem from 'expo-file-system/legacy';

import { t } from '@/src/shared/i18n';

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

/** Prefer CDN host origin as Referer (incvideo); fsst.online alone often 403s. */
export function progressiveMediaHeaders(mediaUrl: string, playerUrl?: string): Record<string, string> {
  let referer = 'https://www.incvideo1.online/';
  try {
    const mediaHost = new URL(mediaUrl).hostname.toLowerCase();
    if (mediaHost.includes('incvideo') || mediaHost.includes('filevideo')) {
      referer = `https://${mediaHost}/`;
    } else if (playerUrl) {
      referer = `${new URL(playerUrl).origin}/`;
    }
  } catch {
    // keep default
  }
  return {
    'User-Agent': DEFAULT_UA,
    Referer: referer,
  };
}

export async function downloadProgressiveFile(
  url: string,
  destPath: string,
  onProgress?: (progress: number) => void,
  headers?: Record<string, string>
): Promise<string> {
  const download = FileSystem.createDownloadResumable(
    url,
    destPath,
    headers && Object.keys(headers).length ? { headers } : {},
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
