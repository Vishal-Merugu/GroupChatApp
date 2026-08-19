import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';

import type { Message } from './message';
import type { User } from './user';
import type { UserGroup } from './user-group';

export class Group extends Model<InferAttributes<Group>, InferCreationAttributes<Group>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare users?: NonAttribute<User[]>;
  declare messages?: NonAttribute<Message[]>;
  /** Present only on queries that include the join model. */
  declare usergroup?: NonAttribute<UserGroup>;

  public static initialize(sequelize: Sequelize): typeof Group {
    Group.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, modelName: 'group', tableName: 'groups' },
    );
    return Group;
  }
}
