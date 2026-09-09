// client/src/hooks/useAttachmentRefs.ts
// 본문에 꽂힌 증적 참조(<span class="attachment-ref" data-attachment="원본파일명">)를
// 실제 첨부 카드로 바꾼다.
//
// 정화된 HTML 을 문자열로 다시 조립하지 않고 이미 붙은 DOM 을 손본다. 문자열을 다시
// 만들면 정화 이후 단계가 생겨 XSS 표면이 늘어난다. 여기서는 textContent 와
// addEventListener 만 쓴다.
//
// 카드의 다운로드는 기존 /api/uploads/download 를 타고, 그 라우트가 게시판 권한과
// 비밀글 접근을 다시 검사한다.

import { useEffect, type RefObject } from 'react';
import { formatFileSize, isImageFile } from '../utils/fileUtils';
import { downloadFile } from '../utils/downloadUtils';
import { toast } from '../utils/toast';
import {
  ATTACHMENT_REF_ATTR,
  ATTACHMENT_REF_CLASS,
} from '../components/editor/AttachmentRefPlugin';

export interface AttachmentRefTarget {
  originalName: string;
  storedName: string;
  size?: number;
  url?: string;
}

/** 처리 완료 표시 — 같은 노드를 두 번 꾸미지 않는다 */
const DONE_ATTR = 'data-ref-ready';

export function useAttachmentRefs(
  containerRef: RefObject<HTMLElement | null>,
  attachments: AttachmentRefTarget[],
  onPreviewImage?: (url: string, alt: string) => void,
  /** 이 기능이 꺼져 있으면 참조를 손대지 않는다 (기본값: 켜짐) */
  enabled = true
) {
  useEffect(() => {
    const container = containerRef.current;
    // 꺼져 있을 때 빈 목록을 넘겨 받는 것과는 다르다 —
    // 빈 목록이면 모든 참조가 "삭제된 첨부" 가 되어 버린다.
    // 기능이 꺼진 것은 첨부가 사라진 것이 아니므로 아무것도 하지 않는다.
    if (!container || !enabled) return;

    const byName = new Map(attachments.map(a => [a.originalName, a]));
    const cleanups: Array<() => void> = [];

    container
      .querySelectorAll<HTMLElement>(
        // 클래스·속성 이름은 에디터 플러그인이 정한 것을 그대로 쓴다.
        // 여기에 문자열을 다시 적어 두면, 저장 마크업을 바꿨을 때 읽기 화면만 조용히
        // 참조를 못 알아보는 상태가 된다.
        `span.${ATTACHMENT_REF_CLASS}[${ATTACHMENT_REF_ATTR}]:not([${DONE_ATTR}])`
      )
      .forEach(el => {
        const name = el.getAttribute(ATTACHMENT_REF_ATTR) ?? '';
        const target = byName.get(name);
        el.setAttribute(DONE_ATTR, 'true');

        // 첨부가 지워졌는데 본문 참조만 남은 경우 — 조용히 사라지면 증적이 있었다는
        // 사실 자체가 지워지므로, 무엇이 없어졌는지 남겨 둔다.
        if (!target) {
          el.classList.add('attachment-ref--missing');
          el.textContent = `삭제된 첨부: ${name}`;
          el.setAttribute('title', '이 첨부는 더 이상 게시글에 없습니다.');
          return;
        }

        const image = isImageFile(target.originalName);
        el.classList.add('attachment-ref--ready');
        el.textContent = '';
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('title', image ? `${name} 크게 보기` : `${name} 다운로드`);
        el.setAttribute('aria-label', el.getAttribute('title') as string);

        const icon = document.createElement('span');
        icon.className = 'attachment-ref__icon';
        icon.textContent = image ? '🖼️' : '📎';

        const label = document.createElement('span');
        label.className = 'attachment-ref__name';
        label.textContent = name;

        el.append(icon, label);

        if (target.size) {
          const size = document.createElement('span');
          size.className = 'attachment-ref__size';
          size.textContent = formatFileSize(target.size);
          el.append(size);
        }

        const activate = async () => {
          if (image && onPreviewImage) {
            onPreviewImage(target.url ?? `/api/uploads/download/${target.storedName}`, name);
            return;
          }
          try {
            await downloadFile({
              storedName: target.storedName,
              originalName: target.originalName,
              url: target.url,
            });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : '파일 다운로드에 실패했습니다.');
          }
        };

        const onClick = (e: Event) => {
          e.preventDefault();
          void activate();
        };
        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          void activate();
        };

        el.addEventListener('click', onClick);
        el.addEventListener('keydown', onKeyDown);
        cleanups.push(() => {
          el.removeEventListener('click', onClick);
          el.removeEventListener('keydown', onKeyDown);
        });
      });

    return () => cleanups.forEach(fn => fn());
  }, [containerRef, attachments, onPreviewImage, enabled]);
}
