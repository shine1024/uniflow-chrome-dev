// ============================================================
// UniFLOW DevTool - Background (Service Worker)
// ------------------------------------------------------------
// 확장 아이콘 클릭을 F4 와 동일하게 처리한다 — 활성 탭의 사이드바를 토글.
// (action 에서 default_popup 을 제거했으므로 클릭이 onClicked 로 들어온다.)
// 콘텐츠 스크립트가 아직 없는 탭(확장 리로드 전부터 열려 있던 탭 등)은
// sidebar.js 를 주입한 뒤 다시 토글을 요청한다. 주입 불가 페이지(chrome:// 등)는 무시.
// ============================================================
chrome.action.onClicked.addListener(async (tab) => {
	if (!tab || !tab.id) return;
	try {
		await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
	} catch (e) {
		try {
			await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/content/sidebar.js'] });
			await chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar' });
		} catch (e2) {
			// chrome://, 웹스토어 등 주입 불가 페이지 — 무시
		}
	}
});
