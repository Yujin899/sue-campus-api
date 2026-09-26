import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { Roles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { Role } from '../generated/prisma/enums';
import { UsersService } from './users.service';
import { BanUserDto } from './dto/ban-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SetUserRoleDto } from './dto/set-user-role.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@Session() session: UserSession) {
    return { user: session.user };
  }

  @Get()
  @Roles([Role.ADMIN])
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Roles([Role.ADMIN])
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/role')
  @Roles([Role.ADMIN])
  setRole(
    @Param('id') id: string,
    @Body() dto: SetUserRoleDto,
    @Session() session: UserSession,
  ) {
    return this.usersService.setRole(id, dto, session.user.id);
  }

  @Patch(':id/ban')
  @Roles([Role.ADMIN])
  ban(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @Session() session: UserSession,
  ) {
    return this.usersService.ban(id, dto, session.user.id);
  }

  @Delete(':id/ban')
  @Roles([Role.ADMIN])
  unban(@Param('id') id: string) {
    return this.usersService.unban(id);
  }

  @Delete(':id')
  @Roles([Role.ADMIN])
  remove(@Param('id') id: string, @Session() session: UserSession) {
    return this.usersService.remove(id, session.user.id);
  }
}
