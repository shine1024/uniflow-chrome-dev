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

### 2026-06-15 — 문서 역할 정리 + 작업 기록 체계(.task) 구성
- CLAUDE.md에서 "미구현/향후 계획" 제거 → `.task/BACKLOG.md` 로 이관, CLAUDE.md는 Claude 작업용 컨텍스트로 한정
- CLAUDE.md에 "작업 기록(필수)" 규칙 추가 — 작업 전 WORKLOG/BACKLOG 확인, 작업 후 WORKLOG 갱신
- `.task/WORKLOG.md`·`.task/BACKLOG.md` 신설, `.task/README.md` 갱신
- README.md를 도구 사용 가이드로 정리 (스크린샷·요소좌표맵 등 미구현 표현 제거)
- 커밋: (이번 작업)

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
