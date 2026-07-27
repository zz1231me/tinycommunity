// client/src/components/editor/EditorErrorBoundary.tsx
// CKEditor 5 에러 처리용 Error Boundary

import React, { Component, ReactNode, ErrorInfo } from 'react';
import FallbackEditor from './FallbackEditor';

interface Props {
  children: ReactNode;
  onImageUpload: (blob: Blob, callback: (url: string, alt?: string) => void) => void;
  initialContent?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorRef?: React.RefObject<any>;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class EditorErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // 에러가 발생하면 fallback UI를 보여준다
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('CKEditor 5 Error Boundary:', error, errorInfo);
    }
  }

  override render() {
    if (this.state.hasError) {
      // Fallback Editor 렌더링
      return (
        <div className="space-y-3">
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0">
                <svg
                  className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                  에디터 로딩 실패
                </h3>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  CKEditor 5 로딩에 실패했습니다. 기본 마크다운 에디터를 사용합니다.
                </p>
              </div>
            </div>
          </div>

          <FallbackEditor
            ref={this.props.editorRef}
            onImageUpload={this.props.onImageUpload}
            initialContent={this.props.initialContent}
            onChange={this.props.onChange}
            placeholder={this.props.placeholder}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default EditorErrorBoundary;
