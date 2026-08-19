import { PROVIDER_KINDS, type ProviderKind } from '@groupchat/contracts';
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

/**
 * A user's own API key for one LLM provider (BYOK). `encryptedApiKey` is never
 * read outside `llm-credential.service.ts`, and never serialized — the DTO
 * exposed to clients is `maskedApiKey` only, computed once at write time so
 * display never requires decrypting.
 */
export class LlmCredential extends Model<
  InferAttributes<LlmCredential>,
  InferCreationAttributes<LlmCredential>
> {
  declare id: CreationOptional<number>;
  declare userId: ForeignKey<User['id']>;
  declare provider: ProviderKind;
  declare label: string;
  declare model: string;
  declare baseUrl: string | null;
  declare encryptedApiKey: string | null;
  declare maskedApiKey: string | null;
  /** Lower runs first. Unique per user so ordering is never ambiguous. */
  declare priority: number;
  declare enabled: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  public static initialize(sequelize: Sequelize): typeof LlmCredential {
    LlmCredential.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        provider: { type: DataTypes.ENUM(...PROVIDER_KINDS), allowNull: false },
        label: { type: DataTypes.STRING, allowNull: false },
        model: { type: DataTypes.STRING, allowNull: false },
        baseUrl: { type: DataTypes.STRING(2048), allowNull: true },
        encryptedApiKey: { type: DataTypes.TEXT, allowNull: true },
        maskedApiKey: { type: DataTypes.STRING(16), allowNull: true },
        priority: { type: DataTypes.INTEGER, allowNull: false },
        enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        modelName: 'llmcredential',
        tableName: 'llmcredentials',
        indexes: [{ unique: true, fields: ['userId', 'priority'] }],
      },
    );
    return LlmCredential;
  }
}
