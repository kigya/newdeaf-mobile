import {
  parseEmbessPlaylistEpisodes,
  parseFsstPlaylistEpisodes,
} from '@/src/data/catalog/embedStreams';
import { listCompletedDownloads } from '@/src/features/downloads/match';
import type { DownloadRecord } from '@/src/features/downloads/types';

export type SeasonEpisodeRef = {
  season: number;
  episode: number;
};

export type PlanSeasonOpts = {
  movieId: string;
  limit?: number;
  onlyMissing?: boolean;
};

function sortEpisodes(episodes: SeasonEpisodeRef[]): SeasonEpisodeRef[] {
  return [...episodes].sort((a, b) => a.season - b.season || a.episode - b.episode);
}

function dedupe(episodes: SeasonEpisodeRef[]): SeasonEpisodeRef[] {
  const seen = new Set<string>();
  const out: SeasonEpisodeRef[] = [];
  for (const ep of episodes) {
    if (!Number.isFinite(ep.season) || !Number.isFinite(ep.episode)) continue;
    if (ep.season <= 0 || ep.episode <= 0) continue;
    const key = `${ep.season}:${ep.episode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ season: ep.season, episode: ep.episode });
  }
  return out;
}

export function episodeRefsFromEmbessHtml(html: string): SeasonEpisodeRef[] {
  return parseEmbessPlaylistEpisodes(html).map((ep) => ({
    season: ep.season,
    episode: ep.episode,
  }));
}

export function episodeRefsFromFsstHtml(html: string): SeasonEpisodeRef[] {
  return parseFsstPlaylistEpisodes(html)
    .map((ep) => ({ season: ep.season, episode: ep.episode }))
    .filter((ep): ep is SeasonEpisodeRef => ep.season != null && ep.episode != null);
}

export function planSeasonDownload(
  episodes: SeasonEpisodeRef[],
  completed: DownloadRecord[],
  opts: PlanSeasonOpts
): SeasonEpisodeRef[] {
  const onlyMissing = opts.onlyMissing !== false;
  const ordered = sortEpisodes(dedupe(episodes));
  const missing = onlyMissing
    ? ordered.filter(
        (ep) => listCompletedDownloads(opts.movieId, completed, ep.season, ep.episode).length === 0
      )
    : ordered;
  const limit = opts.limit != null && opts.limit > 0 ? Math.floor(opts.limit) : missing.length;
  return missing.slice(0, limit);
}
