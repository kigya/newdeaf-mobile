import type { MovieSummary } from '@/src/data/catalog/types';

export type ListKind = 'builtin' | 'custom';

export type ListRecord = {
  id: string;
  name: string;
  kind: ListKind;
  createdAt: number;
  sortIndex: number;
};

export type ListItemRecord = MovieSummary & {
  listId: string;
  createdAt: number;
};

export const BUILTIN_QUEUE_ID = 'queue';
export const BUILTIN_REWATCH_ID = 'rewatch';

export const BUILTIN_LISTS: ListRecord[] = [
  { id: BUILTIN_QUEUE_ID, name: 'queue', kind: 'builtin', createdAt: 0, sortIndex: 0 },
  { id: BUILTIN_REWATCH_ID, name: 'rewatch', kind: 'builtin', createdAt: 0, sortIndex: 1 },
];
