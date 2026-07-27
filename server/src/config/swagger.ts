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
      schemas: {
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
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
