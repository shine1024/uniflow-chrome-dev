# 녹화 → 편집 가능한 시나리오 → Playwright 내보내기

- 상태: 1차 완료 — 실제 Playwright 실행까지 성공 검증됨 (커밋 전)
- 관련 파일: `src/content/content.js`, `src/popup/*`, `src/editor/*`(신규)

## 목표
사용자 동작 녹화를 **편집 가능한 시각적 시나리오**로 보고, 수정/삭제/갭(gap) 조정 후
**Playwright 테스트 코드(.spec.ts)** 로 내보내 그대로 재현한다. → 재녹화 불필요.

## 결정 사항 (2026-06-15)
- **편집기 위치**: 별도 전체 페이지(새 탭) — `src/editor/editor.html`
- **플로우 표현**: 번호 타임라인 카드(편집형), 카드 사이에 gap 시간 표시·편집
- **1차 범위**: 편집 + gap + Export (현재 수집 데이터 기반). 녹화기 보강은 2차.

## 1차 (MVP) 작업
- [x] 편집기 페이지: 스텝을 번호 카드로 렌더, 삭제 / 재정렬(드래그) / 인라인 값·갭 편집 / 사용여부 토글
- [x] gap: `timestamp` 차이로 자동 산출 → 편집 가능 → `waitForTimeout`(적용 토글 + 임계값)
- [x] Playwright 코드 실시간 미리보기 + 복사 + `.spec.ts` 다운로드
- [x] 시나리오 저장(`chrome.storage.local.scenario`) / "녹화에서 다시 불러오기"
- [x] 팝업 녹화탭에 "시나리오 편집기 열기" 버튼
- [x] 검증(assert) 스텝: URL 일치 / 요소·텍스트 보임 / 텍스트 포함 → `expect` 코드 생성 (성공·실패 판정)
- [x] 녹화 중 검증 캡처: 녹화 바 "✓ 검증 추가" → 페이지 요소 클릭으로 selector·text 자동 캡처 (편집기 왕복 없이 녹화 흐름 유지)
- locator 우선순위: `data-testid` → `#id` → `getByRole(name)` → `getByText` → CSS 폴백

## 2차 (견고화) — BACKLOG
- 녹화기 보강: `role` / accessible name / `data-testid` / `name`·`placeholder` / **iframe 경로** 수집 (검증 캡처 시 유형 자동 판별 포함)
- 로그인 `storageState` 가이드

## 3차
- 다이어그램 뷰(Mermaid), 스텝별 스크린샷, 시나리오 JSON import/export
