/**
 * Database Module
 * 
 * Инициализация Prisma Client и экспорт для использования в других модулях
 * 
 * Примечание: Используем Prisma 6, который поддерживает стандартный подход
 */

import { PrismaClient } from '@prisma/client';

// Singleton instance Prisma Client
let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// В Prisma 6 URL базы данных берется из переменной окружения DATABASE_URL
// или из schema.prisma для миграций

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // В development режиме используем глобальную переменную для hot reload
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = global.__prisma;
}

export { prisma };
export * from '@prisma/client';
