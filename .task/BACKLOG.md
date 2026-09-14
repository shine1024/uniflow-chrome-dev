# 백로그 (BACKLOG)

아직 구현하지 않은 기능 / 향후 계획. 새 과제가 생기면 여기에 추가한다.
착수하면 필요 시 `.task/NNN-제목.md` 로 상세 계획을 만든다.
**완료된 항목은 이 목록에서 제거하고 `WORKLOG.md` 에 기록한다** (할 일 → 한 일로 이동).

## 다음 세션 이어가기
> **[2026-07-06 재개 지점] 최우선: TinyMCE 게시판 본문 녹화·재생이 실제 확장에서 여전히 안 됨.**
>
> **현재 커밋 상태(둘 다 `main`, push 안 함):**
> - `d1f7a53` `[보완] Playwright 로케이터 확장 내 검증·영역 스코프·유일성` — ✅ 실제 Playwright로 검증 완료(로케이터 견고화)
> - `94cc076` `[신규] TinyMCE 리치텍스트 입력 녹화·재생 (작업중)` — ⚠️ 부품만 검증, **실제 확장 end-to-end 미검증**
>
> **문제:** 게시판 글쓰기 TinyMCE 에디터 **본문**이 (녹화 → 생성 spec 재생) 저장 시 "본문 입력" 검증에 걸림. 사용자 환경에서 여전히 실패. (녹화가 아니라 재생/실행 경로 문제로 좁혀졌으나 실제 확장에서 미해결)
>
> **지금까지 확정된 진단(재도출 불필요 — 실제 페이지에서 확인함):**
> - 대상: TinyMCE **5.6.2**, iframe `#tinymce_ifr`, body `id=tinymce`(contenteditable), 백킹 `<textarea name="tinymce">`. 폼은 **최상위 문서**(제목 `input[name='title']`, 저장 `#btnSave` 또는 툴바 "저장").
> - 녹화 캡처: TinyMCE는 iframe 생성 후 `doc.open/write`로 문서를 다시 써 **같은 Document 객체인데 등록 리스너가 지워짐** → ②는 `attachToFrame`를 doc 동일성으로 막지 않고 재부착 + `scanFrames` **700ms 재스캔**으로 대응. (주입 코드로 실제 페이지에서 재부착·캡처 확인)
> - 재생: **`fill`도 `page.keyboard` 실제 키입력(실제 click 포커스 후에도)도 이 에디터에 안 들어감**(`getContent` 빈 값). **오직 `tinymce.get('tinymce').setContent(html); ed.save()`만** 백킹 textarea까지 채우고 본문검증 통과 → ② editor.js는 iframe richtext를 이 API로 생성(id는 frameSelector에서 `_ifr` 제거).
>
> **아직 안 풀린 것:** 부품은 다 실제 페이지에서 통했는데 **실제 확장 end-to-end(녹화→스텝 저장→생성→재생 저장)** 가 사용자 환경에서 실패. 원인 미확정 — 후보: (a) 확장 미리로드로 옛 content.js가 돎 (b) 격리월드(content script)에서의 iframe 리스너 동작이 주입(메인월드) 테스트와 다름 (c) 본문 스텝이 애초에 캡처 안 됨.
>
> **다음 스텝(사용자와 합의):** content.js에 **임시 진단 로그** 심기 — `setupFrameWatch` 실행 / `attachToFrame`가 iframe 발견 / `handleRichInput` 발동 시 `console.log`. 사용자가 확장 새로고침+F5+녹화+타이핑 → **페이지 F12 콘솔** 로그로 어디서 끊기는지 판별: 로그 전무=리로드/주입 문제 / `handleRichInput`은 뜨는데 스텝 없음=저장 경로 / 다 뜨는데 재생 실패=생성코드. 원인 잡으면 임시 로그 제거.
>
> **실측 정보(테스트 계정·경로):** 로그인 `demo009`/`123123` @ https://uniflow.unipost.co.kr/login → 커뮤니티(`/unicloud/view/gw-all-board-list`) → 글쓰기(`#btnWrite`) → `gw-all-board-insert`. 주의: 인서트 URL **직접 이동은 blank/로그아웃**됨(반드시 클릭 경유), SPA 클릭이 자동화에서 불안정(anchor `el.click()`로 우회), Playwright `page.keyboard`는 이 iframe에 **못 침**.
>
> **운영 팁:** content.js 반영은 `chrome://extensions` 새로고침 **+ 작업페이지 F5 + 재녹화** 셋 다 필요.
>
> **(부차) 미해결 이슈** — 로케이터 작업(`d1f7a53`, 커밋됨)의 남은 실이슈: 결재작성 "공통"(트리 카테고리) 클릭이 트리를 못 펼침(펼침 핸들러 아닌 텍스트만 짚었을 가능성). 다음확인: 재생이 에러(Timeout/not clickable)인지 vs 통과-무반응인지, "공통" 노드 outerHTML(토글 아이콘 포함), `npx playwright codegen`로 실동작 로케이터 확보 → `findClickTarget`(content.js) 보정.

- [ ] (선택) **시나리오 라이브러리/관리** — 아래 "기능" 항목 참고 (현재 저장은 단일 슬롯이라 관리 기능 없음)
- [ ] (선택) **콘텐츠 스크립트 Manrope 적용** — 현재 F2 패널/F3 모달/녹화 바는 한글 위주라 시스템 폰트 폴백. Manrope까지 통일하려면 `web_accessible_resources` + `chrome.runtime.getURL`로 폰트 주입 필요 (라틴 글자에만 효과)

## 기능
- **시나리오 라이브러리/관리**: 현재 편집기 저장은 `chrome.storage.local.scenario` **단일 슬롯(1개)** — 덮어쓰기. 여러 시나리오를 이름별로 저장/목록/불러오기/삭제하고, 시나리오 JSON export·import로 백업·공유 (현재 "관리" 기능 없음, 실제 산출물은 내보낸 `.spec.ts`)
- **JSP 파일 표식**: 서버 쪽에서 meta 태그/data 속성으로 JSP 경로를 주입 (dev 프로필에서만 활성화)
  - 방안 A: `<meta name="jsp-source" content="<%=request.getServletPath()%>">` (공통 레이아웃에 1줄)
  - 방안 B: `<div data-jsp-source="...">` (include 단위로 세밀한 표시, 복잡한 화면에 유리)
- **data-main 속성**: 메인 JS 특정을 위한 `<script data-main="true">` 마킹 (서버 쪽)
- **녹화 데이터 → 자연어 변환**: Claude API 후처리로 셀렉터+텍스트를 자연어 문장으로
- **Playwright 내보내기 2차/3차** (1차 완료: 편집+gap+검증+녹화중 검증캡처+Export — 진행 문서 `001-playwright-export.md`): ~~녹화기 보강(role/accessible name/data-testid)~~ → 2026-07-02 완료(WORKLOG 참고, `iframe 경로`는 미구현), 로그인 `storageState` 가이드, 다이어그램 뷰, 시나리오 JSON import/export
  - 남은 견고화: **iframe 경로 수집** — 리치텍스트 편집기(contenteditable/TinyMCE)는 2026-07-06 지원(same-origin iframe 에 리스너 부착, `frameLocator` 생성). **남은 것**: iframe 내부의 *일반 폼 입력·클릭*은 여전히 미기록(셀렉터를 최상위 문서 기준으로 못 잡아 스킵), cross-origin iframe 은 원천 불가. 클릭 시 요소의 accessible name(연결된 `<label>`) 수집으로 폼 필드 `getByRole` 정확도 향상
- **스크린샷 캡처**: 녹화 시점 화면 자동 캡처(captureVisibleTab) — 별도 Service Worker 필요(현재 백그라운드 없음). popup.js 에 screenshot step 렌더 코드만 잔존
- **요소 좌표맵**: 캡처 시점 interactive 요소 rect 수집(step type "elements_map") — 스크린샷과 함께 구현

## 네트워크 인지 대기 (2026-09-01 1차 완료 — WORKLOG 참고) — 후속
- **응답 바디 수집 + assert/목킹**: netHook 은 현재 메서드·URL·상태·시각만 수집. 응답 바디까지 캡처하면 (a) 응답값 검증(`expect(resp).json()`) (b) `page.route` 로 결정론적 목킹 가능. 바디는 XHR `responseText`/fetch clone 으로 취득 — 용량·민감정보(평문) 주의
- **navigate 스텝 네트워크 대기**: 현재 waitUrl 은 click/key 만. 전체페이지 로드(navigate)는 `waitForURL` 유지 중 — 로드 후 주요 데이터 XHR 대기까지 붙이면 더 견고(단 응답이 이미 지나가 hang 되지 않게 주의)
- **대표요청 선택 정교화**: 현재 "창 내 가장 늦게 끝난 fetch/XHR". 폴링/하트비트가 있으면 오판 가능 — method(비-GET 우선)·요청빈도·URL 패턴 학습 등으로 개선 여지. 사용자가 카드 "API 대기" 필드로 수정/삭제 가능
- **networkEvents 적재 배치화**: 현재 XHR 당 storage read-modify-write(=O(n²), 상한 1000). chatty 페이지 대비 메모리 버퍼+디바운스 플러시로 전환 검토(단 네비게이션 유실 방지 필요)
- **로그인 storageState 가이드**(2차 항목과 연계): F2 자동로그인·쿠키/localStorage 를 `storageState` 로 떠 로그인 스텝 없이 재현

## 개선
- **COMMON_PATTERNS 커스터마이징**: UniFLOW 디렉터리 구조에 맞게 공통/라이브러리 필터 패턴 조정
