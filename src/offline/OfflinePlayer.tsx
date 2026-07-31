import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { t } from '@/src/i18n';
import { colors, fonts, spacing } from '@/src/theme';

import { cueAtTime, parseVtt, type VttCue } from './vtt';

type Props = {
  playlistPath: string;
  subtitlePath?: string;
  title?: string;
  mediaKind?: 'hls' | 'progressive';
  onClose?: () => void;
};

export function OfflinePlayer({
  playlistPath,
  subtitlePath,
  title,
  mediaKind = 'hls',
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [cues, setCues] = useState<VttCue[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [subsEnabled, setSubsEnabled] = useState(true);
  const showSubsToggle = mediaKind === 'hls' && !!subtitlePath;

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

  useEventListener(player, 'timeUpdate', ({ currentTime: t }) => {
    setCurrentTime(t);
  });

  // Fallback: some Android builds don't emit timeUpdate reliably with local HLS.
  useEffect(() => {
    const id = setInterval(() => {
      try {
        const t = player.currentTime;
        if (typeof t === 'number' && !Number.isNaN(t)) setCurrentTime(t);
      } catch {
        // ignore
      }
    }, 250);
    return () => clearInterval(id);
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
        <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
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
