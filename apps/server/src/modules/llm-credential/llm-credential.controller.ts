import type { Request, Response } from 'express';

import { requireUser } from '../../middleware/authenticate';
import {
  createLlmCredentialSchema,
  credentialIdParamSchema,
  reorderLlmCredentialsSchema,
  testPromptSchema,
  updateLlmCredentialSchema,
} from './llm-credential.schemas';
import {
  createCredential,
  deleteCredential,
  listCredentials,
  reorderCredentials,
  testCredential,
  updateCredential,
} from './llm-credential.service';

export async function getCredentials(req: Request, res: Response): Promise<void> {
  res.status(200).json(await listCredentials(requireUser(req).id));
}

export async function postCredential(req: Request, res: Response): Promise<void> {
  const input = createLlmCredentialSchema.parse(req.body);
  res.status(201).json(await createCredential(requireUser(req).id, input));
}

export async function putCredential(req: Request, res: Response): Promise<void> {
  const { credentialId } = credentialIdParamSchema.parse(req.params);
  const input = updateLlmCredentialSchema.parse(req.body);
  res.status(200).json(await updateCredential(requireUser(req).id, credentialId, input));
}

export async function removeCredential(req: Request, res: Response): Promise<void> {
  const { credentialId } = credentialIdParamSchema.parse(req.params);
  await deleteCredential(requireUser(req).id, credentialId);
  res.status(204).send();
}

export async function postReorder(req: Request, res: Response): Promise<void> {
  const { orderedIds } = reorderLlmCredentialsSchema.parse(req.body);
  res.status(200).json(await reorderCredentials(requireUser(req).id, orderedIds));
}

export async function postTestCredential(req: Request, res: Response): Promise<void> {
  const { credentialId } = credentialIdParamSchema.parse(req.params);
  const { prompt } = testPromptSchema.parse(req.body);
  res.status(200).json(await testCredential(requireUser(req).id, credentialId, prompt));
}
