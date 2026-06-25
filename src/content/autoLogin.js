// ============================================================
// UniFLOW DevTool - 자동로그인 (F2)
// ------------------------------------------------------------
// F2 키로 도메인별 자동로그인 / 로그아웃을 토글한다.
// 사이트마다 아이디·비밀번호 입력칸과 로그인·로그아웃 버튼이 다르므로,
// 도메인별 설정(자격증명 + 요소 셀렉터)을 chrome.storage.local 에 저장해 사용한다.
//   domainAutoLogin = { "<host>": { username, password, idSel, pwSel, loginBtnSel, logoutBtnSel } }
// 등록은 페이지에 뜨는 "등록 패널"(Shadow DOM, 헤더 드래그로 이동)에서 진행한다.
// 패널이 페이지에 떠 있는 채로 "요소 선택"을 하므로(팝업처럼 닫히지 않음) 셀렉터를 바로 짚는다.
// 요소 선택 하이라이트 디자인과 셀렉터 생성(getSelector)은 content.js 의 것을 재사용·공유한다
// (manifest 에서 content.js 가 먼저 로드되어 같은 isolated world 전역에 존재).
// 패널 열기는 확장 팝업 → 설정 탭의 "등록 패널 열기" 버튼이 트리거한다.
// ============================================================
(() => {
  const AUTOLOGIN_KEY = 'domainAutoLogin';
  const PANEL_ID = 'uniflow-autologin-panel';
  const HIGHLIGHT_ID = 'uniflow-autologin-highlight';
  const TOAST_ID = 'uniflow-autologin-toast';

  const FIELD_LABELS = {
    idSel: '아이디 필드',
    pwSel: '비밀번호 필드',
    loginBtnSel: '로그인 버튼',
    logoutBtnSel: '로그아웃 버튼'
  };

  let panelHost = null;
  let panelShadow = null;
  let panelState = { idSel: '', pwSel: '', loginBtnSel: '', logoutBtnSel: '' };

  let highlightBox = null;
  let hoverHandler = null;
  let clickHandler = null;
  let pickCursorStyle = null;
  let pickHover = null;
  let pickingField = null;
  let toastTimer = null;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---- storage (도메인 단위) ----
  async function getConfig() {
    const data = await chrome.storage.local.get([AUTOLOGIN_KEY]);
    const map = data[AUTOLOGIN_KEY] || {};
    return map[location.hostname] || null;
  }

  async function saveConfig(entry) {
    const data = await chrome.storage.local.get([AUTOLOGIN_KEY]);
    const map = data[AUTOLOGIN_KEY] || {};
    map[location.hostname] = entry;
    await chrome.storage.local.set({ [AUTOLOGIN_KEY]: map });
  }

  // ---- 셀렉터 → 요소 ----
  function queryOne(selector) {
    if (!selector) return null;
    try { return document.querySelector(selector); } catch (e) { return null; }
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (parseFloat(style.opacity) === 0) return false;
    return true;
  }

  // ---- 입력 채우기 (input/change 이벤트 발생시켜 검증 로직 통과) ----
  function fillInput(el, value) {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---- F2: 자동로그인 / 로그아웃 토글 ----
  // 1차 신호는 로그인 폼(아이디·비번 입력칸)의 가시성.
  // 폼이 보이면 로그인 전으로 보고 자동로그인, 안 보이면 로그인된 상태로 보고 로그아웃 버튼을 클릭한다.
  // (로그아웃 버튼의 존재로 로그인 상태를 역추론하던 방식보다, 항상 등록되는 로그인 폼을 기준으로 판정)
  async function handleF2() {
    const cfg = await getConfig();
    if (!cfg) {
      showToast('이 도메인 자동로그인 설정이 없습니다. 확장 팝업 → 설정 탭에서 등록 패널을 여세요.', 'warn');
      return;
    }

    const idEl = queryOne(cfg.idSel);
    const pwEl = queryOne(cfg.pwSel);
    const loginBtn = queryOne(cfg.loginBtnSel);
    const logoutBtn = queryOne(cfg.logoutBtnSel);

    // 로그인 폼(아이디·비번 입력칸)이 보이면 → 로그인 전 → 자동로그인 실행
    if (isVisible(idEl) && isVisible(pwEl)) {
      if (!loginBtn) {
        showToast('로그인 버튼을 찾지 못했습니다. 등록 패널에서 요소 선택을 다시 확인하세요.', 'error');
        return;
      }
      fillInput(idEl, cfg.username || '');
      fillInput(pwEl, cfg.password || '');
      loginBtn.click();
      return;
    }

    // 로그인 폼이 안 보임 → 로그인된 상태로 간주 → 로그아웃 버튼이 보이면 클릭
    if (isVisible(logoutBtn)) {
      logoutBtn.click();
      return;
    }

    // 폼도 로그아웃 버튼도 못 찾음 → 상태 판단 불가 (셀렉터 점검 안내)
    if (cfg.logoutBtnSel) {
      showToast('로그인 폼·로그아웃 버튼 모두 찾지 못했습니다. 등록 패널에서 셀렉터를 확인하세요.', 'warn');
    } else {
      showToast('로그인 상태로 보이지만 로그아웃 버튼이 등록되지 않았습니다. 등록 패널에서 추가하세요.', 'warn');
    }
  }

  // ---- 등록 패널 (Shadow DOM, 드래그 이동) ----
  const PANEL_TEMPLATE = `
    <style>
      :host { all: initial; }
      .panel {
        position: fixed; top: 80px; right: 24px; width: 384px;
        background: #fff; border: 1px solid #e8e8e8; border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.22);
        font-family: -apple-system, 'Malgun Gothic', sans-serif; color: #1a1a1a;
        z-index: 2147483647;
      }
      .hd {
        display: flex; align-items: center; justify-content: space-between;
        padding: 11px 14px; border-bottom: 1px solid #e8e8e8;
        cursor: move; user-select: none;
      }
      .hd h3 { margin: 0; font-size: 14px; font-weight: 600; }
      .hd .host {
        font-size: 11px; font-weight: 500; color: #024ad8;
        background: #eff6ff; padding: 1px 7px; border-radius: 7px; margin-left: 6px;
      }
      .x {
        background: none; border: none; font-size: 15px; line-height: 1;
        cursor: pointer; color: #636363; padding: 2px 4px;
      }
      .x:hover { color: #1a1a1a; }
      .bd { padding: 12px 14px; }
      .warn { font-size: 11px; color: #b45309; margin-bottom: 10px; line-height: 1.5; }
      .row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
      .row label { flex: 0 0 92px; font-size: 13px; color: #636363; white-space: nowrap; }
      .row label small { color: #c2c2c2; }
      .row input {
        flex: 1; min-width: 0; padding: 5px 8px;
        border: 1px solid #c2c2c2; border-radius: 4px; font-size: 13px;
      }
      .row .pick {
        flex: 0 0 auto; padding: 5px 9px; font-size: 12px; cursor: pointer;
        border: 1px solid #c2c2c2; background: #f7f7f7; border-radius: 4px; color: #1a1a1a;
      }
      .row .pick:hover { background: #f0f0f0; }
      .sel { font-size: 11px; color: #636363; margin: 0 0 9px 98px; word-break: break-all; }
      .sel b { color: #024ad8; font-weight: 600; }
      .status { font-size: 11px; min-height: 14px; margin: 2px 0 8px; color: #636363; }
      .ft { display: flex; gap: 6px; }
      .ft button {
        flex: 1; padding: 7px; border-radius: 4px; font-size: 13px; font-weight: 600;
        cursor: pointer; border: 1px solid transparent;
      }
      .save { background: #024ad8; color: #fff; }
      .save:hover { background: #0e3191; }
      .cancel { background: #fff; color: #3d3d3d; border-color: #c2c2c2; }
      .cancel:hover { background: #f7f7f7; }
    </style>
    <div class="panel">
      <div class="hd">
        <h3>자동로그인 등록 <span class="host"></span></h3>
        <button class="x" title="닫기 (Esc)">✕</button>
      </div>
      <div class="bd">
        <div class="warn">⚠ 비밀번호는 평문으로 브라우저에 저장됩니다 (개발 편의용).</div>

        <div class="row">
          <label>아이디</label>
          <input class="in-user" type="text" placeholder="아이디 입력값">
          <button class="pick" data-field="idSel">요소 선택</button>
        </div>
        <div class="sel" data-sel="idSel">선택된 요소: 미설정</div>

        <div class="row">
          <label>비밀번호</label>
          <input class="in-pw" type="password" placeholder="비밀번호 입력값">
          <button class="pick" data-field="pwSel">요소 선택</button>
        </div>
        <div class="sel" data-sel="pwSel">선택된 요소: 미설정</div>

        <div class="row">
          <label>로그인 버튼</label>
          <span style="flex:1"></span>
          <button class="pick" data-field="loginBtnSel">요소 선택</button>
        </div>
        <div class="sel" data-sel="loginBtnSel">선택된 요소: 미설정</div>

        <div class="row">
          <label>로그아웃 <small>(선택)</small></label>
          <span style="flex:1"></span>
          <button class="pick" data-field="logoutBtnSel">요소 선택</button>
        </div>
        <div class="sel" data-sel="logoutBtnSel">선택된 요소: 미설정</div>

        <div class="status"></div>
        <div class="ft">
          <button class="save">저장</button>
          <button class="cancel">닫기</button>
        </div>
      </div>
    </div>
  `;

  async function openPanel() {
    if (panelHost) return;
    const cfg = (await getConfig()) || {};
    panelState = {
      idSel: cfg.idSel || '',
      pwSel: cfg.pwSel || '',
      loginBtnSel: cfg.loginBtnSel || '',
      logoutBtnSel: cfg.logoutBtnSel || ''
    };

    panelHost = document.createElement('div');
    panelHost.id = PANEL_ID;
    panelShadow = panelHost.attachShadow({ mode: 'open' });
    panelShadow.innerHTML = PANEL_TEMPLATE;
    document.documentElement.appendChild(panelHost);

    panelShadow.querySelector('.host').textContent = location.hostname;
    panelShadow.querySelector('.in-user').value = cfg.username || '';
    panelShadow.querySelector('.in-pw').value = cfg.password || '';
    Object.keys(FIELD_LABELS).forEach(updatePanelSel);

    panelShadow.querySelector('.x').addEventListener('click', closePanel);
    panelShadow.querySelector('.cancel').addEventListener('click', closePanel);
    panelShadow.querySelector('.save').addEventListener('click', savePanel);
    panelShadow.querySelectorAll('.pick').forEach((b) => {
      b.addEventListener('click', (e) => { e.preventDefault(); startPick(b.dataset.field); });
    });

    makeDraggable(panelShadow.querySelector('.hd'), panelShadow.querySelector('.panel'));
  }

  function closePanel() {
    if (pickingField) stopPick();
    if (panelHost) { panelHost.remove(); panelHost = null; panelShadow = null; }
  }

  function updatePanelSel(field) {
    if (!panelShadow) return;
    const el = panelShadow.querySelector(`.sel[data-sel="${field}"]`);
    if (!el) return;
    const val = panelState[field];
    el.innerHTML = val ? '선택된 요소: <b>' + escapeHtml(val) + '</b>' : '선택된 요소: 미설정';
  }

  function setPanelStatus(text, kind) {
    if (!panelShadow) return;
    const el = panelShadow.querySelector('.status');
    el.textContent = text;
    el.style.color = kind === 'ok' ? '#024ad8'
      : kind === 'err' ? '#b3262b'
      : kind === 'pick' ? '#024ad8' : '#636363';
  }

  async function savePanel() {
    const username = panelShadow.querySelector('.in-user').value.trim();
    const password = panelShadow.querySelector('.in-pw').value;

    const missing = [];
    if (!username) missing.push('아이디');
    if (!password) missing.push('비밀번호');
    if (!panelState.idSel) missing.push('아이디 요소');
    if (!panelState.pwSel) missing.push('비밀번호 요소');
    if (!panelState.loginBtnSel) missing.push('로그인 버튼');
    if (missing.length) { setPanelStatus('필요: ' + missing.join(', '), 'err'); return; }

    await saveConfig({
      username,
      password,
      idSel: panelState.idSel,
      pwSel: panelState.pwSel,
      loginBtnSel: panelState.loginBtnSel,
      logoutBtnSel: panelState.logoutBtnSel || ''
    });
    setPanelStatus('✓ 저장됨 — 이제 F2 로 자동로그인됩니다.', 'ok');
  }

  // ---- 모달 드래그 이동 (userSwitch.js 패턴) ----
  function makeDraggable(handle, target) {
    let offsetX = 0, offsetY = 0;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.x')) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      const baseX = offsetX, baseY = offsetY;
      function onMove(ev) {
        offsetX = baseX + (ev.clientX - startX);
        offsetY = baseY + (ev.clientY - startY);
        target.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ---- 요소 선택 피커 (content.js 하이라이트 디자인 재사용) ----
  // 우리 UI(패널·하이라이트·토스트)는 제외하고 실제 페이지 요소만 반환
  function pageElementUnder(target) {
    if (!target || target.nodeType !== 1) return null;
    if (target.id === HIGHLIGHT_ID) return null;
    if (target.closest && (target.closest('#' + PANEL_ID) || target.closest('#' + TOAST_ID))) return null;
    return target;
  }

  function setPickCursor(on) {
    if (on && !pickCursorStyle) {
      pickCursorStyle = document.createElement('style');
      pickCursorStyle.textContent = '*, *:hover { cursor: crosshair !important; }';
      document.documentElement.appendChild(pickCursorStyle);
    } else if (!on && pickCursorStyle) {
      pickCursorStyle.remove();
      pickCursorStyle = null;
    }
  }

  function startPick(field) {
    if (pickingField) stopPick();
    pickingField = field;
    pickHover = null;

    highlightBox = document.createElement('div');
    highlightBox.id = HIGHLIGHT_ID;
    highlightBox.style.cssText =
      'position:fixed;z-index:2147483646;pointer-events:none;display:none;' +
      'background:rgba(2,74,216,0.16);border:2px solid #024ad8;border-radius:2px;' +
      'box-shadow:0 0 0 1px rgba(255,255,255,0.5);';
    document.documentElement.appendChild(highlightBox);

    hoverHandler = (e) => {
      const el = pageElementUnder(e.target);
      if (!el) { highlightBox.style.display = 'none'; pickHover = null; return; }
      pickHover = el;
      const r = el.getBoundingClientRect();
      highlightBox.style.display = 'block';
      highlightBox.style.left = r.left + 'px';
      highlightBox.style.top = r.top + 'px';
      highlightBox.style.width = r.width + 'px';
      highlightBox.style.height = r.height + 'px';
    };

    clickHandler = (e) => {
      const el = pickHover || pageElementUnder(e.target);
      if (!el) return; // 패널/하이라이트 위 클릭은 무시 (패널 버튼은 정상 동작)
      e.preventDefault();
      e.stopPropagation();
      const f = pickingField;
      const selector = getSelector(el); // content.js 의 전역 함수 (셀렉터 일관성 유지)
      stopPick();
      panelState[f] = selector;
      updatePanelSel(f);
      setPanelStatus((FIELD_LABELS[f] || f) + ' 선택됨: ' + selector, 'ok');
    };

    document.addEventListener('mousemove', hoverHandler, true);
    document.addEventListener('click', clickHandler, true);
    setPickCursor(true);
    setPanelStatus((FIELD_LABELS[field] || field) + ' — 페이지에서 클릭하세요 (Esc 취소)', 'pick');
  }

  function stopPick() {
    pickingField = null;
    pickHover = null;
    if (hoverHandler) { document.removeEventListener('mousemove', hoverHandler, true); hoverHandler = null; }
    if (clickHandler) { document.removeEventListener('click', clickHandler, true); clickHandler = null; }
    if (highlightBox) { highlightBox.remove(); highlightBox = null; }
    setPickCursor(false);
  }

  // ---- 토스트 (F2 안내용, Shadow DOM 격리) ----
  function showToast(text, kind) {
    let host = document.getElementById(TOAST_ID);
    let shadow;
    if (!host) {
      host = document.createElement('div');
      host.id = TOAST_ID;
      shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host { all: initial; }
          .toast {
            position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
            z-index: 2147483647; max-width: 80vw;
            padding: 10px 18px; border-radius: 10px;
            font-family: -apple-system, 'Malgun Gothic', sans-serif; font-size: 13px;
            color: #fff; box-shadow: 0 6px 24px rgba(0,0,0,0.28);
            background: #1a1a1a;
          }
          .toast.info  { background: #024ad8; }
          .toast.warn  { background: #b45309; }
          .toast.error { background: #b3262b; }
        </style>
        <div class="toast"></div>
      `;
      document.documentElement.appendChild(host);
    } else {
      shadow = host.shadowRoot;
    }
    const el = shadow.querySelector('.toast');
    el.textContent = text;
    el.className = 'toast ' + (kind || '');
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    toastTimer = setTimeout(removeToast, 2600);
  }

  function removeToast() {
    const host = document.getElementById(TOAST_ID);
    if (host) host.remove();
  }

  // ---- F2 토글 / Esc 취소·닫기 ----
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      if (pickingField) { stopPick(); setPanelStatus('선택 취소됨', ''); return; }
      handleF2();
    } else if (e.key === 'Escape') {
      if (pickingField) { stopPick(); setPanelStatus('선택 취소됨', ''); }
      else if (panelHost) closePanel();
    }
  });

  // ---- 메시지 수신 (popup → 등록 패널 열기) ----
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'openAutoLoginPanel') {
      openPanel();
      sendResponse({ ok: true });
    }
  });
})();
