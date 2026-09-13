// client/src/components/editor/CodeBlockEscape.ts
// 코드 블록에서 빠져나오는 길을 만든다.
//
// 코드 블록 안에서는 Enter 가 줄바꿈으로 쓰인다. CKEditor 는 Enter 를 세 번
// 연달아 누르면 블록을 벗어나게 해 두었지만, 그것을 아는 사람은 거의 없다.
// 게다가 코드 블록이 글의 마지막이면 다음 세 가지가 모두 막힌다:
//   - 아래 방향키: 갈 블록이 없어 아무 일도 없다
//   - 아래 빈 곳 클릭: 커서가 코드 블록 안으로 들어간다(그것도 맨 앞으로)
//   - 마우스로 뒤쪽 클릭: 마찬가지
// 그래서 코드 블록을 한 번 만들면 글을 이어 쓸 수 없다.
//
// 여기서는 사람이 실제로 하는 두 가지 동작을 받아 준다.
//   1) 블록 끝에서 아래(오른쪽) 방향키 → 뒤에 문단을 만들고 커서를 옮긴다
//      블록 처음에서 위(왼쪽) 방향키   → 앞에 문단을 만든다
//   2) 마지막 블록 아래 빈 곳 클릭     → 뒤에 문단을 만들고 커서를 옮긴다
//
// 나갈 곳이 이미 있으면 아무것도 하지 않는다 — 평소 이동은 브라우저에 맡긴다.
// 문단은 실제로 필요할 때만 만들어지므로 저장되는 내용에 빈 문단이 쌓이지 않는다.

import { MouseObserver, Plugin, type ModelElement } from 'ckeditor5';

/**
 * 안에서 Enter 가 소비돼 갇히는 블록.
 *
 * 표·이미지·구분선 같은 위젯은 CKEditor 의 WidgetTypeAround 가 위아래에 문단 삽입
 * 버튼을 띄워 주고, 목록·인용구는 빈 줄에서 Enter 를 한 번 더 누르면 빠져나온다.
 * 코드 블록만 그 둘 다에 해당하지 않는다.
 */
const TRAPPING_BLOCKS = new Set(['codeBlock']);

const KEY_UP = 38;
const KEY_DOWN = 40;

/**
 * 방향키로 블록을 빠져나가야 하는 상황인가.
 *
 * 세 조건이 모두 맞아야 한다 — 갇히는 블록이고, 커서가 그쪽 끝에 있고,
 * 그쪽에 이웃이 없다. 하나라도 어긋나면 평소 이동이므로 브라우저에 맡긴다.
 */
export function shouldEscapeByArrow(opts: {
  blockName: string;
  atEdge: boolean;
  hasSibling: boolean;
}): boolean {
  return TRAPPING_BLOCKS.has(opts.blockName) && opts.atEdge && !opts.hasSibling;
}

/** 마지막 블록 아래의 빈 곳을 왼쪽 버튼으로 눌렀는가 */
export function isClickBelowBlock(opts: {
  button: number;
  clientY: number;
  blockBottom: number;
}): boolean {
  return opts.button === 0 && opts.clientY > opts.blockBottom;
}

export class CodeBlockEscape extends Plugin {
  static get pluginName() {
    return 'CodeBlockEscape' as const;
  }

  init(): void {
    const view = this.editor.editing.view;
    const viewDocument = view.document;

    // mousedown 은 기본 관찰 대상이 아니다 — 붙여 주지 않으면 아래 리스너가 불리지 않는다
    view.addObserver(MouseObserver);

    this.listenTo(
      viewDocument,
      'keydown',
      (
        evt,
        data: {
          keyCode: number;
          shiftKey: boolean;
          ctrlKey: boolean;
          metaKey: boolean;
          altKey: boolean;
          preventDefault: () => void;
        }
      ) => {
        if (data.shiftKey || data.ctrlKey || data.metaKey || data.altKey) return;
        const where =
          data.keyCode === KEY_DOWN ? 'after' : data.keyCode === KEY_UP ? 'before' : null;
        if (!where) return;
        if (!this._escapeFromCaret(where)) return;
        data.preventDefault();
        evt.stop();
      },
      { priority: 'high' }
    );

    this.listenTo(
      viewDocument,
      'mousedown',
      (evt, data: { domEvent: MouseEvent; preventDefault: () => void }) => {
        if (!this._escapeFromClickBelow(data.domEvent)) return;
        data.preventDefault();
        evt.stop();
      },
      { priority: 'high' }
    );
  }

  /** 커서가 갇히는 블록의 끝(또는 처음)에 있고 그쪽에 이웃이 없으면 문단을 만든다 */
  private _escapeFromCaret(where: 'before' | 'after'): boolean {
    const model = this.editor.model;
    const selection = model.document.selection;
    if (!selection.isCollapsed) return false;

    const position = selection.getFirstPosition();
    const block = position?.parent as ModelElement | undefined;
    if (!position || !block || !TRAPPING_BLOCKS.has(block.name)) return false;

    const decided = shouldEscapeByArrow({
      blockName: block.name,
      atEdge: where === 'after' ? position.isAtEnd : position.isAtStart,
      hasSibling: !!(where === 'after' ? block.nextSibling : block.previousSibling),
    });
    if (!decided) return false;

    this._insertParagraph(block, where);
    return true;
  }

  /** 마지막 블록이 갇히는 블록일 때, 그 아래 빈 곳을 누르면 문단을 만든다 */
  private _escapeFromClickBelow(domEvent: MouseEvent): boolean {
    const editing = this.editor.editing;
    const root = this.editor.model.document.getRoot();
    if (!root || root.childCount === 0) return false;

    const last = root.getChild(root.childCount - 1) as ModelElement;
    if (!TRAPPING_BLOCKS.has(last.name)) return false;

    const viewElement = editing.mapper.toViewElement(last);
    if (!viewElement) return false;
    const dom = editing.view.domConverter.mapViewToDom(viewElement) as HTMLElement | undefined;
    if (!dom) return false;

    // 블록보다 아래를 눌렀을 때만 — 블록 안쪽 클릭은 그대로 둔다
    if (
      !isClickBelowBlock({
        button: domEvent.button,
        clientY: domEvent.clientY,
        blockBottom: dom.getBoundingClientRect().bottom,
      })
    ) {
      return false;
    }

    this._insertParagraph(last, 'after');
    return true;
  }

  private _insertParagraph(block: ModelElement, where: 'before' | 'after'): void {
    const model = this.editor.model;
    model.change(writer => {
      const paragraph = writer.createElement('paragraph');
      writer.insert(
        paragraph,
        writer.createPositionAt(block, where === 'after' ? 'after' : 'before')
      );
      writer.setSelection(paragraph, 'in');
    });
    this.editor.editing.view.focus();
  }
}
