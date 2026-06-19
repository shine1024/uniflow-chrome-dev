# 백로그 (BACKLOG)

아직 구현하지 않은 기능 / 향후 계획. 새 과제가 생기면 여기에 추가한다.
착수하면 필요 시 `.task/NNN-제목.md` 로 상세 계획을 만든다.
**완료된 항목은 이 목록에서 제거하고 `WORKLOG.md` 에 기록한다** (할 일 → 한 일로 이동).

## 다음 세션 이어가기
> 시나리오 편집기 1차는 **커밋·푸시 완료**, Playwright 실행까지 검증됨. 한 일 상세는 WORKLOG `2026-06-17~19` 참고.

- [ ] **노션풍 디자인 확장** — 현재 popup 만 적용됨. 편집기(editor.html) / F3 모달(userSwitch.js) / 녹화 바(content.js)에 동일 디자인 토큰(`:root` 변수) 적용
- [ ] **팝업 노션 디자인 시각 최종 확인** — 기능은 OK, 디자인 톤만 브라우저에서 확인
- [ ] (선택) **시나리오 라이브러리/관리** — 아래 "기능" 항목 참고 (현재 저장은 단일 슬롯이라 관리 기능 없음)

## 기능
- **시나리오 라이브러리/관리**: 현재 편집기 저장은 `chrome.storage.local.scenario` **단일 슬롯(1개)** — 덮어쓰기. 여러 시나리오를 이름별로 저장/목록/불러오기/삭제하고, 시나리오 JSON export·import로 백업·공유 (현재 "관리" 기능 없음, 실제 산출물은 내보낸 `.spec.ts`)
- **JSP 파일 표식**: 서버 쪽에서 meta 태그/data 속성으로 JSP 경로를 주입 (dev 프로필에서만 활성화)
  - 방안 A: `<meta name="jsp-source" content="<%=request.getServletPath()%>">` (공통 레이아웃에 1줄)
  - 방안 B: `<div data-jsp-source="...">` (include 단위로 세밀한 표시, 복잡한 화면에 유리)
- **data-main 속성**: 메인 JS 특정을 위한 `<script data-main="true">` 마킹 (서버 쪽)
- **녹화 데이터 → 자연어 변환**: Claude API 후처리로 셀렉터+텍스트를 자연어 문장으로
- **Playwright 내보내기 2차/3차** (1차 완료: 편집+gap+검증+녹화중 검증캡처+Export — 진행 문서 `001-playwright-export.md`): 녹화기 보강(role/accessible name/data-testid/iframe 경로), 로그인 `storageState` 가이드, 다이어그램 뷰, 시나리오 JSON import/export
- **스크린샷 캡처**: 녹화 시점 화면 자동 캡처(captureVisibleTab) — 별도 Service Worker 필요(현재 백그라운드 없음). popup.js 에 screenshot step 렌더 코드만 잔존
- **요소 좌표맵**: 캡처 시점 interactive 요소 rect 수집(step type "elements_map") — 스크린샷과 함께 구현

## 개선
- **COMMON_PATTERNS 커스터마이징**: UniFLOW 디렉터리 구조에 맞게 공통/라이브러리 필터 패턴 조정
