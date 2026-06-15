# 아키텍처 노트

UniFLOW DevTool 의 내부 구조·데이터 흐름 메모. 기능 현황은 [`../CLAUDE.md`](../CLAUDE.md) 참고.

## 컴포넌트 책임

| 컴포넌트 | 실행 컨텍스트 | 책임 |
| --- | --- | --- |
| `src/content/content.js` | Content Script (페이지) | 녹화 바(Shadow DOM), 클릭/input/URL 이벤트 캡처 |
| `src/content/userSwitch.js` | Content Script (페이지) | F3 사용자 전환 모달(Shadow DOM, 드래그 이동), 로그인 전환 API |
| `src/popup/popup.{html,js}` | Popup | 파일 추출, 녹화 제어, 마크다운 변환/복사, 도메인별 토큰 관리 |

> 현재 백그라운드 Service Worker 는 없다. 모든 동작이 popup 과 content script 컨텍스트에서 끝난다.

## 데이터 흐름

```
[Popup] --(executeScript world:'MAIN', func)--> [페이지]                  파일/뷰 정보 추출
[Popup] --(executeScript files:['src/content/content.js'])--> [페이지]    녹화용 content 주입(없을 때)
[Popup] <--(chrome.storage.local: recording, steps)--> [content.js]       녹화 상태/단계 공유
```

- popup ↔ content 통신: `chrome.storage.local` + `chrome.runtime.onMessage`
- 페이지 컨텍스트(RequireJS 등) 접근: `executeScript({ world: 'MAIN' })`
- 페이지에 주입하는 UI(녹화 바, F3 모달)는 **반드시 Shadow DOM** 으로 CSS 격리

## chrome.storage.local 키

| 키 | 형태 | 용도 |
| --- | --- | --- |
| `recording` | `boolean` | 녹화 진행 상태 |
| `steps` | `array` | 녹화된 단계(click/input/navigate) |
| `domainTokens` | `{ "<host>": { clientKey, label } }` | F3 전환용 도메인별 API 토큰 |
| `domainFavorites` | `{ "<host>": ["usId", ...] }` | F3 도메인별 즐겨찾기 |

## 보안 메모

- `clientKey` 토큰은 소스에 하드코딩하지 않고 `domainTokens` 에 도메인 단위로 저장.
- 설정 탭 목록에서는 토큰을 마스킹 표시(`maskToken`).
- password 입력 필드는 녹화 시 마스킹.

## 진입점 경로 규칙

manifest 의 `content_scripts.js`/`default_popup` 와 `popup.js` 의
`executeScript({ files: [...] })` 는 모두 **확장 루트 기준 경로**다. 소스 이동 시 함께 갱신.
