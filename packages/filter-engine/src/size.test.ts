import { parseSizeStr } from './size';

describe('parseSizeStr', () => {
  it('parses GB values', () => {
    expect(parseSizeStr('30GB')).toBe(30);
    expect(parseSizeStr('1.5GB')).toBe(1.5);
    expect(parseSizeStr('0GB')).toBe(0);
  });

  it('parses TB values', () => {
    expect(parseSizeStr('1TB')).toBe(1024);
    expect(parseSizeStr('1.5TB')).toBe(1536);
    expect(parseSizeStr('0.5TB')).toBe(512);
  });

  it('parses MB values', () => {
    expect(parseSizeStr('512MB')).toBe(0.5);
    expect(parseSizeStr('1024MB')).toBe(1);
    expect(parseSizeStr('100MB')).toBeCloseTo(0.09765625);
  });

  it('is case-insensitive', () => {
    expect(parseSizeStr('30gb')).toBe(30);
    expect(parseSizeStr('1tb')).toBe(1024);
    expect(parseSizeStr('512mb')).toBe(0.5);
  });

  it('trims whitespace', () => {
    expect(parseSizeStr('  30GB  ')).toBe(30);
    expect(parseSizeStr(' 1TB ')).toBe(1024);
  });

  it('treats plain numbers as bytes and converts to GB', () => {
    expect(parseSizeStr('1000000000')).toBeCloseTo(1);
    expect(parseSizeStr('5000000000')).toBeCloseTo(5);
    expect(parseSizeStr('500000000')).toBeCloseTo(0.5);
  });

  it('returns 0 for empty string', () => {
    expect(parseSizeStr('')).toBe(0);
    expect(parseSizeStr('   ')).toBe(0);
  });
});
