import { Injectable, BadGatewayException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import type { AutobrrFilter } from './autobrr-filter.schema';

@Injectable()
export class AutobrrService {
  private getClient(url: string, apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: `${url}/api`,
      headers: { 'X-API-Token': apiKey },
      maxRedirects: 0,
      timeout: 10_000,
    });
  }

  private rethrow(err: unknown, action: string): never {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 'no response';
      const body = err.response?.data;
      const detail = typeof body === 'string' ? body : JSON.stringify(body ?? err.message);
      throw new BadGatewayException(`autobrr ${action} failed (${status}): ${detail}`);
    }
    throw err;
  }

  async testConnection(url: string, apiKey: string): Promise<{ connected: boolean; filter_count?: number; error?: string }> {
    try {
      const client = this.getClient(url, apiKey);
      const res = await client.get<unknown[]>('/filters');
      return { connected: true, filter_count: Array.isArray(res.data) ? res.data.length : 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return { connected: false, error: message };
    }
  }

  async listFilters(url: string, apiKey: string): Promise<unknown[]> {
    const client = this.getClient(url, apiKey);
    const res = await client.get<unknown[]>('/filters');
    return res.data;
  }

  async createFilter(url: string, apiKey: string, filter: AutobrrFilter): Promise<Record<string, unknown>> {
    try {
      const client = this.getClient(url, apiKey);
      const res = await client.post<Record<string, unknown>>('/filters', filter);
      return res.data;
    } catch (err) { this.rethrow(err, 'create filter'); }
  }

  async updateFilter(url: string, apiKey: string, id: number, filter: AutobrrFilter): Promise<Record<string, unknown>> {
    try {
      const client = this.getClient(url, apiKey);
      const res = await client.put<Record<string, unknown>>(`/filters/${id}`, filter);
      return res.data;
    } catch (err) { this.rethrow(err, 'update filter'); }
  }

  async getFilter(url: string, apiKey: string, id: number): Promise<Record<string, unknown>> {
    try {
      const client = this.getClient(url, apiKey);
      const res = await client.get<Record<string, unknown>>(`/filters/${id}`);
      return res.data;
    } catch (err) { this.rethrow(err, 'get filter'); }
  }
}
