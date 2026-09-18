import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SubjectsService } from './subjects.service';

describe('SubjectsService', () => {
  let service: SubjectsService;

  const prisma = {
    subject: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubjectsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SubjectsService>(SubjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a subject via Prisma', async () => {
    const dto = { code: 'MATH101', name: 'Calculus I' };
    prisma.subject.create.mockResolvedValue({ id: '1', ...dto });

    const result = await service.create(dto);

    expect(prisma.subject.create).toHaveBeenCalledWith({ data: dto });
    expect(result).toEqual({ id: '1', ...dto });
  });

  it('lists all subjects ordered by name', async () => {
    const subjects = [
      { id: '1', code: 'MATH101', name: 'Algebra' },
      { id: '2', code: 'CS101', name: 'Databases' },
    ];
    prisma.subject.findMany.mockResolvedValue(subjects);

    const result = await service.findAll();

    expect(prisma.subject.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { name: 'asc' },
    });
    expect(result).toEqual(subjects);
  });

  it('filters subjects by name or code when a query is provided', async () => {
    prisma.subject.findMany.mockResolvedValue([]);

    await service.findAll('  math  ');

    expect(prisma.subject.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: 'math', mode: 'insensitive' } },
          { code: { contains: 'math', mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
    });
  });

  it('ignores a blank query', async () => {
    await service.findAll('   ');

    expect(prisma.subject.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { name: 'asc' },
    });
  });

  it('throws NotFoundException when subject is missing', async () => {
    prisma.subject.findUnique.mockResolvedValue(null);

    await expect(service.findOne('42')).rejects.toThrow(
      'Subject #42 not found',
    );
    expect(prisma.subject.findUnique).toHaveBeenCalledWith({
      where: { id: '42' },
    });
  });
});
