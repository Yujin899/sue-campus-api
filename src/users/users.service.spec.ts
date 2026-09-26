import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';
import { UsersService, isBanActive } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const prisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    session: {
      deleteMany: jest.fn(),
    },
    verification: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };

  const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    emailVerified: true,
    image: null,
    role: Role.USER,
    banned: false,
    banReason: null,
    bannedUntil: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    _count: { sessions: 1, quizAttempts: 2, authoredQuizzes: 3 },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.update.mockResolvedValue(makeUser());
    prisma.user.delete.mockResolvedValue({ id: 'user-1' });
    prisma.user.count.mockResolvedValue(5);
    prisma.session.deleteMany.mockResolvedValue({ count: 1 });
    prisma.verification.deleteMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns a paginated envelope using the default limit', async () => {
      prisma.user.findMany.mockResolvedValue([makeUser()]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result).toMatchObject({
        total: 1,
        page: 1,
        limit: 20,
        pageCount: 1,
      });
      expect(result.items).toHaveLength(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('computes pageCount and honours the requested page', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(45);

      const result = await service.findAll({ page: 3, limit: 20 });

      expect(result.pageCount).toBe(3);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });

    it('never returns a pageCount below 1', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await expect(service.findAll({})).resolves.toMatchObject({
        pageCount: 1,
      });
    });

    it('searches name and email case-insensitively and trims the query', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({ q: '  ada  ' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'ada', mode: 'insensitive' } },
              { email: { contains: 'ada', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('filters by role and ban status', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({ role: Role.ADMIN, banned: false });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: Role.ADMIN, banned: false },
        }),
      );
    });

    it('reports an expired ban as not banned', async () => {
      prisma.user.findMany.mockResolvedValue([
        makeUser({
          banned: true,
          bannedUntil: new Date('2020-01-01'),
          banReason: 'old',
        }),
      ]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.items[0].banned).toBe(false);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the user is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setRole', () => {
    it('refuses to change your own role', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.setRole('user-1', { role: Role.ADMIN }, 'user-1'),
      ).rejects.toThrow('You cannot change your own role');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses to demote the last remaining admin', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ role: Role.ADMIN }));
      prisma.user.count.mockResolvedValue(0);

      await expect(
        service.setRole('user-1', { role: Role.USER }, 'admin-9'),
      ).rejects.toThrow('You cannot demote the last remaining admin');
    });

    it('promotes a user', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser({ role: Role.ADMIN }));

      await service.setRole('user-1', { role: Role.ADMIN }, 'admin-9');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: Role.ADMIN },
      });
    });

    it('demotes an admin when another admin remains', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ role: Role.ADMIN }));
      prisma.user.count.mockResolvedValue(1);

      await service.setRole('user-1', { role: Role.USER }, 'admin-9');

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { role: Role.ADMIN, banned: false, NOT: { id: 'user-1' } },
      });
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('ban', () => {
    it('refuses to block your own account', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(service.ban('user-1', {}, 'user-1')).rejects.toThrow(
        'You cannot block your own account',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to block the last remaining admin', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ role: Role.ADMIN }));
      prisma.user.count.mockResolvedValue(0);

      await expect(service.ban('user-1', {}, 'admin-9')).rejects.toThrow(
        'You cannot block the last remaining admin',
      );
    });

    it('rejects a bannedUntil in the past', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.ban(
          'user-1',
          { bannedUntil: '2020-01-01T00:00:00.000Z' },
          'admin-9',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks permanently, revokes sessions and clears pending OTPs', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await service.ban('user-1', { reason: '  spam  ' }, 'admin-9');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { banned: true, banReason: 'spam', bannedUntil: null },
      });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.verification.deleteMany).toHaveBeenCalledWith({
        where: { identifier: 'ada@example.com' },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('stores a temporary block expiry', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await service.ban(
        'user-1',
        { bannedUntil: '2999-01-01T00:00:00.000Z' },
        'admin-9',
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          banned: true,
          banReason: null,
          bannedUntil: new Date('2999-01-01T00:00:00.000Z'),
        },
      });
    });
  });

  describe('unban', () => {
    it('clears every ban field', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ banned: true, banReason: 'spam' }),
      );

      await service.unban('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { banned: false, banReason: null, bannedUntil: null },
      });
    });
  });

  describe('remove', () => {
    it('refuses to delete your own account', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(service.remove('user-1', 'user-1')).rejects.toThrow(
        'You cannot delete your own account',
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete the last remaining admin', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ role: Role.ADMIN }));
      prisma.user.count.mockResolvedValue(0);

      await expect(service.remove('user-1', 'admin-9')).rejects.toThrow(
        'You cannot delete the last remaining admin',
      );
    });

    it('deletes the user', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await service.remove('user-1', 'admin-9');

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });
  });
});

describe('isBanActive', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('is false when the user is not banned', () => {
    expect(isBanActive({ banned: false, bannedUntil: null }, now)).toBe(false);
  });

  it('is true for a permanent ban', () => {
    expect(isBanActive({ banned: true, bannedUntil: null }, now)).toBe(true);
  });

  it('is true while a temporary ban has not expired', () => {
    expect(
      isBanActive({ banned: true, bannedUntil: new Date('2026-07-01') }, now),
    ).toBe(true);
  });

  it('is false once a temporary ban has expired', () => {
    expect(
      isBanActive({ banned: true, bannedUntil: new Date('2026-05-01') }, now),
    ).toBe(false);
  });
});
