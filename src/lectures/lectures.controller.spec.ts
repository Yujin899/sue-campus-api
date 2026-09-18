import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LecturesController } from './lectures.controller';
import { LecturesService } from './lectures.service';

describe('LecturesController', () => {
  let controller: LecturesController;
  let service: LecturesService;

  const prisma = {
    subject: { findUnique: jest.fn() },
    lecture: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const storage = {
    buildLectureObjectKey: jest.fn(() => 'lectures/subject/key.pdf'),
    signUpload: jest.fn(),
    signDownload: jest.fn(),
    headObject: jest.fn(),
    deleteObject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LecturesController],
      providers: [
        LecturesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: ConfigService, useValue: { get: jest.fn(() => 200) } },
      ],
    }).compile();

    controller = module.get<LecturesController>(LecturesController);
    service = module.get<LecturesService>(LecturesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates presign to the service', async () => {
    const dto = {
      subjectId: 'sub',
      fileName: 'notes.pdf',
      contentType: 'application/pdf',
      size: 1024,
    };
    const presignSpy = jest.spyOn(service, 'presign').mockResolvedValue({
      objectKey: 'k',
      uploadUrl: 'u',
      expiresIn: 300,
    });

    await expect(controller.presign(dto)).resolves.toEqual({
      objectKey: 'k',
      uploadUrl: 'u',
      expiresIn: 300,
    });
    expect(presignSpy).toHaveBeenCalledWith(dto);
  });
});
