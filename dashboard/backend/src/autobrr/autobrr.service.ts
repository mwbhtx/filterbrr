import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class AutobrrService {
  private getClient(url: string, apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: `${url}/api/v1`,
      headers: { 'X-API-Token': apiKey },
    });
  }

  async testConnection(url: string, apiKey: string): Promise<{ ok: boolean; version?: string }> {
    try {
      const client = this.getClient(url, apiKey);
      const res = await client.get<{ version?: string }>('/config');
      return { ok: true, version: res.data?.version };
    } catch {
      return { ok: false };
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
