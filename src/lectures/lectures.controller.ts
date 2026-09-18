import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { Role } from '../generated/prisma/enums';
import { CreateLectureDto } from './dto/create-lecture.dto';
import { PresignLectureDto } from './dto/presign-lecture.dto';
import { UpdateLectureDto } from './dto/update-lecture.dto';
import { LecturesService } from './lectures.service';

@Controller('lectures')
export class LecturesController {
  constructor(private readonly lecturesService: LecturesService) {}

  @Post('presign')
  @Roles([Role.ADMIN])
  presign(@Body() presignLectureDto: PresignLectureDto) {
    return this.lecturesService.presign(presignLectureDto);
  }

  @Post()
  @Roles([Role.ADMIN])
  create(@Body() createLectureDto: CreateLectureDto) {
    return this.lecturesService.create(createLectureDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.lecturesService.findOne(id);
  }

  @Get(':id/download')
  download(@Param('id') id: string) {
    return this.lecturesService.download(id);
  }

  @Patch(':id')
  @Roles([Role.ADMIN])
  update(@Param('id') id: string, @Body() updateLectureDto: UpdateLectureDto) {
    return this.lecturesService.update(id, updateLectureDto);
  }

  @Delete(':id')
  @Roles([Role.ADMIN])
  remove(@Param('id') id: string) {
    return this.lecturesService.remove(id);
  }
}
