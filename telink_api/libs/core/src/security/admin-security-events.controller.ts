import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { SecurityEventService } from './security-event.service';

@Controller('admin/security-events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminSecurityEventsController {
  constructor(private readonly events: SecurityEventService) {}

  @Get()
  @Roles('support', 'moderator', 'admin')
  list(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.events.list({
      userId,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      cursor,
    });
  }

  @Get(':id/verify')
  @Roles('admin')
  verify(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.events.verifySignature(id);
  }
}