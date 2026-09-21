// 본문에 첨부 참조를 꽂는 인라인 위젯.
// 키는 저장 파일명이 아니라 원본 파일명이다. 작성 중에는 저장 파일명이 없고, 같은 이름의 첨부가 둘이면 먼저 오는 것으로 해석된다.
// 저장 형식: <span class="attachment-ref" data-attachment="원본파일명">원본파일명</span>

import { Command, Plugin, Widget, toWidget, type Editor, type ModelElement } from 'ckeditor5';

/** 저장 마크업의 클래스. 정화기·렌더러·에디터가 함께 쓴다. */
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
    // focus 의 parent 가 루트 프래그먼트일 수 있어 요소일 때만 판정한다.
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

    // 인라인 오브젝트로 등록해 내부 글자만 지워져 참조가 깨지는 것을 막는다.
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
        // 정화기가 속성을 지워도 파일명은 남도록 본문에도 넣는다.
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
