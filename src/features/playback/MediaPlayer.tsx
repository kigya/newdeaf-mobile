import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cueAtTime, parseVtt, type VttCue } from '@/src/features/playback/offline/vtt';
import { ensureFileUri } from '@/src/features/playback/offline/prepareLocalSource';
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
import { t } from '@/src/shared/i18n';
import { errorMessage } from '@/src/shared/lib/errorMessage';
import { colors, fonts, spacing } from '@/src/shared/theme';

const PROGRESS_THROTTLE_MS = 5000;

export type MediaProgressPayload = {
  positionSec: number;
  durationSec?: number;
};

type Props = {
  uri: string;
  contentType?: 'hls' | 'progressive';
  /** CDN / player Origin headers for remote HLS. */
  headers?: Record<string, string>;
  /** Local subtitle file path. */
  subtitlePath?: string;
  /** Remote VTT URL (fetched for overlay). */
  subtitleUri?: string;
  title?: string;
  /** Applied once after first ready (resume). Not re-applied on track switches. */
  initialPositionSec?: number;
  onProgress?: (payload: MediaProgressPayload) => void;
  onClose?: () => void;
  /** Extra overlay (e.g. track chips). */
  children?: ReactNode;
  /** Offline / local playback — enable background audio + auto PiP. */
  enableBackgroundPlayback?: boolean;
};

function buildSource(
  uri: string,
  contentType: 'hls' | 'progressive',
  headers?: Record<string, string>
): VideoSource {
  const normalized = uri.startsWith('file:') || uri.startsWith('http') ? uri : ensureFileUri(uri);
  return {
    uri: normalized,
    contentType: contentType === 'progressive' ? 'progressive' : 'hls',
    ...(headers ? { headers } : {}),
  };
}

export function MediaPlayer({
  uri,
  contentType = 'hls',
  headers,
  subtitlePath,
  subtitleUri,
  title,
  initialPositionSec = 0,
  onProgress,
  onClose,
  children,
  enableBackgroundPlayback = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [cues, setCues] = useState<VttCue[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [subsEnabled, setSubsEnabled] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const hasSubs = !!(subtitlePath || subtitleUri);
  const initialSeekDoneRef = useRef(false);
  const lastProgressAtRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const preservePositionRef = useRef<number | null>(null);
  const uriRef = useRef(uri);
  const wantPlayingRef = useRef(true);

  const initialSourceRef = useRef(buildSource(uri, contentType, headers));
  const player = useVideoPlayer(initialSourceRef.current, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
    p.staysActiveInBackground = enableBackgroundPlayback;
    p.play();
  });

  useEffect(() => {
    try {
      player.staysActiveInBackground = enableBackgroundPlayback;
    } catch {
      // ignore
    }
  }, [player, enableBackgroundPlayback]);

  useEffect(() => {
    // Debug aid for CDN header / URL issues on device.
    logIfDev(
      '[MediaPlayer] source',
      uri.slice(0, 140),
      headers ? Object.keys(headers).join(',') : 'no-headers'
    );
  }, [uri, headers]);

  // Swap HLS source without remounting; restore playback position.
  useEffect(() => {
    if (uriRef.current === uri) return;
    const resumeAt = resumePosition(preservePositionRef.current, player.currentTime);
    uriRef.current = uri;
    preservePositionRef.current = resumeAt;
    const next = buildSource(uri, contentType, headers);
    let seekInterval: ReturnType<typeof setInterval> | null = null;
    let seekTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    void (async () => {
      try {
        setPlayerError(null);
        await player.replaceAsync(next);
        runUnlessCancelled(cancelled, () => {
          wantPlayingRef.current = true;
          player.play();
          const target = takePreserveTarget(preservePositionRef.current);
          preservePositionRef.current = null;
          const trySeek = () =>
            trySeekTo(target, () => player.duration, (t) => {
              player.currentTime = t;
            });
          const handles = maybeScheduleSeek(target, trySeek, scheduleSeekRetries);
          assignSeekHandles(handles, (h) => {
            seekInterval = h.seekInterval;
            seekTimeout = h.seekTimeout;
          });
        });
      } catch (e) {
        preservePositionRef.current = null;
        runUnlessCancelled(cancelled, () => {
          setPlayerError(errorMessage(e, t('offline.playbackError')));
        });
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(seekInterval as ReturnType<typeof setInterval>);
      clearTimeout(seekTimeout as ReturnType<typeof setTimeout>);
    };
  }, [uri, contentType, headers, player]);

  const reportProgress = (positionSec: number, force = false) => {
    const cb = onProgressRef.current;
    if (!cb) return;
    const now = Date.now();
    if (!force && now - lastProgressAtRef.current < PROGRESS_THROTTLE_MS) return;
    lastProgressAtRef.current = now;
    let durationSec: number | undefined;
    try {
      const d = player.duration;
      if (isFiniteNumber(d) && d > 0) durationSec = d;
    } catch {
      // ignore
    }
    cb({ positionSec, durationSec });
  };

  useEventListener(player, 'timeUpdate', ({ currentTime: time }) => {
    setCurrentTime(time);
    reportProgress(time);
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    handlePlayerStatus(
      status,
      () => {
        const message = statusErrorMessage(error, t('offline.playbackError'));
        setPlayerError(message);
        warnIfDev('[MediaPlayer] status error', error);
      },
      () => {
        applyReadyToPlay(wantPlayingRef.current, () => player.play(), () => setPlayerError(null));
      }
    );
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    wantPlayingRef.current = !!isPlaying;
  });

  useEffect(() => {
    const id = setInterval(() => {
      whenFiniteTime(readFiniteTime(() => player.currentTime), (time) => {
        setCurrentTime(time);
        reportProgress(time);
      });
    }, 250);
    return () => clearInterval(id);
  }, [player]);

  // Initial resume seek only once.
  useEffect(() => {
    const mode = shouldSkipInitialSeek(initialSeekDoneRef.current, initialPositionSec);
    let cleanup = () => {};
    runInitialSeekMode(
      mode,
      () => {
        initialSeekDoneRef.current = true;
      },
      () => {
        const id = setInterval(() => {
          if (
            trySeekTo(initialPositionSec, () => player.duration, (t) => {
              player.currentTime = t;
            })
          ) {
            wantPlayingRef.current = true;
            player.play();
            initialSeekDoneRef.current = true;
            clearInterval(id);
          }
        }, 200);
        const timeout = setTimeout(() => {
          clearInterval(id);
          forceSeekIfNeeded(initialSeekDoneRef.current, () => {
            player.currentTime = initialPositionSec;
            player.play();
          });
          initialSeekDoneRef.current = true;
        }, 8000);
        cleanup = () => {
          clearInterval(id);
          clearTimeout(timeout);
        };
      }
    );
    return () => cleanup();
  }, [player, initialPositionSec]);

  useEffect(() => {
    return () => {
      wantPlayingRef.current = false;
      whenFiniteTime(readFiniteTime(() => player.currentTime), (time) => {
        reportProgress(time, true);
      });
    };
  }, [player]);

  useEffect(() => {
    let cancelled = false;
    setCues([]);
    void (async () => {
      try {
        let text: string | null = null;
        if (subtitlePath) {
          const info = await FileSystem.getInfoAsync(subtitlePath);
          if (!info.exists) return;
          text = await FileSystem.readAsStringAsync(subtitlePath);
        } else if (subtitleUri) {
          const res = await fetch(subtitleUri, headers ? { headers } : undefined);
          if (!res.ok) return;
          text = await res.text();
        }
        if (!shouldApplyParsedSubs(text, cancelled)) return;
        const parsed = parseVtt(text!);
        runUnlessCancelled(cancelled, () => setCues(parsed));
      } catch {
        // ignore missing/unreadable subs
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subtitlePath, subtitleUri, headers]);

  const activeCue = useMemo(
    () => (subsEnabled ? cueAtTime(cues, currentTime) : null),
    [cues, currentTime, subsEnabled]
  );

  const handleClose = () => {
    wantPlayingRef.current = false;
    whenFiniteTime(readFiniteTime(() => player.currentTime), (time) => {
      reportProgress(time, true);
    });
    onClose?.();
  };

  return (
    <View style={styles.wrap}>
      <VideoView
        style={styles.video}
        player={player}
        contentFit="contain"
        surfaceType="textureView"
        nativeControls
        allowsPictureInPicture
        startsPictureInPictureAutomatically={enableBackgroundPlayback}
        fullscreenOptions={{ enable: true }}
      />

      {activeCue ? (
        <View style={[styles.subsWrap, { bottom: insets.bottom + 72 }]} pointerEvents="none">
          <Text style={styles.subs}>{activeCue.text}</Text>
        </View>
      ) : null}

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={handleClose} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? t('common.player')}
        </Text>
        {hasSubs ? (
          <Pressable onPress={() => setSubsEnabled((v) => !v)} hitSlop={12} style={styles.iconBtn}>
            <Ionicons
              name={subsEnabled ? 'text' : 'text-outline'}
              size={22}
              color={subsEnabled ? colors.accent : colors.white}
            />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {children}

      {playerError ? (
        <View style={styles.errorBanner} pointerEvents="none">
          <Text style={styles.errorText}>{playerError}</Text>
        </View>
      ) : null}

      {!uri ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.black,
  },
  video: {
    flex: 1,
    backgroundColor: colors.black,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.blackOverlay35,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 15,
  },
  subsWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  subs: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    textShadowColor: colors.blackShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    backgroundColor: colors.blackOverlay45,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  loader: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 96,
    backgroundColor: colors.blackOverlay75,
    padding: spacing.md,
    borderRadius: 8,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: 13,
    textAlign: 'center',
  },
});
