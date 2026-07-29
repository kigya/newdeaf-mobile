export type DownloadStatus = 'queued' | 'resolving' | 'downloading' | 'completed' | 'failed' | 'paused';

export type DownloadSource = 'movie' | 'youtube';

export type DownloadMediaKind = 'hls' | 'progressive';

export type DownloadRecord = {
  id: string;
  movieId: string;
  title: string;
  posterUrl?: string;
  audioLabel: string;
  quality: string;
  subtitleLabel: string;
  status: DownloadStatus;
  progress: number;
  error?: string;
  videoDir?: string;
  playlistPath?: string;
  subtitlePath?: string;
  createdAt: number;
  updatedAt: number;
  playerUrl?: string;
  hlsUrl?: string;
  subtitleUrl?: string;
  source: DownloadSource;
  mediaKind: DownloadMediaKind;
  youtubeUrl?: string;
};

export type DownloadRequest = {
  movieId: string;
  title: string;
  posterUrl?: string;
  playerUrl: string;
  audioLabel: string;
  quality: string;
  subtitleLabel: string;
  hlsUrl: string;
  subtitleUrl: string;
};

export type YoutubeDownloadRequest = {
  youtubeUrl: string;
  videoId: string;
  title: string;
  posterUrl?: string;
  quality: string;
  mediaKind: DownloadMediaKind;
  /** Progressive MP4 URL or HLS master URL from Piped. */
  streamUrl: string;
};
