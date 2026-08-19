import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { getEnv } from '../config/env';
import { ExternalServiceError } from '../errors/app-error';
import { logger } from '../utils/logger';

let client: S3Client | undefined;

function getClient(): S3Client {
  const env = getEnv();
  if (!env.BUCKET_NAME || !env.IAM_ACCESS_KEY || !env.IAM_SECRET_KEY) {
    throw new ExternalServiceError('s3', 'file uploads are not configured');
  }

  client ??= new S3Client({
    region: env.AWS_REGION,
    credentials: { accessKeyId: env.IAM_ACCESS_KEY, secretAccessKey: env.IAM_SECRET_KEY },
  });
  return client;
}

export interface UploadResult {
  url: string;
  key: string;
}

/**
 * Uploads a buffer to S3.
 *
 * Rewritten from the callback/Promise hybrid in the original, which resolved
 * from inside an `s3.upload` callback while also awaiting it — and buffered the
 * request to a file on local disk with `fs.appendFileSync` first, which does
 * not survive a container restart and blocks the event loop per chunk.
 */
export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const env = getEnv();
  const bucket = env.BUCKET_NAME;
  if (!bucket) {
    throw new ExternalServiceError('s3', 'BUCKET_NAME is not configured');
  }

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // The original set `ACL: 'public-read'`, making every shared file
        // world-readable to anyone who guessed the URL. Objects stay private;
        // access goes through the app.
      }),
    );
  } catch (error) {
    logger.error('S3 upload failed', { key, error: String(error) });
    throw new ExternalServiceError('s3', 'could not upload file', error);
  }

  return { key, url: `https://${bucket}.s3.${env.AWS_REGION}.amazonaws.com/${key}` };
}

/** Namespaced, collision-free object key. */
export function buildAttachmentKey(groupId: number, userId: number, fileName: string): string {
  const safeName = fileName.replace(/[^\w.-]/g, '_').slice(0, 120);
  return `groups/${groupId}/users/${userId}/${Date.now()}-${safeName}`;
}
