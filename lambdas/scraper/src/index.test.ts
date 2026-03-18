import { getCategoryFacets, toCSV } from './index';

describe('getCategoryFacets', () => {
  it('returns FREELEECH facet for freeleech', () => {
    expect(getCategoryFacets('freeleech')).toBe('tags%3AFREELEECH');
  });
  it('returns Movies facet for movies', () => {
    expect(getCategoryFacets('movies')).toBe('cat%3AMovies');
  });
  it('returns freeleech facet for unknown category', () => {
    expect(getCategoryFacets('unknown')).toBe('tags%3AFREELEECH');
  });
});

describe('toCSV', () => {
  it('produces CSV with header row', () => {
    const rows = [{ name: 'Test Torrent', size: 1073741824, date: '2026-03-17', seeders: 100, leechers: 5, completed: 200, category: 'freeleech' }];
    const csv = toCSV(rows);
    expect(csv).toContain('name,size,date,seeders,leechers,completed,category');
    expect(csv).toContain('"Test Torrent"');
  });
  it('escapes double quotes in names', () => {
    const rows = [{ name: 'Test "Quoted"', size: 1073741824, date: '2026-03-17', seeders: 0, leechers: 0, completed: 0, category: 'freeleech' }];
    const csv = toCSV(rows);
    expect(csv).toContain('"Test ""Quoted"""');
  });
});
