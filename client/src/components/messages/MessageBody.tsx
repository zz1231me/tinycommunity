// client/src/components/messages/MessageBody.tsx
// 메시지 본문. 줄바꿈을 보존하고 링크만 눌리게 만든다.
//
// 원시 HTML 을 그리는 경로를 두지 않는다 — 조각을 React 요소로 그리면
// 텍스트는 React 가 이스케이프하므로 정화기가 필요 없다.

import { linkifyText } from '../../utils/linkifyText';

export function MessageBody({ content }: { content: string }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {linkifyText(content).map((seg, i) =>
        seg.type === 'link' ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2 hover:no-underline"
          >
            {seg.value}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </span>
  );
}
