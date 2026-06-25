import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const DIGITS_ONLY = /^\d+$/;

@Injectable()
export class PositiveIntPipe implements PipeTransform<unknown, number> {
  transform(value: unknown, _metadata: ArgumentMetadata): number {
    // El ValidationPipe global corre antes que este pipe y, con `transform: true`,
    // aplica Number(value) al parametro (lo que interpreta "0x1" como hex 1,
    // "1.5" como 1.5, "1e5" como 100000, etc.). Esto significa que a este
    // pipe puede llegarle un string crudo (si el global no transforma por algun
    // motivo) o un number ya convertido por Number(). Validamos ambos casos.
    //
    // Casos rechazados con 400:
    //  - string que no es solo digitos decimales: "0x1", "1.5", "1e5", "+1", " 1", "1 ".
    //  - number que no es entero positivo dentro de MAX_SAFE_INTEGER.
    //  - cualquier otro tipo (null, undefined, array, object, boolean).
    if (typeof value === 'string') {
      if (!DIGITS_ONLY.test(value)) {
        throw new BadRequestException({
          error: 'Bad Request',
          message: 'id must be a positive integer',
          details: null,
        });
      }
      const parsed = Number.parseInt(value, 10);
      if (parsed <= 0 || !Number.isSafeInteger(parsed)) {
        throw new BadRequestException({
          error: 'Bad Request',
          message: 'id must be a positive integer',
          details: null,
        });
      }
      return parsed;
    }

    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value <= 0 || !Number.isSafeInteger(value)) {
        throw new BadRequestException({
          error: 'Bad Request',
          message: 'id must be a positive integer',
          details: null,
        });
      }
      return value;
    }

    throw new BadRequestException({
      error: 'Bad Request',
      message: 'id must be a positive integer',
      details: null,
    });
  }
}
