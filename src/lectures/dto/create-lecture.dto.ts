import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateLectureDto {
  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  objectKey!: string;

  @IsInt()
  @Min(1)
  size!: number;

  @IsIn(['application/pdf'])
  contentType!: string;
}
