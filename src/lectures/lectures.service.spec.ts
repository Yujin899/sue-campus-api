import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LecturesService } from './lectures.service';

describe('LecturesService', () => {
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
      providers: [
        LecturesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: ConfigService, useValue: { get: jest.fn(() => 200) } },
      ],
    }).compile();

    service = module.get<LecturesService>(LecturesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('presign returns a signed upload URL', async () => {
    prisma.subject.findUnique.mockResolvedValue({ id: 'sub' });
    storage.signUpload.mockResolvedValue('https://upload.example/url');

    const dto = {
      subjectId: 'sub',
      fileName: 'notes.pdf',
      contentType: 'application/pdf',
      size: 1024,
    };

    const result = await service.presign(dto);

    expect(result.objectKey).toBe('lectures/subject/key.pdf');
    expect(result.uploadUrl).toBe('https://upload.example/url');
    expect(storage.signUpload).toHaveBeenCalledWith(
      'lectures/subject/key.pdf',
      {
        contentType: 'application/pdf',
        size: 1024,
      },
    );
  });

  it('presign throws NotFoundException for a missing subject', async () => {
    prisma.subject.findUnique.mockResolvedValue(null);

    await expect(
      service.presign({
        subjectId: 'nope',
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        size: 10,
      }),
    ).rejects.toThrow('Subject #nope not found');
  });

  it('presign rejects files over the size limit', async () => {
    prisma.subject.findUnique.mockResolvedValue({ id: 'sub' });

    await expect(
      service.presign({
        subjectId: 'sub',
        fileName: 'big.pdf',
        contentType: 'application/pdf',
        size: 300 * 1024 * 1024,
      }),
    ).rejects.toThrow('200MB limit');
  });

  it('create verifies the upload exists before persisting', async () => {
    prisma.subject.findUnique.mockResolvedValue({ id: 'sub' });
    storage.headObject.mockResolvedValue({
      exists: true,
      size: 42,
      contentType: 'application/pdf',
    });
    prisma.lecture.create.mockResolvedValue({ id: 'lec' });

    const dto = {
      subjectId: 'sub',
      title: 'Intro',
      fileName: 'notes.pdf',
      objectKey: 'lectures/sub/key.pdf',
      size: 42,
      contentType: 'application/pdf',
    };

    const result = await service.create(dto);

    expect(storage.headObject).toHaveBeenCalledWith('lectures/sub/key.pdf');
    expect(prisma.lecture.create).toHaveBeenCalled();
    expect(result).toEqual({ id: 'lec' });
  });

  it('create rejects when the object was never uploaded', async () => {
    prisma.subject.findUnique.mockResolvedValue({ id: 'sub' });
    storage.headObject.mockResolvedValue({
      exists: false,
      size: 0,
      contentType: '',
    });

    await expect(
      service.create({
        subjectId: 'sub',
        title: 'Intro',
        fileName: 'notes.pdf',
        objectKey: 'lectures/sub/key.pdf',
        size: 42,
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow('was not uploaded yet');
  });

  it('remove deletes the object then the row', async () => {
    prisma.lecture.findUnique.mockResolvedValue({
      id: 'lec',
      objectKey: 'lectures/sub/key.pdf',
    });
    prisma.lecture.delete.mockResolvedValue({ id: 'lec' });

    const result = await service.remove('lec');

    expect(storage.deleteObject).toHaveBeenCalledWith('lectures/sub/key.pdf');
    expect(prisma.lecture.delete).toHaveBeenCalledWith({
      where: { id: 'lec' },
    });
    expect(result).toEqual({ id: 'lec' });
  });

  it('download signs the object as an attachment download', async () => {
    prisma.lecture.findUnique.mockResolvedValue({
      id: 'lec',
      objectKey: 'lectures/sub/key.pdf',
      fileName: 'notes.pdf',
      size: 42,
      contentType: 'application/pdf',
    });
    storage.signDownload.mockResolvedValue('https://download.example/url');

    const result = await service.download('lec');

    expect(storage.signDownload).toHaveBeenCalledWith(
      'lectures/sub/key.pdf',
      'notes.pdf',
    );
    expect(result).toEqual({
      url: 'https://download.example/url',
      fileName: 'notes.pdf',
      size: 42,
      contentType: 'application/pdf',
      expiresIn: 3600,
    });
  });
});
