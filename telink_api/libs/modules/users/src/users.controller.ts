import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, JwtPayload } from '@telink/core';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.users.getMe(user.sub);
  }

  @Patch('me')
  @HttpCode(200)
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.users.updateMe(user.sub, dto);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.users.getPublic(id);
  }
}