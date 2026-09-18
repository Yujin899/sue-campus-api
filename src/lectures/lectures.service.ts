import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  StorageService,
  PRESIGN_UPLOAD_TTL_SECONDS,
  PRESIGN_DOWNLOAD_TTL_SECONDS,
} from '../storage/storage.service';
import { PresignLectureDto } from './dto/presign-lecture.dto';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { UpdateLectureDto } from './dto/update-lecture.dto';

@Injectable()
export class LecturesService {
  private readonly maxSizeBytes: number;
  private readonly logger = new Logger(LecturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    const maxMb = Number(config.get('LECTURE_MAX_MB', 200));
    this.maxSizeBytes = maxMb * 1024 * 1024;
  }

  private async ensureSubject(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) {
      throw new NotFoundException(`Subject #${subjectId} not found`);
    }
    return subject;
  }

  private assertWithinLimit(size: number): void {
    if (size > this.maxSizeBytes) {
      const maxMb = Math.floor(this.maxSizeBytes / (1024 * 1024));
      throw new PayloadTooLargeException(`File exceeds the ${maxMb}MB limit`);
    }
  }

  async presign(dto: PresignLectureDto) {
    await this.ensureSubject(dto.subjectId);
    this.assertWithinLimit(dto.size);

    const objectKey = this.storage.buildLectureObjectKey(dto.subjectId);
    const uploadUrl = await this.storage.signUpload(objectKey, {
      contentType: dto.contentType,
      size: dto.size,
    });

    return { objectKey, uploadUrl, expiresIn: PRESIGN_UPLOAD_TTL_SECONDS };
  }

  async create(dto: CreateLectureDto) {
    await this.ensureSubject(dto.subjectId);
    this.assertWithinLimit(dto.size);

    const head = await this.storage.headObject(dto.objectKey);
    if (!head.exists) {
      throw new BadRequestException('The file was not uploaded yet');
    }
    if (head.size !== dto.size) {
      throw new BadRequestException('File size does not match the upload');
    }

    return this.prisma.lecture.create({
      data: {
        subjectId: dto.subjectId,
        title: dto.title,
        fileName: dto.fileName,
        objectKey: dto.objectKey,
        size: dto.size,
        contentType: dto.contentType,
      },
    });
  }

  async findAllBySubject(subjectId: string) {
    await this.ensureSubject(subjectId);
    return this.prisma.lecture.findMany({
      where: { subjectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id } });
    if (!lecture) {
      throw new NotFoundException(`Lecture #${id} not found`);
    }
    return lecture;
  }

  async download(id: string) {
    const lecture = await this.findOne(id);
    const url = await this.storage.signDownload(
      lecture.objectKey,
      lecture.fileName,
    );
    return {
      url,
      fileName: lecture.fileName,
      size: lecture.size,
      contentType: lecture.contentType,
      expiresIn: PRESIGN_DOWNLOAD_TTL_SECONDS,
    };
  }

  async update(id: string, dto: UpdateLectureDto) {
    await this.findOne(id);
    if (dto.subjectId) {
      await this.ensureSubject(dto.subjectId);
    }
    if (dto.size) {
      this.assertWithinLimit(dto.size);
    }
    return this.prisma.lecture.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const lecture = await this.findOne(id);
    await this.storage.deleteObject(lecture.objectKey);
    return this.prisma.lecture.delete({ where: { id } });
  }
}
