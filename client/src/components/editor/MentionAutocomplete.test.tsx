// client/src/components/editor/MentionAutocomplete.test.tsx
// 오버레이가 "언제 뜨고, 무엇을 넣는가"를 CKEditor 대역으로 검증한다.
// 실제 CKEditor 를 띄우는 대신, 이 컴포넌트가 쓰는 표면(model.change / domRoots)만 흉내낸다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MentionAutocomplete, { type MentionEditor } from './MentionAutocomplete';

const mockSearchUsers = vi.fn();
vi.mock('../../api/users', () => ({
  searchUsers: (q: string, signal?: AbortSignal) => mockSearchUsers(q, signal),
}));

/** writer 가 실제로 받은 조작을 기록해 검증한다 */
interface Recorded {
  removed: boolean;
  insertedText: string | null;
  shiftedBy: number | null;
}

function makeEditor(): { editor: MentionEditor; root: HTMLElement; rec: Recorded } {
  const root = document.createElement('div');
  root.contentEditable = 'true';
  document.body.appendChild(root);

  const rec: Recorded = { removed: false, insertedText: null, shiftedBy: null };

  const editor: MentionEditor = {
    model: {
      document: {
        selection: {
          getFirstPosition: () => ({
            getShiftedBy: (n: number) => {
              rec.shiftedBy = n;
              return { marker: 'start' };
            },
          }),
        },
      },
      change: cb =>
        cb({
          createRange: () => ({ marker: 'range' }),
          createPositionAt: () => ({ marker: 'pos' }),
          remove: () => {
            rec.removed = true;
          },
          insertText: (text: string) => {
            rec.insertedText = text;
          },
          setSelection: () => {},
        }),
    },
    editing: { view: { domRoots: new Map([['main', root]]) } },
  };

  return { editor, root, rec };
}

/** 에디터 안에 텍스트를 넣고 캐럿을 끝에 둔 뒤 input 이벤트를 발생시킨다 */
function typeInto(root: HTMLElement, text: string) {
  root.textContent = text;
  const textNode = root.firstChild as Text;
  const range = document.createRange();
  range.setStart(textNode, text.length);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.input(root);
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
  mockSearchUsers.mockResolvedValue([
    { id: 'alice', name: '앨리스' },
    { id: 'bobby', name: '바비' },
  ]);
  // happy-dom 은 레이아웃을 계산하지 않아 캐럿 rect 가 0 이다 —
  // 오버레이 위치 계산이 이를 "위치 불명"으로 보고 닫아버리므로 좌표를 준다.
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 100, bottom: 120, left: 50, right: 60 }) as DOMRect;
});

describe('열림 조건', () => {
  it('@ 뒤에 입력하면 후보 목록이 열린다', async () => {
    const { editor, root } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '안녕 @ali');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('앨리스')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
  });

  it('멘션 입력이 아니면 열리지 않는다', async () => {
    const { editor, root } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '그냥 텍스트');

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(mockSearchUsers).not.toHaveBeenCalled();
  });

  it('이메일 입력 중에는 열리지 않는다', async () => {
    const { editor, root } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, 'user@example');

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('검색 결과가 없으면 열지 않는다', async () => {
    mockSearchUsers.mockResolvedValue([]);
    const { editor, root } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '@zzz');

    await waitFor(() => expect(mockSearchUsers).toHaveBeenCalled());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('@ 뒤 검색어로 사용자를 조회한다', async () => {
    const { editor, root } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '@ali');

    await waitFor(() => expect(mockSearchUsers).toHaveBeenCalledWith('ali', expect.anything()));
  });
});

describe('선택 반영', () => {
  it('클릭하면 @검색어를 @아이디 로 치환한다', async () => {
    const { editor, root, rec } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '안녕 @ali');
    const option = await screen.findByText('앨리스');
    fireEvent.click(option);

    // '@ali' 4글자를 지우고 '@alice ' 를 넣어야 한다
    expect(rec.shiftedBy).toBe(-4);
    expect(rec.removed).toBe(true);
    expect(rec.insertedText).toBe('@alice ');
  });

  it('선택 후 목록이 닫힌다', async () => {
    const { editor, root } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '@ali');
    fireEvent.click(await screen.findByText('앨리스'));

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('Enter 로 활성 항목을 선택한다', async () => {
    const { editor, root, rec } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '@a');
    await screen.findByRole('listbox');
    fireEvent.keyDown(document, { key: 'Enter' });

    await waitFor(() => expect(rec.insertedText).toBe('@alice '));
  });

  it('↓ 로 이동한 뒤 Enter 하면 두 번째 항목이 들어간다', async () => {
    const { editor, root, rec } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '@a');
    await screen.findByRole('listbox');
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });

    await waitFor(() => expect(rec.insertedText).toBe('@bobby '));
  });

  it('Escape 로 닫는다', async () => {
    const { editor, root } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '@a');
    await screen.findByRole('listbox');
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });
});

describe('서버가 인식하지 못하는 아이디 안내', () => {
  it('4자 미만 아이디에는 "알림 불가" 를 표시한다', async () => {
    mockSearchUsers.mockResolvedValue([{ id: 'ab', name: '짧은아이디' }]);
    const { editor, root } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '@ab');

    expect(await screen.findByText('알림 불가')).toBeInTheDocument();
  });

  it('정상 길이 아이디에는 표시하지 않는다', async () => {
    const { editor, root } = makeEditor();
    render(<MentionAutocomplete editor={editor} />);

    typeInto(root, '@ali');
    await screen.findByRole('listbox');

    expect(screen.queryByText('알림 불가')).not.toBeInTheDocument();
  });
});

describe('editor 가 없을 때', () => {
  it('아무것도 렌더하지 않고 터지지 않는다', () => {
    const { container } = render(<MentionAutocomplete editor={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
