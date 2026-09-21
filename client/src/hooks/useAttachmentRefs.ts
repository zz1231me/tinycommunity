// 본문의 증적 참조 span 을 첨부 카드로 바꾼다.
// HTML 문자열을 다시 조립하지 않고 DOM 만 손댄다(정화 이후 단계를 만들지 않기 위함).

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

/** 처리 완료 표시. 같은 노드를 두 번 꾸미지 않는다. */
const DONE_ATTR = 'data-ref-ready';

export function useAttachmentRefs(
  containerRef: RefObject<HTMLElement | null>,
  attachments: AttachmentRefTarget[],
  onPreviewImage?: (url: string, alt: string) => void,
  /** 꺼져 있으면 참조를 손대지 않는다 */
  enabled = true
) {
  useEffect(() => {
    const container = containerRef.current;
    // 기능이 꺼진 것은 빈 목록과 다르다. 빈 목록이면 모든 참조가 '삭제된 첨부' 가 된다.
    if (!container || !enabled) return;

    const byName = new Map(attachments.map(a => [a.originalName, a]));
    let cleanups: Array<() => void> = [];

    const decorate = () => {
      // 이전 회차 리스너는 노드와 함께 사라졌으므로 목록만 비운다
      cleanups = [];
      container
        .querySelectorAll<HTMLElement>(
          // 클래스·속성 이름은 에디터 플러그인 상수를 그대로 쓴다. 문자열로 복제하지 말 것.
          `span.${ATTACHMENT_REF_CLASS}[${ATTACHMENT_REF_ATTR}]:not([${DONE_ATTR}])`
        )
        .forEach(el => {
          const name = el.getAttribute(ATTACHMENT_REF_ATTR) ?? '';
          const target = byName.get(name);
          el.setAttribute(DONE_ATTR, 'true');

          // 첨부가 지워지고 참조만 남은 경우, 무엇이 없어졌는지 남겨 둔다
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
    };

    decorate();

    // 본문이 다시 그려지면 다시 꾸민다. subtree 를 보지 않아야 자기 자신을 다시 부르지 않는다.
    const observer = new MutationObserver(() => decorate());
    observer.observe(container, { childList: true });

    return () => {
      observer.disconnect();
      cleanups.forEach(fn => fn());
    };
  }, [containerRef, attachments, onPreviewImage, enabled]);
}
