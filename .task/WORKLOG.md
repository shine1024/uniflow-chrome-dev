# 작업 로그 (WORKLOG)

Claude와 진행한 작업의 **시간순 기록** — 최신 항목이 맨 위.
의미 있는 작업/커밋을 마치면 맨 위에 새 항목을 추가한다.

## 형식
```
### YYYY-MM-DD — <한 줄 요약>
- 한 일 (불릿)
- 커밋: <해시> (여러 개면 나열)
- 메모/후속: (선택)
```

---

### 2026-06-24 — HP 디자인 전 화면 통일 (editor·F3 모달·녹화 바·F2 패널·popup.js)
- "한 번에 전부 통일" 결정에 따라 남은 모든 화면을 HP 토큰(design.md)으로 맞춤. popup과 동일 팔레트(primary #024ad8, ink #1a1a1a, cloud #f7f7f7, hairline #e8e8e8, steel #c2c2c2, danger #ff5050·#b3262b), 버튼 4px + letter-spacing
- editor.html: `:root` 토큰 + Manrope `@font-face`(`../popup/fonts/`), 헤더·코드패널을 ink 슬랩, 코드 타이틀 bright-blue(#296ef9), 카드/번호뱃지/입력/태그 토큰화
- userSwitch.js(F3 모달): 헤더·도메인칩·링크·테이블·메시지색 HP로, 입력/닫기버튼 4px
- content.js: 녹화 바 빨강→coral(#ff5050→#b3262b)·버튼 4px·assert-active 초록→HP블루, 인스펙터 하이라이트 #2383e2→#024ad8, 검증 유형 메뉴 토큰화
- autoLogin.js(F2 패널): 패널 회색/보더/입력 4px·녹색강조→HP블루, 토스트(ink/HP블루/bloom-deep)·상태색·자체 피커 하이라이트까지
- popup.js: 동적 콘텐츠 인라인색을 토큰으로(muted→--text-3, 강조→--accent, 삭제/오류→--danger-deep, 성공→--accent)
- 콘텐츠 스크립트(F2/F3/녹화바)는 한글 위주라 Manrope 미적용(시스템 폴백) — 색·형태만 통일. Manrope는 확장 페이지(popup·editor)만
- 예외: editor "복사됨" 피드백은 파란 버튼 대비 위해 초록(#059669) 유지
- 검증: 4개 JS `node --check` 통과, 구palette 잔여 0, editor·F3 모달·녹화 바를 로컬 렌더로 육안 확인. 미커밋

### 2026-06-24 — F2 등록 패널 UI 보정 (너비·라벨 줄바꿈·HP블루)
- 패널이 좁고(340px) "로그아웃 (선택)" 라벨이 라벨칸(72px)을 초과해 줄바꿈되던 문제
- 너비 340→384px, 라벨칸 72→92px + `white-space:nowrap`, `.sel` 좌여백 78→98px 정렬, 라벨/입력/요소선택 버튼 폰트 1px씩 상향(가독성)
- 저장 버튼·도메인 칩 파랑을 popup과 동일한 HP 블루(#024ad8·#0e3191)로 통일 (패널 전체 토큰화는 후속)
- 검증: 패널 마크업을 임시 HTML로 렌더 → "로그아웃 (선택)" 한 줄 표시·넓어진 폭 육안 확인 (autoLogin.js, 미커밋)

### 2026-06-24 — F2·F3를 등록된 도메인에서만 동작 (미등록은 무음 무시)
- 요청: F2 자동로그인 / F3 사용자 전환을 등록된 도메인에서만 동작시키고, 미등록 도메인에선 완전 무음 무시(토스트·모달 없음)
- F3(userSwitch.js): 기존엔 토큰 등록 여부와 무관하게 어느 사이트에서나 모달이 열렸음 → `showModal()` 진입 시 `getDomainToken()`을 먼저 조회해 토큰 없으면 모달을 만들지 않고 return. 기존 "토큰 없음" 경고 분기는 가드로 죽어 제거
- F2(autoLogin.js): `handleF2()`는 이미 설정 없으면 return했으나 안내 토스트를 띄웠음 → 토스트 제거하고 무음 return (등록 패널의 요소 선택 취소 등 패널 동작은 유지)
- "등록" 기준: F2=`domainAutoLogin[host]`, F3=`domainTokens[host]`
- 검증: 두 파일 `node --check` 통과, showToast/showMsg 잔여 참조 정상. CLAUDE.md F2·F3 설명 갱신. 미커밋

### 2026-06-24 — popup에 HP 디자인 시스템(design.md) 1차 적용
- 어제 준비만 해둔 `design.md`(HP 디자인 시스템 스펙)·`src/popup/fonts/`(Manrope woff2 400/500/600/700)를 실제 코드에 연결 — 직전까지 스펙·폰트만 받아두고 코드 미반영 상태였음
- popup.html: `@font-face`로 Manrope 4종 연결, body 폰트 `Manrope` 우선(한글은 Malgun Gothic 폴백 유지)
- `:root` 토큰값을 HP 팔레트로 매핑(토큰명은 유지) — ink/charcoal/graphite(#1a1a1a·#3d3d3d·#636363), canvas #fff, cloud #f7f7f7, hairline #e8e8e8, steel #c2c2c2, primary=HP Electric Blue #024ad8(pressed #0e3191·soft #c9e0fc), danger=bloom-coral #ff5050(#b3262b)
- 버튼: radius 4px(rounded.md)·letter-spacing 0.3px, primary hover→pressed blue, 녹화/초기화·녹화상태 바를 coral 계열로, "복사됨" 확인을 팔레트 내 blue로
- 설정 탭 인라인 하드코딩(회색·코드칩 배경·입력 radius 8px→4px)을 토큰으로 치환
- 검증: 로컬 HTTP로 popup 렌더 → Manrope 로드 true, primary 버튼 배경 rgb(2,74,216)=#024ad8, radius 4px 확인 + 추출/설정 탭 스크린샷 육안 확인
- 범위 밖(후속): editor·F3 모달(userSwitch.js)·녹화 바(content.js)·popup.js 동적 의미색(상태 빨강/초록, 링크 blue) — BACKLOG 참고. 미커밋

### 2026-06-23 — F2 로그인 상태 판정 방식 변경 (로그인 폼 기준)
- 기존: "로그아웃 버튼이 보이면 로그인 상태"로 역추론 → 로그아웃 버튼은 선택 등록이라 미등록 시 토글 불가, 단일 신호 의존
- 변경: **로그인 폼(아이디·비번 입력칸) 가시성**을 1차 신호로. 폼이 보이면 로그인 전→자동로그인, 안 보이면 로그인 상태→로그아웃 버튼 클릭. 폼·로그아웃 버튼 모두 못 찾으면 셀렉터 점검 토스트로 중단(무작정 동작 안 함)
- `isVisible()` 보강: width/height 0뿐 아니라 `visibility:hidden/collapse`·`opacity:0`도 비가시로 처리
- `autoLogin.js`의 `handleF2()`·`isVisible()` 수정, CLAUDE.md F2 설명 갱신

### 2026-06-22 — 자동로그인(F2) 기능 도입
- 구버전 확장 `uniflow-chrome-extension/keyHandler.js`의 F2 자동로그인을 본 프로젝트로 이식. 원본의 하드코딩(아이디 `uniflow`/비번/`#id`·`.btn-login` 셀렉터)은 가져오지 않고 **도메인별 chrome.storage.local 저장**으로 전환 (`domainTokens` 패턴 동일)
- 신규 `src/content/autoLogin.js`: F2 → 도메인 설정 읽어 로그아웃 버튼이 보이면 로그아웃, 아니면 아이디/비번 채우고(input·change 이벤트) 로그인 버튼 클릭. 설정 없으면 안내 토스트
- 사이트마다 로그인/비번 칸·로그인·**로그아웃 버튼이 다름** → 4개 요소를 모두 도메인별로 등록. 로그인 상태 감지는 원본의 `.session` 대신 "로그아웃 버튼 존재"로 판단
- 요소 선택 피커: content.js의 하이라이트 디자인(파란 오버레이·crosshair·`pageElementUnder`)을 재사용한 독립 피커. 셀렉터 생성은 content.js의 전역 `getSelector` 공유(같은 isolated world, manifest 로드 순서로 보장)
- 등록 UI = **페이지에 뜨는 드래그 가능한 등록 패널**(Shadow DOM, autoLogin.js): 아이디(입력값+요소선택) · 비밀번호(입력값+요소선택) · 로그인 버튼(요소선택) · 로그아웃(선택) → [저장]. 패널이 떠 있는 채로 요소를 짚으므로 팝업이 닫히는 문제·초안 우회가 없음(초안 방식 폐기). 헤더 드래그로 이동(userSwitch 패턴)
- 팝업 설정 탭은 "현재 페이지에 등록 패널 열기" 버튼 + 등록된 도메인 목록([삭제])만 담당. 패널은 열 때 해당 도메인의 기존 설정을 불러옴(수정 겸용)
- 변경 파일: `manifest.json`(content_scripts에 autoLogin.js 추가), `src/content/autoLogin.js`(신규·등록 패널 포함), `src/popup/popup.html`·`popup.js`(설정 탭: 패널 열기 버튼+목록)
- 메모: 비밀번호 평문 저장(녹화 input과 동일 트레이드오프, 설정 섹션에 주의 문구). 미커밋 — 브라우저 실동작 검증은 사용자 확인 후

### 2026-06-17~19 — 시나리오 녹화 → Playwright 편집기 1차 + 녹화/UI 개선 (커밋 완료)
- content.js: 녹화 바 "✓ 검증 추가" 모드 → 페이지 요소를 클릭하면 selector·text 자동 캡처해 assert 스텝 생성 (편집기 왕복 없이 녹화 흐름 안에서 검증 — "투스텝" 끊김 해소)
- 팝업 녹화 결과/복사에 assert 표시, editor `normalizeFromRaw`가 `assertType`/`expected` 보존
- 팝업 UI를 노션풍 디자인 토큰(Segoe UI 15px · 라이트 헤더 · 부드러운 보더/여백, `:root` 변수화)으로 개편 — 편집기/F3/녹화 바 확장 예정
- 편집기: 시나리오 **설명란** 추가(저장 + 내보낸 코드 상단 주석으로 포함)
- 편집기: 단계 카드를 **번호 노드 + 연속 타임라인 선**으로 연결 flow 시각화, 갭(대기시간)은 칩으로 표시
- 편집기: 시나리오 **설명란** 추가 (저장 + 내보낸 코드 상단 주석)
- 🐛 수정: 편집기 열 때 **새 녹화 자동 감지** — 저장된 편집본이 *다른* 녹화면 새 녹화를 자동 로드(같은 녹화면 편집본 유지). "옛 데이터가 떠서 아이디/검증 입력이 안 되던" 문제 해결 (`scenario.sourceRecId` = 첫 스텝 timestamp로 판별)
- 🐛 수정: **비밀번호 입력 값 편집 반영** — 편집 전 마스킹(`****`)일 때만 `process.env.PASSWORD`, 사용자가 값을 넣으면 그 값으로 `fill`
- 🐛 수정: **input/textarea/select 클릭 locator** — `getByText`(placeholder를 텍스트로 오인) 대신 셀렉터(`page.locator`) 사용. 버튼/링크는 `getByRole`, 일반 텍스트 요소는 `getByText` 유지
- 변경: **비밀번호 마스킹 해제** — 테스트 재현 목적상 실제 입력값을 그대로 기록(→ 코드젠이 `page.fill`에 실제 값 사용). 평문 저장 트레이드오프는 수용
- 🐛 수정: **입력 스텝 누락** — 입력은 500ms 디바운스라, 비밀번호 입력 후 바로 로그인 클릭→이동하면 타이머가 취소돼 스텝이 빠지던 문제. ① 클릭 기록 직전 대기 입력 flush ② `change`(blur) 시 즉시 커밋 ③ `addStep` 직렬화(경쟁 방지). Playwright로 "입력 직후 즉시 클릭" 시 비밀번호 스텝 보존 검증
- 검증 유형 세분화: **요소 보임 / 텍스트 일치(`toHaveText`) / 텍스트 포함(`toContainText`) / 입력값 일치(`toHaveValue`) / URL 일치**
- 녹화 중 검증 캡처를 **개발자도구 인스펙터식**으로 개선: hover 시 요소 하이라이트 → 클릭하면 그 자리에서 검증 유형 선택 메뉴 → selector·text·기대값 자동 캡처 (input엔 '입력값 일치'만 노출하고 값 자동 채움). Playwright로 hover/메뉴/캡처 전 과정 구동 검증
- Playwright(MCP) + `chrome.storage` 목 하니스로 입력/저장/검증/자동로드 **실제 구동 검증 완료**
- ✅ **결과**: 녹화 → 편집 → 검증 → 내보내기 → **실제 Playwright 실행 성공**까지 1바퀴 검증 완료 (사용자 확인)
- 📦 이 세션 작업을 `9354d4d` 위에 단일 커밋으로 정리·푸시 (`.claude/`·`.playwright-mcp/`는 `.gitignore` 제외). 커밋 해시는 git log 참고
- 다음 할 일은 BACKLOG "다음 세션 이어가기" 참고

### 2026-06-16 — Playwright 내보내기 1차 (시나리오 편집기)
- `src/editor` 신규: 녹화 스텝을 번호 타임라인 카드로 편집(삭제·드래그 재정렬·값·갭·사용여부) + Playwright `.spec.ts` 실시간 미리보기/복사/다운로드
- gap = `timestamp` 차이 자동 산출 → `waitForTimeout`(적용 토글+임계값), locator 우선순위(role/text/CSS 폴백)
- 검증(assert) 스텝: URL 일치 / 요소·텍스트 보임 / 텍스트 포함 → `expect` 코드로 성공·실패 판정
- 편집본 `chrome.storage.local.scenario` 저장 + "녹화에서 불러오기", 팝업 녹화탭에 "▶ Playwright" 버튼
- 설계/진행: `.task/001-playwright-export.md`
- 커밋: (이번 작업)

### 2026-06-15 — README 기능 가이드 개편
- 도구 성격을 "UniFLOW 구축·운영 개발자 편의 도구"로 재정의
- 사용법 표 → 기능별(정의·용도·사용법) 항목으로 재구성
- 커밋: (이번 작업)

### 2026-06-15 — 문서 역할 정리 + 작업 기록 체계(.task) 구성
- CLAUDE.md에서 "미구현/향후 계획" 제거 → `.task/BACKLOG.md` 로 이관, CLAUDE.md는 Claude 작업용 컨텍스트로 한정
- CLAUDE.md에 "작업 기록(필수)" 규칙 추가 — 작업 전 WORKLOG/BACKLOG 확인, 작업 후 WORKLOG 갱신
- `.task/WORKLOG.md`·`.task/BACKLOG.md` 신설, `.task/README.md` 갱신
- README.md를 도구 사용 가이드로 정리 (스크린샷·요소좌표맵 등 미구현 표현 제거)
- 커밋: ac6330c

### 2026-06-15 — CLAUDE.md 현행화
- 파일 구조를 src/ 트리로 갱신, Google/OAuth 항목 제거
- 미구현이던 "스크린샷 캡처"·"요소 좌표맵"을 ✅→❌ 정정(생성 코드 없음)
- 실제 구현 반영: URL 변경 감지(navigate), 페이지 이동 후 녹화 유지, F3 모달 드래그, password 마스킹
- 커밋: 840bb11

### 2026-06-15 — Google Sheets 저장 기능 제거
- background.js(서비스계정 JWT + Sheets append) 삭제, manifest background 제거
- 녹화 탭 Google 저장 버튼 + 설정 탭 스프레드시트ID/서비스계정 UI 제거, popup.js 관련 로직·죽은 driveFileId 스텁 제거
- 녹화·F3·도메인 토큰 기능은 유지 (Google 비의존 확인)
- 커밋: ea97abf

### 2026-06-15 — src/ 디렉터리 구조 정리 + 관리 파일 추가
- content/userSwitch/popup 을 src/ 하위로 이동, manifest·popup.js 주입 경로를 src/ 기준으로 갱신
- README.md, .gitignore, docs/architecture.md, .task/ 신설
- 커밋: 9b35ba9

### 2026-06-15 — F3 사용자 전환 모달 드래그 이동 + 도메인 토큰
- F3 사용자 전환 모달 헤더를 잡고 드래그로 이동 가능하게 추가 (userSwitch.js)
- 사용자 목록/즐겨찾기/API 로그인 전환, 도메인별 clientKey 토큰 등록·관리(설정 탭)
- 커밋: 7ecd651
