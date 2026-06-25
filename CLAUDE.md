# UniFLOW DevTool — Chrome Extension 개발도구

## 프로젝트 목적
UniFLOW 웹시스템 화면 수정 시, Claude Code에 전달할 컨텍스트(소스파일, 스타일, 접근경로)를
**한 동작으로 추출**하는 Chrome Extension.

출력물을 Claude Code에 붙여넣으면 "이 화면의 어떤 파일을 어떻게 고쳐야 하는지" 바로 작업 가능하게 하는 것이 목표.

## 작업 기록 (필수)
이 프로젝트의 작업 현황·히스토리·향후 계획은 `.task/` 에서 관리한다.
- **작업을 시작하기 전** `.task/WORKLOG.md`(시간순 작업 히스토리)와 `.task/BACKLOG.md`(미구현·향후 계획)를 먼저 확인한다.
- **의미 있는 작업을 마치면**(기능 추가/변경, 구조 변경, 커밋 등) `.task/WORKLOG.md` 맨 위에 항목을 추가한다 — `날짜 · 한 일 · 관련 커밋`.
- 새로 발견한 향후 과제는 `.task/BACKLOG.md` 에 추가한다.
- 개별 작업의 상세 계획이 필요하면 `.task/NNN-제목.md` 로 만든다.

## 현재 상태 (v0.3)
- ✅ **파일 추출**: script[src] + RequireJS 모듈(require.s.contexts._.defined, _.urlFetched) + CSS(link + @import) 추출
- ✅ **접근경로 녹화**: 클릭 + input/change 이벤트 캡처 → 셀렉터 + 텍스트 라벨 + 입력값 기록
- ✅ **URL 변경 감지**: pushState/replaceState/popstate/hashchange + 전체 페이지 로드 추적 → step type "navigate". 페이지를 이동해도 녹화 유지(chrome.storage.local.recording)
- ✅ **input 이벤트**: 디바운싱 500ms, step type "input". 테스트 재현 목적상 **비밀번호도 실제 값 그대로 기록**(평문이 chrome.storage·생성 코드에 저장됨 — 주의)
- ✅ **녹화 바 UI**: Shadow DOM으로 페이지 CSS와 격리, 브라우저 상단 중앙 fixed, [중지] 버튼
- ✅ **복사**: 추출/녹화 결과를 마크다운 형태로 클립보드 복사
- ✅ **공통 파일 필터링**: COMMON_PATTERNS 배열 기반 (popup.js 상단), 체크박스 토글
- ✅ **CSS 중복 제거**: 쿼리스트링(?bust=...) 무시하고 경로 기준 dedup
- ✅ **F3 사용자 전환**: F3 키로 사용자 전환 모달(Shadow DOM, 헤더 드래그로 이동) 토글 → 사용자 목록 조회 + 즐겨찾기 + API 로그인 전환 (userSwitch.js). **토큰(`domainTokens`)이 등록된 도메인에서만 모달이 열림** — 미등록 도메인에선 무음으로 무시(토스트·모달 없음)
- ✅ **도메인별 API 토큰**: F3 로그인 전환에 쓰는 clientKey를 하드코딩하지 않고 chrome.storage.local 에 도메인 단위로 등록/관리 (설정 탭). 즐겨찾기도 도메인별 저장
- ✅ **F2 자동로그인**: F2 키로 자동로그인/로그아웃 토글(아이디 입력→비번 입력→로그인 버튼 클릭, 로그인 폼이 안 보이면 로그아웃 버튼 클릭). 사이트마다 다른 아이디·비번 입력칸과 로그인·로그아웃 버튼을 **도메인별로 등록**(`chrome.storage.local.domainAutoLogin`). 로그인 상태는 **로그인 폼(아이디·비번 입력칸) 가시성**으로 판단 — 폼이 보이면 로그인 전으로 보고 로그인, 안 보이면 로그인된 상태로 보고 로그아웃(로그아웃 버튼의 존재로 역추론하지 않음). 등록은 페이지에 뜨는 **드래그 가능한 등록 패널**(Shadow DOM, autoLogin.js)에서 진행 — 패널이 떠 있는 채로 인스펙터식 "요소 선택"으로 셀렉터를 짚는다(content.js 하이라이트 디자인·`getSelector` 재사용). 패널 열기는 팝업 설정 탭의 버튼(설정 탭은 패널 열기 + 도메인 목록/삭제만 담당). **설정(`domainAutoLogin`)이 등록된 도메인에서만 동작** — 미등록 도메인에선 F2를 무음으로 무시. 비밀번호 평문 저장 주의
- ✅ **Playwright 내보내기 (1차)**: 녹화 시나리오를 별도 편집기 페이지(`src/editor`, 새 탭)에서 번호 타임라인 카드로 보고 → 삭제/드래그 재정렬/값·갭(`waitForTimeout`) 편집 + **검증(`expect`) 스텝**(요소 보임 / 텍스트 일치 / 텍스트 포함 / 입력값 일치 / URL 일치)으로 성공·실패 판정 → Playwright `.spec.ts` 실시간 미리보기·복사·다운로드. 검증은 편집기에서 추가하거나 **녹화 중 녹화 바 "✓ 검증 추가" → 인스펙터식 하이라이트로 요소를 짚고 클릭 → 검증 유형 메뉴에서 선택해 캡처**. 편집본은 `chrome.storage.local.scenario` 에 저장 (상세: `.task/001-playwright-export.md`)

## UI 디자인 시스템
- 전 화면(popup·편집기·F3 모달·F2 등록 패널·녹화 바)이 **HP 디자인 시스템(`design.md`)** 토큰을 따른다 — primary=HP Electric Blue `#024ad8`(pressed `#0e3191`), ink `#1a1a1a`, cloud `#f7f7f7`, hairline `#e8e8e8`, steel `#c2c2c2`, danger=coral `#ff5050`/`#b3262b`. 버튼 radius 4px, 카드/리스트 8px
- 폰트는 **Manrope**(Forma DJR Micro 대체, `src/popup/fonts/` woff2 400/500/600/700). `@font-face`는 확장 페이지(popup·editor)에만 적용 — 콘텐츠 스크립트 Shadow DOM(F2/F3/녹화 바)은 한글 위주라 시스템 폰트 폴백, 색·형태만 통일
- popup·editor는 `:root` CSS 변수(`--accent`·`--text`·`--bg`·`--radius` 등)로 토큰화. 색을 새로 넣을 때 하드코딩 대신 토큰 사용

## 기술 스택
- Chrome Extension Manifest V3
- Vanilla JS (프레임워크 없음)
- Shadow DOM (녹화 바 CSS 격리)
- chrome.storage.local (녹화 상태 유지)
- chrome.scripting.executeScript with world: 'MAIN' (RequireJS 등 페이지 컨텍스트 접근)

## 파일 구조
```
uniflow-devtool/
  manifest.json              — Manifest V3, permissions + 진입점 경로
  icons/                     — 확장 아이콘 (16/48/128)
  src/
    content/
      content.js            — 페이지 inject, 녹화 바, 클릭/input/URL 이벤트 캡처
      userSwitch.js         — F3 사용자 전환 모달(Shadow DOM), 도메인별 토큰 조회 + 사용자 목록/즐겨찾기/로그인 전환 API
      autoLogin.js          — F2 자동로그인/로그아웃 + 인페이지 등록 패널(Shadow DOM, 드래그) + 요소 선택 피커(하이라이트 재사용)
    popup/
      popup.html            — 팝업 UI (파일추출 탭 + 접근경로 녹화 탭 + 설정 탭)
      popup.js              — 추출 로직 + 녹화 제어 + 마크다운 변환/복사 + 도메인별 토큰 관리
    editor/
      editor.html           — 시나리오 편집기(별도 탭): 번호 카드 편집 + Playwright 미리보기/내보내기
      editor.js             — 녹화 스텝 로드/편집(삭제·재정렬·값·갭)/Playwright 코드 생성
  docs/                      — 설계 메모·아키텍처 노트
  .task/                     — 작업 기록/진행 관리
    WORKLOG.md              — 시간순 작업 히스토리 (최신이 위)
    BACKLOG.md              — 미구현·향후 계획
  README.md                  — 도구 사용 가이드 (설치·사용법·설정)
  CLAUDE.md                  — 이 파일 (Claude 작업용 프로젝트 컨텍스트)
```

> 진입점 경로 규칙: manifest.json의 `content_scripts.js`/`default_popup` 와
> `popup.js`의 `executeScript({ files: ['src/content/content.js'] })` 는 모두 **확장 루트 기준 경로**다.
> 소스를 옮기면 이 두 곳을 함께 갱신할 것.

## 대상 환경
- UniFLOW: JSP + RequireJS 기반 웹시스템
- 각 화면마다 매핑되는 메인 JS 파일이 있음
- 화면 이동은 URL 직접 접근보다 이벤트(버튼 클릭 등)로 이루어지는 경우가 대부분

## 설계 원칙
- 이 도구로 추출한 결과물은 Claude Code에 전달하여 화면 수정 작업의 컨텍스트로 사용
- 추출 결과의 기본 출력 형태는 마크다운 (Claude Code 친화적)
- 녹화 시 셀렉터뿐 아니라 클릭된 요소의 텍스트 라벨도 함께 수집 (사람과 AI 모두 읽을 수 있도록)
- 공통/라이브러리 파일은 기본 필터링하되 토글 가능

## 코딩 컨벤션
- 함수명은 역할을 명확히 드러낼 것 (extract~, render~, to~Markdown)
- DOM 조작은 vanilla JS, 외부 의존성 없음
- content script와 popup 간 통신은 chrome.storage + chrome.runtime.onMessage
- 녹화 바 등 페이지에 inject하는 UI는 반드시 Shadow DOM으로 격리
