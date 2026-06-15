# 백로그 (BACKLOG)

아직 구현하지 않은 기능 / 향후 계획. 새 과제가 생기면 여기에 추가한다.
착수하면 필요 시 `.task/NNN-제목.md` 로 상세 계획을 만든다.
**완료된 항목은 이 목록에서 제거하고 `WORKLOG.md` 에 기록한다** (할 일 → 한 일로 이동).

## 기능
- **JSP 파일 표식**: 서버 쪽에서 meta 태그/data 속성으로 JSP 경로를 주입 (dev 프로필에서만 활성화)
  - 방안 A: `<meta name="jsp-source" content="<%=request.getServletPath()%>">` (공통 레이아웃에 1줄)
  - 방안 B: `<div data-jsp-source="...">` (include 단위로 세밀한 표시, 복잡한 화면에 유리)
- **data-main 속성**: 메인 JS 특정을 위한 `<script data-main="true">` 마킹 (서버 쪽)
- **녹화 데이터 → 자연어 변환**: Claude API 후처리로 셀렉터+텍스트를 자연어 문장으로
- **스크린샷 캡처**: 녹화 시점 화면 자동 캡처(captureVisibleTab) — 별도 Service Worker 필요(현재 백그라운드 없음). popup.js 에 screenshot step 렌더 코드만 잔존
- **요소 좌표맵**: 캡처 시점 interactive 요소 rect 수집(step type "elements_map") — 스크린샷과 함께 구현

## 개선
- **COMMON_PATTERNS 커스터마이징**: UniFLOW 디렉터리 구조에 맞게 공통/라이브러리 필터 패턴 조정
