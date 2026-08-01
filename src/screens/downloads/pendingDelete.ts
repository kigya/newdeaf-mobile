/** Clear-and-remove helper so both null and present pending rows are unit-tested. */
export function runPendingDelete(
  pending: { id: string } | null | undefined,
  removeFn: (id: string) => void | Promise<void>
): void {
  if (pending?.id) void removeFn(pending.id);
}
