// client/src/components/editor/AttachmentRefPlugin.ts
// 본문 안에 "이 문단의 증적은 이 첨부" 를 꽂는 인라인 위젯.
//
// 저장 파일명(storedName)이 아니라 원본 파일명을 키로 쓴다. 새 글을 쓸 때 첨부는
// 아직 업로드 전이라 저장 파일명이 없고, 원본 파일명은 작성 중에도 저장 후에도
// 같은 이름으로 파일을 교체해도 유지되므로 참조가 끊기지 않는다.
// 대신 한 글 안에 같은 이름의 첨부가 둘이면 먼저 오는 것으로 해석된다.
//
// 저장 형식: <span class="attachment-ref" data-attachment="원본파일명">원본파일명</span>
// 이 마크업은 서버 contentRenderer 와 클라이언트 htmlSanitizer 양쪽에서 허용된다.

import { Command, Plugin, Widget, toWidget, type Editor, type ModelElement } from 'ckeditor5';

/** 저장 마크업의 클래스 — 정화기·렌더러·에디터가 공유하는 단일 키 */
export const ATTACHMENT_REF_CLASS = 'attachment-ref';
/** 참조 대상을 담는 속성 */
export const ATTACHMENT_REF_ATTR = 'data-attachment';
/** 첨부를 꽂는 커맨드 이름 */
export const INSERT_ATTACHMENT_REF = 'insertAttachmentRef';

const MODEL = 'attachmentRef';
const NAME_ATTR = 'name';

class InsertAttachmentRefCommand extends Command {
  override execute(name: string) {
    const model = this.editor.model;
    model.change(writer => {
      model.insertObject(writer.createElement(MODEL, { [NAME_ATTR]: name }), null, null, {
        setSelection: 'after',
      });
    });
  }

  override refresh() {
    const { schema, document } = this.editor.model;
    // focus 의 parent 는 루트 프래그먼트일 수도 있어 요소일 때만 판정한다
    const parent = document.selection.focus?.parent as ModelElement | undefined;
    this.isEnabled = !!parent?.is?.('element') && schema.checkChild(parent, MODEL);
  }
}

export default class AttachmentRefPlugin extends Plugin {
  static get requires() {
    return [Widget];
  }

  static get pluginName() {
    return 'AttachmentRef' as const;
  }

  init() {
    const editor = this.editor as Editor;

    // 통짜 인라인 오브젝트 — 내부 글자를 지우다 참조가 반쪽 나는 일을 막는다.
    editor.model.schema.register(MODEL, {
      inheritAllFrom: '$inlineObject',
      allowAttributes: [NAME_ATTR],
    });

    editor.conversion.for('upcast').elementToElement({
      view: { name: 'span', classes: ATTACHMENT_REF_CLASS },
      model: (viewElement, { writer }) =>
        writer.createElement(MODEL, {
          [NAME_ATTR]: viewElement.getAttribute(ATTACHMENT_REF_ATTR) ?? '',
        }),
    });

    editor.conversion.for('dataDowncast').elementToElement({
      model: MODEL,
      view: (modelElement, { writer }) => {
        const name = String(modelElement.getAttribute(NAME_ATTR) ?? '');
        const span = writer.createContainerElement('span', {
          class: ATTACHMENT_REF_CLASS,
          [ATTACHMENT_REF_ATTR]: name,
        });
        // 정화기가 속성을 떨어뜨리거나 참조가 깨져도 최소한 파일명은 읽히도록 본문에도 남긴다.
        writer.insert(writer.createPositionAt(span, 0), writer.createText(name));
        return span;
      },
    });

    editor.conversion.for('editingDowncast').elementToElement({
      model: MODEL,
      view: (modelElement, { writer }) => {
        const name = String(modelElement.getAttribute(NAME_ATTR) ?? '');
        const span = writer.createContainerElement('span', {
          class: `${ATTACHMENT_REF_CLASS} ck-attachment-ref`,
        });
        writer.insert(writer.createPositionAt(span, 0), writer.createText(`📎 ${name}`));
        return toWidget(span, writer, { label: `증적 첨부: ${name}` });
      },
    });

    editor.commands.add(INSERT_ATTACHMENT_REF, new InsertAttachmentRefCommand(editor));
  }
}
