import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';
import { BanUserDto } from './dto/ban-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SetUserRoleDto } from './dto/set-user-role.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Explicit select so Account rows (accessToken, refreshToken, password) can
 * never leak into an admin response, plus a few counts the UI renders.
 */
const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  role: true,
  banned: true,
  banReason: true,
  bannedUntil: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { sessions: true, quizAttempts: true, authoredQuizzes: true },
  },
} as const;

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: Role;
  banned: boolean;
  banReason: string | null;
  bannedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { sessions: number; quizAttempts: number; authoredQuizzes: number };
}

export interface ManagedUserPage {
  items: ManagedUser[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

/** A ban is inactive once its expiry has passed. */
export function isBanActive(
  user: { banned: boolean; bannedUntil: Date | null },
  now: Date = new Date(),
): boolean {
  if (!user.banned) {
    return false;
  }
  if (!user.bannedUntil) {
    return true;
  }
  return user.bannedUntil > now;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string): Promise<ManagedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_LIST_SELECT,
    });
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async findAll(query: ListUsersQueryDto): Promise<ManagedUserPage> {
    const search = query.q?.trim();
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.banned === undefined ? {} : { banned: query.banned }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...row,
        banned: isBanActive(row),
      })),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async setRole(
    id: string,
    dto: SetUserRoleDto,
    requesterId: string,
  ): Promise<ManagedUser> {
    const user = await this.findOne(id);

    if (user.id === requesterId) {
      throw new BadRequestException('You cannot change your own role');
    }
    if (user.role === Role.ADMIN && dto.role !== Role.ADMIN) {
      await this.assertNotLastAdmin(id, 'demote');
    }

    await this.prisma.user.update({ where: { id }, data: { role: dto.role } });
    return this.findOne(id);
  }

  async ban(
    id: string,
    dto: BanUserDto,
    requesterId: string,
  ): Promise<ManagedUser> {
    const user = await this.findOne(id);

    if (user.id === requesterId) {
      throw new BadRequestException('You cannot block your own account');
    }
    if (user.role === Role.ADMIN) {
      await this.assertNotLastAdmin(id, 'block');
    }

    const bannedUntil = dto.bannedUntil ? new Date(dto.bannedUntil) : null;
    const reason = dto.reason?.trim() || null;

    if (bannedUntil && bannedUntil <= new Date()) {
      throw new BadRequestException('bannedUntil must be in the future');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { banned: true, banReason: reason, bannedUntil },
      }),
      // Invalidate access immediately - a ban alone would not end live sessions.
      this.prisma.session.deleteMany({ where: { userId: id } }),
      // Verification has no FK to User, so pending OTPs must be cleared by hand.
      this.prisma.verification.deleteMany({
        where: { identifier: user.email },
      }),
    ]);

    return this.findOne(id);
  }

  async unban(id: string): Promise<ManagedUser> {
    await this.findOne(id);

    await this.prisma.user.update({
      where: { id },
      data: { banned: false, banReason: null, bannedUntil: null },
    });
    return this.findOne(id);
  }

  async remove(id: string, requesterId: string) {
    const user = await this.findOne(id);

    if (user.id === requesterId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    if (user.role === Role.ADMIN) {
      await this.assertNotLastAdmin(id, 'delete');
    }

    // Session, Account and QuizAttempt cascade; Quiz.createdById is SetNull.
    return this.prisma.user.delete({ where: { id } });
  }

  private async assertNotLastAdmin(id: string, action: string): Promise<void> {
    const remaining = await this.prisma.user.count({
      where: { role: Role.ADMIN, banned: false, NOT: { id } },
    });
    if (remaining === 0) {
      throw new BadRequestException(
        `You cannot ${action} the last remaining admin`,
      );
    }
  }
}
