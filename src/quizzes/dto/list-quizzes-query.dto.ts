import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { QuizStatus } from '../../generated/prisma/enums';

const QUIZ_STATUSES = Object.values(QuizStatus);

export class ListQuizzesQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;

  @IsOptional()
  @IsIn(QUIZ_STATUSES)
  status?: QuizStatus;

  @IsOptional()
  @IsString()
  subjectId?: string;
}
