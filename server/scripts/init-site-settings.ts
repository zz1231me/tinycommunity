// ============================================================================
// 사이트 설정 초기화 스크립트
// 사용법: cd server && npx ts-node scripts/init-site-settings.ts
// ============================================================================

import { sequelize } from '../src/config/sequelize';

async function initSiteSettings() {
  try {
    console.log('🔄 사이트 설정 초기화 시작...');
    
    // 데이터베이스 연결
    await sequelize.authenticate();
    console.log('✅ 데이터베이스 연결 성공');
    
    // 사이트 설정 생성
    const [result] = await sequelize.query(`
      INSERT OR REPLACE INTO site_settings 
      (id, siteName, description, logoUrl, createdAt, updatedAt) 
      VALUES (
        1,
        'TinyCommunity',
        '',
        NULL,
        datetime('now'),
        datetime('now')
      )
    `);
    
    console.log('✅ 사이트 설정 생성/업데이트 완료');
    
    // 확인
    const [settings] = await sequelize.query('SELECT * FROM site_settings');
    console.log('\n📊 현재 사이트 설정:');
    console.table(settings);
    
    console.log('\n✅ 사이트 설정 초기화 완료!');
    
  } catch (error) {
    console.error('❌ 사이트 설정 초기화 실패:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// 스크립트 실행
initSiteSettings()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
