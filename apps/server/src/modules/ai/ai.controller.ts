import type { Request, Response } from 'express';

import { requireUser } from '../../middleware/authenticate';
import { getProviderChainForUser } from '../llm-credential/llm-credential.service';
import { askSchema } from './ai.schemas';

/**
 * Minimal non-streaming proof that a user's provider waterfall actually
 * answers a prompt, falling through their configured credentials in priority
 * order on a rate limit or outage. This is the seam Stage F–H build on —
 * summarization and semantic search will call `getProviderChainForUser` the
 * same way, then stream the result instead of blocking on it.
 */
export async function postAsk(req: Request, res: Response): Promise<void> {
  const { prompt } = askSchema.parse(req.body);
  const provider = await getProviderChainForUser(requireUser(req).id);

  const result = await provider.complete([{ role: 'user', content: prompt }]);
  res.status(200).json({ content: result.content, model: result.model });
}
