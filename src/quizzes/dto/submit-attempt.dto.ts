import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AttemptAnswerDto {
  @IsString()
  questionId!: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(0, { each: true })
  selectedIndices!: number[];
}

export class SubmitAttemptDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttemptAnswerDto)
  answers?: AttemptAnswerDto[];
}
