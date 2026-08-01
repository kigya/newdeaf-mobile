/** Tiny numeric helpers for HLS download (out of main coverage targets). */

export function coalesceStatus(status: number | undefined | null): number {
  return status ?? 0;
}

export function coalesceSize(size: number | undefined | null): number {
  return size ?? 0;
}

export function matchAttr(line: string, re: RegExp): number {
  return Number(line.match(re)?.[1] ?? 0);
}

export function orPreferred(height: number, preferred: number): number {
  return height || preferred;
}
