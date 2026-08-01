import {
  resumePosition,
  statusErrorMessage,
  logIfDev,
  warnIfDev,
  runUnlessCancelled,
  shouldSkipInitialSeek,
  trySeekTo,
  scheduleSeekRetries,
  takePreserveTarget,
  clampSeekTarget,
  isFiniteNumber,
  applyReadyToPlay,
  forceSeekIfNeeded,
  maybeScheduleSeek,
  readFiniteTime,
  shouldApplyParsedSubs,
  whenFiniteTime,
  handlePlayerStatus,
  runInitialSeekMode,
  assignSeekHandles,
} from '@/src/features/playback/mediaPlayerHelpers';

describe('mediaPlayerHelpers', () => {
  it('resumePosition prefers preserved then currentTime', () => {
    expect(resumePosition(12, 5)).toBe(12);
    expect(resumePosition(null, 5)).toBe(5);
    expect(resumePosition(null, 'x')).toBe(0);
  });

  it('statusErrorMessage', () => {
    expect(statusErrorMessage({ message: 'boom' }, 'fb')).toBe('boom');
    expect(statusErrorMessage({ message: '' }, 'fb')).toBe('fb');
    expect(statusErrorMessage({ message: undefined }, 'fb')).toBe('fb');
    expect(statusErrorMessage(null, 'fb')).toBe('fb');
    expect(statusErrorMessage('x', 'fb')).toBe('fb');
  });

  it('logIfDev and warnIfDev respect __DEV__', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    Object.defineProperty(global, '__DEV__', { value: true, configurable: true });
    logIfDev('a');
    warnIfDev('b');
    expect(log).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    log.mockClear();
    warn.mockClear();
    Object.defineProperty(global, '__DEV__', { value: false, configurable: true });
    logIfDev('a');
    warnIfDev('b');
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    Object.defineProperty(global, '__DEV__', { value: true, configurable: true });
    log.mockRestore();
    warn.mockRestore();
  });

  it('runUnlessCancelled and shouldSkipInitialSeek', () => {
    const fn = jest.fn();
    expect(runUnlessCancelled(true, fn)).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    expect(runUnlessCancelled(false, fn)).toBe(true);
    expect(fn).toHaveBeenCalled();
    expect(shouldSkipInitialSeek(true, 10)).toBe('skip');
    expect(shouldSkipInitialSeek(false, 0)).toBe('mark-done');
    expect(shouldSkipInitialSeek(false, 5)).toBe('seek');
  });

  it('trySeekTo and scheduleSeekRetries', () => {
    expect(clampSeekTarget(50, 100)).toBe(50);
    expect(clampSeekTarget(99, 100)).toBe(99);
    expect(trySeekTo(10, () => 100, jest.fn())).toBe(true);
    expect(trySeekTo(10, () => 0, jest.fn())).toBe(false);
    expect(
      trySeekTo(10, () => {
        throw new Error('x');
      }, jest.fn())
    ).toBe(false);
    expect(takePreserveTarget(null)).toBe(0);
    expect(takePreserveTarget(9)).toBe(9);

    jest.useFakeTimers();
    const trySeek = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const handles = scheduleSeekRetries(trySeek);
    jest.advanceTimersByTime(200);
    expect(trySeek).toHaveBeenCalled();
    jest.advanceTimersByTime(5000);
    clearInterval(handles.seekInterval);
    clearTimeout(handles.seekTimeout);
    jest.useRealTimers();
  });

  it('isFiniteNumber applyReadyToPlay forceSeekIfNeeded', () => {
    expect(isFiniteNumber(1)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber('x')).toBe(false);
    const play = jest.fn();
    const clear = jest.fn();
    applyReadyToPlay(false, play, clear);
    expect(play).not.toHaveBeenCalled();
    applyReadyToPlay(true, play, clear);
    expect(clear).toHaveBeenCalled();
    expect(play).toHaveBeenCalled();
    applyReadyToPlay(true, () => {
      throw new Error('p');
    }, clear);
    const seek = jest.fn();
    expect(forceSeekIfNeeded(true, seek)).toBe(false);
    expect(seek).not.toHaveBeenCalled();
    expect(forceSeekIfNeeded(false, seek)).toBe(true);
    expect(seek).toHaveBeenCalled();
    expect(
      forceSeekIfNeeded(false, () => {
        throw new Error('s');
      })
    ).toBe(true);
  });

  it('maybeScheduleSeek readFiniteTime shouldApplyParsedSubs', () => {
    expect(maybeScheduleSeek(0.5, () => true, scheduleSeekRetries)).toBeNull();
    expect(maybeScheduleSeek(10, () => true, scheduleSeekRetries)).toBeNull();
    jest.useFakeTimers();
    const handles = maybeScheduleSeek(10, () => false, scheduleSeekRetries);
    expect(handles).not.toBeNull();
    clearInterval(handles!.seekInterval);
    clearTimeout(handles!.seekTimeout);
    jest.useRealTimers();
    expect(readFiniteTime(() => 5)).toBe(5);
    expect(readFiniteTime(() => NaN)).toBeNull();
    expect(
      readFiniteTime(() => {
        throw new Error('t');
      })
    ).toBeNull();
    expect(shouldApplyParsedSubs(null, false)).toBe(false);
    expect(shouldApplyParsedSubs('x', true)).toBe(false);
    expect(shouldApplyParsedSubs('x', false)).toBe(true);
  });

  it('whenFiniteTime handlePlayerStatus runInitialSeekMode assignSeekHandles', () => {
    const onTime = jest.fn();
    whenFiniteTime(null, onTime);
    expect(onTime).not.toHaveBeenCalled();
    whenFiniteTime(3, onTime);
    expect(onTime).toHaveBeenCalledWith(3);

    const onError = jest.fn();
    const onReady = jest.fn();
    handlePlayerStatus('loading', onError, onReady);
    expect(onError).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    handlePlayerStatus('error', onError, onReady);
    expect(onError).toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
    onError.mockClear();
    handlePlayerStatus('readyToPlay', onError, onReady);
    expect(onError).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalled();

    const onMark = jest.fn();
    const onSeek = jest.fn();
    runInitialSeekMode('skip', onMark, onSeek);
    expect(onMark).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
    runInitialSeekMode('mark-done', onMark, onSeek);
    expect(onMark).toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
    onMark.mockClear();
    runInitialSeekMode('seek', onMark, onSeek);
    expect(onMark).not.toHaveBeenCalled();
    expect(onSeek).toHaveBeenCalled();

    const assign = jest.fn();
    assignSeekHandles(null, assign);
    expect(assign).not.toHaveBeenCalled();
    assignSeekHandles({ a: 1 }, assign);
    expect(assign).toHaveBeenCalledWith({ a: 1 });
  });
});
