import { RawTorrent, NormalizedTorrent } from './types';

export const CATEGORY_MAP: Record<number, [string, string]> = {
  // Movies
  1: ['movies', 'Movies/Cam'],
  10: ['movies', 'Movies/Screener'],
  11: ['movies', 'Movies/DVD-R'],
  12: ['movies', 'Movies/DVD-Rip'],
  13: ['movies', 'Movies/BluRay'],
  14: ['movies', 'Movies/XviD'],
  15: ['movies', 'Movies/HD'],
  29: ['movies', 'Movies/Documentary'],
  36: ['movies', 'Movies/WebRip'],
  37: ['movies', 'Movies/4K'],
  43: ['movies', 'Movies/HDRip'],
  47: ['movies', 'Movies/4K-UHD'],
  // TV
  2: ['tv', 'TV/Episodes'],
  26: ['tv', 'TV/Episodes HD'],
  27: ['tv', 'TV/Boxsets'],
  32: ['tv', 'TV/Episodes SD'],
  34: ['tv', 'TV/Anime'],
  35: ['tv', 'TV/Cartoons'],
  44: ['tv', 'TV/Foreign'],
  // Games
  17: ['games', 'Games/PC'],
  18: ['games', 'Games/PS'],
  19: ['games', 'Games/Xbox'],
  40: ['games', 'Games/Nintendo'],
  42: ['games', 'Games/Mac'],
  // Apps
  20: ['apps', 'Apps/PC'],
  21: ['apps', 'Apps/Mac'],
  22: ['apps', 'Apps/Linux'],
  24: ['apps', 'Apps/Mobile'],
  // Music
  16: ['music', 'Music/Albums'],
  31: ['music', 'Music/Singles'],
  46: ['music', 'Music/Videos'],
  // Books
  45: ['books', 'Books/EBooks'],
  // Education
  23: ['education', 'Education'],
  38: ['education', 'Education/Foreign'],
  // Other
  5: ['other', 'Other/TV-Rips'],
  28: ['other', 'Subtitles'],
  33: ['other', 'Other/Foreign'],
  41: ['other', 'Other/Boxsets'],
};

export function deriveResolution(name: string): string {
  const match = name.match(/(2160|1080|720|480|576|4320)[pPiI]/);
  if (match) return `${match[1]}p`;

  const upper = name.toUpperCase();
  if (upper.includes('4K') || upper.includes('UHD')) return '2160p';

  return 'unknown';
}

export function deriveSource(name: string): string {
  const upper = name.toUpperCase();

  // BLURAY/BLU-RAY with REMUX or BDREMUX → Remux
  if (/BDREMUX/i.test(name)) return 'Remux';
  if ((/BLU[\s-]?RAY/i.test(name) || /BLURAY/i.test(name)) && /REMUX/i.test(name)) return 'Remux';

  // BLURAY/BLU-RAY without REMUX → BluRay
  if (/BLU[\s-]?RAY/i.test(name) || /BLURAY/i.test(name)) return 'BluRay';

  if (upper.includes('WEB-DL')) return 'WEB-DL';
  if (/WEB[\s-]?RIP/i.test(name)) return 'WEBRip';
  if (upper.includes('HDTV')) return 'HDTV';
  if (upper.includes('REMUX')) return 'Remux';
  if (/\bWEB\b/i.test(name)) return 'WEB';
  if (/DVD[\s-]?RIP/i.test(name)) return 'DVDRip';

  return 'Other';
}

export function deriveCodec(name: string): string {
  const upper = name.toUpperCase();

  if (/H[\s.]?265/i.test(name) || /X[\s.]?265/i.test(name) || upper.includes('HEVC')) return 'H.265';
  if (/H[\s.]?264/i.test(name) || /X[\s.]?264/i.test(name) || upper.includes('AVC')) return 'H.264';
  if (/\bAV1\b/i.test(name)) return 'AV1';
  if (/XVID/i.test(name)) return 'XviD';

  return 'Other';
}

export function deriveHdr(name: string): string {
  const upper = name.toUpperCase();

  // Detect DV using word boundary (avoids DVD false positive) or DOVI
  const hasDV = /\bDV\b/.test(name) || /DOVI/i.test(name);
  const hasHDR10Plus = upper.includes('HDR10+') || upper.includes('HDR10PLUS');
  const hasHDR = /\bHDR\b/i.test(name) || /\bHDR10\b/i.test(name);
  const hasSDR = /\bSDR\b/i.test(name);

  if (hasDV && (hasHDR || hasHDR10Plus)) return 'DV HDR';
  if (hasDV) return 'DV';
  if (hasHDR10Plus) return 'HDR10+';
  if (hasHDR) return 'HDR';
  if (hasSDR) return 'SDR';

  return 'None';
}

export function deriveReleaseGroup(name: string, filename?: string): string {
  // Try filename first
  if (filename) {
    const fileMatch = filename.match(/-([A-Za-z0-9]+?)(?:\.torrent)?$/);
    if (fileMatch) return fileMatch[1];
  }

  // Fall back to name
  const nameMatch = name.match(/-([A-Za-z0-9]+)(?:\s|$|\))/);
  if (nameMatch) return nameMatch[1];

  return 'unknown';
}

export function deriveFields(name: string, filename?: string) {
  return {
    resolution: deriveResolution(name),
    source: deriveSource(name),
    codec: deriveCodec(name),
    hdr: deriveHdr(name),
    release_group: deriveReleaseGroup(name, filename),
  };
}

export function bytesToGb(bytes: number): number {
  return bytes / (1024 ** 3);
}

export function formatSize(bytes: number): string {
  const gb = bytesToGb(bytes);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 ** 2);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

export function normalizeTorrent(raw: RawTorrent): NormalizedTorrent {
  const [category, subcategory] = CATEGORY_MAP[raw.categoryID] ?? ['unknown', 'unknown'];
  const derived = deriveFields(raw.name, raw.filename);
  const sizeBytes = raw.size;
  const tags = (raw.tags ?? []).filter(t => t !== 'FREELEECH');

  return {
    torrent_id: raw.fid,
    name: raw.name,
    filename: raw.filename,
    category,
    category_id: raw.categoryID,
    subcategory,
    resolution: derived.resolution,
    source: derived.source,
    codec: derived.codec,
    hdr: derived.hdr,
    release_group: derived.release_group,
    size_bytes: sizeBytes,
    size_gb: parseFloat(bytesToGb(sizeBytes).toFixed(4)),
    size_str: formatSize(sizeBytes),
    snatched: raw.completed,
    seeders: raw.seeders,
    leechers: raw.leechers,
    comments: raw.numComments,
    date: raw.addedTimestamp,
    tags,
    genres: raw.genres,
    rating: raw.rating,
    imdb_id: raw.imdbID,
  };
}
