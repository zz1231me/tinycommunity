import React, { useCallback, useRef } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { useAccessibleBoards } from '../../hooks/useAccessibleBoards';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import '../../styles/command-palette.css';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { boards } = useAccessibleBoards();

  const runCommand = useCallback(
    (fn: () => void) => {
      onOpenChange(false);
      fn();
    },
    [onOpenChange]
  );

  // cmdk 가 입력칸에 포커스를 주기는 하지만 Tab 은 아무도 잡지 않는다 — 그대로 두면
  // Tab 한 번에 팔레트 뒤 화면으로 포커스가 새어, 가려진 곳의 단추를 누르게 된다.
  //
  // ESC 도 여기 하나로 모은다. cmdk 의 onKeyDown 은 포커스가 팔레트 안에 있을 때만
  // 듣는데, 훅은 문서에서 들으므로 포커스가 어디로 빠졌든 닫힌다.
  //
  // 훅은 아래 early return 보다 위에 있어야 한다. 조건부 훅 호출은 렌더마다 순서를
  // 어긋나게 한다. 닫혀 있을 때 ESC 를 먹지 않도록 open 을 그대로 넘긴다.
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useFocusTrap(panelRef, close, open);

  if (!open) return null;

  return (
    <div className="command-palette-overlay" onClick={() => onOpenChange(false)}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="명령어 팔레트"
        className="command-palette-container"
        onClick={e => e.stopPropagation()}
      >
        <Command label="명령어 팔레트">
          <div className="command-input-wrapper">
            <svg
              aria-hidden="true"
              className="command-search-icon"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <Command.Input placeholder="명령어 또는 페이지 검색..." className="command-input" />
          </div>
          <Command.List className="command-list">
            <Command.Empty className="command-empty">검색 결과가 없습니다.</Command.Empty>

            <Command.Group heading="게시판" className="command-group">
              {boards.map(board => (
                <Command.Item
                  key={board.id}
                  value={`board-${board.name}`}
                  onSelect={() => runCommand(() => navigate(`/dashboard/posts/${board.id}`))}
                  className="command-item"
                >
                  <span className="command-item-icon">📋</span>
                  {board.name}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="빠른 이동" className="command-group">
              <Command.Item
                value="calendar 캘린더"
                onSelect={() => runCommand(() => navigate('/dashboard/calendar'))}
                className="command-item"
              >
                <span className="command-item-icon">📅</span>
                캘린더
              </Command.Item>
              <Command.Item
                value="memos 메모"
                onSelect={() => runCommand(() => navigate('/dashboard/memos'))}
                className="command-item"
              >
                <span className="command-item-icon">📝</span>
                메모
              </Command.Item>
              <Command.Item
                value="wiki 위키"
                onSelect={() => runCommand(() => navigate('/dashboard/wiki'))}
                className="command-item"
              >
                <span className="command-item-icon">📚</span>
                위키
              </Command.Item>
              <Command.Item
                value="profile 프로필 설정"
                onSelect={() => runCommand(() => navigate('/profile'))}
                className="command-item"
              >
                <span className="command-item-icon">👤</span>
                프로필 설정
              </Command.Item>
              {user?.role === 'admin' && (
                <Command.Item
                  value="admin 관리자"
                  onSelect={() => runCommand(() => navigate('/admin'))}
                  className="command-item"
                >
                  <span className="command-item-icon">⚙️</span>
                  관리자 페이지
                </Command.Item>
              )}
            </Command.Group>
          </Command.List>
        </Command>
        <div className="command-footer">
          <span>↑↓ 탐색</span>
          <span>↵ 선택</span>
          <span>Esc 닫기</span>
        </div>
      </div>
    </div>
  );
};
