import { Platform } from 'react-native';
import BackgroundActions from 'react-native-background-actions';

import {
  startDownloadForeground,
  stopDownloadForeground,
  updateDownloadForeground,
} from '@/src/features/downloads/foreground';

describe('download foreground service', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    (BackgroundActions.isRunning as jest.Mock).mockReturnValue(false);
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it('no-ops on non-android', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    await startDownloadForeground('Film');
    await updateDownloadForeground('Film', 0.5);
    await stopDownloadForeground();
    expect(BackgroundActions.start).not.toHaveBeenCalled();
    expect(BackgroundActions.updateNotification).not.toHaveBeenCalled();
    expect(BackgroundActions.stop).not.toHaveBeenCalled();
  });

  it('starts foreground task when not running', async () => {
    await startDownloadForeground('Film');
    expect(BackgroundActions.start).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        taskName: 'NewDeafDownload',
        taskTitle: 'NewDeaf',
        parameters: { title: 'Film' },
      })
    );
  });

  it('keep-alive task sleeps while running then exits', async () => {
    jest.useFakeTimers();
    try {
      let taskFn: (() => Promise<void>) | undefined;
      (BackgroundActions.isRunning as jest.Mock).mockReturnValue(false);
      (BackgroundActions.start as jest.Mock).mockImplementationOnce(
        async (task: () => Promise<void>) => {
          taskFn = task;
        }
      );
      await startDownloadForeground('Film');
      expect(taskFn).toBeDefined();
      (BackgroundActions.isRunning as jest.Mock).mockReturnValue(true);
      const runningPromise = taskFn!();
      await Promise.resolve();
      // Exit the loop before the in-flight sleep resolves.
      (BackgroundActions.isRunning as jest.Mock).mockReturnValue(false);
      await stopDownloadForeground();
      await jest.advanceTimersByTimeAsync(2000);
      await runningPromise;
    } finally {
      jest.useRealTimers();
      (BackgroundActions.isRunning as jest.Mock).mockReturnValue(false);
      await stopDownloadForeground();
    }
  });

  it('updates notification when already running', async () => {
    (BackgroundActions.isRunning as jest.Mock).mockReturnValue(true);
    await startDownloadForeground('Film');
    expect(BackgroundActions.start).not.toHaveBeenCalled();
    expect(BackgroundActions.updateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ taskTitle: 'NewDeaf' })
    );
  });

  it('ignores updateNotification failures when already running', async () => {
    (BackgroundActions.isRunning as jest.Mock).mockReturnValue(true);
    (BackgroundActions.updateNotification as jest.Mock).mockRejectedValueOnce(new Error('x'));
    await expect(startDownloadForeground('Film')).resolves.toBeUndefined();
  });

  it('warns when start fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (BackgroundActions.start as jest.Mock).mockRejectedValueOnce(new Error('denied'));
    await startDownloadForeground('Film');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('updateDownloadForeground clamps percent and updates bar', async () => {
    (BackgroundActions.isRunning as jest.Mock).mockReturnValue(true);
    await updateDownloadForeground('Film', 1.5);
    expect(BackgroundActions.updateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        progressBar: { max: 100, value: 100, indeterminate: false },
      })
    );
    await updateDownloadForeground('Film', -1);
    expect(BackgroundActions.updateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        progressBar: { max: 100, value: 0, indeterminate: false },
      })
    );
  });

  it('updateDownloadForeground no-ops when not running', async () => {
    (BackgroundActions.isRunning as jest.Mock).mockReturnValue(false);
    await updateDownloadForeground('Film', 0.4);
    expect(BackgroundActions.updateNotification).not.toHaveBeenCalled();
  });

  it('updateDownloadForeground swallows errors', async () => {
    (BackgroundActions.isRunning as jest.Mock).mockReturnValue(true);
    (BackgroundActions.updateNotification as jest.Mock).mockRejectedValueOnce(new Error('x'));
    await expect(updateDownloadForeground('Film', 0.2)).resolves.toBeUndefined();
  });

  it('stopDownloadForeground stops when running', async () => {
    (BackgroundActions.isRunning as jest.Mock).mockReturnValue(true);
    await stopDownloadForeground();
    expect(BackgroundActions.stop).toHaveBeenCalled();
  });

  it('stopDownloadForeground skips stop when not running', async () => {
    (BackgroundActions.isRunning as jest.Mock).mockReturnValue(false);
    await stopDownloadForeground();
    expect(BackgroundActions.stop).not.toHaveBeenCalled();
  });

  it('stopDownloadForeground warns on failure', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (BackgroundActions.isRunning as jest.Mock).mockReturnValue(true);
    (BackgroundActions.stop as jest.Mock).mockRejectedValueOnce(new Error('stop'));
    await stopDownloadForeground();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
