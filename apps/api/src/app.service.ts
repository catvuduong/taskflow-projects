import { Injectable } from '@nestjs/common';
import { DbService } from './db.service.js';

export interface Item {
  id: number;
  title: string;
}

@Injectable()
export class AppService {
  constructor(private readonly db: DbService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async health(): Promise<{ status: 'ok'; db: 'up' | 'down' | 'disabled' }> {
    if (!this.db.enabled) return { status: 'ok', db: 'disabled' };
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok', db: 'up' };
    } catch {
      return { status: 'ok', db: 'down' };
    }
  }

  listItems(): Promise<Item[]> {
    return this.db.query<Item>('SELECT id, title FROM items ORDER BY id DESC LIMIT 50');
  }

  async addItem(title: string): Promise<Item> {
    const rows = await this.db.query<Item>(
      'INSERT INTO items (title) VALUES ($1) RETURNING id, title',
      [title],
    );
    return rows[0];
  }
}
