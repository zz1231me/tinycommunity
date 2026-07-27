// 파일 확장자 제한 제거 + 하드닝에 대한 라이브 통합 테스트
// 실제 업로드 미들웨어(uploadFiles/uploadImages/validateUploadedFile)를 인-프로세스로 마운트해
// multipart 요청을 실제로 흘려보내며 변경된 로직을 검증한다.
import express from 'express';
import request from 'supertest';
import fs from 'fs';

import { uploadFiles, refreshFileUploader } from '../middlewares/upload/file';
import { uploadImages } from '../middlewares/upload/image';
import { validateUploadedFile } from '../middlewares/upload/validator';
import { errorHandler } from '../middlewares/error.middleware';
import { SiteSettings } from '../models/SiteSettings';
import { refreshSettingsCache } from '../utils/settingsCache';

function buildApp() {
  const app = express();
  app.post(
    '/t-file',
    uploadFiles.array('files'),
    validateUploadedFile({ validateContent: false }), // 첨부=다운로드 전용: 내용검증 생략
    (req, res) => {
      const files = (req.files as Express.Multer.File[]) ?? [];
      res.status(200).json({ ok: true, stored: files.map(f => f.filename), paths: files.map(f => f.path) });
    }
  );
  app.post(
    '/t-image',
    uploadImages.single('image'),
    validateUploadedFile(), // 이미지=인라인 서빙: 내용(magic) 검증
    (req, res) => {
      const f = req.file as Express.Multer.File | undefined;
      res.status(200).json({ ok: true, stored: f?.filename, path: f?.path });
    }
  );
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const createdPaths: string[] = [];

function track(res: request.Response) {
  if (res.body?.paths) createdPaths.push(...res.body.paths);
  if (res.body?.path) createdPaths.push(res.body.path);
  return res;
}

// 최소 magic byte 버퍼
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32, 0x20)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 0),
]);
const BIN = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xde, 0xad, 0xbe, 0xef]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

// 설정 캐시/업로더를 기본값 baseline으로 되돌린다.
// destroy만 하면 refreshSettingsCache가 캐시를 기본값으로 리셋하지 않으므로(행이 없으면 유지),
// 기본값 행을 만들어 명시적으로 원복한다. 다른 스위트로의 상태 누수 방지.
async function resetSettingsToDefault() {
  await SiteSettings.destroy({ where: {} });
  await SiteSettings.create({ maxFileCount: 5 } as never);
  await refreshSettingsCache();
  refreshFileUploader();
}

afterAll(async () => {
  for (const p of createdPaths) {
    try {
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* noop */
    }
  }
  await resetSettingsToDefault();
});

describe('첨부 업로드 — 확장자 화이트리스트 제거', () => {
  it('임의 확장자(.bin, octet-stream)를 허용한다', async () => {
    const res = track(
      await request(app)
        .post('/t-file')
        .attach('files', BIN, { filename: 'data.bin', contentType: 'application/octet-stream' })
    );
    expect(res.status).toBe(200);
    expect(res.body.stored[0]).toMatch(/^\d+_[a-f0-9]+$/); // 무확장자 랜덤 저장명
  });

  it('임의 확장자(.psd)를 허용한다', async () => {
    const res = track(
      await request(app)
        .post('/t-file')
        .attach('files', BIN, { filename: 'art.psd', contentType: 'application/octet-stream' })
    );
    expect(res.status).toBe(200);
  });

  it('확장자 없는 파일(README)도 허용한다', async () => {
    const res = track(
      await request(app)
        .post('/t-file')
        .attach('files', Buffer.from('readme'), {
          filename: 'README',
          contentType: 'application/octet-stream',
        })
    );
    expect(res.status).toBe(200);
  });

  it('실제 PDF는 허용하고 저장 후 실행권한이 제거(0644)된다', async () => {
    const res = track(
      await request(app)
        .post('/t-file')
        .attach('files', PDF, { filename: 'doc.pdf', contentType: 'application/pdf' })
    );
    expect(res.status).toBe(200);
    if (process.platform !== 'win32') {
      const mode = fs.statSync(res.body.paths[0]).mode & 0o777;
      expect(mode).toBe(0o644);
    }
  });

  it('DRM 보호 등 시그니처가 비표준인 문서(.pdf 등)도 허용한다 (첨부는 내용검증 생략)', async () => {
    // %PDF 매직넘버가 없는 내용(DRM 래핑 문서 재현) — application/pdf지만 이미지가 아니므로 통과
    const res = track(
      await request(app)
        .post('/t-file')
        .attach('files', Buffer.from('DRM-wrapped: not a standard %PDF header'), {
          filename: 'protected.pdf',
          contentType: 'application/pdf',
        })
    );
    expect(res.status).toBe(200);
  });

  it('image/* MIME 파일을 "첨부"해도 내용검증하지 않는다 (경로 기준 — 첨부는 다운로드 전용)', async () => {
    // 이미지 MIME이지만 첨부 경로라 magic 검증 생략 → DRM/비표준 이미지 첨부도 허용
    const res = track(
      await request(app)
        .post('/t-file')
        .attach('files', Buffer.from('not really a png but attached as image'), {
          filename: 'drm-image.png',
          contentType: 'image/png',
        })
    );
    expect(res.status).toBe(200);
  });
});

describe('첨부 업로드 — 절대차단(floor) + 정규화 우회 차단', () => {
  const blocked: Array<[string, string]> = [
    ['evil.php', '기본'],
    ['evil.php.', '끝 점 우회'],
    ['evil.php ', '끝 공백 우회'],
    ['evil.svg ', 'svg 끝 공백 우회'],
    ['.htaccess', 'dotfile 형태'],
    ['shell.sh', '셸 스크립트'],
  ];
  it.each(blocked)('%s (%s) 은 400으로 차단된다', async filename => {
    const res = track(
      await request(app)
        .post('/t-file')
        .attach('files', BIN, { filename, contentType: 'application/octet-stream' })
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('위험한 파일');
  });
});

describe('업로드 제한 초과 — multer 에러가 5xx가 아닌 4xx로 매핑된다', () => {
  it('maxFileCount(기본 5) 초과 업로드는 400으로 거부한다(500 아님)', async () => {
    let req = request(app).post('/t-file');
    for (let i = 0; i < 6; i++) {
      req = req.attach('files', BIN, {
        filename: `f${i}.bin`,
        contentType: 'application/octet-stream',
      });
    }
    const res = track(await req);
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
  });
});

describe('업로드 한도 동적 반영 — 설정 변경이 이미 등록된 라우트에 적용된다', () => {
  it('maxFileCount를 8로 올리면 기존 라우트도 6개 업로드를 허용한다', async () => {
    // 기본(maxFileCount=5)에서 6개는 초과
    const before = track(
      await (() => {
        let req = request(app).post('/t-file');
        for (let i = 0; i < 6; i++) {
          req = req.attach('files', BIN, {
            filename: `b${i}.bin`,
            contentType: 'application/octet-stream',
          });
        }
        return req;
      })()
    );
    expect(before.status).toBe(400);

    // 설정을 8로 올리고 업로더 재빌드 (관리자 설정 변경 경로 재현)
    await SiteSettings.destroy({ where: {} });
    await SiteSettings.create({ maxFileCount: 8 } as never);
    await refreshSettingsCache();
    refreshFileUploader();

    // 같은 app(이미 등록된 라우트)에서 6개가 이제 허용돼야 함 (동적 위임 검증)
    const after = track(
      await (() => {
        let req = request(app).post('/t-file');
        for (let i = 0; i < 6; i++) {
          req = req.attach('files', BIN, {
            filename: `a${i}.bin`,
            contentType: 'application/octet-stream',
          });
        }
        return req;
      })()
    );
    expect(after.status).toBe(200);

    await resetSettingsToDefault();
  });
});

describe('이미지 업로드 — 인라인 서빙 경로 저장형 XSS 방어', () => {
  it('정상 PNG는 허용된다', async () => {
    const res = track(
      await request(app)
        .post('/t-image')
        .attach('image', PNG, { filename: 'pic.png', contentType: 'image/png' })
    );
    expect(res.status).toBe(200);
  });

  it('이미지 경로는 내용(magic number)을 계속 검증한다 — 내용이 PNG가 아니면 거부', async () => {
    // 첨부(문서)는 내용검증을 생략하지만, 인라인 서빙되는 이미지 경로는 유지됨을 확인
    const res = track(
      await request(app)
        .post('/t-image')
        .attach('image', Buffer.from('not really a png image'), {
          filename: 'fake.png',
          contentType: 'image/png',
        })
    );
    expect(res.status).toBe(400);
  });

  it('관리자가 화이트리스트에 .svg를 넣어도 floor 검사가 svg 업로드를 차단한다', async () => {
    // 이미지 확장자 화이트리스트에 .svg를 강제로 주입 (관리자 오설정 재현)
    await SiteSettings.destroy({ where: {} });
    await SiteSettings.create({
      allowedImageExtensions: JSON.stringify([
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.bmp',
        '.ico',
        '.svg',
      ]),
    } as never);
    await refreshSettingsCache();

    const res = track(
      await request(app)
        .post('/t-image')
        .attach('image', SVG, { filename: 'x.svg', contentType: 'image/svg+xml' })
    );

    expect(res.status).toBe(400); // whitelist 통과했어도 floor가 차단

    await resetSettingsToDefault();
  });
});
