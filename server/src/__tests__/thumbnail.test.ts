// server/src/__tests__/thumbnail.test.ts
// 썸네일 지연 생성·캐시·정리 동작 검증. 실제 sharp 로 이미지를 만들어 처리한다.

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { THUMBS_DIR, deleteThumbnail, getOrCreateThumbnail } from '../services/thumbnail.service';

let workDir: string;

async function makeImage(name: string, width: number, height: number): Promise<string> {
  const filePath = path.join(workDir, name);
  await sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 120, b: 200 } },
  })
    .png()
    .toFile(filePath);
  return filePath;
}

beforeAll(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumb-test-'));
});

afterAll(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('getOrCreateThumbnail', () => {
  it('큰 이미지를 최대 480px 이내로 줄인 JPEG 을 만든다', async () => {
    const source = await makeImage('big.png', 1600, 900);

    const thumbPath = await getOrCreateThumbnail(source, 'big.png');
    expect(thumbPath).not.toBeNull();

    const meta = await sharp(thumbPath as string).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(480);
    // 비율 유지: 1600x900 → 480x270
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(270);

    await deleteThumbnail('big.png');
  });

  it('원본보다 크게 늘리지 않는다', async () => {
    const source = await makeImage('small.png', 100, 60);

    const thumbPath = await getOrCreateThumbnail(source, 'small.png');
    const meta = await sharp(thumbPath as string).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(60);

    await deleteThumbnail('small.png');
  });

  it('썸네일이 원본보다 작다', async () => {
    const source = await makeImage('shrink.png', 2000, 2000);
    const thumbPath = (await getOrCreateThumbnail(source, 'shrink.png')) as string;

    const [srcStat, thumbStat] = await Promise.all([fs.stat(source), fs.stat(thumbPath)]);
    expect(thumbStat.size).toBeLessThan(srcStat.size);

    await deleteThumbnail('shrink.png');
  });

  it('두 번째 호출은 캐시된 파일을 재사용한다(재생성하지 않음)', async () => {
    const source = await makeImage('cached.png', 800, 600);

    const first = (await getOrCreateThumbnail(source, 'cached.png')) as string;
    const firstStat = await fs.stat(first);

    const second = await getOrCreateThumbnail(source, 'cached.png');
    const secondStat = await fs.stat(second as string);

    expect(second).toBe(first);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);

    await deleteThumbnail('cached.png');
  });

  it('이미지가 아닌 파일에는 null 을 반환한다', async () => {
    const notImage = path.join(workDir, 'notimage.bin');
    await fs.writeFile(notImage, 'this is definitely not an image');

    expect(await getOrCreateThumbnail(notImage, 'notimage.bin')).toBeNull();
  });

  it('원본이 없으면 null 을 반환한다', async () => {
    expect(await getOrCreateThumbnail(path.join(workDir, 'missing.png'), 'missing.png')).toBeNull();
  });

  it('deleteThumbnail 은 캐시 파일을 지우고, 없어도 던지지 않는다', async () => {
    const source = await makeImage('remove.png', 300, 300);
    await getOrCreateThumbnail(source, 'remove.png');

    const thumbPath = path.join(THUMBS_DIR, 'remove.png.jpg');
    await expect(fs.stat(thumbPath)).resolves.toBeDefined();

    await deleteThumbnail('remove.png');
    await expect(fs.stat(thumbPath)).rejects.toThrow();

    // 두 번째 삭제도 조용히 통과해야 한다
    await expect(deleteThumbnail('remove.png')).resolves.toBeUndefined();
  });
});
