import { HttpStatus } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import {
  collectMessages,
  validationExceptionFactory,
} from './validation-exception.factory';

function makeError(
  property: string,
  constraints: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return { property, constraints, children };
}

describe('collectMessages', () => {
  it('returns the constraints of a leaf error', () => {
    expect(
      collectMessages(
        makeError('code', {
          isString: 'code must be a string',
          isNotEmpty: 'code should not be empty',
        }),
      ),
    ).toEqual(['code must be a string', 'code should not be empty']);
  });

  it('flattens nested children', () => {
    const messages = collectMessages(
      makeError('answers', {}, [
        makeError('0', { isInt: 'must be an integer' }),
      ]),
    );

    expect(messages).toEqual(['must be an integer']);
  });

  it('returns an empty array when there is nothing to report', () => {
    expect(collectMessages(makeError('code', {}))).toEqual([]);
  });
});

describe('validationExceptionFactory', () => {
  it('keys messages by field name', () => {
    const exception = validationExceptionFactory([
      makeError('code', { isNotEmpty: 'code should not be empty' }),
      makeError('name', { isString: 'name must be a string' }),
    ]);

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.getResponse()).toEqual({
      statusCode: 400,
      message: 'code should not be empty',
      errors: {
        code: ['code should not be empty'],
        name: ['name must be a string'],
      },
    });
  });

  it('keeps the first message as the top level message', () => {
    const exception = validationExceptionFactory([
      makeError('code', { isNotEmpty: 'code should not be empty' }),
      makeError('name', { isString: 'name must be a string' }),
    ]);

    const body = exception.getResponse() as { message: string };
    expect(body.message).toBe('code should not be empty');
  });

  it('skips properties with no messages', () => {
    const exception = validationExceptionFactory([
      makeError('code', { isNotEmpty: 'code should not be empty' }),
      makeError('description', {}),
    ]);

    const body = exception.getResponse() as {
      errors: Record<string, string[]>;
    };
    expect(Object.keys(body.errors)).toEqual(['code']);
  });

  it('falls back to a generic message for an empty error list', () => {
    const exception = validationExceptionFactory([]);

    expect(exception.getResponse()).toEqual({
      statusCode: 400,
      message: 'Invalid request',
      errors: {},
    });
  });
});
