// server/src/models/IpRule.ts — IP 화이트리스트/블랙리스트 규칙 모델

import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/sequelize';

export type IpRuleType = 'whitelist' | 'blacklist';

export interface IpRuleAttributes {
  id: string;
  type: IpRuleType;
  ip: string; // 단일 IP (192.168.1.1) 또는 CIDR (192.168.1.0/24)
  description: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IpRuleCreationAttributes extends Optional<
  IpRuleAttributes,
  'id' | 'description' | 'isActive'
> {}

export class IpRule
  extends Model<IpRuleAttributes, IpRuleCreationAttributes>
  implements IpRuleAttributes
{
  declare public id: string;
  declare public type: IpRuleType;
  declare public ip: string;
  declare public description: string | null;
  declare public isActive: boolean;
  declare public createdBy: string;
  declare public readonly createdAt: Date;
  declare public readonly updatedAt: Date;
}

IpRule.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM('whitelist', 'blacklist'),
      allowNull: false,
      comment: '규칙 유형: whitelist(허용) / blacklist(차단)',
    },
    ip: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '단일 IP 또는 CIDR 표기 (예: 192.168.1.1, 10.0.0.0/8)',
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
      comment: '규칙 설명 (선택)',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '활성 여부',
    },
    createdBy: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '생성 관리자 ID',
    },
  },
  {
    sequelize,
    tableName: 'ip_rules',
    modelName: 'IpRule',
    timestamps: true,
    indexes: [{ fields: ['type', 'isActive'] }, { fields: ['ip'] }],
  }
);

export default IpRule;
