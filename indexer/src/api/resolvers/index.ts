import { DateTimeScalar, BigIntScalar, DecimalScalar, JSONScalar } from '../scalars';
import { Query } from './queries';
import { Subscription } from './subscriptions';
import {
  MarketResolvers,
  UserPositionResolvers,
  TransactionResolvers,
  MarketSnapshotResolvers,
  InterestAccrualEventResolvers,
} from './fields';

export const resolvers = {
  // Custom scalars
  DateTime: DateTimeScalar,
  BigInt: BigIntScalar,
  Decimal: DecimalScalar,
  JSON: JSONScalar,

  // Queries
  Query,

  // Subscriptions
  Subscription,

  // Type resolvers
  Market: MarketResolvers,
  UserPosition: UserPositionResolvers,
  Transaction: TransactionResolvers,
  MarketSnapshot: MarketSnapshotResolvers,
  InterestAccrualEvent: InterestAccrualEventResolvers,
};
