# UniFLOW DevTool — Chrome Extension 개발도구

## 프로젝트 목적
UniFLOW 웹시스템 화면 수정 시, Claude Code에 전달할 컨텍스트(소스파일, 스타일, 접근경로)를
**한 동작으로 추출**하는 Chrome Extension.

출력물을 Claude Code에 붙여넣으면 "이 화면의 어떤 파일을 어떻게 고쳐야 하는지" 바로 작업 가능하게 하는 것이 목표.

## 현재 상태 (v0.3)
- ✅ **파일 추출**: script[src] + RequireJS 모듈(require.s.contexts._.defined, _.urlFetched) + CSS(link + @import) 추출
- ✅ **접근경로 녹화**: 클릭 + input/change 이벤트 캡처 → 셀렉터 + 텍스트 라벨 + 입력값 기록
- ✅ **input 이벤트**: 디바운싱 500ms, password 필드 마스킹, step type "input"
- ✅ **스크린샷 캡처**: background.js service worker에서 captureVisibleTab, 녹화시작/navigate/중지 시점 자동 캡처
- ✅ **요소 좌표맵**: 스크린샷 캡처 시점에 interactive 요소 rect 수집, step type "elements_map"
- ✅ **Google Drive/Sheets 연동**: OAuth(chrome.identity) + Drive 업로드 + Sheets append
- ✅ **녹화 바 UI**: Shadow DOM으로 페이지 CSS와 격리, 브라우저 상단 중앙 fixed
- ✅ **복사**: 마크다운 형태로 클립보드 복사 (elements_map은 JSON 블록으로 포함)
- ✅ **공통 파일 필터링**: COMMON_PATTERNS 배열 기반 (popup.js 상단)
- ✅ **CSS 중복 제거**: 쿼리스트링(?bust=...) 무시하고 경로 기준 dedup
- ✅ **F3 사용자 전환**: F3 키로 사용자 전환 모달(Shadow DOM) 토글 → 사용자 목록 조회 + 즐겨찾기 + API 로그인 전환 (userSwitch.js)
- ✅ **도메인별 API 토큰**: F3 로그인 전환에 쓰는 clientKey를 하드코딩하지 않고 chrome.storage.local 에 도메인 단위로 등록/관리 (설정 탭). 즐겨찾기도 도메인별 저장

## 미구현 / 향후 계획
- ❌ **JSP 파일 표식**: 서버 쪽에 meta 태그 또는 data 속성으로 JSP 경로를 주입해야 함
  - 방안 A: `<meta name="jsp-source" content="<%=request.getServletPath()%>">` (공통 레이아웃에 1줄)
  - 방안 B: `<div data-jsp-source="...">` (include 단위로 세밀한 표시, 복잡한 화면에 유리)
  - 어느 쪽이든 dev 프로필에서만 활성화
- ❌ **COMMON_PATTERNS 커스터마이징**: UniFLOW 디렉터리 구조에 맞게 필터 패턴 조정 필요
- ❌ **녹화 데이터 → 자연어 변환**: Claude API 후처리로 셀렉터+텍스트를 자연어 문장으로
- ❌ **data-main 속성**: 메인 JS 특정을 위한 `<script data-main="true">` 마킹 (서버 쪽)
- ❌ **Google OAuth client_id 설정**: manifest.json의 YOUR_GOOGLE_CLIENT_ID 실제 값으로 교체 필요

## 기술 스택
- Chrome Extension Manifest V3
- Vanilla JS (프레임워크 없음)
- Shadow DOM (녹화 바 CSS 격리)
- chrome.storage.local (녹화 상태 유지)
- chrome.scripting.executeScript with world: 'MAIN' (RequireJS 등 페이지 컨텍스트 접근)

## 파일 구조
```
uniflow-devtool/
  manifest.json    — Manifest V3, permissions + oauth2 설정
  background.js    — Service Worker: 스크린샷 캡처, Google Drive/Sheets/OAuth API
  popup.html       — 팝업 UI (파일추출 탭 + 접근경로 녹화 탭 + Google 저장)
  popup.js         — 추출 로직 + 녹화 제어 + 마크다운 변환/복사 + Google 저장 UI + 도메인별 토큰 관리
  content.js       — 페이지 inject, 녹화 바, 클릭/input/URL 이벤트 캡처, 요소 좌표맵
  userSwitch.js    — F3 사용자 전환 모달(Shadow DOM), 도메인별 토큰 조회 + 사용자 목록/즐겨찾기/로그인 전환 API
  CLAUDE.md        — 이 파일
  .task/           — 작업 계획 파일
```

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
