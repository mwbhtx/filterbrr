import { Handler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ScrapeEvent {
  userId: string;
  category: string;
  days: number;
  startPage: number;
  delay: number;
  trackerUsername: string;
  trackerPassword: string;
}

interface TorrentRow {
  name: string;
  size: string;
  date: string;
  seeders: number;
  leechers: number;
  completed: number;
  category: string;
}

export function getCategoryId(category: string): number {
  const map: Record<string, number> = { freeleech: 0, movies: 14, tv: 26 };
  return map[category] ?? 0;
}

export function parseTorrentsFromPage($: cheerio.CheerioAPI, category: string): TorrentRow[] {
  const rows: TorrentRow[] = [];
  $('tr.torrent').each((_, el) => {
    const $el = $(el);
    rows.push({
      name: $el.find('.title a').text().trim(),
      size: $el.find('.size').text().trim(),
      date: $el.find('.date').text().trim(),
      seeders: parseInt($el.find('.seeders').text()) || 0,
      leechers: parseInt($el.find('.leechers').text()) || 0,
      completed: parseInt($el.find('.completed').text()) || 0,
      category,
    });
  });
  return rows;
}

export function toCSV(rows: TorrentRow[]): string {
  const header = 'name,size,date,seeders,leechers,completed,category\n';
  return header + rows.map(r =>
    `"${r.name.replace(/"/g, '""')}","${r.size}","${r.date}",${r.seeders},${r.leechers},${r.completed},"${r.category}"`
  ).join('\n');
}

export const handler: Handler<ScrapeEvent> = async (event) => {
  const { userId, category, days, trackerUsername, trackerPassword } = event;

  const session = axios.create({ baseURL: 'https://www.torrentleech.org', withCredentials: true });
  await session.post('/user/account/login/', new URLSearchParams({
    username: trackerUsername,
    password: trackerPassword,
  }));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const rows: TorrentRow[] = [];
  let page = event.startPage ?? 1;

  while (true) {
    const response = await session.get(`/torrents/browse/list/categories/${getCategoryId(category)}/page/${page}`);
    const $ = cheerio.load(response.data as string);
    const torrents = parseTorrentsFromPage($, category);

    if (torrents.length === 0) break;

    const filtered = torrents.filter(t => new Date(t.date) >= cutoff);
    rows.push(...filtered);

    if (filtered.length < torrents.length) break;
    page++;

    await new Promise(r => setTimeout(r, (event.delay ?? 1) * 1000));
  }

  const csv = toCSV(rows);
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
  const key = `${userId}/datasets/torrents_data_${category}_${timestamp}.csv`;

  const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-southeast-2' });
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET ?? 'filterbrr-userdata',
    Key: key,
    Body: csv,
    ContentType: 'text/csv',
  }));

  return { key, rowCount: rows.length };
};
