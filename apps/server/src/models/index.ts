import type { Sequelize } from 'sequelize';

import { getSequelize } from '../db/sequelize';
import { ForgotPasswordRequest } from './forgot-password-request';
import { Group } from './group';
import { LlmCredential } from './llm-credential';
import { Message } from './message';
import { User } from './user';
import { UserGroup } from './user-group';

export { ForgotPasswordRequest, Group, LlmCredential, Message, User, UserGroup };
export type { PublicUser } from './user';
export { MESSAGE_KINDS, type MessageKind } from './message';

let initialized = false;

/**
 * Registers every model and its associations against one connection.
 *
 * The original wired associations at the bottom of `app.js`, which meant
 * importing a model for a test dragged in the whole HTTP app. Doing it in one
 * explicit call keeps model setup independent of the server.
 */
export function initModels(sequelize: Sequelize = getSequelize()): Sequelize {
  if (initialized) {
    return sequelize;
  }

  User.initialize(sequelize);
  Group.initialize(sequelize);
  UserGroup.initialize(sequelize);
  Message.initialize(sequelize);
  ForgotPasswordRequest.initialize(sequelize);
  LlmCredential.initialize(sequelize);

  User.belongsToMany(Group, { through: UserGroup, foreignKey: 'userId', otherKey: 'groupId' });
  Group.belongsToMany(User, { through: UserGroup, foreignKey: 'groupId', otherKey: 'userId' });

  // The join model is also queried directly (membership + admin checks), so it
  // needs its own associations, not just the belongsToMany above.
  User.hasMany(UserGroup, { foreignKey: 'userId' });
  UserGroup.belongsTo(User, { foreignKey: 'userId' });
  Group.hasMany(UserGroup, { foreignKey: 'groupId' });
  UserGroup.belongsTo(Group, { foreignKey: 'groupId' });

  User.hasMany(Message, { foreignKey: 'userId' });
  Message.belongsTo(User, { foreignKey: 'userId' });
  // Deleting a group takes its messages with it; the original left orphans.
  Group.hasMany(Message, { foreignKey: 'groupId', onDelete: 'CASCADE' });
  Message.belongsTo(Group, { foreignKey: 'groupId' });

  User.hasMany(ForgotPasswordRequest, { foreignKey: 'userId', onDelete: 'CASCADE' });
  ForgotPasswordRequest.belongsTo(User, { foreignKey: 'userId' });

  User.hasMany(LlmCredential, { foreignKey: 'userId', onDelete: 'CASCADE' });
  LlmCredential.belongsTo(User, { foreignKey: 'userId' });

  initialized = true;
  return sequelize;
}

/** Test helper — allows re-initialising against a fresh connection. */
export function resetModelRegistration(): void {
  initialized = false;
}
