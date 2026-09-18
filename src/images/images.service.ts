import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export type ImagePurpose = 'avatar' | 'subject-thumbnail';

const FOLDERS: Record<ImagePurpose, string> = {
  avatar: 'sue-campus/avatars',
  'subject-thumbnail': 'sue-campus/thumbnails',
};

@Injectable()
export class ImagesService {
  private readonly cloudName: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
    this.apiKey = config.get<string>('CLOUDINARY_API_KEY');
    this.apiSecret = config.get<string>('CLOUDINARY_API_SECRET');
  }

  private assertConfigured() {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new ServiceUnavailableException('Cloudinary is not configured');
    }
  }

  presign(purpose: ImagePurpose) {
    this.assertConfigured();

    const folder = FOLDERS[purpose];
    const timestamp = Math.round(Date.now() / 1000);
    const params: Record<string, string | number> = { folder, timestamp };

    const signature = createHash('sha1')
      .update(serializeParams(params) + this.apiSecret)
      .digest('hex');

    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`,
      params: {
        cloudName: this.cloudName,
        apiKey: this.apiKey,
        folder,
        timestamp,
        signature,
      },
    };
  }
}

function serializeParams(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('&');
}
