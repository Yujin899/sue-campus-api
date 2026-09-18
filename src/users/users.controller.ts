import { Controller, Get } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { Role } from '../generated/prisma/enums';

@Controller('users')
export class UsersController {
  @Get('me')
  me(@Session() session: UserSession) {
    return { user: session.user };
  }

  @Get('admin')
  @Roles([Role.ADMIN])
  admin(@Session() session: UserSession) {
    return { message: 'Admin only', user: session.user };
  }
}
