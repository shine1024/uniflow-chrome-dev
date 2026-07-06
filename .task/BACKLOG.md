# 백로그 (BACKLOG)

아직 구현하지 않은 기능 / 향후 계획. 새 과제가 생기면 여기에 추가한다.
착수하면 필요 시 `.task/NNN-제목.md` 로 상세 계획을 만든다.
**완료된 항목은 이 목록에서 제거하고 `WORKLOG.md` 에 기록한다** (할 일 → 한 일로 이동).

## 다음 세션 이어가기
> **[2026-07-02 재개 지점] 로케이터 견고화 코드 완료·미커밋. 남은 실제 이슈: "트리 노드 클릭이 트리를 못 펼침".**
>
> **이번 세션에 한 일(모두 미커밋):**
> - `src/content/content.js`: ① `isUniqueSelector`+getSelector 유일성 climb ② `findScopeAnchor`+`isGoodScopeId`(쓰레기 id `#R`·`#[object...]` 배제) ③ `chooseLocatorStrategy`+검증 헬퍼들(`liveRole`/`accessibleName`/`emulateGetByText`/`roleResolvesTo`/`textResolvesTo`/`isElVisible`/`isAriaHidden`/`uniqueHits`) — 후보를 라이브 DOM에 맞춰보고 유일·보임으로 걸리는 전략 채택, 스코프는 전역에서 애매할 때만, 안 되면 CSS 폴백. `collectLocator`가 `locatorStrategy`+`scope` 저장
> - `src/editor/editor.js`: `pickLocator`가 `locatorStrategy` 우선(팩토리 `emit()`), `tagToRole` 명시적 role 우선, `normalizeFromRaw`가 `locatorStrategy`·`scope` 전달, `test.step` 래핑, scope·exact·visible
> - 검증: **실제 Playwright 1.61.1** + 목 페이지 다수로 교차검증 통과(유일성·스코프 선택·자동 판별·`#R` 제거). 검증 하니스는 `.playwright-mcp`(gitignore)에 만들었다 정리함
>
> **꼭 알아둘 운영 팁(이번에 헤맨 지점):** content.js 수정 반영은 `chrome://extensions` 확장 새로고침 **+ 작업 페이지 F5** 둘 다 필요(안 그러면 옛 content.js가 열린 탭에 계속 돎). 재녹화해야 `locatorStrategy` 붙음. 편집기가 옛 저장 시나리오를 붙잡으면 "녹화에서 불러오기" 버튼으로 강제 로드.
>
> **막힌 지점(여기서 재개):** 결재작성 화면에서 **"공통"(트리 카테고리) 클릭 → 하위 "경조금 지급 신청서"가 펼쳐져야 하는데 트리가 안 펼쳐짐.** iframe 아님(manifest에 all_frames 없음 + 녹화가 됐으므로 메인문서). 로케이터가 펼침 핸들러 요소가 아니라 텍스트만 짚었을 가능성. **다음 확인:** ① 재생이 에러(Timeout/not clickable)인지 vs 통과-무반응인지 ② "공통" 노드 outerHTML(부모+화살표/토글 아이콘 포함) ③ 빠른 정답은 `npx playwright codegen <url>`로 직접 공통 펼쳐 실제 동작 로케이터 확보. 필요 시 `findClickTarget`(content.js) 보정.
>
> **커밋 안 함**(사용자 요청). 검증 후 커밋 예정 메시지: `[보완] Playwright 로케이터 확장 내 검증·영역 스코프·유일성`.
>
> 시나리오 편집기 1차는 **커밋·푸시 완료**, Playwright 실행까지 검증됨. 한 일 상세는 WORKLOG `2026-06-17~19` 참고.

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

## 개선
- **COMMON_PATTERNS 커스터마이징**: UniFLOW 디렉터리 구조에 맞게 공통/라이브러리 필터 패턴 조정
