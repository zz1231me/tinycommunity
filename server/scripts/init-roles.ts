// ============================================================================
// 역할(Role) 초기 데이터 생성 스크립트
// 사용법: cd server && npx ts-node scripts/init-roles.ts
// ============================================================================

import { sequelize } from '../src/config/sequelize';
import { Role } from '../src/models/Role';

async function initRoles() {
  try {
    console.log('🔄 역할 데이터 초기화 시작...');
    
    // 데이터베이스 연결
    await sequelize.authenticate();
    console.log('✅ 데이터베이스 연결 성공');
    
    // 기존 역할 확인
    const existingRoles = await Role.findAll();
    console.log(`📊 기존 역할 개수: ${existingRoles.length}`);
    
    if (existingRoles.length > 0) {
      console.log('ℹ️ 기존 역할 목록:');
      existingRoles.forEach(role => {
        console.log(`  - ${role.id}: ${role.name} (활성: ${role.isActive})`);
      });
    }
    
    // 기본 역할 생성 (없을 경우에만)
    const roles = [
      {
        id: 'admin',
        name: '관리자',
        description: '모든 권한을 가진 최고 관리자',
        isActive: true
      },
      {
        id: 'manager',
        name: '매니저',
        description: '게시판 및 사용자 관리 권한',
        isActive: true
      },
      {
        id: 'user',
        name: '일반 사용자',
        description: '기본 사용자 권한',
        isActive: true
      },
      {
        id: 'guest',
        name: '게스트',
        description: '읽기 전용 권한',
        isActive: true
      }
    ];
    
    for (const roleData of roles) {
      const [role, created] = await Role.findOrCreate({
        where: { id: roleData.id },
        defaults: roleData
      });
      
      if (created) {
        console.log(`✅ 역할 생성: ${role.id} - ${role.name}`);
      } else {
        console.log(`ℹ️ 역할 존재: ${role.id} - ${role.name}`);
      }
    }
    
    // 최종 확인
    const finalRoles = await Role.findAll({
      order: [['id', 'ASC']]
    });
    
    console.log('\n📊 최종 역할 목록:');
    console.table(finalRoles.map(r => ({
      ID: r.id,
      이름: r.name,
      설명: r.description,
      활성: r.isActive ? '✅' : '❌'
    })));
    
    console.log('\n✅ 역할 초기화 완료!');
    
  } catch (error) {
    console.error('❌ 역할 초기화 실패:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// 스크립트 실행
initRoles()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
