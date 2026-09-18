import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export function createPrismaAdapter(): PrismaPg {
  return new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({ adapter: createPrismaAdapter() });
}
