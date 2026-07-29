import * as FileSystem from 'expo-file-system/legacy';

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
    throw new Error('Не удалось скачать файл');
  }
  if (result.status && result.status >= 400) {
    throw new Error(`Ошибка скачивания: ${result.status}`);
  }
  onProgress?.(1);
  return result.uri;
}
