import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttemptStatus,
  QuestionType,
  QuizStatus,
  Role,
} from '../generated/prisma/enums';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { ReviewQuizDto } from './dto/review-quiz.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

export interface Requester {
  id: string;
  role: Role;
}

const EDITABLE_STATUSES: QuizStatus[] = [QuizStatus.DRAFT, QuizStatus.REJECTED];

@Injectable()
export class QuizzesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureSubject(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!subject) {
      throw new NotFoundException(`Subject #${subjectId} not found`);
    }
    return subject;
  }

  private async findQuizOrFail(id: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz) {
      throw new NotFoundException(`Quiz #${id} not found`);
    }
    return quiz;
  }

  private isAuthorOrAdmin(
    quiz: { createdById: string },
    requester: Requester,
  ): boolean {
    return quiz.createdById === requester.id || requester.role === Role.ADMIN;
  }

  private assertCanView(
    quiz: { status: QuizStatus; createdById: string },
    requester: Requester,
  ): void {
    if (quiz.status === QuizStatus.PUBLISHED) {
      return;
    }
    if (this.isAuthorOrAdmin(quiz, requester)) {
      return;
    }
    throw new NotFoundException('Quiz not found');
  }

  private assertAuthorOrAdmin(
    quiz: { createdById: string },
    requester: Requester,
  ): void {
    if (!this.isAuthorOrAdmin(quiz, requester)) {
      throw new ForbiddenException('You do not own this quiz');
    }
  }

  private assertEditable(quiz: { status: QuizStatus }): void {
    if (!EDITABLE_STATUSES.includes(quiz.status)) {
      throw new BadRequestException(
        'Only draft or rejected quizzes can be edited',
      );
    }
  }

  private validateQuestionShape(
    type: QuestionType,
    prompt: string,
    options: string[],
    correctAnswerIndices: number[],
  ): string[] {
    if (!prompt || !prompt.trim()) {
      throw new BadRequestException('Question prompt is required');
    }
    if (!Array.isArray(options) || options.length < 2) {
      throw new BadRequestException('A question needs at least 2 options');
    }
    const normalized = options.map((option) => option.trim());
    if (normalized.some((option) => !option)) {
      throw new BadRequestException('Options cannot be empty');
    }
    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException('Options must be unique');
    }
    if (
      !Array.isArray(correctAnswerIndices) ||
      correctAnswerIndices.length === 0
    ) {
      throw new BadRequestException('At least one correct answer is required');
    }
    if (new Set(correctAnswerIndices).size !== correctAnswerIndices.length) {
      throw new BadRequestException('Correct answers must be unique');
    }
    const invalid = correctAnswerIndices.some(
      (index) =>
        !Number.isInteger(index) || index < 0 || index >= normalized.length,
    );
    if (invalid) {
      throw new BadRequestException(
        `correctAnswerIndices must be between 0 and ${normalized.length - 1}`,
      );
    }
    if (
      type !== QuestionType.MULTI_SELECT &&
      correctAnswerIndices.length !== 1
    ) {
      throw new BadRequestException(
        'This question type requires exactly one correct answer',
      );
    }
    return normalized;
  }

  private resolveQuestionInput(dto: {
    type?: QuestionType;
    prompt: string;
    options?: string[];
    correctAnswerIndices: number[];
  }) {
    const type = dto.type ?? QuestionType.MULTIPLE_CHOICE;
    const options =
      dto.options ??
      (type === QuestionType.TRUE_FALSE ? ['True', 'False'] : undefined);
    if (!options) {
      throw new BadRequestException('Options are required');
    }
    const normalized = this.validateQuestionShape(
      type,
      dto.prompt,
      options,
      dto.correctAnswerIndices,
    );
    return { type, options: normalized };
  }

  private sanitizeQuestion<T extends { correctAnswerIndices: number[] }>(
    question: T,
  ): Record<string, unknown> {
    const clone: Record<string, unknown> = { ...question };
    delete clone.correctAnswerIndices;
    return clone;
  }

  async create(dto: CreateQuizDto, requester: Requester) {
    await this.ensureSubject(dto.subjectId);
    return this.prisma.quiz.create({
      data: {
        subjectId: dto.subjectId,
        title: dto.title,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        createdById: requester.id,
      },
    });
  }

  async findAll(
    requester: Requester,
    filters: { mine?: boolean; status?: QuizStatus; subjectId?: string } = {},
  ) {
    const { mine = false, status, subjectId } = filters;

    if (
      status &&
      status !== QuizStatus.PUBLISHED &&
      !mine &&
      requester.role !== Role.ADMIN
    ) {
      throw new ForbiddenException('You cannot list quizzes with that status');
    }

    const where: {
      subjectId?: string;
      createdById?: string;
      status?: QuizStatus;
    } = {};

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (mine) {
      where.createdById = requester.id;
      if (status) {
        where.status = status;
      }
    } else if (requester.role === Role.ADMIN && status) {
      where.status = status;
    } else {
      where.status = QuizStatus.PUBLISHED;
    }

    return this.prisma.quiz.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        subject: { select: { id: true, code: true, name: true } },
        _count: { select: { questions: true } },
      },
    });
  }

  async findOne(id: string, requester: Requester) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, code: true, name: true } },
        _count: { select: { questions: true } },
      },
    });
    if (!quiz) {
      throw new NotFoundException(`Quiz #${id} not found`);
    }
    this.assertCanView(quiz, requester);
    return quiz;
  }

  async update(id: string, dto: UpdateQuizDto, requester: Requester) {
    const quiz = await this.findQuizOrFail(id);
    this.assertAuthorOrAdmin(quiz, requester);
    this.assertEditable(quiz);
    if (dto.subjectId) {
      await this.ensureSubject(dto.subjectId);
    }
    return this.prisma.quiz.update({ where: { id }, data: dto });
  }

  async remove(id: string, requester: Requester) {
    const quiz = await this.findQuizOrFail(id);
    this.assertAuthorOrAdmin(quiz, requester);
    if (requester.role !== Role.ADMIN) {
      this.assertEditable(quiz);
    }
    return this.prisma.quiz.delete({ where: { id } });
  }

  async submit(id: string, requester: Requester) {
    const quiz = await this.findQuizOrFail(id);
    this.assertAuthorOrAdmin(quiz, requester);
    this.assertEditable(quiz);

    const questions = await this.prisma.question.findMany({
      where: { quizId: id },
      orderBy: { order: 'asc' },
    });
    if (questions.length === 0) {
      throw new BadRequestException(
        'Add at least one question before submitting',
      );
    }
    questions.forEach((question, index) => {
      try {
        this.validateQuestionShape(
          question.type,
          question.prompt,
          question.options,
          question.correctAnswerIndices,
        );
      } catch {
        throw new BadRequestException(
          `Question ${index + 1} is incomplete or invalid`,
        );
      }
    });

    return this.prisma.quiz.update({
      where: { id },
      data: {
        status: QuizStatus.PENDING_REVIEW,
        reviewNote: null,
        reviewedById: null,
        reviewedAt: null,
      },
    });
  }

  async review(id: string, dto: ReviewQuizDto, requester: Requester) {
    const quiz = await this.findQuizOrFail(id);
    if (quiz.status !== QuizStatus.PENDING_REVIEW) {
      throw new BadRequestException('Quiz is not awaiting review');
    }
    const approved = dto.action === 'approve';
    return this.prisma.quiz.update({
      where: { id },
      data: {
        status: approved ? QuizStatus.PUBLISHED : QuizStatus.REJECTED,
        reviewNote: approved ? null : (dto.note ?? null),
        reviewedById: requester.id,
        reviewedAt: new Date(),
      },
    });
  }

  async unpublish(id: string, requester: Requester) {
    const quiz = await this.findQuizOrFail(id);
    this.assertAuthorOrAdmin(quiz, requester);
    if (quiz.status !== QuizStatus.PUBLISHED) {
      throw new BadRequestException(
        'Only published quizzes can be unpublished',
      );
    }
    return this.prisma.quiz.update({
      where: { id },
      data: { status: QuizStatus.DRAFT },
    });
  }

  async listQuestions(quizId: string, requester: Requester) {
    const quiz = await this.findQuizOrFail(quizId);
    this.assertCanView(quiz, requester);
    const questions = await this.prisma.question.findMany({
      where: { quizId },
      orderBy: { order: 'asc' },
    });
    if (this.isAuthorOrAdmin(quiz, requester)) {
      return questions;
    }
    return questions.map((question) => this.sanitizeQuestion(question));
  }

  private normalizeSelectedIndices(
    indices: number[],
    optionCount: number,
  ): number[] {
    const unique = new Set(
      indices.filter(
        (index) => Number.isInteger(index) && index >= 0 && index < optionCount,
      ),
    );
    return Array.from(unique).sort((a, b) => a - b);
  }

  private remainingSeconds(startedAt: Date, durationMinutes: number): number {
    const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    return Math.max(0, durationMinutes * 60 - elapsed);
  }

  private summarizeAttempt(attempt: {
    id: string;
    quizId: string;
    status: AttemptStatus;
    score: number | null;
    total: number | null;
    startedAt: Date;
    submittedAt: Date | null;
  }) {
    return {
      id: attempt.id,
      quizId: attempt.quizId,
      status: attempt.status,
      score: attempt.score,
      total: attempt.total,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
    };
  }

  private buildAttemptResult(
    attempt: Parameters<QuizzesService['summarizeAttempt']>[0],
    questions: Array<{
      id: string;
      type: QuestionType;
      prompt: string;
      options: string[];
      correctAnswerIndices: number[];
    }>,
    answers: Array<{
      questionId: string;
      selectedIndices: number[];
      isCorrect: boolean | null;
    }>,
  ) {
    const byQuestion = new Map(
      answers.map((answer) => [answer.questionId, answer]),
    );
    const results = questions.map((question) => {
      const answer = byQuestion.get(question.id);
      return {
        questionId: question.id,
        type: question.type,
        prompt: question.prompt,
        options: question.options,
        selectedIndices: answer?.selectedIndices ?? [],
        correctAnswerIndices: question.correctAnswerIndices,
        isCorrect: answer?.isCorrect ?? false,
      };
    });
    return {
      attempt: this.summarizeAttempt(attempt),
      score: attempt.score ?? 0,
      total: attempt.total ?? questions.length,
      results,
    };
  }

  async startAttempt(quizId: string, requester: Requester) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!quiz) {
      throw new NotFoundException(`Quiz #${quizId} not found`);
    }
    this.assertCanView(quiz, requester);
    if (quiz.questions.length === 0) {
      throw new BadRequestException('This quiz has no questions yet');
    }

    const existing = await this.prisma.quizAttempt.findFirst({
      where: {
        quizId,
        userId: requester.id,
        status: AttemptStatus.IN_PROGRESS,
      },
      orderBy: { startedAt: 'desc' },
    });
    const attempt =
      existing ??
      (await this.prisma.quizAttempt.create({
        data: { quizId, userId: requester.id },
      }));
    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId: attempt.id },
    });

    return {
      attempt: this.summarizeAttempt(attempt),
      remainingSeconds: this.remainingSeconds(
        attempt.startedAt,
        quiz.durationMinutes,
      ),
      questions: quiz.questions.map((question) =>
        this.sanitizeQuestion(question),
      ),
      answers: answers.map((answer) => ({
        questionId: answer.questionId,
        selectedIndices: answer.selectedIndices,
      })),
    };
  }

  async listMyAttempts(quizId: string, requester: Requester) {
    const quiz = await this.findQuizOrFail(quizId);
    this.assertCanView(quiz, requester);
    return this.prisma.quizAttempt.findMany({
      where: { quizId, userId: requester.id },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        status: true,
        score: true,
        total: true,
        startedAt: true,
        submittedAt: true,
      },
    });
  }

  async getAttempt(quizId: string, attemptId: string, requester: Requester) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: { include: { questions: { orderBy: { order: 'asc' } } } },
      },
    });
    if (!attempt || attempt.quizId !== quizId) {
      throw new NotFoundException(`Attempt #${attemptId} not found`);
    }
    if (attempt.userId !== requester.id && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('You cannot view this attempt');
    }

    const questions = attempt.quiz.questions;
    const answers = await this.prisma.attemptAnswer.findMany({
      where: { attemptId },
    });

    if (attempt.status === AttemptStatus.SUBMITTED) {
      return this.buildAttemptResult(attempt, questions, answers);
    }

    return {
      attempt: this.summarizeAttempt(attempt),
      remainingSeconds: this.remainingSeconds(
        attempt.startedAt,
        attempt.quiz.durationMinutes,
      ),
      questions: questions.map((question) => this.sanitizeQuestion(question)),
      answers: answers.map((answer) => ({
        questionId: answer.questionId,
        selectedIndices: answer.selectedIndices,
      })),
    };
  }

  async submitAttempt(
    quizId: string,
    attemptId: string,
    dto: SubmitAttemptDto,
    requester: Requester,
  ) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: {
        quiz: { include: { questions: { orderBy: { order: 'asc' } } } },
      },
    });
    if (!attempt || attempt.quizId !== quizId) {
      throw new NotFoundException(`Attempt #${attemptId} not found`);
    }
    if (attempt.userId !== requester.id) {
      throw new ForbiddenException('You can only submit your own attempt');
    }

    const questions = attempt.quiz.questions;

    if (attempt.status === AttemptStatus.SUBMITTED) {
      const stored = await this.prisma.attemptAnswer.findMany({
        where: { attemptId },
      });
      return this.buildAttemptResult(attempt, questions, stored);
    }

    const provided = new Map<string, number[]>();
    for (const answer of dto.answers ?? []) {
      provided.set(answer.questionId, answer.selectedIndices);
    }

    const graded = questions.map((question) => {
      const selected = this.normalizeSelectedIndices(
        provided.get(question.id) ?? [],
        question.options.length,
      );
      const correct = this.normalizeSelectedIndices(
        question.correctAnswerIndices,
        question.options.length,
      );
      const isCorrect =
        selected.length === correct.length &&
        selected.every((value, index) => value === correct[index]);
      return { question, selected, isCorrect };
    });
    const score = graded.filter((entry) => entry.isCorrect).length;
    const submittedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.attemptAnswer.deleteMany({ where: { attemptId } }),
      this.prisma.attemptAnswer.createMany({
        data: graded.map((entry) => ({
          attemptId,
          questionId: entry.question.id,
          selectedIndices: entry.selected,
          isCorrect: entry.isCorrect,
        })),
      }),
      this.prisma.quizAttempt.update({
        where: { id: attemptId },
        data: {
          status: AttemptStatus.SUBMITTED,
          score,
          total: questions.length,
          submittedAt,
        },
      }),
    ]);

    return this.buildAttemptResult(
      {
        ...attempt,
        status: AttemptStatus.SUBMITTED,
        score,
        total: questions.length,
        submittedAt,
      },
      questions,
      graded.map((entry) => ({
        questionId: entry.question.id,
        selectedIndices: entry.selected,
        isCorrect: entry.isCorrect,
      })),
    );
  }

  async getMyAttemptsOverview(userId: string, limit = 20) {
    const [submitted, inProgress] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: { userId, status: AttemptStatus.SUBMITTED },
        orderBy: { submittedAt: 'desc' },
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              subject: { select: { id: true, code: true, name: true } },
            },
          },
        },
      }),
      this.prisma.quizAttempt.findFirst({
        where: { userId, status: AttemptStatus.IN_PROGRESS },
        orderBy: { startedAt: 'desc' },
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
              durationMinutes: true,
              subject: { select: { id: true, code: true, name: true } },
            },
          },
        },
      }),
    ]);

    const toPercentage = (score: number | null, total: number | null) =>
      total && total > 0 ? Math.round(((score ?? 0) / total) * 100) : 0;

    const percentages = submitted
      .filter((attempt) => (attempt.total ?? 0) > 0)
      .map((attempt) => toPercentage(attempt.score, attempt.total));
    const averagePercentage = percentages.length
      ? Math.round(
          percentages.reduce((sum, value) => sum + value, 0) /
            percentages.length,
        )
      : null;

    const recent = submitted.slice(0, limit).map((attempt) => ({
      id: attempt.id,
      quizId: attempt.quizId,
      quizTitle: attempt.quiz.title,
      subjectId: attempt.quiz.subject?.id ?? null,
      subjectCode: attempt.quiz.subject?.code ?? null,
      subjectName: attempt.quiz.subject?.name ?? null,
      score: attempt.score ?? 0,
      total: attempt.total ?? 0,
      percentage: toPercentage(attempt.score, attempt.total),
      submittedAt: attempt.submittedAt,
    }));

    const subjectMap = new Map<
      string,
      { id: string; code: string; name: string; sum: number; count: number }
    >();
    for (const attempt of submitted) {
      const subject = attempt.quiz.subject;
      if (!subject || (attempt.total ?? 0) <= 0) {
        continue;
      }
      const entry = subjectMap.get(subject.id) ?? {
        id: subject.id,
        code: subject.code,
        name: subject.name,
        sum: 0,
        count: 0,
      };
      entry.sum += toPercentage(attempt.score, attempt.total);
      entry.count += 1;
      subjectMap.set(subject.id, entry);
    }
    const bySubject = Array.from(subjectMap.values())
      .map(({ id, code, name, sum, count }) => ({
        id,
        code,
        name,
        attempts: count,
        averagePercentage: Math.round(sum / count),
      }))
      .sort((a, b) => b.attempts - a.attempts);

    return {
      stats: {
        attempts: submitted.length,
        quizzesTaken: new Set(submitted.map((attempt) => attempt.quizId)).size,
        averagePercentage,
        bestPercentage: percentages.length ? Math.max(...percentages) : null,
      },
      inProgress: inProgress
        ? {
            attemptId: inProgress.id,
            quizId: inProgress.quizId,
            quizTitle: inProgress.quiz.title,
            subjectCode: inProgress.quiz.subject?.code ?? null,
            subjectName: inProgress.quiz.subject?.name ?? null,
            startedAt: inProgress.startedAt,
            remainingSeconds: this.remainingSeconds(
              inProgress.startedAt,
              inProgress.quiz.durationMinutes,
            ),
          }
        : null,
      recent,
      bySubject,
    };
  }

  async getStatusStats() {
    const grouped = await this.prisma.quiz.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const byStatus = {
      [QuizStatus.DRAFT]: 0,
      [QuizStatus.PENDING_REVIEW]: 0,
      [QuizStatus.PUBLISHED]: 0,
      [QuizStatus.REJECTED]: 0,
    };
    for (const entry of grouped) {
      byStatus[entry.status] = entry._count._all;
    }

    return {
      total: grouped.reduce((sum, entry) => sum + entry._count._all, 0),
      byStatus,
    };
  }

  private async findQuestionOrFail(quizId: string, questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question || question.quizId !== quizId) {
      throw new NotFoundException(`Question #${questionId} not found`);
    }
    return question;
  }

  async addQuestion(
    quizId: string,
    dto: CreateQuestionDto,
    requester: Requester,
  ) {
    const quiz = await this.findQuizOrFail(quizId);
    this.assertAuthorOrAdmin(quiz, requester);
    this.assertEditable(quiz);

    const { type, options } = this.resolveQuestionInput(dto);
    const last = await this.prisma.question.findFirst({
      where: { quizId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    return this.prisma.question.create({
      data: {
        quizId,
        type,
        prompt: dto.prompt.trim(),
        options,
        correctAnswerIndices: dto.correctAnswerIndices,
        order: (last?.order ?? 0) + 1,
      },
    });
  }

  async updateQuestion(
    quizId: string,
    questionId: string,
    dto: UpdateQuestionDto,
    requester: Requester,
  ) {
    const quiz = await this.findQuizOrFail(quizId);
    this.assertAuthorOrAdmin(quiz, requester);
    this.assertEditable(quiz);
    const question = await this.findQuestionOrFail(quizId, questionId);

    const { type, options } = this.resolveQuestionInput({
      type: dto.type ?? question.type,
      prompt: dto.prompt ?? question.prompt,
      options: dto.options ?? question.options,
      correctAnswerIndices:
        dto.correctAnswerIndices ?? question.correctAnswerIndices,
    });

    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        type,
        prompt: (dto.prompt ?? question.prompt).trim(),
        options,
        correctAnswerIndices:
          dto.correctAnswerIndices ?? question.correctAnswerIndices,
      },
    });
  }

  async removeQuestion(
    quizId: string,
    questionId: string,
    requester: Requester,
  ) {
    const quiz = await this.findQuizOrFail(quizId);
    this.assertAuthorOrAdmin(quiz, requester);
    this.assertEditable(quiz);
    await this.findQuestionOrFail(quizId, questionId);
    return this.prisma.question.delete({ where: { id: questionId } });
  }
}
