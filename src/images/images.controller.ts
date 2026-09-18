import { Controller, Post } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { Role } from '../generated/prisma/enums';
import { ImagesService } from './images.service';

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('presign/avatar')
  presignAvatar() {
    return this.imagesService.presign('avatar');
  }

  @Post('presign/subject-thumbnail')
  @Roles([Role.ADMIN])
  presignSubjectThumbnail() {
    return this.imagesService.presign('subject-thumbnail');
  }
}
