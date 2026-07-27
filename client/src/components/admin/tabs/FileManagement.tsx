// client/src/components/admin/tabs/FileManagement.tsx - 파일 관리 탭
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../api/axios';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { AdminSection } from '../common/AdminSection';
import { toast } from '../../../utils/toast';
import { formatDateShort } from '../../../utils/date';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { SearchInput } from '../../common/SearchInput';

interface FileItem {
  filename: string;
  size: number;
  mtime: string;
  type: 'file' | 'image';
  downloadUrl: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_ICONS: Record<string, string> = {
  pdf: '📄',
  doc: '📝',
  docx: '📝',
  xls: '📊',
  xlsx: '📊',
  ppt: '📋',
  pptx: '📋',
  zip: '🗜️',
  rar: '🗜️',
  txt: '📃',
  mp4: '🎬',
  mp3: '🎵',
  hwp: '📝',
  jpg: '🖼️',
  jpeg: '🖼️',
  png: '🖼️',
  gif: '🎞️',
  webp: '🖼️',
};

function getFileIcon(filename: string, type: 'file' | 'image'): string {
  if (type === 'image') return '🖼️';
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICONS[ext] ?? '📎';
}

export const FileManagement = React.memo(() => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'file' | 'image' | ''>('');
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FileItem | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/uploads/admin/list', {
        params: {
          page,
          limit: 20,
          type: typeFilter || undefined,
          search: debouncedSearch || undefined,
        },
      });
      const data = res.data.data;
      setFiles(data.items as FileItem[]);
      setTotalPages(data.totalPages as number);
      setTotal(data.total as number);
      setTotalSize(data.totalSize as number);
    } catch {
      toast.error('파일 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, debouncedSearch]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  // 검색어 변경 시 1페이지로 리셋 (다른 페이지에 머물러 빈 결과가 보이는 것 방지)
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const handleDelete = async (file: FileItem) => {
    setDeletingFile(file.filename);
    try {
      await api.delete(`/uploads/admin/${file.type}/${file.filename}`);
      toast.success('파일이 삭제되었습니다.');
      setConfirmDelete(null);
      // 현재 페이지의 마지막 파일을 삭제했고 1페이지가 아니면 이전 페이지로(빈 페이지 stale 방지).
      // setPage가 page 의존 useEffect로 refetch를 트리거하므로 명시 refetch 생략.
      if (files.length === 1 && page > 1) {
        setPage(p => p - 1);
      } else {
        await fetchFiles();
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message ?? '삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingFile(null);
    }
  };

  return (
    <AdminSection title="파일 관리" description="업로드된 파일과 이미지를 관리합니다.">
      {/* 통계 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">{total}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">전체 파일</div>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {formatBytes(totalSize)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">총 용량</div>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={typeFilter}
          onChange={e => {
            setTypeFilter(e.target.value as 'file' | 'image' | '');
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          <option value="">전체 유형</option>
          <option value="file">첨부 파일</option>
          <option value="image">이미지</option>
        </select>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="파일명 검색..."
          ariaLabel="파일명 검색"
          className="w-48"
        />
        <button
          onClick={() => void fetchFiles()}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          새로고침
        </button>
      </div>

      {/* 목록 */}
      {loading ? (
        <LoadingSpinner message="파일 목록 불러오는 중..." />
      ) : files.length === 0 ? (
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <svg
            className="w-12 h-12 mx-auto mb-3 opacity-40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm">파일이 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  파일명
                </th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                  유형
                </th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                  크기
                </th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hidden md:table-cell">
                  업로드 일시
                </th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  작업
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map(file => (
                <tr
                  key={`${file.type}-${file.filename}`}
                  className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg flex-shrink-0">
                        {getFileIcon(file.filename, file.type)}
                      </span>
                      <span className="truncate max-w-[200px] text-slate-700 dark:text-slate-300 font-mono text-xs">
                        {file.filename}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 hidden sm:table-cell">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        file.type === 'image'
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {file.type === 'image' ? '이미지' : '파일'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 hidden sm:table-cell text-slate-600 dark:text-slate-400">
                    {formatBytes(file.size)}
                  </td>
                  <td className="py-2.5 px-3 hidden md:table-cell text-slate-500 dark:text-slate-500 text-xs">
                    {formatDateShort(file.mtime)}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {/*
                       * downloadUrl은 이미 서버에서 prefix 포함해 반환됨:
                       * - 파일: `/api/uploads/download/${name}` (api 포함)
                       * - 이미지: `/uploads/images/${name}` (static serving, api 미포함)
                       * 이전 코드는 file 타입에 `/api` 를 또 prepend해 `/api/api/...` 404 발생
                       */}
                      <a
                        href={file.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        {file.type === 'image' ? '보기' : '다운로드'}
                      </a>
                      <button
                        onClick={() => setConfirmDelete(file)}
                        disabled={deletingFile === file.filename}
                        className="px-2 py-1 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            이전
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            다음
          </button>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={e => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-file-title"
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3
              id="delete-file-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2"
            >
              파일 삭제 확인
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
              다음 파일을 삭제하시겠습니까?
            </p>
            <p className="text-sm font-mono text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg mb-4 break-all">
              {confirmDelete.filename}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
              ⚠️ 게시글에서 참조 중인 파일일 수 있습니다. 삭제 후 복구할 수 없습니다.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => void handleDelete(confirmDelete)}
                disabled={deletingFile === confirmDelete.filename}
                className="px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {deletingFile === confirmDelete.filename && (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminSection>
  );
});

FileManagement.displayName = 'FileManagement';

export default FileManagement;
