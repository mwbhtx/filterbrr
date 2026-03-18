import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class AutobrrService {
  private getClient(url: string, apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: `${url}/api`,
      headers: { 'X-API-Token': apiKey },
    });
  }

  async testConnection(url: string, apiKey: string): Promise<{ connected: boolean; filter_count?: number; error?: string }> {
    try {
      const client = this.getClient(url, apiKey);
      await client.get('/config');
      const filters = await client.get<unknown[]>('/filters');
      return { connected: true, filter_count: Array.isArray(filters.data) ? filters.data.length : 0 };
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

  async createFilter(url: string, apiKey: string, filter: Record<string, unknown>): Promise<Record<string, unknown>> {
    const client = this.getClient(url, apiKey);
    const res = await client.post<Record<string, unknown>>('/filters', filter);
    return res.data;
  }

  async updateFilter(url: string, apiKey: string, id: number, filter: Record<string, unknown>): Promise<Record<string, unknown>> {
    const client = this.getClient(url, apiKey);
    const res = await client.put<Record<string, unknown>>(`/filters/${id}`, filter);
    return res.data;
  }
}
