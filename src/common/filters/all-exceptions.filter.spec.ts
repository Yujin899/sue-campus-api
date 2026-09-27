import { HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AllExceptionsFilter, mapPrismaError } from './all-exceptions.filter';

function knownError(code: string, meta?: Record<string, unknown>): Error {
  return new Prisma.PrismaClientKnownRequestError('prisma failed', {
    code,
    clientVersion: '7.10.0',
    meta,
  });
}

describe('mapPrismaError', () => {
  it('returns null for a non-Prisma error', () => {
    expect(mapPrismaError(new Error('boom'))).toBeNull();
  });

  it('returns null for an unrecognised Prisma code', () => {
    expect(mapPrismaError(knownError('P9999'))).toBeNull();
  });

  describe('P2002 unique violation', () => {
    it('names the model and field', () => {
      expect(
        mapPrismaError(
          knownError('P2002', { modelName: 'Subject', target: ['code'] }),
        ),
      ).toEqual({
        status: HttpStatus.CONFLICT,
        message: 'A subject with this code already exists.',
        code: 'P2002',
      });
    });

    it('reads a target supplied as a constraint name string', () => {
      expect(
        mapPrismaError(
          knownError('P2002', {
            modelName: 'User',
            target: 'User_email_key',
          }),
        ),
      ).toEqual({
        status: HttpStatus.CONFLICT,
        message: 'A user with this email address already exists.',
        code: 'P2002',
      });
    });

    it('falls back gracefully when meta is missing', () => {
      expect(mapPrismaError(knownError('P2002'))).toEqual({
        status: HttpStatus.CONFLICT,
        message: 'A record already exists.',
        code: 'P2002',
      });
    });

    it('humanises a multi-word model name', () => {
      expect(
        mapPrismaError(
          knownError('P2002', {
            modelName: 'QuizAttempt',
            target: ['attemptId'],
          }),
        ),
      ).toMatchObject({
        message: 'A quiz attempt with this attempt already exists.',
      });
    });
  });

  it('maps P2003 to a conflict', () => {
    expect(mapPrismaError(knownError('P2003'))).toEqual({
      status: HttpStatus.CONFLICT,
      message:
        'This record is still referenced by other data and cannot be changed.',
      code: 'P2003',
    });
  });

  it('maps P2025 to not found', () => {
    expect(mapPrismaError(knownError('P2025'))).toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });

  it.each([
    ['P2000', HttpStatus.BAD_REQUEST],
    ['P2004', HttpStatus.BAD_REQUEST],
    ['P2014', HttpStatus.BAD_REQUEST],
  ])('maps %s to a bad request', (code, status) => {
    expect(mapPrismaError(knownError(code))).toMatchObject({ status });
  });
});

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    status = jest.fn().mockReturnThis();
    json = jest.fn().mockReturnThis();
    host = {
      switchToHttp: () => ({ getResponse: () => ({ status, json }) }),
    } as unknown as ArgumentsHost;
  });

  it('passes an HttpException through with its own status and body', () => {
    const exception = new HttpException('nope', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(exception.getResponse());
  });

  it('answers a P2002 with 409 and a readable message', () => {
    filter.catch(
      knownError('P2002', { modelName: 'Subject', target: ['code'] }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      message: 'A subject with this code already exists.',
    });
  });

  it('never includes a stack trace in the response body', () => {
    const error = new Error('connection string leaked here');

    filter.catch(error, host);

    const calls = json.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    const body = calls[0][0];
    expect(body).not.toHaveProperty('stack');
    expect(Object.values(body)).not.toContain(error.stack);
  });

  it('returns 500 for an unrecognised exception', () => {
    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'boom',
    });
  });

  it('hides the detail behind a generic message in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      filter.catch(new Error('internal detail'), host);

      expect(json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Something went wrong on our side. Please try again.',
      });
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
