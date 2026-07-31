import {
  MediaPlayer,
  type MediaProgressPayload,
} from '@/src/player/MediaPlayer';

export type OfflineProgressPayload = MediaProgressPayload;

type Props = {
  playlistPath: string;
  subtitlePath?: string;
  title?: string;
  mediaKind?: 'hls' | 'progressive';
  initialPositionSec?: number;
  onProgress?: (payload: OfflineProgressPayload) => void;
  onClose?: () => void;
};

/** Thin wrapper around MediaPlayer for local downloads. */
export function OfflinePlayer({
  playlistPath,
  subtitlePath,
  title,
  mediaKind = 'hls',
  initialPositionSec = 0,
  onProgress,
  onClose,
}: Props) {
  return (
    <MediaPlayer
      uri={playlistPath}
      contentType={mediaKind}
      subtitlePath={subtitlePath}
      title={title}
      initialPositionSec={initialPositionSec}
      onProgress={onProgress}
      onClose={onClose}
    />
  );
}
