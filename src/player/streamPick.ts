import type { HlsSource } from '@/src/api/types';

export function qualityOptions(source: HlsSource | undefined): string[] {
  if (!source) return [];
  return Object.keys(source.quality)
    .map(Number)
    .sort((a, b) => b - a)
    .map(String);
}
