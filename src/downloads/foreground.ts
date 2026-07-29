import { Platform } from 'react-native';
import BackgroundActions from 'react-native-background-actions';

import { colors } from '@/src/theme';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let keepAlive = false;

/**
 * Keeps an Android foreground service alive while HLS download runs in JS.
 * Progress text is updated via updateNotification.
 */
export async function startDownloadForeground(title: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (BackgroundActions.isRunning()) {
    try {
      await BackgroundActions.updateNotification({
        taskTitle: 'NewDeaf',
        taskDesc: `Скачиваем: ${title}`,
      });
    } catch {
      // ignore
    }
    return;
  }

  keepAlive = true;
  const task = async () => {
    while (keepAlive && BackgroundActions.isRunning()) {
      await sleep(2000);
    }
  };

  try {
    await BackgroundActions.start(task, {
      taskName: 'NewDeafDownload',
      taskTitle: 'NewDeaf',
      taskDesc: `Скачиваем: ${title}`,
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      color: colors.accent,
      linkingURI: 'newdeaf://',
      parameters: { title },
      foregroundServiceType: ['dataSync'],
      progressBar: {
        max: 100,
        value: 0,
        indeterminate: true,
      },
    });
  } catch (e) {
    console.warn('[downloadFg] start failed', e);
  }
}

export async function updateDownloadForeground(
  title: string,
  progress01: number
): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!BackgroundActions.isRunning()) return;
  const pct = Math.max(0, Math.min(100, Math.round(progress01 * 100)));
  try {
    await BackgroundActions.updateNotification({
      taskTitle: 'NewDeaf',
      taskDesc: `Скачиваем: ${title} · ${pct}%`,
      progressBar: {
        max: 100,
        value: pct,
        indeterminate: false,
      },
    });
  } catch {
    // ignore
  }
}

export async function stopDownloadForeground(): Promise<void> {
  keepAlive = false;
  if (Platform.OS !== 'android') return;
  try {
    if (BackgroundActions.isRunning()) {
      await BackgroundActions.stop();
    }
  } catch (e) {
    console.warn('[downloadFg] stop failed', e);
  }
}
