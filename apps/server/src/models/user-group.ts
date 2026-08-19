import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

import type { Group } from './group';
import type { User } from './user';

/**
 * Membership join table. `isAdmin` lives here rather than on the user because
 * admin rights are per-group.
 */
export class UserGroup extends Model<
  InferAttributes<UserGroup>,
  InferCreationAttributes<UserGroup>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare groupId: ForeignKey<Group['id']>;
  declare isAdmin: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  public static initialize(sequelize: Sequelize): typeof UserGroup {
    UserGroup.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        groupId: { type: DataTypes.INTEGER, allowNull: false },
        // Defaulted to false. The original defaulted membership to `true`,
        // which silently made every added member a group admin.
        isAdmin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        modelName: 'usergroup',
        tableName: 'usergroups',
        indexes: [{ unique: true, fields: ['userId', 'groupId'] }],
      },
    );
    return UserGroup;
  }
}
