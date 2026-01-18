import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

prisma.$on('query' as never, (e: { query: string; duration: number }) => {
  if (e.duration > 100) {
    logger.warn('Slow query detected', {
      query: e.query,
      duration: e.duration,
    });
  }
});

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error('Database error', { error: e.message });
});

prisma.$on('warn' as never, (e: { message: string }) => {
  logger.warn('Database warning', { warning: e.message });
});

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database', { error });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Failed to disconnect from database', { error });
  }
}
