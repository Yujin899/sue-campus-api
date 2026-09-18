import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { QuestionType } from '../../generated/prisma/enums';

const QUESTION_TYPES = Object.values(QuestionType);

export class CreateQuestionDto {
  @IsOptional()
  @IsIn(QUESTION_TYPES)
  type?: QuestionType;

  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  options?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  correctAnswerIndices!: number[];
}
