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
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { Role } from '../generated/prisma/enums';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { ListQuizzesQueryDto } from './dto/list-quizzes-query.dto';
import { MyAttemptsQueryDto } from './dto/my-attempts-query.dto';
import { ReviewQuizDto } from './dto/review-quiz.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { QuizzesService, Requester } from './quizzes.service';

@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  private toRequester(session: UserSession): Requester {
    return {
      id: session.user.id,
      role: (session.user as { role?: Role }).role ?? Role.USER,
    };
  }

  @Post()
  create(@Body() dto: CreateQuizDto, @Session() session: UserSession) {
    return this.quizzesService.create(dto, this.toRequester(session));
  }

  @Get()
  findAll(
    @Session() session: UserSession,
    @Query() query: ListQuizzesQueryDto,
  ) {
    return this.quizzesService.findAll(this.toRequester(session), query);
  }

  @Get('attempts/mine')
  getMyAttemptsOverview(
    @Session() session: UserSession,
    @Query() query: MyAttemptsQueryDto,
  ) {
    return this.quizzesService.getMyAttemptsOverview(
      session.user.id,
      query.limit,
    );
  }

  @Get('stats')
  @Roles([Role.ADMIN])
  getStatusStats() {
    return this.quizzesService.getStatusStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Session() session: UserSession) {
    return this.quizzesService.findOne(id, this.toRequester(session));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuizDto,
    @Session() session: UserSession,
  ) {
    return this.quizzesService.update(id, dto, this.toRequester(session));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Session() session: UserSession) {
    return this.quizzesService.remove(id, this.toRequester(session));
  }

  @Post(':id/attempts')
  startAttempt(@Param('id') id: string, @Session() session: UserSession) {
    return this.quizzesService.startAttempt(id, this.toRequester(session));
  }

  @Get(':id/attempts/mine')
  listMyAttempts(@Param('id') id: string, @Session() session: UserSession) {
    return this.quizzesService.listMyAttempts(id, this.toRequester(session));
  }

  @Get(':id/attempts/:attemptId')
  getAttempt(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @Session() session: UserSession,
  ) {
    return this.quizzesService.getAttempt(
      id,
      attemptId,
      this.toRequester(session),
    );
  }

  @Post(':id/attempts/:attemptId/submit')
  submitAttempt(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitAttemptDto,
    @Session() session: UserSession,
  ) {
    return this.quizzesService.submitAttempt(
      id,
      attemptId,
      dto,
      this.toRequester(session),
    );
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @Session() session: UserSession) {
    return this.quizzesService.submit(id, this.toRequester(session));
  }

  @Post(':id/review')
  @Roles([Role.ADMIN])
  review(
    @Param('id') id: string,
    @Body() dto: ReviewQuizDto,
    @Session() session: UserSession,
  ) {
    return this.quizzesService.review(id, dto, this.toRequester(session));
  }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @Session() session: UserSession) {
    return this.quizzesService.unpublish(id, this.toRequester(session));
  }

  @Get(':id/questions')
  listQuestions(@Param('id') id: string, @Session() session: UserSession) {
    return this.quizzesService.listQuestions(id, this.toRequester(session));
  }

  @Post(':id/questions')
  addQuestion(
    @Param('id') id: string,
    @Body() dto: CreateQuestionDto,
    @Session() session: UserSession,
  ) {
    return this.quizzesService.addQuestion(id, dto, this.toRequester(session));
  }

  @Patch(':id/questions/:questionId')
  updateQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
    @Session() session: UserSession,
  ) {
    return this.quizzesService.updateQuestion(
      id,
      questionId,
      dto,
      this.toRequester(session),
    );
  }

  @Delete(':id/questions/:questionId')
  removeQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Session() session: UserSession,
  ) {
    return this.quizzesService.removeQuestion(
      id,
      questionId,
      this.toRequester(session),
    );
  }
}
