/** Extract Error.message or return fallback for unknown thrown values. */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
