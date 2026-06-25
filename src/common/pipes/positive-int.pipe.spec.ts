import { BadRequestException } from '@nestjs/common';
import { PositiveIntPipe } from './positive-int.pipe';

describe('PositiveIntPipe', () => {
  const pipe = new PositiveIntPipe();
  const meta = { type: 'param', metatype: Number, data: 'id' } as const;

  describe('accepts valid positive integers (string input)', () => {
    it.each(['1', '42', '9999', String(Number.MAX_SAFE_INTEGER)])('returns the parsed number for %p', (input) => {
      expect(pipe.transform(input, meta)).toBe(Number(input));
    });
  });

  describe('accepts valid positive integers (number input, post-Number() coercion)', () => {
    it.each([1, 42, 9999, Number.MAX_SAFE_INTEGER])('returns the value for %d', (input) => {
      expect(pipe.transform(input, meta)).toBe(input);
    });
  });

  describe('rejects non-digit strings (defense against ValidationPipe Number() coercion)', () => {
    it.each([
      ['0x1', 'hex literal would be Number()=1'],
      ['1.5', 'decimal would be Number()=1.5 then truncated'],
      ['1.0', 'decimal point not allowed'],
      ['1e5', 'scientific notation would be Number()=100000'],
      ['1+1', 'plus operator would be Number()=NaN'],
      ['-1', 'negative (also caught by <=0)'],
      [' 1', 'leading whitespace'],
      ['1 ', 'trailing whitespace'],
      ['abc', 'non-numeric'],
      ['', 'empty'],
      ['1.0.0', 'multiple dots'],
      ['0xff', 'hex prefix'],
      ['Infinity', 'special'],
      ['NaN', 'special'],
    ])('rejects %p (%s)', (input) => {
      expect(() => pipe.transform(input, meta)).toThrow(BadRequestException);
    });
  });

  describe('rejects 0 and negative', () => {
    it.each(['0', '-1', '-999', 0, -1, -999])('rejects %p', (input) => {
      expect(() => pipe.transform(input, meta)).toThrow(BadRequestException);
    });
  });

  describe('rejects numbers exceeding safe integer range', () => {
    it('rejects huge digit-only string (overflow)', () => {
      expect(() => pipe.transform('99999999999999999999', meta)).toThrow(BadRequestException);
    });

    it('rejects Number.MAX_SAFE_INTEGER + 1 as string', () => {
      const overflow = String(Number.MAX_SAFE_INTEGER + 1);
      expect(() => pipe.transform(overflow, meta)).toThrow(BadRequestException);
    });

    it('rejects Number.MAX_SAFE_INTEGER + 1 as number (post-Number() coercion)', () => {
      // Number('99999999999999999999') = 1e20 (unsafe integer).
      const overflow = Number('99999999999999999999');
      expect(Number.isSafeInteger(overflow)).toBe(false);
      expect(() => pipe.transform(overflow, meta)).toThrow(BadRequestException);
    });
  });

  describe('rejects non-integer numbers (post-Number() coercion)', () => {
    it.each([1.5, -1.5, NaN, Infinity, -Infinity])('rejects %p', (input) => {
      expect(() => pipe.transform(input, meta)).toThrow(BadRequestException);
    });
  });

  describe('rejects other types', () => {
    it.each([undefined, null, true, false, [], {}, new Date()])('rejects %p', (input) => {
      expect(() => pipe.transform(input as unknown, meta)).toThrow(BadRequestException);
    });
  });

  describe('error shape matches §6', () => {
    it('throws BadRequestException with statusCode 400 and stable message', () => {
      try {
        pipe.transform('abc', meta);
        fail('expected throw');
      } catch (caught) {
        const ex = caught as BadRequestException;
        expect(ex.getStatus()).toBe(400);
        const response = ex.getResponse() as Record<string, unknown>;
        expect(response).toMatchObject({
          error: 'Bad Request',
          message: 'id must be a positive integer',
          details: null,
        });
      }
    });
  });
});
