import * as FileSystem from 'expo-file-system/legacy';

function downloadsRoot(): string {
  return `${FileSystem.documentDirectory ?? ''}downloads/`;
}

async function directorySize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return 0;
  if (!info.isDirectory) {
    return 'size' in info && typeof info.size === 'number' ? info.size : 0;
  }
  let total = 0;
  const names = await FileSystem.readDirectoryAsync(uri);
  for (const name of names) {
    const child = uri.endsWith('/') ? `${uri}${name}` : `${uri}/${name}`;
    total += await directorySize(child);
  }
  return total;
}

export async function computePathUsage(uri: string): Promise<number> {
  try {
    return await directorySize(uri);
  } catch {
    return 0;
  }
}

export async function computeDownloadsUsage(): Promise<number> {
  return computePathUsage(downloadsRoot());
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function wouldExceedCap(usedBytes: number, additionalBytes: number, capMb: number): boolean {
  if (!Number.isFinite(capMb) || capMb <= 0) return false;
  const capBytes = capMb * 1024 * 1024;
  return usedBytes + additionalBytes > capBytes;
}

export function isStorageCapBlocked(usedBytes: number, capMb: number): boolean {
  if (!Number.isFinite(capMb) || capMb <= 0) return false;
  return usedBytes >= capMb * 1024 * 1024;
}
