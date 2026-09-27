import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

interface MappedError {
  status: number;
  message: string;
  /** Prisma error code, for logging. Absent for unmapped errors. */
  code?: string;
}

/** Human labels for the columns that actually carry unique constraints. */
const FIELD_LABELS: Record<string, string> = {
  code: 'code',
  email: 'email address',
  token: 'session',
  objectKey: 'uploaded file',
  providerId: 'provider',
  accountId: 'account',
  attemptId: 'attempt',
  questionId: 'question',
};

function humanizeField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function humanizeModel(model: string): string {
  const spaced = model.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced;
}

/**
 * Prisma reports the offending column either as an array of field names or as
 * the raw constraint name, depending on version and driver. Constraint names
 * look like `Subject_code_key`, so the column is recovered from between the
 * model prefix and the `_key` suffix.
 */
function readTarget(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const target = (meta as { target?: unknown }).target;
  if (Array.isArray(target) && typeof target[0] === 'string') {
    return target[0];
  }
  if (typeof target === 'string') {
    const constraint = /^[^_]+_(.+?)(?:_key)?$/.exec(target);
    return constraint ? constraint[1] : target;
  }
  return null;
}

function readModel(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const modelName = (meta as { modelName?: unknown }).modelName;
  return typeof modelName === 'string' ? modelName : null;
}

/**
 * Translates a Prisma request error into an HTTP response the client can act
 * on. Exported separately from the filter so it can be unit tested without any
 * HTTP plumbing.
 */
export function mapPrismaError(error: unknown): MappedError | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) &&
    !(error instanceof Prisma.PrismaClientUnknownRequestError)
  ) {
    return null;
  }

  const code = (error as { code?: string }).code;
  const meta = (error as { meta?: unknown }).meta;

  switch (code) {
    case 'P2002': {
      const field = readTarget(meta);
      const model = readModel(meta);
      const subject = model ? `A ${humanizeModel(model)}` : 'A record';
      const suffix = field ? ` with this ${humanizeField(field)}` : '';
      return {
        status: HttpStatus.CONFLICT,
        message: `${subject}${suffix} already exists.`,
        code,
      };
    }

    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        message:
          'This record is still referenced by other data and cannot be changed.',
        code,
      };

    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'The requested record was not found.',
        code,
      };

    case 'P2000':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'That value is too long.',
        code,
      };

    case 'P2004':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'That value failed a database constraint.',
        code,
      };

    case 'P2014':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'The change broke a relationship between records.',
        code,
      };

    default:
      return null;
  }
}

/**
 * Catches everything so that no failure ever surfaces to the client as a bare
 * "Internal server error" with nothing logged. HttpExceptions keep their own
 * status and body; Prisma request errors become actionable 4xx responses; and
 * anything unrecognised is logged with its stack before a generic 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const mapped = mapPrismaError(exception);
    if (mapped) {
      this.logger.warn(`${mapped.code} ${mapped.message}`);
      response.status(mapped.status).json({
        statusCode: mapped.status,
        message: mapped.message,
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const detail =
      exception instanceof Error ? exception.message : String(exception);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: isProduction
        ? 'Something went wrong on our side. Please try again.'
        : detail,
    });
  }
}
