import { normalizeTorrent } from './normalize';
import { RawTorrent } from './types';

function makeRawTorrent(overrides: Partial<RawTorrent> = {}): RawTorrent {
  return {
    fid: 12345,
    name: 'Test.Movie.2026.1080p.BluRay.x264-GROUP',
    filename: 'Test.Movie.2026.1080p.BluRay.x264-GROUP.torrent',
    categoryID: 13,
    size: 2147483648,
    seeders: 50,
    leechers: 3,
    completed: 200,
    numComments: 5,
    addedTimestamp: '2026-03-17 12:00:00',
    tags: ['FREELEECH', 'FOREIGN'],
    genres: 'Action, Thriller',
    rating: 7.5,
    imdbID: 'tt1234567',
    ...overrides,
  };
}

describe('normalizeTorrent integration', () => {
  it('maps raw torrent fields to normalized structure', () => {
    const raw = makeRawTorrent();
    const result = normalizeTorrent(raw);

    expect(result.torrent_id).toBe(12345);
    expect(result.name).toBe(raw.name);
    expect(result.filename).toBe(raw.filename);
    expect(result.category).toBe('movies');
    expect(result.subcategory).toBe('Movies/BluRay');
    expect(result.resolution).toBe('1080p');
    expect(result.source).toBe('BluRay');
    expect(result.codec).toBe('H.264');
    expect(result.seeders).toBe(50);
    expect(result.leechers).toBe(3);
    expect(result.snatched).toBe(200);
    expect(result.comments).toBe(5);
    expect(result.date).toBe('2026-03-17 12:00:00');
    expect(result.genres).toBe('Action, Thriller');
    expect(result.rating).toBe(7.5);
    expect(result.imdb_id).toBe('tt1234567');
  });

  it('filters out FREELEECH from tags', () => {
    const raw = makeRawTorrent({ tags: ['FREELEECH', 'FOREIGN'] });
    const result = normalizeTorrent(raw);
    expect(result.tags).toEqual(['FOREIGN']);
  });

  it('computes size fields correctly', () => {
    const raw = makeRawTorrent({ size: 1073741824 }); // 1 GB
    const result = normalizeTorrent(raw);
    expect(result.size_bytes).toBe(1073741824);
    expect(result.size_gb).toBe(1);
    expect(result.size_str).toBe('1.00 GB');
  });

  it('serializes normalized array to JSON', () => {
    const torrents = [makeRawTorrent(), makeRawTorrent({ fid: 99999, name: 'Another.Torrent' })];
    const normalized = torrents.map(normalizeTorrent);
    const json = JSON.stringify(normalized);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].torrent_id).toBe(12345);
    expect(parsed[1].torrent_id).toBe(99999);
  });
});
