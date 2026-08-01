import { t } from '@/src/i18n';
import {
  formatWatchTime,
  type WatchProgressRecord,
} from '@/src/watch-progress/types';

export function resumeDialogMessage(progress: WatchProgressRecord): string {
  const time = formatWatchTime(progress.positionSec);
  if (progress.season != null && progress.episode != null) {
    return t('resume.message', {
      label: t('resume.episodeTime', {
        season: progress.season,
        episode: progress.episode,
        time,
      }),
    });
  }
  return t('resume.messageMovie', { time });
}
