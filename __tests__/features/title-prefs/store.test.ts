jest.mock('@/src/features/title-prefs/db', () => ({
  listTitlePrefs: jest.fn(async () => []),
  getTitlePrefs: jest.fn(async () => null),
  upsertTitlePrefs: jest.fn(async () => undefined),
}));

import { listTitlePrefs, upsertTitlePrefs } from '@/src/features/title-prefs/db';
import { useTitlePrefsStore } from '@/src/features/title-prefs/store';

describe('title-prefs store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTitlePrefsStore.setState({ byId: {}, hydrated: false });
  });

  it('hydrates from db', async () => {
    (listTitlePrefs as jest.Mock).mockResolvedValue([
      { movieId: '1', audioLabel: 'RU', updatedAt: 1 },
    ]);
    await useTitlePrefsStore.getState().hydrate();
    expect(useTitlePrefsStore.getState().get('1')?.audioLabel).toBe('RU');
    expect(useTitlePrefsStore.getState().hydrated).toBe(true);
  });

  it('hydrate re-reads when mutated during list', async () => {
    let resolveList: (v: unknown) => void = () => undefined;
    (listTitlePrefs as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        })
    );
    (listTitlePrefs as jest.Mock).mockResolvedValueOnce([
      { movieId: 'after', updatedAt: 2 },
    ]);

    const hydratePromise = useTitlePrefsStore.getState().hydrate();
    await useTitlePrefsStore.getState().setTracks('x', 'A');
    resolveList([{ movieId: 'stale', updatedAt: 1 }]);
    await hydratePromise;
    expect(useTitlePrefsStore.getState().get('after')).toBeTruthy();
  });

  it('setTracks merges previous intro skip and fills labels', async () => {
    useTitlePrefsStore.setState({
      byId: { '1': { movieId: '1', introSkipSec: 40, audioLabel: 'Old', updatedAt: 1 } },
      hydrated: true,
    });
    await useTitlePrefsStore.getState().setTracks('1', 'RU', 'EN');
    expect(upsertTitlePrefs).toHaveBeenCalledWith(
      expect.objectContaining({
        movieId: '1',
        audioLabel: 'RU',
        subtitleLabel: 'EN',
        introSkipSec: 40,
      })
    );
    await useTitlePrefsStore.getState().setTracks('2');
    expect(useTitlePrefsStore.getState().get('2')?.audioLabel).toBeUndefined();
  });

  it('setIntroSkipSec keeps existing tracks', async () => {
    useTitlePrefsStore.setState({
      byId: { '1': { movieId: '1', audioLabel: 'RU', subtitleLabel: 'EN', updatedAt: 1 } },
      hydrated: true,
    });
    await useTitlePrefsStore.getState().setIntroSkipSec('1', 88);
    expect(useTitlePrefsStore.getState().get('1')).toMatchObject({
      audioLabel: 'RU',
      introSkipSec: 88,
    });
  });
});
