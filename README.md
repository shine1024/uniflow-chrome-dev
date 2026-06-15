# UniFLOW DevTool

UniFLOW(JSP + RequireJS 기반 웹시스템) 화면 수정 시, Claude Code에 전달할 컨텍스트
(소스파일·스타일·접근경로)를 **한 동작으로 추출**하는 Chrome Extension 개발도구.

추출 결과를 Claude Code에 붙여넣으면 "이 화면의 어떤 파일을 어떻게 고쳐야 하는지" 바로 작업할 수 있다.

## 설치 (개발자 모드 / unpacked 로드)

1. Chrome 에서 `chrome://extensions` 접속
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** 클릭 → 이 저장소 루트 폴더(`manifest.json` 있는 곳) 선택
4. 소스를 수정한 뒤에는 확장 카드의 **새로고침(↻)** 버튼으로 재적용

## 사용법

| 기능 | 동작 |
| --- | --- |
| **파일 추출** | 팝업 → 파일추출 탭 → `추출` : script[src] + RequireJS 모듈 + CSS(link/@import) 수집 후 마크다운 복사 |
| **접근경로 녹화** | 팝업 → 녹화 탭 → 시작 : 클릭/입력/URL 이동을 셀렉터·라벨·스크린샷·요소 좌표맵으로 기록 |
| **F3 사용자 전환** | 페이지에서 `F3` : 사용자 목록·즐겨찾기 모달(드래그 이동 가능) → API 로그인 전환 |

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
.task/                     작업 계획 파일
CLAUDE.md                  프로젝트 컨텍스트 (AI/개발자 공용)
```

> 진입점 경로(`manifest.json`, `popup.js` 의 `executeScript files`)는 **확장 루트 기준**이다.
> 소스를 옮기면 두 곳을 함께 갱신할 것. 자세한 설계는 [`docs/architecture.md`](docs/architecture.md) 참고.

## 기술 스택

Chrome Extension Manifest V3 · Vanilla JS(의존성 없음) · Shadow DOM(주입 UI 격리) ·
`chrome.storage.local` · `chrome.scripting.executeScript`(`world: 'MAIN'`)

## 개발 메모

기능 현황·미구현 계획·코딩 컨벤션은 [`CLAUDE.md`](CLAUDE.md), 진행 중 작업은 [`.task/`](.task/) 참고.
