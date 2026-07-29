-- 죽은 스키마 정리 (선택) — 실제 디스크 공간 회수용.
-- ★파괴적(되돌릴 수 없음). 반드시 DB 백업 후 실행하세요.
-- 앱 코드에서는 이미 이 컬럼/모델을 제거했고(모델에서 미참조), sync(alter:false)는 이 컬럼들을
-- 자동으로 삭제하지 않으므로, 공간을 회수하려면 아래를 수동 실행합니다.
--
-- 대상(사용 흔적 0, 기능 미구현/제거 잔재):
--   users:    bio, phoneNumber, isEmailVerified, emailVerificationToken
--   comments: dislikeCount
--   posts:    isNotice, publishedAt, deletedBy
--   table:    PostBookmarks (북마크는 bookmarks 테이블 사용, 이 테이블은 생성 코드 0=항상 비어있음)
--
-- MariaDB/MySQL: 아래 그대로 실행.
-- SQLite: 3.35.0(2021) 이상에서 DROP COLUMN 지원. 그 이하 버전은 테이블 재생성 필요.

ALTER TABLE `users` DROP COLUMN `bio`;
ALTER TABLE `users` DROP COLUMN `phoneNumber`;
ALTER TABLE `users` DROP COLUMN `isEmailVerified`;
ALTER TABLE `users` DROP COLUMN `emailVerificationToken`;

ALTER TABLE `comments` DROP COLUMN `dislikeCount`;

ALTER TABLE `posts` DROP COLUMN `isNotice`;
ALTER TABLE `posts` DROP COLUMN `publishedAt`;
ALTER TABLE `posts` DROP COLUMN `deletedBy`;

DROP TABLE IF EXISTS `PostBookmarks`;
