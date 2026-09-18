import { IsIn, IsOptional, IsString } from 'class-validator';

export const QUIZ_REVIEW_ACTIONS = ['approve', 'reject'] as const;
export type QuizReviewAction = (typeof QUIZ_REVIEW_ACTIONS)[number];

export class ReviewQuizDto {
  @IsIn(QUIZ_REVIEW_ACTIONS)
  action!: QuizReviewAction;

  @IsOptional()
  @IsString()
  note?: string;
}
