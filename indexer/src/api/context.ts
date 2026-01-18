import { PrismaClient } from '@prisma/client';
import DataLoader from 'dataloader';
import { prisma } from '../db/client';
import { Market, UserPosition } from '@prisma/client';

export interface GraphQLContext {
  prisma: PrismaClient;
  loaders: {
    marketLoader: DataLoader<string, Market | null>;
    userPositionLoader: DataLoader<string, UserPosition | null>;
  };
}

export function createContext(): GraphQLContext {
  return {
    prisma,
    loaders: {
      marketLoader: new DataLoader(async (ids: readonly string[]) => {
        const markets = await prisma.market.findMany({
          where: { id: { in: [...ids] } },
        });

        const marketMap = new Map(markets.map((m) => [m.id, m]));
        return ids.map((id) => marketMap.get(id) || null);
      }),

      userPositionLoader: new DataLoader(async (ids: readonly string[]) => {
        const positions = await prisma.userPosition.findMany({
          where: { id: { in: [...ids] } },
        });

        const positionMap = new Map(positions.map((p) => [p.id, p]));
        return ids.map((id) => positionMap.get(id) || null);
      }),
    },
  };
}
