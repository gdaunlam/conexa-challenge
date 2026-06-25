import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcrypt';
import { BcryptConfig } from '../../../config/configuration';

@Injectable()
export class BcryptPasswordService {
  private readonly cost: number;

  constructor(configService: ConfigService) {
    const bcryptConfig = configService.get<BcryptConfig>('bcrypt');
    if (bcryptConfig === undefined) {
      throw new Error('bcrypt config is not available; cannot start BcryptPasswordService');
    }
    this.cost = bcryptConfig.cost;
  }

  hash(plain: string): Promise<string> {
    return hash(plain, this.cost);
  }

  verify(plain: string, hashed: string): Promise<boolean> {
    return compare(plain, hashed);
  }
}
