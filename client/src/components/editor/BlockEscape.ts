// client/src/components/editor/BlockEscape.ts
// 글의 마지막 블록에서 빠져나오는 길을 만든다.
//
// CKEditor 는 본문 아래 빈 곳을 누르면 "가장 가까운 블록" 으로 커서를 보낸다.
// 그래서 마지막 블록이 무엇이냐에 따라 두 가지 문제가 생긴다.
//
//  1. 갇힌다 — 코드 블록은 Enter 가 줄바꿈으로 쓰여 안에서 나올 수 없고(세 번 연달아
//     누르면 나오지만 아는 사람이 없다), 인용구도 아래를 누르면 안쪽 문단으로 들어간다.
//     마지막이 그 블록이면 글을 이어 쓸 방법이 없다.
//
//  2. 지워진다 — 표·이미지·구분선 같은 위젯은 아래를 눌렀을 때 '선택' 된다.
//     그 상태에서 한 글자만 입력하면 위젯이 통째로 대체된다.
//     표 아래 빈 곳을 누르고 글을 쓰려 한 사람은 표를 잃는다.
//
// 사람이 실제로 하는 동작을 그대로 받아 준다.
//   - 마지막 블록 아래 빈 곳 클릭 → 뒤에 문단을 만들고 커서를 옮긴다
//   - 코드 블록 끝에서 아래(처음에서 위) 방향키 → 그쪽에 문단을 만든다
//
// 나갈 곳이 이미 있으면 아무것도 하지 않는다 — 평소 이동은 브라우저에 맡긴다.
// 문단은 실제로 필요할 때만 만들어지므로 저장되는 내용에 빈 문단이 쌓이지 않는다.

import { MouseObserver, Plugin, type ModelElement } from 'ckeditor5';

/**
 * 안에서 Enter 가 소비돼 갇히는 블록.
 *
 * 위젯(표·이미지·구분선 등)은 여기 적지 않는다 — 스키마가 object 로 표시하므로
 * 새 위젯이 늘어도 자동으로 함께 다뤄진다.
 */
const TRAPPING_BLOCKS = new Set(['codeBlock', 'blockQuote']);

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

/**
 * 이 블록이 마지막일 때, 아래를 누르면 문단을 만들어 줘야 하는가.
 *
 * 갇히는 블록이거나 위젯이면 그렇다. 평범한 문단·제목·목록은 그대로 둔다 —
 * 그쪽은 아래를 눌렀을 때 끝으로 커서가 가는 것이 자연스럽고, 잃을 것도 없다.
 */
export function needsEscapeHatch(opts: { blockName: string; isObject: boolean }): boolean {
  return TRAPPING_BLOCKS.has(opts.blockName) || opts.isObject;
}

export class BlockEscape extends Plugin {
  static get pluginName() {
    return 'BlockEscape' as const;
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
      // 위젯 선택보다 먼저 가로채야 한다 — 선택된 뒤에는 다음 입력이 위젯을 지운다
      { priority: 'highest' }
    );
  }

  /** 커서가 갇히는 블록의 끝(또는 처음)에 있고 그쪽에 이웃이 없으면 문단을 만든다 */
  private _escapeFromCaret(where: 'before' | 'after'): boolean {
    const model = this.editor.model;
    const selection = model.document.selection;
    if (!selection.isCollapsed) return false;

    const position = selection.getFirstPosition();
    const block = position?.parent as ModelElement | undefined;
    if (!position || !block) return false;

    const decided = shouldEscapeByArrow({
      blockName: block.name,
      atEdge: where === 'after' ? position.isAtEnd : position.isAtStart,
      hasSibling: !!(where === 'after' ? block.nextSibling : block.previousSibling),
    });
    if (!decided) return false;

    this._insertParagraph(block, where);
    return true;
  }

  /** 마지막 블록 아래 빈 곳을 눌렀을 때, 그 블록이 갇히거나 지워질 수 있으면 문단을 만든다 */
  private _escapeFromClickBelow(domEvent: MouseEvent): boolean {
    const editor = this.editor;
    const root = editor.model.document.getRoot();
    if (!root || root.childCount === 0) return false;

    const last = root.getChild(root.childCount - 1) as ModelElement;
    if (!needsEscapeHatch({ blockName: last.name, isObject: editor.model.schema.isObject(last) })) {
      return false;
    }

    const viewElement = editor.editing.mapper.toViewElement(last);
    if (!viewElement) return false;
    const dom = editor.editing.view.domConverter.mapViewToDom(viewElement) as
      HTMLElement | undefined;
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
