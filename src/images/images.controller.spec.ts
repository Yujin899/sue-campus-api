import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';

describe('ImagesController', () => {
  let controller: ImagesController;
  let service: ImagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImagesController],
      providers: [
        ImagesService,
        { provide: ConfigService, useValue: { get: () => 'x' } },
      ],
    }).compile();

    controller = module.get<ImagesController>(ImagesController);
    service = module.get<ImagesService>(ImagesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates avatar presign to the service', () => {
    const presignSpy = jest.spyOn(service, 'presign').mockReturnValue({
      uploadUrl: 'u',
      params: {
        cloudName: 'c',
        apiKey: 'k',
        folder: 'f',
        timestamp: 1,
        signature: 's',
      },
    });

    expect(controller.presignAvatar()).toEqual(
      expect.objectContaining({ uploadUrl: 'u' }),
    );
    expect(presignSpy).toHaveBeenCalledWith('avatar');
  });
});
