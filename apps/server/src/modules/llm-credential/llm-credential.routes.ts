import { Router } from 'express';

import { asyncHandler } from '../../middleware/async-handler';
import { authenticate } from '../../middleware/authenticate';
import {
  getCredentials,
  postCredential,
  postReorder,
  postTestCredential,
  putCredential,
  removeCredential,
} from './llm-credential.controller';

export const llmCredentialRouter = Router();

llmCredentialRouter.use(authenticate);

llmCredentialRouter.get('/', asyncHandler(getCredentials));
llmCredentialRouter.post('/', asyncHandler(postCredential));
llmCredentialRouter.post('/reorder', asyncHandler(postReorder));
llmCredentialRouter.put('/:credentialId', asyncHandler(putCredential));
llmCredentialRouter.delete('/:credentialId', asyncHandler(removeCredential));
llmCredentialRouter.post('/:credentialId/test', asyncHandler(postTestCredential));
