import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

export const PRESIGN_UPLOAD_TTL_SECONDS = 300;
export const PRESIGN_DOWNLOAD_TTL_SECONDS = 3600;

export interface StorageHead {
  exists: boolean;
  size: number;
  contentType: string;
}

export function buildAttachmentDisposition(fileName: string): string {
  const fallback = fileName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    fileName,
  )}`;
}

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('B2_BUCKET');
    const region = config.get<string>('B2_REGION', 'us-east-005');

    this.s3 = new S3Client({
      endpoint: config.getOrThrow<string>('B2_ENDPOINT'),
      region,
      forcePathStyle: true,
      // Presigned PUTs must not embed a payload checksum: the SDK would sign the
      // checksum of an empty body, which the browser upload can never satisfy.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.getOrThrow<string>('B2_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('B2_APPLICATION_KEY'),
      },
    });
  }

  buildLectureObjectKey(subjectId: string): string {
    return `lectures/${subjectId}/${randomUUID().replace(/-/g, '')}.pdf`;
  }

  signUpload(
    objectKey: string,
    input: { contentType: string; size: number },
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: input.contentType,
      ContentLength: input.size,
    });
    return getSignedUrl(this.s3, command, {
      expiresIn: PRESIGN_UPLOAD_TTL_SECONDS,
    });
  }

  signDownload(objectKey: string, fileName?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ...(fileName
        ? { ResponseContentDisposition: buildAttachmentDisposition(fileName) }
        : {}),
    });
    return getSignedUrl(this.s3, command, {
      expiresIn: PRESIGN_DOWNLOAD_TTL_SECONDS,
    });
  }

  async headObject(objectKey: string): Promise<StorageHead> {
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return {
        exists: true,
        size: head.ContentLength ?? 0,
        contentType: head.ContentType ?? '',
      };
    } catch (error: unknown) {
      if ((error as { name?: string }).name === 'NotFound') {
        return { exists: false, size: 0, contentType: '' };
      }
      throw error;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.s3
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }))
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to delete object ${objectKey}: ${String(error)}`,
        );
      });
  }
}
