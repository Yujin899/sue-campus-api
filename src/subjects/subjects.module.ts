import { Module } from '@nestjs/common';
import { LecturesModule } from '../lectures/lectures.module';
import { SubjectsService } from './subjects.service';
import { SubjectsController } from './subjects.controller';

@Module({
  imports: [LecturesModule],
  controllers: [SubjectsController],
  providers: [SubjectsService],
})
export class SubjectsModule {}
