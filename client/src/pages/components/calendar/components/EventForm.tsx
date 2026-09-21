// client/src/pages/components/calendar/components/EventForm.tsx
import React, { useId, useMemo } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import { ClassicEditor, type EditorConfig } from 'ckeditor5';
import { buildEditorConfig } from '../../../../components/editor/core/editorConfig';
import '../../../../components/editor/core/CKEditorOverride.css';
import { EventFormData } from '../types';
import { categories } from '../constants';
import { uploadApi } from '../../../../api/axios';
import { useSiteSettings } from '../../../../store/siteSettings';

// 다른 에디터들(CKEditorWrapper/WikiEditor)와 동일한 axios 기반 어댑터.
// - 419(액세스 토큰 만료) 자동 갱신 + 재시도 (axios 인터셉터)
// - AbortController로 컴포넌트 언마운트 시 업로드 취소 (메모리/네트워크 누수 방지)
// - onUploadProgress로 CKEditor 진행률 표시
class EventImageUploadAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private loader: any;
  private controller = new AbortController();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(loader: any) {
    this.loader = loader;
  }
  async upload(): Promise<{ default: string }> {
    const file: File = await this.loader.file;
    const formData = new FormData();
    formData.append('image', file);
    const res = await uploadApi.post('/uploads/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: this.controller.signal,
      onUploadProgress: e => {
        if (typeof e.total === 'number' && e.total > 0) {
          this.loader.uploadTotal = e.total;
          this.loader.uploaded = e.loaded;
        }
      },
    });
    const url = res.data?.data?.imageUrl ?? res.data?.data?.url ?? res.data?.imageUrl;
    if (!url) throw new Error('이미지 업로드 응답에 URL이 없습니다.');
    return { default: url };
  }
  abort() {
    this.controller.abort();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EventUploadAdapterPlugin(editor: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor.plugins.get('FileRepository').createUploadAdapter = (loader: any) =>
    new EventImageUploadAdapter(loader);
}

interface EventFormProps {
  formData: EventFormData;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (data: Partial<EventFormData>) => void;
  onCancel: () => void;
  mode: 'create' | 'edit';
  submitting?: boolean;
}

// 공통 input 클래스 — 디자인 시스템 프리미티브(.input)에 위임
const inputCls = 'input';

function FieldLabel({
  children,
  required,
  htmlFor,
}: {
  children: React.ReactNode;
  required?: boolean;
  /** 이어 줄 입력칸의 id. 이어 주지 않으면 라벨을 눌러도 칸에 들어가지 않는다. */
  htmlFor?: string;
}) {
  return (
    <label className="form-label" htmlFor={htmlFor}>
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

export const EventForm: React.FC<EventFormProps> = ({
  formData,
  onSubmit,
  onChange,
  onCancel,
  mode,
  submitting = false,
}) => {
  // 관리자 설정값 — 서버 검증과 동일 한도를 클라이언트에서도 사전 차단
  const fieldId = useId();
  const eventBodyMax = useSiteSettings(s => s.settings.eventBodyMaxLength);
  const eventLocationMax = useSiteSettings(s => s.settings.eventLocationMaxLength);
  const editorConfig = useMemo<EditorConfig>(
    () =>
      buildEditorConfig('event', {
        placeholder: '일정에 대한 메모나 설명을 입력하세요 (선택사항)',
        extraPlugins: [EventUploadAdapterPlugin],
      }),
    []
  );

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={e => {
        // 단일 라인 input(제목/장소/날짜)에서 Enter로 일정이 조기 생성·수정되는 것 방지
        // (메모 textarea의 줄바꿈과 명시적 제출 버튼은 그대로 동작)
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
        }
      }}
      className="space-y-3"
    >
      {/* 일정 종류 */}
      <div role="group" aria-labelledby={`${fieldId}-category`}>
        {/* 입력칸이 아니라 단추 묶음이라 label 로 이을 수 없다 — 묶음 이름으로 알린다 */}
        <span className="form-label" id={`${fieldId}-category`}>
          일정 종류<span className="text-red-500 ml-1">*</span>
        </span>
        {/* 종류 고르기 — 카드마다 왼쪽에 그 종류의 색 띠를 세로로 붙인다.
            예전에는 고른 칸만 색으로 가득 채웠는데, 고르기 전에는 색을 알 수 없고
            고른 뒤에는 그 칸만 튀어서 폼 안에서 겉돌았다. 색은 늘 왼쪽 띠로 보여 주고,
            선택은 테두리와 옅은 배경으로만 표시하면 나머지 입력칸과 톤이 맞는다. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map(category => {
            const isSelected = formData.category === category.key;
            return (
              <button
                key={category.key}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  let newTitle = formData.title.replace(/^\[.*?\]\s*/, '').trim();
                  newTitle = newTitle ? `[${category.label}] ${newTitle}` : `[${category.label}] `;
                  onChange({
                    category: category.key,
                    title: newTitle,
                    color: category.bg,
                    backgroundColor: category.bg,
                  });
                }}
                className={`relative flex items-center gap-3 overflow-hidden rounded-xl border py-3 pl-4 pr-3 text-left transition-colors ${
                  isSelected
                    ? 'border-transparent bg-slate-50 dark:bg-slate-700/50'
                    : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/60'
                }`}
                style={
                  isSelected
                    ? { borderColor: category.border, backgroundColor: `${category.bg}1f` }
                    : undefined
                }
              >
                {/* 왼쪽 색 띠 — 카드 높이를 꽉 채운다 */}
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1.5"
                  style={{ backgroundColor: category.bg }}
                />
                <span className="text-base leading-none">{category.emoji}</span>
                <span
                  className={`flex-1 truncate text-sm leading-tight ${
                    isSelected
                      ? 'font-semibold text-slate-900 dark:text-slate-100'
                      : 'font-medium text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {category.label}
                </span>
                {isSelected && (
                  <svg
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: category.border }}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
        {!formData.category && (
          <p className="mt-2 text-sm text-red-500 dark:text-red-400 flex items-center gap-1.5">
            <svg
              aria-hidden="true"
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            일정 종류를 선택해주세요
          </p>
        )}
      </div>

      {/* 제목 */}
      <div>
        <FieldLabel required htmlFor={`${fieldId}-title`}>
          제목
        </FieldLabel>
        <input
          id={`${fieldId}-title`}
          type="text"
          value={formData.title}
          onChange={e => onChange({ title: e.target.value })}
          className={inputCls}
          placeholder="일정 제목을 입력하세요"
          required
        />
      </div>

      {/* 날짜 · 장소 — 넓은 모달 폭을 활용해 3열 배치 (세로 스크롤 최소화) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <FieldLabel required htmlFor={`${fieldId}-start`}>
            시작일
          </FieldLabel>
          <input
            id={`${fieldId}-start`}
            type="date"
            value={formData.start}
            onChange={e => {
              const newStart = e.target.value;
              onChange({
                start: newStart,
                end: newStart > formData.end ? newStart : formData.end,
              });
            }}
            onClick={e => e.currentTarget.showPicker?.()}
            className={`${inputCls} cursor-pointer`}
            required
          />
        </div>
        <div>
          <FieldLabel required htmlFor={`${fieldId}-end`}>
            종료일
          </FieldLabel>
          <input
            id={`${fieldId}-end`}
            type="date"
            value={formData.end}
            min={formData.start}
            onChange={e => onChange({ end: e.target.value })}
            onClick={e => e.currentTarget.showPicker?.()}
            className={`${inputCls} cursor-pointer`}
            required
          />
        </div>
        <div>
          <FieldLabel htmlFor={`${fieldId}-location`}>장소</FieldLabel>
          <div className="relative">
            <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
              <svg
                aria-hidden="true"
                className="w-4 h-4 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <input
              id={`${fieldId}-location`}
              type="text"
              value={formData.location || ''}
              onChange={e => onChange({ location: e.target.value.slice(0, eventLocationMax) })}
              maxLength={eventLocationMax}
              className={`${inputCls} pl-10`}
              placeholder="장소 (선택)"
            />
          </div>
        </div>
      </div>

      {/* 상세 내용 — CKEditor */}
      <div role="group" aria-labelledby={`${fieldId}-body`}>
        {/* CKEditor 는 input 이 아니다 — label 대신 묶음 이름으로 알린다 */}
        <span className="form-label" id={`${fieldId}-body`}>
          상세 내용
        </span>
        <div
          className="event-ck-editor-wrapper rounded-lg overflow-hidden
                        border border-slate-200 dark:border-slate-700"
        >
          <CKEditor
            editor={ClassicEditor}
            config={editorConfig}
            data={formData.body}
            onChange={(_, editor) => {
              // 서버 검증과 동일 한도 적용 — 초과 입력은 잘라서 서버 400을 사전 차단
              const data = editor.getData();
              onChange({ body: data.length > eventBodyMax ? data.slice(0, eventBodyMax) : data });
            }}
          />
          <div className="text-xs text-slate-500 dark:text-slate-400 px-2 py-1 text-right">
            {(formData.body?.length ?? 0).toLocaleString()}/{eventBodyMax.toLocaleString()}자
          </div>
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button type="submit" disabled={submitting} className="btn-primary flex-1">
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              저장 중…
            </>
          ) : mode === 'create' ? (
            <>
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              일정 생성
            </>
          ) : (
            <>
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              수정 완료
            </>
          )}
        </button>

        <button type="button" onClick={onCancel} disabled={submitting} className="btn-secondary">
          취소
        </button>
      </div>
    </form>
  );
};
