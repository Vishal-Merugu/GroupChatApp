import { existsSync } from 'node:fs';
import path from 'node:path';

import cors from 'cors';
import express, { type Express } from 'express';

import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { aiRouter } from './modules/ai/ai.routes';
import { groupRouter } from './modules/group/group.routes';
import { llmCredentialRouter } from './modules/llm-credential/llm-credential.routes';
import { messageRouter } from './modules/message/message.routes';
import { passwordRouter } from './modules/password/password.routes';
import { userRouter } from './modules/user/user.routes';

export interface CreateAppOptions {
  corsOrigin: string;
  /**
   * Directory holding the built React client. When set, the API also serves
   * the UI, so the whole thing deploys as one service on a free tier.
   */
  webRoot?: string;
}

/**
 * Builds the Express app without starting a listener, so tests can drive it
 * with supertest. The original called `app.listen` inline in `app.js`, which
 * made the HTTP layer impossible to test without binding a port.
 */
export function createApp(options: CreateAppOptions): Express {
  const app = express();

  app.use(cors({ origin: options.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', userRouter);
  app.use('/api/password', passwordRouter);
  app.use('/api/groups', groupRouter);
  // Messages are nested under their group — mergeParams gives the child router
  // access to :groupId.
  app.use('/api/groups/:groupId/messages', messageRouter);
  app.use('/api/llm-credentials', llmCredentialRouter);
  app.use('/api/ai', aiRouter);

  // Unmatched /api routes 404 as JSON before any static handling, so a typo'd
  // endpoint never silently returns the HTML shell.
  app.use('/api', notFoundHandler);

  if (options.webRoot && existsSync(options.webRoot)) {
    app.use(express.static(options.webRoot));
    // SPA fallback: any non-API path renders the client, which handles routing.
    app.get('*', (_req, res) => {
      res.sendFile(path.join(options.webRoot ?? '', 'index.html'));
    });
  } else {
    app.use(notFoundHandler);
  }

  // Error middleware must be registered last to catch everything above it.
  app.use(errorHandler);

  return app;
}
