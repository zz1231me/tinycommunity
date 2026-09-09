// client/public/site-identity.js
// 사이트명·파비콘 깜빡임 방지: 직전에 캐시한 값을 첫 페인트 전에 동기 적용한다.
// App 이 사이트 설정을 받아오기 전까지 기본 title 이 잠깐 보였다 바뀌던 문제를 없앤다.
//
// 왜 인라인이 아니라 파일인가: 프로덕션의 CSP 는 script-src 'self' 라 인라인 스크립트를
// 막는다(개발은 Vite 가 자체 CSP 로 서빙해 드러나지 않았다). 해시를 예외로 넣는 방법도
// 있지만 글자 하나만 바뀌어도 깨진다 — 파일로 두면 규칙을 넓히지 않고 그대로 동작한다.
(function () {
  try {
    var t = localStorage.getItem('siteTitle');
    if (t) document.title = t;
    var f = localStorage.getItem('faviconUrl');
    if (f) {
      var link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = f;
    }
  } catch (e) {
    /* localStorage 접근 불가 시 무시 */
  }
})();
