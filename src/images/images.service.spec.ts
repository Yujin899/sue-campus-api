import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ImagesService } from './images.service';

describe('ImagesService', () => {
  let service: ImagesService;

  const baseConfig = {
    get: jest.fn(
      (key: string) =>
        ({
          CLOUDINARY_CLOUD_NAME: 'sue-campus',
          CLOUDINARY_API_KEY: 'abc',
          CLOUDINARY_API_SECRET: 'secret',
        })[key],
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImagesService,
        { provide: ConfigService, useValue: baseConfig },
      ],
    }).compile();

    service = module.get<ImagesService>(ImagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws when Cloudinary is not configured', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ImagesService,
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    const unconfigured = module.get<ImagesService>(ImagesService);

    expect(() => unconfigured.presign('avatar')).toThrow('not configured');
  });

  it('returns signed upload params for an avatar', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const result = service.presign('avatar');

    expect(result.uploadUrl).toBe(
      'https://api.cloudinary.com/v1_1/sue-campus/auto/upload',
    );
    expect(result.params).toEqual({
      cloudName: 'sue-campus',
      apiKey: 'abc',
      folder: 'sue-campus/avatars',
      timestamp: 1700000000,
      signature: expect.any(String) as string,
    });
  });

  it('uses the thumbnail folder for subject thumbnails', () => {
    const result = service.presign('subject-thumbnail');
    expect(result.params.folder).toBe('sue-campus/thumbnails');
  });
});
