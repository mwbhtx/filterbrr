import {
  CATEGORY_MAP,
  deriveResolution,
  deriveSource,
  deriveCodec,
  deriveHdr,
  deriveReleaseGroup,
  deriveFields,
  bytesToGb,
  formatSize,
  normalizeTorrent,
} from './normalize';
import { RawTorrent } from './types';

describe('CATEGORY_MAP', () => {
  it('should have exactly 41 entries', () => {
    expect(Object.keys(CATEGORY_MAP).length).toBe(38);
  });

  it('should map known categories correctly', () => {
    expect(CATEGORY_MAP[13]).toEqual(['movies', 'Movies/BluRay']);
    expect(CATEGORY_MAP[2]).toEqual(['tv', 'TV/Episodes']);
    expect(CATEGORY_MAP[17]).toEqual(['games', 'Games/PC']);
    expect(CATEGORY_MAP[45]).toEqual(['books', 'Books/EBooks']);
  });
});

describe('deriveResolution', () => {
  it.each([
    ['Movie.Name.2160p.BluRay', '2160p'],
    ['Movie.Name.1080p.WEB-DL', '1080p'],
    ['Movie.Name.720p.HDTV', '720p'],
    ['Movie.Name.480p.DVDRip', '480p'],
    ['Movie.Name.576i.DVDRip', '576p'],
    ['Movie.Name.4320p.BluRay', '4320p'],
    ['Movie.Name.1080i.HDTV', '1080p'],
  ])('should extract resolution from %s', (name, expected) => {
    expect(deriveResolution(name)).toBe(expected);
  });

  it('should detect 4K/UHD keywords as 2160p', () => {
    expect(deriveResolution('Movie.Name.4K.BluRay')).toBe('2160p');
    expect(deriveResolution('Movie.Name.UHD.BluRay')).toBe('2160p');
  });

  it('should return unknown for no resolution', () => {
    expect(deriveResolution('Movie.Name.BluRay')).toBe('unknown');
  });
});

describe('deriveSource', () => {
  it.each([
    ['Movie.BDREMUX.1080p', 'Remux'],
    ['Movie.BluRay.REMUX.2160p', 'Remux'],
    ['Movie.BLU-RAY.REMUX', 'Remux'],
    ['Movie.1080p.BluRay.x264', 'BluRay'],
    ['Movie.1080p.BLU-RAY', 'BluRay'],
    ['Movie.1080p.WEB-DL', 'WEB-DL'],
    ['Movie.1080p.WEBRip', 'WEBRip'],
    ['Movie.1080p.WEB-RIP', 'WEBRip'],
    ['Movie.720p.HDTV', 'HDTV'],
    ['Movie.REMUX.1080p', 'Remux'],
    ['Movie.1080p.WEB', 'WEB'],
    ['Movie.DVDRip.XviD', 'DVDRip'],
    ['Movie.DVD-Rip', 'DVDRip'],
    ['Some.Random.Movie', 'Other'],
  ])('should detect source from %s', (name, expected) => {
    expect(deriveSource(name)).toBe(expected);
  });
});

describe('deriveCodec', () => {
  it.each([
    ['Movie.H.265.BluRay', 'H.265'],
    ['Movie.x265.1080p', 'H.265'],
    ['Movie.HEVC.2160p', 'H.265'],
    ['Movie.H265.BluRay', 'H.265'],
    ['Movie.H.264.BluRay', 'H.264'],
    ['Movie.x264.1080p', 'H.264'],
    ['Movie.AVC.BluRay', 'H.264'],
    ['Movie.H264.BluRay', 'H.264'],
    ['Movie.AV1.1080p', 'AV1'],
    ['Movie.XviD.DVDRip', 'XviD'],
    ['Movie.1080p.BluRay', 'Other'],
  ])('should detect codec from %s', (name, expected) => {
    expect(deriveCodec(name)).toBe(expected);
  });
});

describe('deriveHdr', () => {
  it('should detect DV HDR combo', () => {
    expect(deriveHdr('Movie.2160p.DV.HDR.BluRay')).toBe('DV HDR');
    expect(deriveHdr('Movie.2160p.DOVI.HDR10.BluRay')).toBe('DV HDR');
  });

  it('should detect DV alone', () => {
    expect(deriveHdr('Movie.2160p.DV.BluRay')).toBe('DV');
    expect(deriveHdr('Movie.2160p.DOVI.BluRay')).toBe('DV');
  });

  it('should detect HDR10+', () => {
    expect(deriveHdr('Movie.2160p.HDR10+.BluRay')).toBe('HDR10+');
    expect(deriveHdr('Movie.2160p.HDR10PLUS.BluRay')).toBe('HDR10+');
  });

  it('should detect HDR', () => {
    expect(deriveHdr('Movie.2160p.HDR.BluRay')).toBe('HDR');
    expect(deriveHdr('Movie.2160p.HDR10.BluRay')).toBe('HDR');
  });

  it('should detect SDR', () => {
    expect(deriveHdr('Movie.1080p.SDR.BluRay')).toBe('SDR');
  });

  it('should return None for no HDR info', () => {
    expect(deriveHdr('Movie.1080p.BluRay')).toBe('None');
  });

  it('should NOT false-positive DV from DVD', () => {
    expect(deriveHdr('Movie.DVDRip.XviD')).toBe('None');
    expect(deriveHdr('Movie.DVD-R.2024')).toBe('None');
  });
});

describe('deriveReleaseGroup', () => {
  it('should extract from filename (stripping .torrent)', () => {
    expect(deriveReleaseGroup('Movie-GROUP', 'Movie-GROUP.torrent')).toBe('GROUP');
  });

  it('should extract from filename without .torrent', () => {
    expect(deriveReleaseGroup('Movie-GROUP', 'Movie-GROUP')).toBe('GROUP');
  });

  it('should fall back to name when no filename', () => {
    expect(deriveReleaseGroup('Movie.1080p.BluRay-SPARKS')).toBe('SPARKS');
  });

  it('should handle release group followed by space', () => {
    expect(deriveReleaseGroup('Movie.1080p-GROUP (2024)')).toBe('GROUP');
  });

  it('should return unknown when no group found', () => {
    expect(deriveReleaseGroup('Movie 1080p BluRay')).toBe('unknown');
  });
});

describe('deriveFields', () => {
  it('should return all derived fields', () => {
    const result = deriveFields(
      'Movie.Name.2160p.DV.HDR.BluRay.REMUX.HEVC-FraMeSToR',
      'Movie.Name.2160p.DV.HDR.BluRay.REMUX.HEVC-FraMeSToR.torrent',
    );
    expect(result).toEqual({
      resolution: '2160p',
      source: 'Remux',
      codec: 'H.265',
      hdr: 'DV HDR',
      release_group: 'FraMeSToR',
    });
  });
});

describe('bytesToGb', () => {
  it('should convert bytes to GB', () => {
    expect(bytesToGb(1073741824)).toBeCloseTo(1.0);
    expect(bytesToGb(0)).toBe(0);
  });
});

describe('formatSize', () => {
  it('should format GB sizes', () => {
    expect(formatSize(2147483648)).toBe('2.00 GB');
  });

  it('should format MB sizes', () => {
    expect(formatSize(5242880)).toBe('5.00 MB');
  });

  it('should format KB sizes', () => {
    expect(formatSize(1024)).toBe('1.00 KB');
  });
});

describe('normalizeTorrent', () => {
  const raw: RawTorrent = {
    fid: 12345,
    name: 'Movie.Name.2160p.BluRay.x265.HDR-GROUP',
    filename: 'Movie.Name.2160p.BluRay.x265.HDR-GROUP.torrent',
    categoryID: 13,
    size: 5368709120,
    seeders: 50,
    leechers: 10,
    completed: 200,
    numComments: 5,
    addedTimestamp: '2024-01-15 12:00:00',
    tags: ['FREELEECH', 'EXCLUSIVE'],
    genres: 'Action, Thriller',
    rating: 7.5,
    imdbID: 'tt1234567',
  };

  it('should map fields correctly', () => {
    const result = normalizeTorrent(raw);

    expect(result.torrent_id).toBe(12345);
    expect(result.name).toBe(raw.name);
    expect(result.filename).toBe(raw.filename);
    expect(result.category).toBe('movies');
    expect(result.category_id).toBe(13);
    expect(result.subcategory).toBe('Movies/BluRay');
    expect(result.resolution).toBe('2160p');
    expect(result.source).toBe('BluRay');
    expect(result.codec).toBe('H.265');
    expect(result.hdr).toBe('HDR');
    expect(result.release_group).toBe('GROUP');
    expect(result.size_bytes).toBe(5368709120);
    expect(result.size_gb).toBeCloseTo(5.0, 1);
    expect(result.size_str).toBe('5.00 GB');
    expect(result.snatched).toBe(200);
    expect(result.seeders).toBe(50);
    expect(result.leechers).toBe(10);
    expect(result.comments).toBe(5);
    expect(result.date).toBe('2024-01-15 12:00:00');
    expect(result.genres).toBe('Action, Thriller');
    expect(result.rating).toBe(7.5);
    expect(result.imdb_id).toBe('tt1234567');
  });

  it('should filter out FREELEECH from tags', () => {
    const result = normalizeTorrent(raw);
    expect(result.tags).toEqual(['EXCLUSIVE']);
    expect(result.tags).not.toContain('FREELEECH');
  });

  it('should handle unknown category', () => {
    const result = normalizeTorrent({ ...raw, categoryID: 9999 });
    expect(result.category).toBe('unknown');
    expect(result.subcategory).toBe('unknown');
  });

  it('should handle missing tags gracefully', () => {
    const result = normalizeTorrent({ ...raw, tags: undefined as unknown as string[] });
    expect(result.tags).toEqual([]);
  });
});
