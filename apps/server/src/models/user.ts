import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';

import type { Group } from './group';
import type { Message } from './message';

/**
 * `InferAttributes` derives the row shape from the class fields, so the model
 * and its TypeScript type can never drift apart — which is the actual payoff of
 * the Stage A migration for the data layer.
 */
export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare email: string;
  declare phone: string;
  /** bcrypt hash. Never selected into a response — see `toPublicJSON`. */
  declare password: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare groups?: NonAttribute<Group[]>;
  declare messages?: NonAttribute<Message[]>;

  /** The only shape a user is ever serialized into. Keeps the hash out of JSON. */
  public toPublicJSON(): PublicUser {
    return { id: this.id, name: this.name, email: this.email };
  }

  public static initialize(sequelize: Sequelize): typeof User {
    User.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING, allowNull: false },
        email: {
          type: DataTypes.STRING,
          allowNull: false,
          // The original schema allowed duplicate signups to race through;
          // login then picked an arbitrary row.
          unique: true,
          validate: { isEmail: true },
        },
        // Stored as text, not BIGINT: phone numbers are identifiers, not
        // quantities, and leading zeros / `+` prefixes matter.
        phone: { type: DataTypes.STRING, allowNull: false },
        password: { type: DataTypes.STRING, allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, modelName: 'user', tableName: 'users' },
    );
    return User;
  }
}

export interface PublicUser {
  id: number;
  name: string;
  email: string;
}
