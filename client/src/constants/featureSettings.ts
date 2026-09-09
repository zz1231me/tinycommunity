// client/src/constants/featureSettings.ts
// 기능 스위치와 그 기능의 세부 설정이 서로를 가리키게 하는 연결표.
//
// 관리자 화면에서 "기능 설정"(켜고 끄기)과 "사이트 설정"(값 정하기)이 완전히 따로 있었다.
// 로또를 예로 들면 켜는 곳과 확률·포인트를 정하는 곳이 다른 탭이라, 한쪽만 만지고
// 나머지를 잊기 쉬웠다. 두 화면이 서로를 가리키게 해 한 기능을 한자리에서 끝내게 한다.

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
