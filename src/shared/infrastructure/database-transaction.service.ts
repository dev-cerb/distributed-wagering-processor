import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

@Injectable()
export class DatabaseTransactionService {
  constructor(private readonly em: EntityManager) {}

  async execute<T>(callback: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.em.transactional(async (transactionalEm) => {
      return callback(transactionalEm);
    });
  }
}
