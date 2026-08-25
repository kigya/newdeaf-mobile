export type MovieSummary = {
  id: string;
  slug: string;
  title: string;
  year?: string;
  posterUrl?: string;
  href: string;
  kpRating?: string;
  imdbRating?: string;
  /** True when card genre list includes «Сериалы» or title/slug looks like a series. */
  isSeries?: boolean;
};

export type MovieDetail = MovieSummary & {
  description?: string;
  country?: string;
  duration?: string;
  genres: string[];
  genreHrefs: { name: string; href: string }[];
  actors: string[];
  director?: string;
  playerUrl?: string;
  /** Third-party embed when native balancer is unavailable (WebView fallback). */
  fallbackPlayerUrl?: string;
  /** True when playerUrl is a bnsi-compatible balancer (stloadi/stravers/biorn). */
  nativePlayer?: boolean;
  playerToken?: string;
  tokenMovie?: string;
  translationId?: string;
  season?: number;
  episode?: number;
  likes?: string;
  trailerUrl?: string;
  trailerYoutubeId?: string;
  originalTitle?: string;
};

export type Genre = {
  name: string;
  slug: string;
  href: string;
};

export type StreamQualityMap = Record<string, string>;

export type HlsSource = {
  label: string;
  quality: StreamQualityMap;
  audioId?: string;
  /** Fsst playlist_iframe episode coordinates when label is an episode comment. */
  season?: number;
  episode?: number;
};

export type CaptionTrack = {
  kind: string;
  label: string;
  src: string;
};

export type StreamPayload = {
  skipTime?: string | null;
  removeTime?: string | null;
  hlsSource: HlsSource[];
  tracks: CaptionTrack[];
  hasEmbeddedAds?: boolean;
  type?: string;
  autoplay?: boolean;
  time?: number;
  /** True when qualities are progressive MP4 (fsst), not HLS masters. */
  progressive?: boolean;
};

export type PlayerFileListEntry = {
  id: number;
  id_file?: string | number | null;
  translation: string;
  id_translation: number;
  quality: string;
  id_quality: number;
  uhd?: number;
  seasons?: number;
  episode?: number;
  directors_cut?: boolean;
  top_bought?: unknown;
};

/** season -> episode -> translationKey -> entry */
export type PlayerFileList = {
  type: 'serial' | 'movie';
  active?: PlayerFileListEntry;
  all: Record<string, Record<string, Record<string, PlayerFileListEntry>>>;
};

/** @deprecated use PlayerFileListEntry */
export type FileListEntry = PlayerFileListEntry;

export const BASE_URL = 'https://newdeaf.top';

export const GENRES: Genre[] = [
  { name: 'Сериалы', slug: 'serialy', href: '/serialy/' },
  { name: 'Вестерн', slug: 'vestern', href: '/vestern/' },
  { name: 'Военный', slug: 'voennyi', href: '/voennyi/' },
  { name: 'Детектив', slug: 'detektivy', href: '/detektivy/' },
  { name: 'Боевик', slug: 'boevik', href: '/boevik/' },
  { name: 'Драма', slug: 'drama', href: '/drama/' },
  { name: 'Исторический', slug: 'istorich', href: '/istorich/' },
  { name: 'Короткометражки', slug: 'shorts', href: '/shorts/' },
  { name: 'Комедии', slug: 'komedii', href: '/komedii/' },
  { name: 'Мелодрама', slug: 'melodramy', href: '/melodramy/' },
  { name: 'Мистика', slug: 'mistika', href: '/mistika/' },
  { name: 'Приключения', slug: 'prikluch', href: '/prikluch/' },
  { name: 'Семейный', slug: 'semya', href: '/semya/' },
  { name: 'Спорт', slug: 'sportivnye', href: '/sportivnye/' },
  { name: 'Триллер', slug: 'triller', href: '/triller/' },
  { name: 'Ужасы', slug: 'uzhasy', href: '/uzhasy/' },
  { name: 'Фантастика', slug: 'fantastic', href: '/fantastic/' },
  { name: 'Биографии', slug: 'biographia', href: '/biographia/' },
  { name: 'Фэнтези', slug: 'fentezi', href: '/fentezi/' },
  { name: 'Мюзикл', slug: 'music-film-s-subtitrami', href: '/music-film-s-subtitrami/' },
  { name: 'Отечественный', slug: 'otechestva', href: '/otechestva/' },
];
