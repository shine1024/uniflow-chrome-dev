// ============================================================
// UniFLOW DevTool - 사이드바 (F4)
// ------------------------------------------------------------
// F4 키로 페이지 우측 사이드바(Shadow DOM)를 토글한다.
// 사이드바 내부는 확장 팝업(popup.html)을 iframe 으로 그대로 싣는다 —
// iframe 은 확장 오리진 문서라 chrome.tabs/scripting/storage 를 그대로 쓸 수 있어
// popup.js 로직을 재사용한다(별도 포팅·백그라운드 불필요).
// popup.html 은 ?sidebar=1 로 열어 팝업 자신이 풀하이트 레이아웃으로 전환하고,
// 사이드바에 포커스가 있을 때 눌린 F4/Esc 는 postMessage 로 이쪽에 닫기를 요청한다.
// ============================================================
(() => {
	if (window.__uniflowSidebarInit) return; // manifest 자동주입 + background 폴백주입 중복 방지
	window.__uniflowSidebarInit = true;

	const HOST_ID = 'uniflow-sidebar-host';
	const PANEL_WIDTH = 620; // popup 설계 폭과 동일

	function isOpen() {
		return !!document.getElementById(HOST_ID);
	}

	function openSidebar() {
		if (isOpen()) return;
		const host = document.createElement('div');
		host.id = HOST_ID;
		host.style.cssText = 'position:fixed;top:0;right:0;width:' + PANEL_WIDTH + 'px;height:100vh;z-index:2147483647;';
		const shadow = host.attachShadow({ mode: 'open' });
		const wrap = document.createElement('div');
		wrap.style.cssText = 'width:100%;height:100%;background:#fff;box-shadow:-2px 0 12px rgba(0,0,0,0.18);border-left:1px solid #e8e8e8;';
		const frame = document.createElement('iframe');
		frame.src = chrome.runtime.getURL('src/popup/popup.html') + '?sidebar=1';
		frame.style.cssText = 'width:100%;height:100%;border:0;display:block;';
		wrap.appendChild(frame);
		shadow.appendChild(wrap);
		document.documentElement.appendChild(host);
	}

	function closeSidebar() {
		const host = document.getElementById(HOST_ID);
		if (host) host.remove();
	}

	function toggleSidebar() {
		isOpen() ? closeSidebar() : openSidebar();
	}

	// F4 토글 / Esc 닫기 (페이지 쪽에 포커스가 있을 때 눌린 경우)
	document.addEventListener('keydown', (e) => {
		if (e.key === 'F4') {
			e.preventDefault();
			toggleSidebar();
		} else if (e.key === 'Escape' && isOpen()) {
			closeSidebar();
		}
	});

	// 사이드바 iframe(popup.html?sidebar=1) 내부에서 온 닫기 요청
	window.addEventListener('message', (e) => {
		const d = e.data;
		if (d && d.source === 'uniflow-sidebar' && d.type === 'close') closeSidebar();
	}, false);

	// 확장 아이콘 클릭(background) → F4 와 동일하게 토글
	chrome.runtime.onMessage.addListener((msg) => {
		if (msg && msg.action === 'toggleSidebar') toggleSidebar();
	});
})();
