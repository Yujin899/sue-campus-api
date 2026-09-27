import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Flattens a class-validator error tree into plain messages, including the
 * nested `children` produced by @ValidateNested.
 */
export function collectMessages(error: ValidationError): string[] {
  const own = Object.values(error.constraints ?? {});
  const nested = (error.children ?? []).flatMap(collectMessages);
  return [...own, ...nested];
}

/**
 * Nest's default ValidationPipe returns a flat `string[]` of messages with no
 * indication of which field failed, so clients can only show one anonymous
 * error. This keeps the first message for the top-level `message` field while
 * adding an `errors` map keyed by property name.
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const fieldErrors: Record<string, string[]> = {};

  for (const error of errors) {
    const messages = collectMessages(error);
    if (messages.length > 0) {
      fieldErrors[error.property] = messages;
    }
  }

  const first = Object.values(fieldErrors).flat()[0] ?? 'Invalid request';

  return new BadRequestException({
    statusCode: 400,
    message: first,
    errors: fieldErrors,
  });
}
