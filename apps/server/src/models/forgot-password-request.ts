import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';

import type { User } from './user';

export class ForgotPasswordRequest extends Model<
  InferAttributes<ForgotPasswordRequest>,
  InferCreationAttributes<ForgotPasswordRequest>
> {
  /** UUID handed out in the reset link. */
  declare id: string;
  declare userId: ForeignKey<User['id']>;
  declare isActive: CreationOptional<boolean>;
  /** Added in the rebuild: the original link never expired. */
  declare expiresAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  public isUsable(now: Date = new Date()): boolean {
    return this.isActive && this.expiresAt.getTime() > now.getTime();
  }

  public static initialize(sequelize: Sequelize): typeof ForgotPasswordRequest {
    ForgotPasswordRequest.init(
      {
        id: { type: DataTypes.UUID, primaryKey: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        expiresAt: { type: DataTypes.DATE, allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      { sequelize, modelName: 'forgotpasswordrequest', tableName: 'forgotpasswordrequests' },
    );
    return ForgotPasswordRequest;
  }
}
