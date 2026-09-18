import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { Role } from '../generated/prisma/enums';
import { LecturesService } from '../lectures/lectures.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectsService } from './subjects.service';

@Controller('subjects')
export class SubjectsController {
  constructor(
    private readonly subjectsService: SubjectsService,
    private readonly lecturesService: LecturesService,
  ) {}

  @Post()
  @Roles([Role.ADMIN])
  create(@Body() createSubjectDto: CreateSubjectDto) {
    return this.subjectsService.create(createSubjectDto);
  }

  @Get()
  findAll(@Query('q') q?: string) {
    return this.subjectsService.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subjectsService.findOne(id);
  }

  @Get(':id/lectures')
  findLectures(@Param('id') id: string) {
    return this.lecturesService.findAllBySubject(id);
  }

  @Patch(':id')
  @Roles([Role.ADMIN])
  update(@Param('id') id: string, @Body() updateSubjectDto: UpdateSubjectDto) {
    return this.subjectsService.update(id, updateSubjectDto);
  }

  @Delete(':id')
  @Roles([Role.ADMIN])
  remove(@Param('id') id: string) {
    return this.subjectsService.remove(id);
  }
}
