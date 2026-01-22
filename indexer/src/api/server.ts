import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import express from 'express';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { createContext, GraphQLContext } from './context';
import { resolvers } from './resolvers';
import { logger } from '../utils/logger';
import { config } from '../config';

export async function startGraphQLServer(): Promise<{
  server: http.Server;
  shutdown: () => Promise<void>;
}> {
  // Load schema from file
  const typeDefs = fs.readFileSync(
    path.join(__dirname, 'schema.graphql'),
    'utf-8'
  );

  // Create executable schema
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  // Create Express app
  const app = express();
  const httpServer = http.createServer(app);

  // Create WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  // Setup WebSocket server
  const serverCleanup = useServer(
    {
      schema,
      context: async () => createContext(),
    },
    wsServer
  );

  // Create Apollo Server
  const apolloServer = new ApolloServer<GraphQLContext>({
    schema,
    plugins: [
      // Proper shutdown for HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),

      // Proper shutdown for WebSocket server
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  // Start Apollo Server
  await apolloServer.start();

  // Apply middleware
  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    bodyParser.json(),
    expressMiddleware(apolloServer, {
      context: async () => createContext(),
    })
  );

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Start listening
  const port = config.api.port;
  await new Promise<void>((resolve) => {
    httpServer.listen(port, resolve);
  });

  logger.info('GraphQL API server started', {
    url: `http://localhost:${port}/graphql`,
    subscriptions: `ws://localhost:${port}/graphql`,
  });

  // Shutdown function
  const shutdown = async () => {
    logger.info('Shutting down GraphQL server...');
    await apolloServer.stop();
    await serverCleanup.dispose();
    httpServer.close();
    logger.info('GraphQL server stopped');
  };

  return { server: httpServer, shutdown };
}
