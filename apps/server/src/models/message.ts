import { MESSAGE_KINDS, type MessageKind } from '@groupchat/contracts';
import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';

import type { Group } from './group';
import type { User } from './user';

// Re-exported from the shared contract so the column definition and the wire
// type can never drift apart.
export { MESSAGE_KINDS, type MessageKind } from '@groupchat/contracts';

export class Message extends Model<InferAttributes<Message>, InferCreationAttributes<Message>> {
  declare id: CreationOptional<number>;
  /**
   * The message body as plain text.
   *
   * The original stored file shares as a raw `<a href=...>` string in this
   * column and rendered it with innerHTML — both an injection vector and, once
   * Stage E lands, embedding noise. Attachments are structured fields now and
   * this column stays plain text.
   */
  declare body: string;
  declare kind: CreationOptional<MessageKind>;
  declare attachmentUrl: CreationOptional<string | null>;
  declare attachmentName: CreationOptional<string | null>;
  declare userId: ForeignKey<User['id']>;
  declare groupId: ForeignKey<Group['id']>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare user?: NonAttribute<User>;

  public static initialize(sequelize: Sequelize): typeof Message {
    Message.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        // TEXT, not STRING: STRING caps at 255 chars, which silently truncated
        // longer messages in the original.
        body: { type: DataTypes.TEXT, allowNull: false },
        kind: {
          type: DataTypes.ENUM(...MESSAGE_KINDS),
          allowNull: false,
          defaultValue: 'text',
        },
        attachmentUrl: { type: DataTypes.STRING(2048), allowNull: true },
        attachmentName: { type: DataTypes.STRING, allowNull: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        groupId: { type: DataTypes.INTEGER, allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
      },
      {
        sequelize,
        modelName: 'message',
        tableName: 'messages',
        indexes: [
          // History paging is always "messages in this group after this id".
          { fields: ['groupId', 'id'] },
        ],
      },
    );
    return Message;
  }
}
