import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health() {
    return this.appService.health();
  }

  @Get('items')
  listItems() {
    return this.appService.listItems();
  }

  @Post('items')
  addItem(@Body() body: { title?: string }) {
    const title = body?.title?.trim();
    if (!title) throw new BadRequestException('title is required');
    return this.appService.addItem(title);
  }
}
