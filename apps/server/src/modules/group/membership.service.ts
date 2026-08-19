import { ForbiddenError, NotFoundError } from '../../errors/app-error';
import { Group } from '../../models/group';
import { UserGroup } from '../../models/user-group';

export interface Membership {
  group: Group;
  isAdmin: boolean;
}

/**
 * Shared authorization gate. Every group-scoped operation — REST and socket
 * alike — goes through here.
 *
 * The original performed no membership check anywhere: `DELETE /groups/:id`
 * looked up the group and destroyed it, so any logged-in user could delete any
 * group in the system, and `getMessages` was not even behind `authenticate`.
 */
export async function requireMembership(userId: number, groupId: number): Promise<Membership> {
  const group = await Group.findByPk(groupId);
  if (!group) {
    throw new NotFoundError('Group');
  }

  const membership = await UserGroup.findOne({ where: { userId, groupId } });
  if (!membership) {
    // 404 rather than 403: a non-member should not learn the group exists.
    throw new NotFoundError('Group');
  }

  return { group, isAdmin: membership.isAdmin };
}

export async function requireGroupAdmin(userId: number, groupId: number): Promise<Group> {
  const { group, isAdmin } = await requireMembership(userId, groupId);
  if (!isAdmin) {
    throw new ForbiddenError('Only group admins can perform this action');
  }
  return group;
}

export async function isMember(userId: number, groupId: number): Promise<boolean> {
  const membership = await UserGroup.findOne({ where: { userId, groupId } });
  return membership !== null;
}
