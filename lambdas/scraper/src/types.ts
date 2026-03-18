export interface RawTorrent {
  fid: number;
  name: string;
  filename: string;
  categoryID: number;
  size: number;
  seeders: number;
  leechers: number;
  completed: number;
  numComments: number;
  addedTimestamp: string;
  tags: string[];
  genres: string;
  rating: number;
  imdbID: string;
}

export interface NormalizedTorrent {
  torrent_id: number;
  name: string;
  filename: string;
  category: string;
  category_id: number;
  subcategory: string;
  resolution: string;
  source: string;
  codec: string;
  hdr: string;
  release_group: string;
  size_bytes: number;
  size_gb: number;
  size_str: string;
  snatched: number;
  seeders: number;
  leechers: number;
  comments: number;
  date: string;
  tags: string[];
  genres: string;
  rating: number;
  imdb_id: string;
}

export interface ScrapeEvent {
  jobId?: string;
  userId: string;
  category: string;
  days: number;
  startPage: number;
  delay: number;
  trackerUsername: string;
  trackerPassword: string;
}
