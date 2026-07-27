// src/utils/downloadUtils.ts - 쿠키 기반 인증으로 완전 수정
/**
 * ✅ 쿠키 기반 파일 다운로드 함수
 */
export const downloadFile = async (fileInfo: {
  storedName: string;
  originalName: string;
  url?: string;
}) => {
  // ✅ 원본 파일명을 URL 파라미터로 전달 (항상 상대 경로 사용)
  const downloadUrl = `/api/uploads/download/${fileInfo.storedName}?originalName=${encodeURIComponent(fileInfo.originalName)}`;

  // 쿠키 기반 fetch — credentials: 'include'로 HttpOnly 쿠키 자동 포함
  const response = await fetch(downloadUrl, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    } else if (response.status === 403) {
      throw new Error('파일에 접근할 권한이 없습니다.');
    } else if (response.status === 404) {
      throw new Error('파일을 찾을 수 없습니다.');
    } else {
      throw new Error(`다운로드 실패: ${response.status} ${response.statusText}`);
    }
  }

  const blob = await response.blob();

  // 브라우저 다운로드 실행
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileInfo.originalName;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.URL.revokeObjectURL(url);
};
