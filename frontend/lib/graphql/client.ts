'use client';

import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  split,
} from '@apollo/client/index.js';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions/index.js';
import { getMainDefinition } from '@apollo/client/utilities/index.js';
import { createClient } from 'graphql-ws';

const httpLink = new HttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:4000/graphql',
});

// WebSocket link for subscriptions (only in browser)
const wsLink = typeof window !== 'undefined'
  ? new GraphQLWsLink(
      createClient({
        url: process.env.NEXT_PUBLIC_GRAPHQL_WS_URL || 'ws://localhost:4000/graphql',
        connectionParams: {
          // Add auth tokens here if needed
        },
      })
    )
  : null;

// Split traffic between HTTP and WebSocket
const splitLink = typeof window !== 'undefined' && wsLink
  ? split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return (
          definition.kind === 'OperationDefinition' &&
          definition.operation === 'subscription'
        );
      },
      wsLink,
      httpLink
    )
  : httpLink;

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          markets: {
            keyArgs: ['curator', 'collateralDenom', 'debtDenom', 'enabledOnly'],
            merge(existing = [], incoming) {
              return incoming;
            },
          },
          userPositions: {
            keyArgs: ['userAddress', 'hasDebt'],
            merge(existing = [], incoming) {
              return incoming;
            },
          },
          transactions: {
            keyArgs: ['marketId', 'userAddress', 'action'],
            merge(existing = [], incoming) {
              return incoming;
            },
          },
        },
      },
      Market: {
        keyFields: ['id'],
      },
      UserPosition: {
        keyFields: ['id'],
      },
      Transaction: {
        keyFields: ['id'],
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
    },
  },
});
