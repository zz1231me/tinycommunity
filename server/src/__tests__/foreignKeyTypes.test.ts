// 외래키 컬럼의 타입이 참조 대상 PK 와 같은지 확인한다.
//
// SQLite 는 컬럼 타입을 따지지 않아 어긋나 있어도 조용히 돌아간다. 그런데 MySQL/MariaDB 는
// 외래키 양쪽 타입이 다르면 테이블 생성 자체를 거부한다:
//   Can't create table `...`.`PostRevisions` (errno: 150 "Foreign key constraint is
//   incorrectly formed"), errno 1005
// 개발용 SQLite 에서는 드러나지 않고 MySQL/MariaDB 로 옮기는 순간 기동이 막힌다.
//
// 이 테스트는 Sequelize 의 모델 메타데이터만 보므로 SQLite 로 돌려도 잡힌다.

import '../models';
import { sequelize } from '../config/sequelize';

/** 이 연관관계가 만드는 (외래키를 가진 모델, 컬럼명, 참조 대상 모델) */
interface Link {
  holder: string;
  column: string;
  target: string;
  via: string;
}

function collectLinks(): Link[] {
  const links: Link[] = [];
  for (const model of Object.values(sequelize.models)) {
    for (const [as, assoc] of Object.entries(model.associations)) {
      const a = assoc as unknown as {
        associationType: string;
        foreignKey: string;
        source: { name: string };
        target: { name: string };
      };
      const via = `${model.name}.${as} (${a.associationType})`;
      switch (a.associationType) {
        // 외래키가 source 에 있고 target 의 PK 를 가리킨다
        case 'BelongsTo':
          links.push({ holder: a.source.name, column: a.foreignKey, target: a.target.name, via });
          break;
        // 외래키가 target 에 있고 source 의 PK 를 가리킨다
        case 'HasMany':
        case 'HasOne':
          links.push({ holder: a.target.name, column: a.foreignKey, target: a.source.name, via });
          break;
        // BelongsToMany 는 through 모델의 두 컬럼이 각각 걸리는데,
        // 그 through 모델도 위 두 경우로 따로 잡힌다.
        default:
          break;
      }
    }
  }
  return links;
}

/** DataTypes 인스턴스에서 비교에 쓸 이름을 뽑는다 (STRING / INTEGER / UUID …) */
function typeKey(attr: unknown): string | null {
  const t = (attr as { type?: { key?: string } } | undefined)?.type;
  return t?.key ?? null;
}

describe('외래키 타입 일치', () => {
  const links = collectLinks();

  it('확인할 연관관계가 있다', () => {
    expect(links.length).toBeGreaterThan(20);
  });

  it('모든 외래키가 참조 대상 PK 와 같은 타입이다', () => {
    const mismatches: string[] = [];

    for (const link of links) {
      const holder = sequelize.models[link.holder];
      const target = sequelize.models[link.target];
      if (!holder || !target) continue;

      const fkAttr = holder.rawAttributes[link.column];
      // 연관관계가 컬럼을 자동 생성하는 경우가 있어, 모델에 없으면 검사 대상이 아니다
      if (!fkAttr) continue;

      const pkName = target.primaryKeyAttribute;
      if (!pkName) continue;
      const pkAttr = target.rawAttributes[pkName];

      const fkType = typeKey(fkAttr);
      const pkType = typeKey(pkAttr);
      if (!fkType || !pkType) continue;

      // 길이는 MySQL 이 달라도 받아 준다(문자열 한정). 타입 종류가 다르면 거부한다.
      if (fkType !== pkType) {
        mismatches.push(
          `${link.holder}.${link.column} = ${fkType}  ≠  ${link.target}.${pkName} = ${pkType}   [${link.via}]`
        );
      }
    }

    expect(mismatches).toEqual([]);
  });
});
