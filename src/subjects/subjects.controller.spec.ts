import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { LecturesService } from '../lectures/lectures.service';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';

describe('SubjectsController', () => {
  let controller: SubjectsController;
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

  const lecturesService = {
    findAllBySubject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubjectsController],
      providers: [
        SubjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LecturesService, useValue: lecturesService },
      ],
    }).compile();

    controller = module.get<SubjectsController>(SubjectsController);
    service = module.get<SubjectsService>(SubjectsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates create to the service', async () => {
    const dto = { code: 'MATH101', name: 'Calculus I' };
    const createSpy = jest
      .spyOn(service, 'create')
      .mockResolvedValue({ id: '1', ...dto } as never);

    await expect(controller.create(dto)).resolves.toEqual({ id: '1', ...dto });
    expect(createSpy).toHaveBeenCalledWith(dto);
  });

  it('delegates findAll to the service with the query', async () => {
    const findAllSpy = jest
      .spyOn(service, 'findAll')
      .mockResolvedValue([] as never);

    await controller.findAll('math');

    expect(findAllSpy).toHaveBeenCalledWith('math');
  });
});
