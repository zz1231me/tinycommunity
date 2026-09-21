// 기능 스위치와 그 기능의 세부 설정이 서로를 가리키게 하는 연결표.

export interface FeatureSettingsLink {
  /** 이 기능의 세부 설정이 있는 관리자 탭 경로 */
  path: string;
  /** 그 탭 안에서 해당 구역의 id (AdminSection 의 id) */
  section: string;
  /** 버튼에 적을 이름 */
  label: string;
}

export const FEATURE_SETTINGS: Record<string, FeatureSettingsLink> = {
  'tools.lottery': { path: '/admin/site-settings', section: 'lottery', label: '확률·포인트 설정' },
  'post.attachments': {
    path: '/admin/site-settings',
    section: 'file-limits',
    label: '파일 크기·확장자 설정',
  },
  'post.inlineAttachments': {
    path: '/admin/site-settings',
    section: 'editor',
    label: '에디터 설정',
  },
};
