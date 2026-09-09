// 테스트 DB 초기화 - 테스트 프레임워크 로드 후 실행됨 (jest setupFilesAfterEnv)
import { sequelize } from '../config/sequelize';
import '../models'; // 모든 모델 + 관계 초기화

beforeAll(async () => {
  // SQLite 인메모리 DB 동기화
  // authenticate()로 연결이 살아있을 때만 sync — --runInBand에서 스위트 간 재사용
  try {
    await sequelize.authenticate();
  } catch {
    // 연결이 닫혀 있으면 재연결 불필요 (SQLite in-memory는 자동 재생성)
  }
  // force-sync는 모든 테이블을 drop 후 재생성한다. FK 강제(foreign_keys=ON) 상태에선
  // drop 순서에 따라 실패할 수 있어(예: users drop 시 이미 사라진 comments 참조), 모델 집합이
  // 바뀌면 깨질 수 있다. 파괴적 동기화 동안만 FK를 끄고 끝나면 복구한다.
  await sequelize.query('PRAGMA foreign_keys = OFF');
  await sequelize.sync({ force: true });
  await sequelize.query('PRAGMA foreign_keys = ON');
});

// sequelize.close()를 호출하지 않는다.
// --runInBand 환경에서 스위트가 공유 연결을 사용하므로 첫 번째 afterAll이
// 이후 스위트의 DB 접근을 끊는다. Jest --forceExit으로 프로세스 종료 시 정리된다.
