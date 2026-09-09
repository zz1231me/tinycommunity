// server/src/config/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TinyCommunity API 문서',
      version: '1.0.0',
      description: 'TinyCommunity 프로젝트의 RESTful API 문서입니다.',
      contact: {
        name: 'API Support',
        email: 'support@tinycommunity.local',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: '개발 서버',
      },
      {
        url: 'http://localhost',
        description: 'Nginx 프록시 서버',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'HttpOnly 쿠키를 통한 JWT 인증',
        },
      },
      // 자주 쓰는 응답을 재사용해 라우트 주석을 짧게 유지한다
      responses: {
        Unauthorized: {
          description: '인증이 필요합니다',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Forbidden: {
          description: '권한이 없습니다',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: '대상을 찾을 수 없습니다',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        ValidationError: {
          description: '입력값이 올바르지 않습니다',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
      schemas: {
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {},
            message: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: '오류 메시지',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'admin',
            },
            name: {
              type: 'string',
              example: '관리자',
            },
            role: {
              type: 'string',
              example: 'admin',
            },
            roleInfo: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
        Board: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'notice',
            },
            name: {
              type: 'string',
              example: '공지사항',
            },
            description: {
              type: 'string',
              example: '공지사항 게시판',
            },
            isActive: {
              type: 'boolean',
              example: true,
            },
          },
        },
        Post: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            title: {
              type: 'string',
              example: '게시글 제목',
            },
            content: {
              type: 'string',
              example: '게시글 내용',
            },
            boardType: {
              type: 'string',
              example: 'notice',
            },
            UserId: {
              type: 'string',
              example: 'admin',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
    security: [
      {
        cookieAuth: [],
      },
    ],
    // 태그 순서 = Swagger UI 의 그룹 표시 순서. 정의하지 않으면 등장 순서대로 섞인다.
    tags: [
      { name: 'Auth', description: '로그인·회원가입·세션' },
      { name: 'TwoFactor', description: '2단계 인증(TOTP)' },
      { name: 'Boards', description: '게시판' },
      { name: 'Posts', description: '게시글·수정 이력' },
      { name: 'Comments', description: '댓글·반응' },
      { name: 'Wiki', description: '위키 페이지·리비전' },
      { name: 'Events', description: '캘린더 일정' },
      { name: 'Memos', description: '개인 메모' },
      { name: 'Tags', description: '게시판별 태그' },
      { name: 'Notifications', description: '알림(SSE 스트림 포함)' },
      { name: 'Uploads', description: '파일 업로드·다운로드·썸네일' },
      { name: 'Users', description: '사용자 조회·검색' },
      { name: 'Reports', description: '신고' },
      { name: 'CustomPages', description: '커스텀 페이지·번들' },
      { name: 'Admin', description: '관리자 전용' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
