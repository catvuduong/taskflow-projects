import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppModule } from './app.module.js';

let server: express.Express | undefined;

// Entry point for Vercel (see api/index.js and vercel.json). Local/CI use src/main.ts instead.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!server) {
    const exp = express();
    const app = await NestFactory.create(AppModule, new ExpressAdapter(exp));
    app.enableCors();
    await app.init();
    server = exp;
  }
  server(req, res);
}
