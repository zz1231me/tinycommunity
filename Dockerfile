# ========================================
# 멀티 스테이지 빌드 - TinyCommunity 프로젝트
# ========================================

# ----------------------------------------
# Stage 1: 의존성 설치 및 빌드
# ----------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# 서버 빌드
COPY server/package*.json ./server/
RUN cd server && npm ci

COPY server ./server
RUN cd server && npm run build

# 클라이언트 빌드
COPY client/package*.json ./client/
RUN cd client && npm ci

COPY client ./client
RUN cd client && npm run build

# ----------------------------------------
# Stage 2: 프로덕션 이미지
# ----------------------------------------
FROM node:20-alpine

WORKDIR /app

# 프로덕션 의존성만 설치
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production

# 빌드된 파일 복사
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# 업로드 디렉토리 생성
RUN mkdir -p server/uploads/images server/uploads/files

# 로그 디렉토리 생성
RUN mkdir -p logs

# 정적 파일 공유 디렉토리 — compose 가 여기에 named volume 을 붙이고 nginx 가
# 같은 볼륨을 읽는다. 비워 두면 안 된다.
#
# 도커는 '비어 있는' 볼륨에만 이미지 내용을 복사한다. 앱이 빈 /app/static 으로
# 볼륨을 초기화하면 볼륨은 빈 채로 남고, 뒤이어 생성되는 nginx 가 자기 기본
# html 을 root 소유로 채워 넣으며 소유권까지 덮는다. 그러면 node 로 도는 앱이
# 쓰지 못하고, command 의 `cp ... && exec node ...` 가 cp 에서 끊겨 서버가
# 아예 기동하지 않는다(재시작 루프). 미리 채워 두면 볼륨이 내용과 함께 node
# 소유로 초기화되고, nginx 는 '비어 있지 않음' 을 보고 건드리지 않는다.
COPY --from=builder /app/client/dist ./static

# node 사용자가 업로드/로그 디렉토리에 쓸 수 있도록 소유권 설정
RUN chown -R node:node /app

# 환경변수 파일 복사 (실제 배포 시에는 시크릿 사용 권장)
# COPY server/.env ./server/.env

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 포트 노출
EXPOSE 4000

# 비root 사용자로 실행
USER node

# 서버 시작
CMD ["node", "server/dist/index.js"]
