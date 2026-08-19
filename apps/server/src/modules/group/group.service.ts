import { Op } from 'sequelize';

import { getSequelize } from '../../db/sequelize';
import { ValidationError } from '../../errors/app-error';
import { Group } from '../../models/group';
import { User } from '../../models/user';
import { UserGroup } from '../../models/user-group';
import { requireGroupAdmin, requireMembership } from './membership.service';
import type { CreateGroupInput, UpdateGroupInput } from './group.schemas';

export interface GroupSummary {
  id: number;
  name: string;
  isAdmin: boolean;
}

export interface GroupMember {
  userId: number;
  name: string;
  email: string;
  isAdmin: boolean;
}

export interface GroupDetail {
  id: number;
  name: string;
  members: GroupMember[];
}

/**
 * Creates a group and its memberships in one transaction.
 *
 * The original looped members with `members.forEach(async ...)` and responded
 * immediately — the membership inserts raced the response, so a client that
 * fetched the group right after creation often saw it empty, and any insert
 * error vanished into an unhandled rejection.
 */
export async function createGroup(creator: User, input: CreateGroupInput): Promise<GroupDetail> {
  const sequelize = getSequelize();

  return sequelize.transaction(async (transaction) => {
    const group = await Group.create({ name: input.name }, { transaction });

    const invitees = await resolveMembers(input.members, creator.email);
    const adminEmails = new Set(input.admins);

    const rows = [
      // The creator always ends up an admin of their own group.
      { userId: creator.id, groupId: group.id, isAdmin: true },
      ...invitees.map((user) => ({
        userId: user.id,
        groupId: group.id,
        isAdmin: adminEmails.has(user.email),
      })),
    ];

    await UserGroup.bulkCreate(rows, { transaction });

    return {
      id: group.id,
      name: group.name,
      members: [
        { userId: creator.id, name: creator.name, email: creator.email, isAdmin: true },
        ...invitees.map((user) => ({
          userId: user.id,
          name: user.name,
          email: user.email,
          isAdmin: adminEmails.has(user.email),
        })),
      ],
    };
  });
}

export async function listGroupsForUser(userId: number): Promise<GroupSummary[]> {
  const memberships = await UserGroup.findAll({
    where: { userId },
    include: [{ model: Group, required: true }],
    order: [['groupId', 'ASC']],
  });

  return memberships.flatMap((membership) => {
    const group = membership.get('group');
    // `include` is typed as optional; skip rather than assert it is present.
    return group instanceof Group
      ? [{ id: group.id, name: group.name, isAdmin: membership.isAdmin }]
      : [];
  });
}

export async function getGroupDetail(userId: number, groupId: number): Promise<GroupDetail> {
  const { group } = await requireMembership(userId, groupId);

  // One query with a join, not the original's N+1 loop of findOne-per-member.
  const memberships = await UserGroup.findAll({
    where: { groupId },
    include: [{ model: User, required: true }],
    order: [['userId', 'ASC']],
  });

  const members = memberships.flatMap<GroupMember>((membership) => {
    const user = membership.get('user');
    return user instanceof User
      ? [{ userId: user.id, name: user.name, email: user.email, isAdmin: membership.isAdmin }]
      : [];
  });

  return { id: group.id, name: group.name, members };
}

/** Admin-only. Reconciles the member list to exactly what was submitted. */
export async function updateGroup(
  actor: User,
  groupId: number,
  input: UpdateGroupInput,
): Promise<GroupDetail> {
  await requireGroupAdmin(actor.id, groupId);
  const sequelize = getSequelize();

  await sequelize.transaction(async (transaction) => {
    if (input.name !== undefined) {
      await Group.update({ name: input.name }, { where: { id: groupId }, transaction });
    }

    if (input.members === undefined) {
      return;
    }

    const desired = await resolveMembers(input.members, actor.email);
    const desiredIds = new Set([actor.id, ...desired.map((user) => user.id)]);
    const adminEmails = new Set(input.admins ?? []);

    // Removals first, so a member moved out in the same request cannot linger.
    await UserGroup.destroy({
      where: { groupId, userId: { [Op.notIn]: [...desiredIds] } },
      transaction,
    });

    const existing = await UserGroup.findAll({ where: { groupId }, transaction });
    const existingByUserId = new Map(existing.map((row) => [row.userId, row]));

    for (const user of desired) {
      const shouldBeAdmin = adminEmails.has(user.email);
      const current = existingByUserId.get(user.id);

      if (!current) {
        await UserGroup.create(
          { userId: user.id, groupId, isAdmin: shouldBeAdmin },
          { transaction },
        );
      } else if (current.isAdmin !== shouldBeAdmin) {
        await current.update({ isAdmin: shouldBeAdmin }, { transaction });
      }
    }

    // Guard against an admin demoting the last admin and locking the group.
    const adminCount = await UserGroup.count({ where: { groupId, isAdmin: true }, transaction });
    if (adminCount === 0) {
      throw new ValidationError('A group must keep at least one admin');
    }
  });

  return getGroupDetail(actor.id, groupId);
}

export async function deleteGroup(actor: User, groupId: number): Promise<void> {
  const group = await requireGroupAdmin(actor.id, groupId);
  // Memberships and messages cascade via the associations in models/index.ts.
  await group.destroy();
}

/**
 * Maps submitted emails to real users. Unknown addresses are reported rather
 * than silently dropped, which is what the original did — a typo'd invite just
 * never appeared and the creator got no indication why.
 */
async function resolveMembers(emails: string[], creatorEmail: string): Promise<User[]> {
  const unique = [...new Set(emails)].filter((email) => email !== creatorEmail);
  if (unique.length === 0) {
    return [];
  }

  const users = await User.findAll({ where: { email: { [Op.in]: unique } } });
  const found = new Set(users.map((user) => user.email));
  const missing = unique.filter((email) => !found.has(email));

  if (missing.length > 0) {
    throw new ValidationError('Some members are not registered users', { members: missing });
  }

  return users;
}
