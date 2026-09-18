import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttemptStatus,
  QuizStatus,
  QuestionType,
  Role,
} from '../generated/prisma/enums';
import { QuizzesService, Requester } from './quizzes.service';

describe('QuizzesService', () => {
  let service: QuizzesService;

  const prisma = {
    subject: { findUnique: jest.fn() },
    quiz: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
    },
    question: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    quizAttempt: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    attemptAnswer: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };

  const author: Requester = { id: 'author-1', role: Role.USER };
  const admin: Requester = { id: 'admin-1', role: Role.ADMIN };
  const student: Requester = { id: 'student-1', role: Role.USER };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuizzesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<QuizzesService>(QuizzesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll shows only published quizzes to regular users by default', async () => {
    prisma.quiz.findMany.mockResolvedValue([]);

    await service.findAll(student);

    expect(prisma.quiz.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: QuizStatus.PUBLISHED },
      }),
    );
  });

  it('findAll scopes to the requester when mine is set', async () => {
    prisma.quiz.findMany.mockResolvedValue([]);

    await service.findAll(author, { mine: true, status: QuizStatus.REJECTED });

    expect(prisma.quiz.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdById: 'author-1', status: QuizStatus.REJECTED },
      }),
    );
  });

  it('findAll lets admins filter by status', async () => {
    prisma.quiz.findMany.mockResolvedValue([]);

    await service.findAll(admin, { status: QuizStatus.PENDING_REVIEW });

    expect(prisma.quiz.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: QuizStatus.PENDING_REVIEW },
      }),
    );
  });

  it('findAll filters by subject', async () => {
    prisma.quiz.findMany.mockResolvedValue([]);

    await service.findAll(student, { subjectId: 'sub-1' });

    expect(prisma.quiz.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subjectId: 'sub-1', status: QuizStatus.PUBLISHED },
      }),
    );
  });

  it('findAll rejects non-admin status filters', async () => {
    await expect(
      service.findAll(student, { status: QuizStatus.PENDING_REVIEW }),
    ).rejects.toThrow('You cannot list quizzes with that status');
  });

  it('create stores a draft quiz owned by the requester', async () => {
    prisma.subject.findUnique.mockResolvedValue({ id: 'sub-1' });
    prisma.quiz.create.mockResolvedValue({ id: 'quiz-1' });

    const result = await service.create(
      {
        subjectId: 'sub-1',
        title: 'Algebra basics',
        durationMinutes: 10,
      },
      author,
    );

    expect(prisma.quiz.create).toHaveBeenCalledWith({
      data: {
        subjectId: 'sub-1',
        title: 'Algebra basics',
        description: undefined,
        durationMinutes: 10,
        createdById: 'author-1',
      },
    });
    expect(result).toEqual({ id: 'quiz-1' });
  });

  it('submit rejects a quiz without questions', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });
    prisma.question.findMany.mockResolvedValue([]);

    await expect(service.submit('quiz-1', author)).rejects.toThrow(
      'Add at least one question',
    );
  });

  it('submit rejects an incomplete question', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });
    prisma.question.findMany.mockResolvedValue([
      {
        type: QuestionType.MULTIPLE_CHOICE,
        prompt: 'Pick one',
        options: ['a'],
        correctAnswerIndices: [0],
      },
    ]);

    await expect(service.submit('quiz-1', author)).rejects.toThrow(
      'Question 1 is incomplete',
    );
  });

  it('submit moves a valid quiz to pending review', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });
    prisma.question.findMany.mockResolvedValue([
      {
        type: QuestionType.MULTIPLE_CHOICE,
        prompt: 'Pick one',
        options: ['a', 'b'],
        correctAnswerIndices: [1],
      },
    ]);
    prisma.quiz.update.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.PENDING_REVIEW,
    });

    const result = await service.submit('quiz-1', author);

    expect(prisma.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: {
        status: QuizStatus.PENDING_REVIEW,
        reviewNote: null,
        reviewedById: null,
        reviewedAt: null,
      },
    });
    expect(result.status).toBe(QuizStatus.PENDING_REVIEW);
  });

  it('submit refuses to resubmit a published quiz', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.PUBLISHED,
      createdById: 'author-1',
    });

    await expect(service.submit('quiz-1', author)).rejects.toThrow(
      'Only draft or rejected quizzes can be edited',
    );
  });

  it('review approves a quiz and records the reviewer', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.PENDING_REVIEW,
      createdById: 'author-1',
    });
    prisma.quiz.update.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.PUBLISHED,
    });

    await service.review('quiz-1', { action: 'approve' }, admin);

    expect(prisma.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: {
        status: QuizStatus.PUBLISHED,
        reviewNote: null,
        reviewedById: 'admin-1',
        reviewedAt: expect.any(Date) as Date,
      },
    });
  });

  it('review rejects a quiz with a note', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.PENDING_REVIEW,
      createdById: 'author-1',
    });
    prisma.quiz.update.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.REJECTED,
    });

    await service.review(
      'quiz-1',
      { action: 'reject', note: 'Fix question 2' },
      admin,
    );

    expect(prisma.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: {
        status: QuizStatus.REJECTED,
        reviewNote: 'Fix question 2',
        reviewedById: 'admin-1',
        reviewedAt: expect.any(Date) as Date,
      },
    });
  });

  it('review refuses a quiz that is not awaiting review', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });

    await expect(
      service.review('quiz-1', { action: 'approve' }, admin),
    ).rejects.toThrow('Quiz is not awaiting review');
  });

  it('unpublish lets the author return a published quiz to draft', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.PUBLISHED,
      createdById: 'author-1',
    });
    prisma.quiz.update.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
    });

    await service.unpublish('quiz-1', author);

    expect(prisma.quiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: { status: QuizStatus.DRAFT },
    });
  });

  it('unpublish refuses a user who does not own the quiz', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.PUBLISHED,
      createdById: 'author-1',
    });

    await expect(service.unpublish('quiz-1', student)).rejects.toThrow(
      'You do not own this quiz',
    );
    expect(prisma.quiz.update).not.toHaveBeenCalled();
  });

  it('unpublish refuses a quiz that is not published', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });

    await expect(service.unpublish('quiz-1', author)).rejects.toThrow(
      'Only published quizzes can be unpublished',
    );
  });

  it('listQuestions hides answers from students', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.PUBLISHED,
      createdById: 'author-1',
    });
    prisma.question.findMany.mockResolvedValue([
      {
        id: 'q1',
        prompt: 'Pick one',
        options: ['a', 'b'],
        correctAnswerIndices: [1],
        order: 1,
      },
    ]);

    const questions = (await service.listQuestions(
      'quiz-1',
      student,
    )) as unknown as Array<Record<string, unknown>>;
    const question = questions[0];

    expect(question).not.toHaveProperty('correctAnswerIndices');
    expect(question.options).toEqual(['a', 'b']);
  });

  it('listQuestions shows answers to the author', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });
    prisma.question.findMany.mockResolvedValue([
      {
        id: 'q1',
        prompt: 'Pick one',
        options: ['a', 'b'],
        correctAnswerIndices: [1],
        order: 1,
      },
    ]);

    const questions = (await service.listQuestions(
      'quiz-1',
      author,
    )) as unknown as Array<Record<string, unknown>>;
    const question = questions[0];

    expect(question).toHaveProperty('correctAnswerIndices', [1]);
  });

  it('listQuestions hides a draft quiz from other users', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });

    await expect(service.listQuestions('quiz-1', student)).rejects.toThrow(
      'Quiz not found',
    );
  });

  it('addQuestion assigns the next order and normalizes options', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });
    prisma.question.findFirst.mockResolvedValue({ order: 2 });
    prisma.question.create.mockResolvedValue({ id: 'q3' });

    await service.addQuestion(
      'quiz-1',
      {
        prompt: '  Pick one  ',
        options: [' a ', 'b'],
        correctAnswerIndices: [1],
      },
      author,
    );

    expect(prisma.question.create).toHaveBeenCalledWith({
      data: {
        quizId: 'quiz-1',
        type: 'MULTIPLE_CHOICE',
        prompt: 'Pick one',
        options: ['a', 'b'],
        correctAnswerIndices: [1],
        order: 3,
      },
    });
  });

  it('addQuestion supports multiple answers for multi-select', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });
    prisma.question.findFirst.mockResolvedValue(null);
    prisma.question.create.mockResolvedValue({ id: 'q1' });

    await service.addQuestion(
      'quiz-1',
      {
        type: QuestionType.MULTI_SELECT,
        prompt: 'Pick two',
        options: ['a', 'b', 'c'],
        correctAnswerIndices: [0, 2],
      },
      author,
    );

    expect(prisma.question.create).toHaveBeenCalledWith({
      data: {
        quizId: 'quiz-1',
        type: 'MULTI_SELECT',
        prompt: 'Pick two',
        options: ['a', 'b', 'c'],
        correctAnswerIndices: [0, 2],
        order: 1,
      },
    });
  });

  it('addQuestion rejects multiple answers for single-choice', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });

    await expect(
      service.addQuestion(
        'quiz-1',
        {
          prompt: 'Pick one',
          options: ['a', 'b'],
          correctAnswerIndices: [0, 1],
        },
        author,
      ),
    ).rejects.toThrow('requires exactly one correct answer');
  });

  it('addQuestion rejects duplicate options', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });

    await expect(
      service.addQuestion(
        'quiz-1',
        { prompt: 'Pick one', options: ['a', 'a'], correctAnswerIndices: [0] },
        author,
      ),
    ).rejects.toThrow('Options must be unique');
  });

  it('addQuestion rejects an out-of-range answer index', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });

    await expect(
      service.addQuestion(
        'quiz-1',
        { prompt: 'Pick one', options: ['a', 'b'], correctAnswerIndices: [5] },
        author,
      ),
    ).rejects.toThrow('correctAnswerIndices must be between 0 and 1');
  });

  it('addQuestion refuses to edit a pending quiz', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.PENDING_REVIEW,
      createdById: 'author-1',
    });

    await expect(
      service.addQuestion(
        'quiz-1',
        { prompt: 'Pick one', options: ['a', 'b'], correctAnswerIndices: [0] },
        author,
      ),
    ).rejects.toThrow('Only draft or rejected quizzes can be edited');
  });

  it('removeQuestion refuses another user', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.DRAFT,
      createdById: 'author-1',
    });

    await expect(
      service.removeQuestion('quiz-1', 'q1', student),
    ).rejects.toThrow('You do not own this quiz');
  });

  const publishedQuiz = {
    id: 'quiz-1',
    status: QuizStatus.PUBLISHED,
    createdById: 'author-1',
    durationMinutes: 10,
    questions: [
      {
        id: 'q1',
        type: QuestionType.MULTIPLE_CHOICE,
        prompt: 'Pick one',
        options: ['a', 'b'],
        correctAnswerIndices: [1],
        order: 1,
      },
    ],
  };

  it('startAttempt creates a fresh attempt and hides answers', async () => {
    prisma.quiz.findUnique.mockResolvedValue(publishedQuiz);
    prisma.quizAttempt.findFirst.mockResolvedValue(null);
    prisma.quizAttempt.create.mockResolvedValue({
      id: 'attempt-1',
      quizId: 'quiz-1',
      status: AttemptStatus.IN_PROGRESS,
      score: null,
      total: null,
      startedAt: new Date(),
      submittedAt: null,
    });
    prisma.attemptAnswer.findMany.mockResolvedValue([]);

    const result = await service.startAttempt('quiz-1', student);

    expect(prisma.quizAttempt.create).toHaveBeenCalledWith({
      data: { quizId: 'quiz-1', userId: 'student-1' },
    });
    expect(result.attempt).toMatchObject({
      id: 'attempt-1',
      status: AttemptStatus.IN_PROGRESS,
    });
    expect(result.remainingSeconds).toBeGreaterThan(0);
    expect(result.remainingSeconds).toBeLessThanOrEqual(600);
    expect(result.questions[0]).not.toHaveProperty('correctAnswerIndices');
  });

  it('startAttempt resumes an in-progress attempt', async () => {
    prisma.quiz.findUnique.mockResolvedValue(publishedQuiz);
    prisma.quizAttempt.findFirst.mockResolvedValue({
      id: 'attempt-1',
      quizId: 'quiz-1',
      userId: 'student-1',
      status: AttemptStatus.IN_PROGRESS,
      score: null,
      total: null,
      startedAt: new Date(),
      submittedAt: null,
    });
    prisma.attemptAnswer.findMany.mockResolvedValue([
      { questionId: 'q1', selectedIndices: [1] },
    ]);

    const result = await service.startAttempt('quiz-1', student);

    expect(prisma.quizAttempt.create).not.toHaveBeenCalled();
    expect(result.answers).toEqual([
      { questionId: 'q1', selectedIndices: [1] },
    ]);
  });

  it('startAttempt hides a draft quiz from non-authors', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      ...publishedQuiz,
      status: QuizStatus.DRAFT,
    });

    await expect(service.startAttempt('quiz-1', student)).rejects.toThrow(
      'Quiz not found',
    );
  });

  it('startAttempt rejects a quiz without questions', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      ...publishedQuiz,
      questions: [],
    });

    await expect(service.startAttempt('quiz-1', student)).rejects.toThrow(
      'no questions',
    );
  });

  it('submitAttempt grades all answers and stores the result', async () => {
    prisma.quizAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      quizId: 'quiz-1',
      userId: 'student-1',
      status: AttemptStatus.IN_PROGRESS,
      score: null,
      total: null,
      startedAt: new Date(),
      submittedAt: null,
      quiz: {
        durationMinutes: 10,
        questions: [
          {
            id: 'q1',
            type: QuestionType.MULTIPLE_CHOICE,
            prompt: 'A',
            options: ['a', 'b'],
            correctAnswerIndices: [0],
            order: 1,
          },
          {
            id: 'q2',
            type: QuestionType.MULTI_SELECT,
            prompt: 'B',
            options: ['a', 'b', 'c'],
            correctAnswerIndices: [0, 2],
            order: 2,
          },
        ],
      },
    });

    const result = await service.submitAttempt(
      'quiz-1',
      'attempt-1',
      {
        answers: [
          { questionId: 'q1', selectedIndices: [0] },
          { questionId: 'q2', selectedIndices: [0, 2] },
        ],
      },
      student,
    );

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.attemptAnswer.createMany).toHaveBeenCalledWith({
      data: [
        {
          attemptId: 'attempt-1',
          questionId: 'q1',
          selectedIndices: [0],
          isCorrect: true,
        },
        {
          attemptId: 'attempt-1',
          questionId: 'q2',
          selectedIndices: [0, 2],
          isCorrect: true,
        },
      ],
    });
    expect(result.score).toBe(2);
    expect(result.total).toBe(2);
    expect(result.results.every((entry) => entry.isCorrect)).toBe(true);
  });

  it('submitAttempt requires an exact set for multi-select', async () => {
    prisma.quizAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      quizId: 'quiz-1',
      userId: 'student-1',
      status: AttemptStatus.IN_PROGRESS,
      score: null,
      total: null,
      startedAt: new Date(),
      submittedAt: null,
      quiz: {
        durationMinutes: 10,
        questions: [
          {
            id: 'q2',
            type: QuestionType.MULTI_SELECT,
            prompt: 'B',
            options: ['a', 'b', 'c'],
            correctAnswerIndices: [0, 2],
            order: 1,
          },
        ],
      },
    });

    const result = await service.submitAttempt(
      'quiz-1',
      'attempt-1',
      { answers: [{ questionId: 'q2', selectedIndices: [2] }] },
      student,
    );

    expect(result.score).toBe(0);
    expect(result.results[0]).toMatchObject({
      selectedIndices: [2],
      correctAnswerIndices: [0, 2],
      isCorrect: false,
    });
  });

  it('submitAttempt ignores unknown questions and clamps bad indices', async () => {
    prisma.quizAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      quizId: 'quiz-1',
      userId: 'student-1',
      status: AttemptStatus.IN_PROGRESS,
      score: null,
      total: null,
      startedAt: new Date(),
      submittedAt: null,
      quiz: {
        durationMinutes: 10,
        questions: [
          {
            id: 'q1',
            type: QuestionType.MULTIPLE_CHOICE,
            prompt: 'A',
            options: ['a', 'b'],
            correctAnswerIndices: [0],
            order: 1,
          },
        ],
      },
    });

    const result = await service.submitAttempt(
      'quiz-1',
      'attempt-1',
      {
        answers: [
          { questionId: 'q1', selectedIndices: [5] },
          { questionId: 'nope', selectedIndices: [0] },
        ],
      },
      student,
    );

    expect(result.score).toBe(0);
    expect(result.results[0].selectedIndices).toEqual([]);
  });

  it('submitAttempt returns the stored result when already submitted', async () => {
    prisma.quizAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      quizId: 'quiz-1',
      userId: 'student-1',
      status: AttemptStatus.SUBMITTED,
      score: 1,
      total: 1,
      startedAt: new Date(),
      submittedAt: new Date(),
      quiz: {
        durationMinutes: 10,
        questions: [
          {
            id: 'q1',
            type: QuestionType.MULTIPLE_CHOICE,
            prompt: 'A',
            options: ['a', 'b'],
            correctAnswerIndices: [0],
            order: 1,
          },
        ],
      },
    });
    prisma.attemptAnswer.findMany.mockResolvedValue([
      { questionId: 'q1', selectedIndices: [0], isCorrect: true },
    ]);

    const result = await service.submitAttempt(
      'quiz-1',
      'attempt-1',
      { answers: [] },
      student,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result.score).toBe(1);
    expect(result.results[0].isCorrect).toBe(true);
  });

  it('submitAttempt refuses another user attempt', async () => {
    prisma.quizAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      quizId: 'quiz-1',
      userId: 'someone-else',
      status: AttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
      submittedAt: null,
      quiz: { durationMinutes: 10, questions: [] },
    });

    await expect(
      service.submitAttempt('quiz-1', 'attempt-1', {}, student),
    ).rejects.toThrow('only submit your own attempt');
  });

  it('getAttempt returns graded results once submitted', async () => {
    prisma.quizAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      quizId: 'quiz-1',
      userId: 'student-1',
      status: AttemptStatus.SUBMITTED,
      score: 1,
      total: 1,
      startedAt: new Date(),
      submittedAt: new Date(),
      quiz: {
        durationMinutes: 10,
        questions: [
          {
            id: 'q1',
            type: QuestionType.MULTIPLE_CHOICE,
            prompt: 'A',
            options: ['a', 'b'],
            correctAnswerIndices: [0],
            order: 1,
          },
        ],
      },
    });
    prisma.attemptAnswer.findMany.mockResolvedValue([
      { questionId: 'q1', selectedIndices: [0], isCorrect: true },
    ]);

    const result = (await service.getAttempt(
      'quiz-1',
      'attempt-1',
      student,
    )) as unknown as {
      score: number;
      results: Array<{ correctAnswerIndices: number[] }>;
    };

    expect(result.score).toBe(1);
    expect(result.results[0].correctAnswerIndices).toEqual([0]);
  });

  it('getAttempt hides answers while an attempt is in progress', async () => {
    prisma.quizAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      quizId: 'quiz-1',
      userId: 'student-1',
      status: AttemptStatus.IN_PROGRESS,
      score: null,
      total: null,
      startedAt: new Date(),
      submittedAt: null,
      quiz: {
        durationMinutes: 10,
        questions: [
          {
            id: 'q1',
            type: QuestionType.MULTIPLE_CHOICE,
            prompt: 'A',
            options: ['a', 'b'],
            correctAnswerIndices: [0],
            order: 1,
          },
        ],
      },
    });
    prisma.attemptAnswer.findMany.mockResolvedValue([]);

    const result = (await service.getAttempt(
      'quiz-1',
      'attempt-1',
      student,
    )) as unknown as {
      remainingSeconds: number;
      questions: Array<Record<string, unknown>>;
    };

    expect(result).toHaveProperty('remainingSeconds');
    expect(result.questions[0]).not.toHaveProperty('correctAnswerIndices');
  });

  it('getAttempt hides an attempt from other users', async () => {
    prisma.quizAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1',
      quizId: 'quiz-1',
      userId: 'someone-else',
      status: AttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
      submittedAt: null,
      quiz: { durationMinutes: 10, questions: [] },
    });

    await expect(
      service.getAttempt('quiz-1', 'attempt-1', student),
    ).rejects.toThrow('cannot view this attempt');
  });

  it('listMyAttempts scopes to the requester', async () => {
    prisma.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      status: QuizStatus.PUBLISHED,
      createdById: 'author-1',
    });
    prisma.quizAttempt.findMany.mockResolvedValue([]);

    await service.listMyAttempts('quiz-1', student);

    expect(prisma.quizAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { quizId: 'quiz-1', userId: 'student-1' },
      }),
    );
  });

  it('getMyAttemptsOverview aggregates stats, recent, in-progress and subjects', async () => {
    const submittedAt = new Date('2026-09-10T12:00:00Z');
    prisma.quizAttempt.findMany.mockResolvedValue([
      {
        id: 'attempt-2',
        quizId: 'quiz-1',
        score: 9,
        total: 10,
        submittedAt,
        quiz: {
          id: 'quiz-1',
          title: 'Oral pathology',
          subject: {
            id: 'subject-1',
            code: 'MED233',
            name: 'Oral pathology II',
          },
        },
      },
      {
        id: 'attempt-1',
        quizId: 'quiz-2',
        score: 0,
        total: 4,
        submittedAt,
        quiz: {
          id: 'quiz-2',
          title: 'Anatomy basics',
          subject: { id: 'subject-2', code: 'MED101', name: 'Anatomy' },
        },
      },
    ]);
    prisma.quizAttempt.findFirst.mockResolvedValue({
      id: 'attempt-3',
      quizId: 'quiz-3',
      startedAt: new Date(Date.now() - 60_000),
      quiz: {
        id: 'quiz-3',
        title: 'Histology',
        durationMinutes: 10,
        subject: { id: 'subject-2', code: 'MED101', name: 'Anatomy' },
      },
    });

    const result = await service.getMyAttemptsOverview('student-1', 1);

    expect(prisma.quizAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'student-1', status: AttemptStatus.SUBMITTED },
      }),
    );
    expect(result.stats).toEqual({
      attempts: 2,
      quizzesTaken: 2,
      averagePercentage: 45,
      bestPercentage: 90,
    });
    expect(result.recent).toHaveLength(1);
    expect(result.recent[0]).toMatchObject({
      id: 'attempt-2',
      percentage: 90,
      subjectCode: 'MED233',
    });
    expect(result.bySubject).toEqual([
      {
        id: 'subject-1',
        code: 'MED233',
        name: 'Oral pathology II',
        attempts: 1,
        averagePercentage: 90,
      },
      {
        id: 'subject-2',
        code: 'MED101',
        name: 'Anatomy',
        attempts: 1,
        averagePercentage: 0,
      },
    ]);
    expect(result.inProgress).toMatchObject({
      attemptId: 'attempt-3',
      quizId: 'quiz-3',
      quizTitle: 'Histology',
    });
    expect(result.inProgress?.remainingSeconds).toBeGreaterThan(0);
    expect(result.inProgress?.remainingSeconds).toBeLessThanOrEqual(600);
  });

  it('getMyAttemptsOverview returns empty defaults with no activity', async () => {
    prisma.quizAttempt.findMany.mockResolvedValue([]);
    prisma.quizAttempt.findFirst.mockResolvedValue(null);

    const result = await service.getMyAttemptsOverview('student-1');

    expect(result.stats).toEqual({
      attempts: 0,
      quizzesTaken: 0,
      averagePercentage: null,
      bestPercentage: null,
    });
    expect(result.recent).toEqual([]);
    expect(result.bySubject).toEqual([]);
    expect(result.inProgress).toBeNull();
  });

  it('getStatusStats counts quizzes by status', async () => {
    prisma.quiz.groupBy.mockResolvedValue([
      { status: QuizStatus.PUBLISHED, _count: { _all: 4 } },
      { status: QuizStatus.PENDING_REVIEW, _count: { _all: 2 } },
      { status: QuizStatus.DRAFT, _count: { _all: 1 } },
    ]);

    const result = await service.getStatusStats();

    expect(prisma.quiz.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      _count: { _all: true },
    });
    expect(result).toEqual({
      total: 7,
      byStatus: {
        [QuizStatus.DRAFT]: 1,
        [QuizStatus.PENDING_REVIEW]: 2,
        [QuizStatus.PUBLISHED]: 4,
        [QuizStatus.REJECTED]: 0,
      },
    });
  });
});
