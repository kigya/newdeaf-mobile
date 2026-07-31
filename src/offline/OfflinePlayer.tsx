import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { t } from '@/src/i18n';
import { colors, fonts, spacing } from '@/src/theme';

import { cueAtTime, parseVtt, type VttCue } from './vtt';

const PROGRESS_THROTTLE_MS = 5000;

export type OfflineProgressPayload = {
  positionSec: number;
  durationSec?: number;
};

type Props = {
  playlistPath: string;
  subtitlePath?: string;
  title?: string;
  mediaKind?: 'hls' | 'progressive';
  /** Seek here after player is ready (only when user chose Continue). */
  initialPositionSec?: number;
  onProgress?: (payload: OfflineProgressPayload) => void;
  onClose?: () => void;
};

export function OfflinePlayer({
  playlistPath,
  subtitlePath,
  title,
  mediaKind = 'hls',
  initialPositionSec = 0,
  onProgress,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [cues, setCues] = useState<VttCue[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [subsEnabled, setSubsEnabled] = useState(true);
  const showSubsToggle = mediaKind === 'hls' && !!subtitlePath;
  const seekDoneRef = useRef(false);
  const lastProgressAtRef = useRef(0);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const player = useVideoPlayer(
    {
      uri: playlistPath,
      contentType: mediaKind === 'progressive' ? 'progressive' : 'hls',
    },
    (p) => {
      p.loop = false;
      p.timeUpdateEventInterval = 0.25;
      p.play();
    }
  );

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

  // Fallback: some Android builds don't emit timeUpdate reliably with local HLS.
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

  // Seek to resume position once duration/currentTime are available.
  useEffect(() => {
    if (seekDoneRef.current) return;
    if (!(initialPositionSec > 0)) {
      seekDoneRef.current = true;
      return;
    }
    const id = setInterval(() => {
      try {
        const duration = player.duration;
        if (typeof duration === 'number' && duration > 0) {
          const target = Math.min(initialPositionSec, Math.max(0, duration - 1));
          player.currentTime = target;
          seekDoneRef.current = true;
          clearInterval(id);
        }
      } catch {
        // keep trying briefly
      }
    }, 200);
    const timeout = setTimeout(() => {
      clearInterval(id);
      if (!seekDoneRef.current) {
        try {
          player.currentTime = initialPositionSec;
        } catch {
          // ignore
        }
        seekDoneRef.current = true;
      }
    }, 8000);
    return () => {
      clearInterval(id);
      clearTimeout(timeout);
    };
  }, [player, initialPositionSec]);

  // Flush progress on unmount / close.
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
    (async () => {
      if (!subtitlePath) return;
      try {
        const info = await FileSystem.getInfoAsync(subtitlePath);
        if (!info.exists) return;
        const text = await FileSystem.readAsStringAsync(subtitlePath);
        const parsed = parseVtt(text);
        if (!cancelled) setCues(parsed);
      } catch {
        // ignore missing/unreadable subs
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subtitlePath]);

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
        // TextureView so subtitle overlay can draw on top (SurfaceView punches through).
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
          {title ?? t('common.offline')}
        </Text>
        {showSubsToggle ? (
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

      {!playlistPath ? (
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
