import { resumeDialogMessage } from '@/src/features/watch-progress/format';
import type { WatchProgressRecord } from '@/src/features/watch-progress/types';
import { t } from '@/src/shared/i18n';

function progress(
  partial: Partial<WatchProgressRecord> & Pick<WatchProgressRecord, 'positionSec'>
): WatchProgressRecord {
  return {
    id: '1',
    movieId: '1',
    title: 'Film',
    isSeries: false,
    source: 'online',
    updatedAt: 1,
    ...partial,
  };
}

describe('resumeDialogMessage', () => {
  it('formats movie resume message', () => {
    const msg = resumeDialogMessage(progress({ positionSec: 125 }));
    expect(msg).toBe(t('resume.messageMovie', { time: '2:05' }));
  });

  it('formats episode resume message', () => {
    const msg = resumeDialogMessage(
      progress({ positionSec: 3661, season: 2, episode: 3, isSeries: true })
    );
    expect(msg).toBe(
      t('resume.message', {
        label: t('resume.episodeTime', {
          season: 2,
          episode: 3,
          time: '1:01:01',
        }),
      })
    );
  });
});
