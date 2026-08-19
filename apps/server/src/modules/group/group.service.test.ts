import type { Sequelize } from 'sequelize';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Group } from '../../models/group';
import { User } from '../../models/user';
import { UserGroup } from '../../models/user-group';
import { createTestDatabase } from '../../test/db';
import { createGroup, deleteGroup, getGroupDetail, listGroupsForUser, updateGroup } from './group.service';

async function makeUser(name: string): Promise<User> {
  return User.create({
    name,
    email: `${name.toLowerCase()}@example.com`,
    phone: '+491234567890',
    password: 'hashed',
  });
}

describe('group service', () => {
  let sequelize: Sequelize;
  let owner: User;
  let member: User;
  let outsider: User;

  beforeEach(async () => {
    sequelize = await createTestDatabase();
    owner = await makeUser('Owner');
    member = await makeUser('Member');
    outsider = await makeUser('Outsider');
  });

  afterEach(async () => {
    await sequelize.close();
  });

  it('creates the group and all memberships before returning', async () => {
    // The original responded before its async forEach had inserted anything,
    // so a read straight after creation saw an empty group.
    const group = await createGroup(owner, {
      name: 'Planning',
      members: [member.email],
      admins: [],
    });

    const rows = await UserGroup.findAll({ where: { groupId: group.id } });
    expect(rows).toHaveLength(2);
    expect(group.members.map((m) => m.email).sort()).toEqual(
      [owner.email, member.email].sort(),
    );
  });

  it('makes the creator an admin and plain members non-admin', async () => {
    const group = await createGroup(owner, {
      name: 'Planning',
      members: [member.email],
      admins: [],
    });

    const detail = await getGroupDetail(owner.id, group.id);
    expect(detail.members.find((m) => m.email === owner.email)?.isAdmin).toBe(true);
    // The original defaulted `isadmin` to true, silently making everyone admin.
    expect(detail.members.find((m) => m.email === member.email)?.isAdmin).toBe(false);
  });

  it('rejects a member email that is not a registered user', async () => {
    await expect(
      createGroup(owner, { name: 'Planning', members: ['ghost@example.com'], admins: [] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rolls back the group when membership creation fails', async () => {
    await createGroup(owner, { name: 'Valid', members: [], admins: [] }).catch(() => undefined);
    await expect(
      createGroup(owner, { name: 'Broken', members: ['ghost@example.com'], admins: [] }),
    ).rejects.toThrow();

    expect(await Group.findOne({ where: { name: 'Broken' } })).toBeNull();
  });

  it('lists only the groups a user belongs to', async () => {
    const mine = await createGroup(owner, { name: 'Mine', members: [], admins: [] });
    await createGroup(outsider, { name: 'Theirs', members: [], admins: [] });

    const groups = await listGroupsForUser(owner.id);
    expect(groups.map((g) => g.id)).toEqual([mine.id]);
  });

  it('hides a group from a non-member entirely', async () => {
    const group = await createGroup(owner, { name: 'Private', members: [], admins: [] });

    // 404 rather than 403 — a non-member should not learn the group exists.
    await expect(getGroupDetail(outsider.id, group.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('refuses deletion by a non-admin member', async () => {
    const group = await createGroup(owner, {
      name: 'Planning',
      members: [member.email],
      admins: [],
    });

    await expect(deleteGroup(member, group.id)).rejects.toMatchObject({ statusCode: 403 });
    expect(await Group.findByPk(group.id)).not.toBeNull();
  });

  it('refuses deletion by a complete outsider', async () => {
    // In the original, any authenticated user could delete any group by id.
    const group = await createGroup(owner, { name: 'Planning', members: [], admins: [] });

    await expect(deleteGroup(outsider, group.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await Group.findByPk(group.id)).not.toBeNull();
  });

  it('deletes the group and its memberships when an admin asks', async () => {
    const group = await createGroup(owner, {
      name: 'Planning',
      members: [member.email],
      admins: [],
    });

    await deleteGroup(owner, group.id);

    expect(await Group.findByPk(group.id)).toBeNull();
    expect(await UserGroup.count({ where: { groupId: group.id } })).toBe(0);
  });

  it('removes members that are dropped from the submitted list', async () => {
    const group = await createGroup(owner, {
      name: 'Planning',
      members: [member.email, outsider.email],
      admins: [],
    });

    const updated = await updateGroup(owner, group.id, {
      name: 'Planning v2',
      members: [member.email],
      admins: [],
    });

    expect(updated.name).toBe('Planning v2');
    expect(updated.members.map((m) => m.email).sort()).toEqual([member.email, owner.email].sort());
  });

  it('promotes an existing member to admin', async () => {
    const group = await createGroup(owner, {
      name: 'Planning',
      members: [member.email],
      admins: [],
    });

    const updated = await updateGroup(owner, group.id, {
      members: [member.email],
      admins: [member.email],
    });

    expect(updated.members.find((m) => m.email === member.email)?.isAdmin).toBe(true);
  });

  it('refuses an update from a non-admin member', async () => {
    const group = await createGroup(owner, {
      name: 'Planning',
      members: [member.email],
      admins: [],
    });

    await expect(
      updateGroup(member, group.id, { name: 'Hijacked' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
