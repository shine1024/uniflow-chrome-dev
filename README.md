# UniFLOW DevTool

UniFLOW(JSP + RequireJS 기반 웹시스템)의 **구축·운영을 돕는 개발자 편의 도구** Chrome Extension.

제공 기능과 사용법은 아래 [기능](#기능) 참고.

## 설치 (개발자 모드 / unpacked 로드)

1. Chrome 에서 `chrome://extensions` 접속
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** 클릭 → 이 저장소 루트 폴더(`manifest.json` 있는 곳) 선택
4. 소스를 수정한 뒤에는 확장 카드의 **새로고침(↻)** 버튼으로 재적용

## 기능

### 1. 파일 추출
- **정의**: 현재 화면을 구성하는 JS(`script[src]` + RequireJS 모듈) / CSS(`link` + `@import`) 파일 목록을 추출한다.
- **용도**: 화면이 어떤 파일로 이뤄졌는지 빠르게 파악. 결과(마크다운)를 Claude Code에 붙여넣어 바로 수정 작업.
- **사용법**: 팝업 → `파일 추출` 탭 → `현재 화면 추출` → `복사`. 공통/라이브러리 파일은 체크박스로 제외 토글.

### 2. 접근경로 녹화
- **정의**: 화면에서의 클릭·입력·URL 이동을 셀렉터·텍스트 라벨·입력값으로 순서대로 기록한다.
- **용도**: 특정 화면에 도달하는 경로/조작을 재현 가능한 형태로 남김 (URL 직접 접근이 어려운 이벤트 기반 화면 이동 대응).
- **사용법**: 팝업 → `접근경로 녹화` 탭 → `녹화 시작` → 화면 조작(페이지를 이동해도 유지) → 녹화 바 `중지` → `복사`.

### 3. F3 사용자 전환
- **정의**: 페이지에서 `F3` 키로 사용자 전환 모달을 띄워, 사용자 목록·즐겨찾기에서 골라 로그인 사용자를 즉시 전환한다.
- **용도**: 권한·계정별 화면 테스트 시 로그아웃/재로그인 없이 빠른 전환.
- **사용법**: 페이지에서 `F3` → 모달(헤더 드래그로 이동) → 사용자 아이디 클릭으로 전환, `★`로 즐겨찾기. (전환에는 도메인별 토큰 필요 — 아래 [설정](#설정-팝업--설정-탭))

## 설정 (팝업 → 설정 탭)

- **도메인별 API 토큰**: F3 로그인 전환에 쓰는 `clientKey` 를 **도메인 단위**로 등록/관리.
  토큰은 하드코딩하지 않고 `chrome.storage.local`(`domainTokens`)에 저장된다.

## 디렉터리 구조

```
manifest.json              Manifest V3 — 진입점 경로 정의
icons/                     확장 아이콘 (16/48/128)
src/
  content/
    content.js            페이지 inject, 녹화 바, 이벤트 캡처
    userSwitch.js         F3 사용자 전환 모달
  popup/
    popup.html / popup.js 팝업 UI + 제어 로직
docs/                      설계 메모·아키텍처 노트
.task/                     작업 기록 (WORKLOG·BACKLOG)
CLAUDE.md                  프로젝트 컨텍스트 (Claude 작업용)
```

> 진입점 경로(`manifest.json`, `popup.js` 의 `executeScript files`)는 **확장 루트 기준**이다.
> 소스를 옮기면 두 곳을 함께 갱신할 것. 자세한 설계는 [`docs/architecture.md`](docs/architecture.md) 참고.

## 기술 스택

Chrome Extension Manifest V3 · Vanilla JS(의존성 없음) · Shadow DOM(주입 UI 격리) ·
`chrome.storage.local` · `chrome.scripting.executeScript`(`world: 'MAIN'`)

## 개발 메모

기능 현황·코딩 컨벤션은 [`CLAUDE.md`](CLAUDE.md), 작업 히스토리·향후 계획은 [`.task/`](.task/)(WORKLOG·BACKLOG) 참고.
