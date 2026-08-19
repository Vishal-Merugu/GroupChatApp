import { ConflictError, UnauthorizedError } from '../../errors/app-error';
import { User, type PublicUser } from '../../models/user';
import { hashPassword, verifyPassword } from '../auth/password.service';
import { signAccessToken } from '../auth/token.service';
import type { LoginInput, SignUpInput } from './user.schemas';

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const existing = await User.findOne({ where: { email: input.email } });
  if (existing) {
    // 409, not the original's 404 — the account exists, that is the problem.
    throw new ConflictError('An account with that email already exists');
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    phone: input.phone,
    password: await hashPassword(input.password),
  });

  // Signup logs you straight in; the original made the client post to /login again.
  return { token: signAccessToken(user), user: user.toPublicJSON() };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await User.findOne({ where: { email: input.email } });

  // Deliberately identical responses for "no such user" and "wrong password":
  // the original returned 400 vs 401, which let anyone enumerate registered
  // email addresses.
  if (!user || !(await verifyPassword(input.password, user.password))) {
    throw new UnauthorizedError('Incorrect email or password');
  }

  return { token: signAccessToken(user), user: user.toPublicJSON() };
}
