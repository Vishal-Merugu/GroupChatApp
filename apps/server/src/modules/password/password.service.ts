import { randomUUID } from 'node:crypto';

import { getEnv } from '../../config/env';
import { getSequelize } from '../../db/sequelize';
import { ValidationError } from '../../errors/app-error';
import { ForgotPasswordRequest } from '../../models/forgot-password-request';
import { User } from '../../models/user';
import { sendEmail } from '../../services/email.service';
import { logger } from '../../utils/logger';
import { hashPassword } from '../auth/password.service';

const RESET_LINK_TTL_MS = 60 * 60 * 1000;

/**
 * Issues a reset link.
 *
 * Always resolves, whether or not the address is registered — the original
 * returned 400 "User Not Found!!", which turned the endpoint into an account
 * enumeration oracle. The caller sees the same response either way.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    logger.info('Password reset requested for unknown address', { email });
    return;
  }

  const token = randomUUID();

  // Older links are invalidated so only the newest one works.
  await ForgotPasswordRequest.update(
    { isActive: false },
    { where: { userId: user.id, isActive: true } },
  );

  await ForgotPasswordRequest.create({
    id: token,
    userId: user.id,
    expiresAt: new Date(Date.now() + RESET_LINK_TTL_MS),
  });

  const resetUrl = `${getEnv().APP_BASE_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your GroupChat password',
    html: `<p>Hello ${escapeHtml(user.name)},</p>
<p>Click <a href="${resetUrl}">here</a> to choose a new password. This link expires in one hour.</p>
<p>If you did not request this, you can ignore this email.</p>`,
  });
}

/**
 * Consumes a reset token and sets the new password.
 *
 * Both writes run in one transaction. The original passed the transaction as a
 * third argument to `User.update`, where Sequelize takes only two — so the
 * password write silently ran outside the transaction, and a rollback could
 * leave the password changed with the link still live.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const request = await ForgotPasswordRequest.findByPk(token);
  if (!request || !request.isUsable()) {
    throw new ValidationError('This reset link is invalid or has expired');
  }

  const hash = await hashPassword(newPassword);

  await getSequelize().transaction(async (transaction) => {
    await request.update({ isActive: false }, { transaction });
    await User.update({ password: hash }, { where: { id: request.userId }, transaction });
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
