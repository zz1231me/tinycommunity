// client/src/pages/components/calendar/components/EventForm.tsx
import React, { useMemo } from 'react';
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

// 공통 input 클래스
const inputCls = [
  'block w-full px-3.5 py-2.5 rounded-lg text-base',
  'border border-slate-300 dark:border-slate-600',
  'bg-white dark:bg-slate-800',
  'text-slate-900 dark:text-slate-100',
  'placeholder:text-slate-400 dark:placeholder:text-slate-500',
  'focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500',
  'transition-all duration-150',
].join(' ');

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
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
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
        }
      }}
      className="space-y-5"
    >
      {/* 일정 종류 */}
      <div>
        <FieldLabel required>일정 종류</FieldLabel>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {categories.map(category => {
            const isSelected = formData.category === category.key;
            return (
              <button
                key={category.key}
                type="button"
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
                className={`
                  relative flex flex-col items-center justify-center gap-1.5
                  px-2 py-3 rounded-xl border-2
                  transition-all duration-150
                  ${
                    isSelected
                      ? 'border-current font-semibold shadow-md scale-[1.04]'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                  }
                `}
                style={
                  isSelected
                    ? {
                        backgroundColor: category.bg,
                        borderColor: category.border,
                        color: category.textColor,
                      }
                    : undefined
                }
              >
                <span className="text-lg leading-none">{category.emoji}</span>
                <span className="text-xs leading-tight font-semibold whitespace-nowrap">
                  {category.label}
                </span>
                {isSelected && (
                  <div
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-500 rounded-full
                                  flex items-center justify-center shadow-sm"
                  >
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {!formData.category && (
          <p className="mt-2 text-sm text-red-500 dark:text-red-400 flex items-center gap-1.5">
            <svg
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
        <FieldLabel required>제목</FieldLabel>
        <input
          type="text"
          value={formData.title}
          onChange={e => onChange({ title: e.target.value })}
          className={inputCls}
          placeholder="일정 제목을 입력하세요"
          required
        />
      </div>

      {/* 날짜 */}
      <div>
        <FieldLabel required>일정 날짜</FieldLabel>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
              시작일
            </p>
            <input
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
          <div className="flex-shrink-0 pb-3 text-slate-300 dark:text-slate-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
              종료일
            </p>
            <input
              type="date"
              value={formData.end}
              min={formData.start}
              onChange={e => onChange({ end: e.target.value })}
              onClick={e => e.currentTarget.showPicker?.()}
              className={`${inputCls} cursor-pointer`}
              required
            />
          </div>
        </div>
      </div>

      {/* 장소 */}
      <div>
        <FieldLabel>장소</FieldLabel>
        <div className="relative">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
            <svg
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
            type="text"
            value={formData.location || ''}
            onChange={e => onChange({ location: e.target.value.slice(0, eventLocationMax) })}
            maxLength={eventLocationMax}
            className={`${inputCls} pl-10`}
            placeholder="장소를 입력하세요 (선택사항)"
          />
        </div>
      </div>

      {/* 상세 내용 — CKEditor */}
      <div>
        <FieldLabel>상세 내용</FieldLabel>
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
      <div className="flex gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 inline-flex items-center justify-center gap-2
                     px-4 py-2.5 rounded-lg text-sm font-semibold
                     bg-primary-600 hover:bg-primary-700 active:bg-primary-800
                     text-white shadow-sm
                     transition-all duration-150 active:scale-[0.98]
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              저장 중…
            </>
          ) : mode === 'create' ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-4 py-2.5 rounded-lg text-sm font-medium
                     text-slate-600 dark:text-slate-400
                     bg-slate-100 dark:bg-slate-800
                     hover:bg-slate-200 dark:hover:bg-slate-700
                     hover:text-slate-800 dark:hover:text-slate-200
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors duration-150"
        >
          취소
        </button>
      </div>
    </form>
  );
};
