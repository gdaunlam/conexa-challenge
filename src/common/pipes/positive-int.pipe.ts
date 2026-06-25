import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class PositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string, _metadata: ArgumentMetadata): number {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new BadRequestException({
        error: 'Bad Request',
        message: 'id must be a positive integer',
        details: null,
      });
    }
    return parsed;
  }
}
