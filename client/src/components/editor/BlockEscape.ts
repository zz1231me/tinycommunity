// 글의 마지막 블록(코드 블록·인용구·위젯)에서 빠져나갈 문단을 필요할 때만 만든다.

import { MouseObserver, Plugin, type ModelElement } from 'ckeditor5';

/** 안에서 Enter 가 소비돼 갇히는 블록. 위젯은 스키마의 isObject 로 따로 판별한다. */
const TRAPPING_BLOCKS = new Set(['codeBlock', 'blockQuote']);

const KEY_UP = 38;
const KEY_DOWN = 40;

/** 방향키로 블록을 빠져나가야 하는 상황인가. 세 조건이 모두 맞을 때만 참이다. */
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

/** 이 블록이 마지막일 때, 아래를 누르면 문단을 만들어 줘야 하는가. */
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

    // mousedown 은 기본 관찰 대상이 아니라 직접 붙여야 한다
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
      // 위젯 선택보다 먼저 가로채야 한다. 선택된 뒤에는 다음 입력이 위젯을 지운다.
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

    // 블록보다 아래를 눌렀을 때만 처리한다
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
