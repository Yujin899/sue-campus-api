import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { Role } from '../generated/prisma/enums';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';

describe('QuizzesController', () => {
  let controller: QuizzesController;

  const quizzesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    submit: jest.fn(),
    review: jest.fn(),
    unpublish: jest.fn(),
    listQuestions: jest.fn(),
    addQuestion: jest.fn(),
    updateQuestion: jest.fn(),
    removeQuestion: jest.fn(),
    startAttempt: jest.fn(),
    listMyAttempts: jest.fn(),
    getAttempt: jest.fn(),
    submitAttempt: jest.fn(),
    getMyAttemptsOverview: jest.fn(),
    getStatusStats: jest.fn(),
  };

  const session = {
    user: { id: 'user-1', role: Role.USER },
  } as unknown as UserSession;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuizzesController],
      providers: [{ provide: QuizzesService, useValue: quizzesService }],
    }).compile();

    controller = module.get<QuizzesController>(QuizzesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create forwards the requester from the session', () => {
    const dto = { subjectId: 'sub-1', title: 'T', durationMinutes: 5 };
    quizzesService.create.mockReturnValue('created');

    expect(controller.create(dto, session)).toBe('created');
    expect(quizzesService.create).toHaveBeenCalledWith(dto, {
      id: 'user-1',
      role: Role.USER,
    });
  });

  it('findAll passes the query filters through', () => {
    quizzesService.findAll.mockReturnValue('list');

    expect(controller.findAll(session, { mine: true })).toBe('list');
    expect(quizzesService.findAll).toHaveBeenCalledWith(
      { id: 'user-1', role: Role.USER },
      { mine: true },
    );
  });

  it('review delegates to the service', () => {
    const dto = { action: 'approve' as const };
    quizzesService.review.mockReturnValue('reviewed');

    expect(controller.review('quiz-1', dto, session)).toBe('reviewed');
    expect(quizzesService.review).toHaveBeenCalledWith('quiz-1', dto, {
      id: 'user-1',
      role: Role.USER,
    });
  });

  it('unpublish delegates to the service with the requester', () => {
    quizzesService.unpublish.mockReturnValue('unpublished');

    expect(controller.unpublish('quiz-1', session)).toBe('unpublished');
    expect(quizzesService.unpublish).toHaveBeenCalledWith('quiz-1', {
      id: 'user-1',
      role: Role.USER,
    });
  });

  it('listQuestions delegates to the service', () => {
    quizzesService.listQuestions.mockReturnValue('questions');

    expect(controller.listQuestions('quiz-1', session)).toBe('questions');
    expect(quizzesService.listQuestions).toHaveBeenCalledWith('quiz-1', {
      id: 'user-1',
      role: Role.USER,
    });
  });

  it('startAttempt delegates to the service', () => {
    quizzesService.startAttempt.mockReturnValue('attempt');

    expect(controller.startAttempt('quiz-1', session)).toBe('attempt');
    expect(quizzesService.startAttempt).toHaveBeenCalledWith('quiz-1', {
      id: 'user-1',
      role: Role.USER,
    });
  });

  it('submitAttempt delegates with the attempt id and dto', () => {
    const dto = {
      answers: [{ questionId: 'q1', selectedIndices: [0] }],
    };
    quizzesService.submitAttempt.mockReturnValue('result');

    expect(controller.submitAttempt('quiz-1', 'attempt-1', dto, session)).toBe(
      'result',
    );
    expect(quizzesService.submitAttempt).toHaveBeenCalledWith(
      'quiz-1',
      'attempt-1',
      dto,
      { id: 'user-1', role: Role.USER },
    );
  });

  it('getMyAttemptsOverview scopes to the session user and forwards the limit', () => {
    quizzesService.getMyAttemptsOverview.mockReturnValue('overview');

    expect(controller.getMyAttemptsOverview(session, { limit: 5 })).toBe(
      'overview',
    );
    expect(quizzesService.getMyAttemptsOverview).toHaveBeenCalledWith(
      'user-1',
      5,
    );
  });

  it('getStatusStats delegates to the service', () => {
    quizzesService.getStatusStats.mockReturnValue('stats');

    expect(controller.getStatusStats()).toBe('stats');
    expect(quizzesService.getStatusStats).toHaveBeenCalledWith();
  });
});
