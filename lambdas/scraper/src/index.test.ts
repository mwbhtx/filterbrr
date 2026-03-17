import { getCategoryId, parseTorrentsFromPage, toCSV } from './index';
import * as cheerio from 'cheerio';

describe('getCategoryId', () => {
  it('returns 0 for freeleech', () => {
    expect(getCategoryId('freeleech')).toBe(0);
  });
  it('returns 14 for movies', () => {
    expect(getCategoryId('movies')).toBe(14);
  });
  it('returns 0 for unknown category', () => {
    expect(getCategoryId('unknown')).toBe(0);
  });
});

describe('toCSV', () => {
  it('produces CSV with header row', () => {
    const rows = [{ name: 'Test Torrent', size: '1 GB', date: '2026-03-17', seeders: 100, leechers: 5, completed: 200, category: 'freeleech' }];
    const csv = toCSV(rows);
    expect(csv).toContain('name,size,date,seeders,leechers,completed,category');
    expect(csv).toContain('"Test Torrent"');
  });
  it('escapes double quotes in names', () => {
    const rows = [{ name: 'Test "Quoted"', size: '1 GB', date: '2026-03-17', seeders: 0, leechers: 0, completed: 0, category: 'freeleech' }];
    const csv = toCSV(rows);
    expect(csv).toContain('"Test ""Quoted"""');
  });
});

describe('parseTorrentsFromPage', () => {
  it('returns empty array when no torrents on page', () => {
    const $ = cheerio.load('<table></table>');
    const result = parseTorrentsFromPage($, 'freeleech');
    expect(result).toHaveLength(0);
  });
});
