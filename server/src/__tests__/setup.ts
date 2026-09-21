// 테스트 DB 초기화. jest setupFilesAfterEnv 로 실행된다.
import { sequelize } from '../config/sequelize';
import '../models';
import { initializeUploadDirs } from '../middlewares/upload/utils';
import { startTestServer } from './helpers';

beforeAll(async () => {
  // 모든 스위트가 서버 하나를 함께 쓴다(helpers.ts 참고).
  await startTestServer();

  // 테스트는 startServer() 를 거치지 않으므로 업로드 디렉터리를 여기서 만든다.
  await initializeUploadDirs();

  // 연결이 살아 있을 때만 sync 한다. --runInBand 에서 스위트끼리 연결을 재사용한다.
  try {
    await sequelize.authenticate();
  } catch {
    // SQLite in-memory 는 자동 재생성되므로 재연결하지 않는다.
  }
  // force-sync 의 drop 순서가 FK 에 걸릴 수 있어 동기화 동안만 FK 를 끈다.
  await sequelize.query('PRAGMA foreign_keys = OFF');
  await sequelize.sync({ force: true });
  await sequelize.query('PRAGMA foreign_keys = ON');
});

// sequelize.close() 를 부르지 않는다. 연결을 공유하므로 첫 afterAll 이 이후 스위트를 끊는다.
