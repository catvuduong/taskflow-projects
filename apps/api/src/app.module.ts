import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DbService } from './db.service.js';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, DbService],
})
export class AppModule {}
