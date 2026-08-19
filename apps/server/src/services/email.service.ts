import { getEnv } from '../config/env';
import { ExternalServiceError } from '../errors/app-error';
import { logger } from '../utils/logger';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Brevo (formerly SendinBlue) transactional email over its REST API.
 *
 * Called through `fetch` rather than the `sib-api-v3-sdk` package the original
 * used: that SDK ships no types, and Decision 8 rules out papering over an
 * untyped dependency with `any`. The one endpoint needed is a plain POST.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const env = getEnv();

  if (!env.SIB_API_KEY) {
    // In development a reset link is logged instead of mailed, so the flow is
    // exercisable without an email provider account.
    if (env.NODE_ENV === 'production') {
      throw new ExternalServiceError('email', 'SIB_API_KEY is not configured');
    }
    logger.warn('Email provider not configured — logging message instead', {
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return;
  }

  let response: Response;
  try {
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'api-key': env.SIB_API_KEY,
      },
      body: JSON.stringify({
        sender: { email: env.MAIL_SENDER_EMAIL, name: env.MAIL_SENDER_NAME },
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
      }),
    });
  } catch (error) {
    throw new ExternalServiceError('email', 'could not reach the email provider', error);
  }

  if (!response.ok) {
    throw new ExternalServiceError('email', `provider responded with ${response.status}`);
  }
}
