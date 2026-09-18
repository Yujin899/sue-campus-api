import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class PresignLectureDto {
  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsIn(['application/pdf'])
  contentType!: string;

  @IsInt()
  @Min(1)
  size!: number;
}
