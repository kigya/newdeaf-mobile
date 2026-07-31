import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cueAtTime, parseVtt, type VttCue } from '@/src/offline/vtt';
import { t } from '@/src/i18n';
import { colors, fonts, spacing } from '@/src/theme';

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
};

function buildSource(
  uri: string,
  contentType: 'hls' | 'progressive',
  headers?: Record<string, string>
): VideoSource {
  return {
    uri,
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
}: Props) {
  const insets = useSafeAreaInsets();
  const [cues, setCues] = useState<VttCue[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [subsEnabled, setSubsEnabled] = useState(true);
  const hasSubs = !!(subtitlePath || subtitleUri);
  const initialSeekDoneRef = useRef(false);
  const lastProgressAtRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const preservePositionRef = useRef<number | null>(null);
  const uriRef = useRef(uri);

  const initialSourceRef = useRef(buildSource(uri, contentType, headers));
  const player = useVideoPlayer(initialSourceRef.current, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });

  useEffect(() => {
    // Debug aid for CDN header / URL issues on device.
    if (__DEV__) {
      console.log(
        '[MediaPlayer] source',
        uri.slice(0, 140),
        headers ? Object.keys(headers).join(',') : 'no-headers'
      );
    }
  }, [uri, headers]);

  // Swap HLS source without remounting; restore playback position.
  useEffect(() => {
    if (uriRef.current === uri) return;
    const resumeAt =
      preservePositionRef.current ??
      (typeof player.currentTime === 'number' ? player.currentTime : 0);
    uriRef.current = uri;
    preservePositionRef.current = resumeAt;
    const next = buildSource(uri, contentType, headers);
    void (async () => {
      try {
        await player.replaceAsync(next);
        player.play();
        const target = preservePositionRef.current ?? 0;
        preservePositionRef.current = null;
        if (target > 1) {
          const trySeek = () => {
            try {
              const duration = player.duration;
              if (typeof duration === 'number' && duration > 0) {
                player.currentTime = Math.min(target, Math.max(0, duration - 1));
                return true;
              }
            } catch {
              // ignore
            }
            return false;
          };
          if (!trySeek()) {
            const id = setInterval(() => {
              if (trySeek()) clearInterval(id);
            }, 200);
            setTimeout(() => clearInterval(id), 5000);
          }
        }
      } catch {
        preservePositionRef.current = null;
      }
    })();
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
      if (typeof d === 'number' && d > 0 && !Number.isNaN(d)) durationSec = d;
    } catch {
      // ignore
    }
    cb({ positionSec, durationSec });
  };

  useEventListener(player, 'timeUpdate', ({ currentTime: time }) => {
    setCurrentTime(time);
    reportProgress(time);
  });

  useEffect(() => {
    const id = setInterval(() => {
      try {
        const time = player.currentTime;
        if (typeof time === 'number' && !Number.isNaN(time)) {
          setCurrentTime(time);
          reportProgress(time);
        }
      } catch {
        // ignore
      }
    }, 250);
    return () => clearInterval(id);
  }, [player]);

  // Initial resume seek only once.
  useEffect(() => {
    if (initialSeekDoneRef.current) return;
    if (!(initialPositionSec > 0)) {
      initialSeekDoneRef.current = true;
      return;
    }
    const id = setInterval(() => {
      try {
        const duration = player.duration;
        if (typeof duration === 'number' && duration > 0) {
          const target = Math.min(initialPositionSec, Math.max(0, duration - 1));
          player.currentTime = target;
          initialSeekDoneRef.current = true;
          clearInterval(id);
        }
      } catch {
        // keep trying
      }
    }, 200);
    const timeout = setTimeout(() => {
      clearInterval(id);
      if (!initialSeekDoneRef.current) {
        try {
          player.currentTime = initialPositionSec;
        } catch {
          // ignore
        }
        initialSeekDoneRef.current = true;
      }
    }, 8000);
    return () => {
      clearInterval(id);
      clearTimeout(timeout);
    };
  }, [player, initialPositionSec]);

  useEffect(() => {
    return () => {
      try {
        const time = player.currentTime;
        if (typeof time === 'number' && !Number.isNaN(time)) {
          reportProgress(time, true);
        }
      } catch {
        // ignore
      }
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
        if (!text || cancelled) return;
        const parsed = parseVtt(text);
        if (!cancelled) setCues(parsed);
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
    try {
      const time = player.currentTime;
      if (typeof time === 'number' && !Number.isNaN(time)) {
        reportProgress(time, true);
      }
    } catch {
      // ignore
    }
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
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
});
