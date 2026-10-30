import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DbService } from './db.service.js';
import { TrackerController } from './tracker/tracker.controller.js';
import { SeedService } from './tracker/seed.js';
import { TrackerService } from './tracker/tracker.service.js';

@Module({
  imports: [],
  controllers: [AppController, TrackerController],
  providers: [AppService, DbService, TrackerService, SeedService],
})
export class AppModule {}
