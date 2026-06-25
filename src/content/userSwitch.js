// ============================================================
// UniFLOW DevTool - 사용자 전환 (F3)
// ------------------------------------------------------------
// F3 키로 사용자 전환 모달(Shadow DOM)을 토글한다.
// 사용자 로그인 전환 API는 clientKey 토큰을 사용하는데,
// 이 토큰은 하드코딩하지 않고 chrome.storage.local 에
// "도메인 단위"로 등록된 값을 조회해 사용한다.
//   domainTokens   = { "<hostname>": { clientKey, label } }
//   domainFavorites = { "<hostname>": ["usId", ...] }
// 토큰 등록/관리 UI 는 확장 팝업 → 설정 탭에서 제공한다.
// ============================================================
(() => {
  const TOKENS_KEY = 'domainTokens';        // 도메인별 API 토큰
  const FAVORITES_KEY = 'domainFavorites';  // 도메인별 즐겨찾기
  const MODAL_ID = 'uniflow-user-switch-modal';

  let shadowRoot = null;
  let allUsers = [];
  let favList = [];
  let currentToken = null; // { clientKey, label } | null

  // ---- storage 헬퍼 (도메인 단위) ----
  async function getDomainToken() {
    const data = await chrome.storage.local.get([TOKENS_KEY]);
    const map = data[TOKENS_KEY] || {};
    return map[location.hostname] || null;
  }

  async function getFavorites() {
    const data = await chrome.storage.local.get([FAVORITES_KEY]);
    const map = data[FAVORITES_KEY] || {};
    return map[location.hostname] || [];
  }

  async function saveFavorites(list) {
    const data = await chrome.storage.local.get([FAVORITES_KEY]);
    const map = data[FAVORITES_KEY] || {};
    map[location.hostname] = list;
    await chrome.storage.local.set({ [FAVORITES_KEY]: map });
  }

  // ---- API: 사용자 목록 조회 (세션 쿠키 사용, 토큰 불필요) ----
  async function getCompanyUserList() {
    const res = await fetch('/unicloud/admin/usermanage/getCompanyUserList', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sUsName: '', usSts: 'Y', sUseType: 'ALL',
        fRegDateStart: '', fRegDateEnd: '', sUserStatus: '10', onlyUsUseYn: 'Y'
      })
    });
    if (!res.ok) throw new Error('목록 조회 실패: ' + res.status + ' ' + res.statusText);
    return res.json();
  }

  // ---- API: 사용자 로그인 전환 (clientKey 토큰 사용) ----
  // 1) clientKey → secretKey 발급  2) secretKey → userToken 발급  3) SSO 로그인
  async function changeLoginUserByApi(usId, clientKey) {
    const secRes = await fetch('/auth/getSecretKey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', clientKey }
    });
    if (!secRes.ok) throw new Error('SecretKey 발급 실패: ' + secRes.statusText);
    const secData = await secRes.json();
    const secretKey = secData.response.secretKey;

    const tokRes = await fetch('/auth/getInterfaceUserToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', secretKey },
      body: JSON.stringify({ usAuthVal: usId })
    });
    if (!tokRes.ok) throw new Error('UserToken 발급 실패: ' + tokRes.statusText);
    const tokData = await tokRes.json();
    const token = tokData.response.token;

    window.location = `/unicloud/api/call-service-sloLogin?token=${token}`;
  }

  // ---- 모달 템플릿 (Shadow DOM 격리) ----
  const TEMPLATE = `
    <style>
      :host { all: initial; }
      .overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex; align-items: center; justify-content: center;
        z-index: 2147483647;
        font-family: -apple-system, 'Malgun Gothic', sans-serif;
      }
      .modal {
        background: #fff; width: 1000px; max-width: 94vw;
        height: 480px; max-height: 88vh;
        padding: 22px 26px; border-radius: 12px;
        display: flex; flex-direction: column; box-sizing: border-box;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      }
      .modal-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 12px;
        cursor: move; user-select: none;
      }
      .modal-header h3 { margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a; }
      .domain {
        font-size: 12px; font-weight: 500; color: #024ad8;
        background: #eff6ff; padding: 2px 8px; border-radius: 8px; margin-left: 8px;
      }
      .close-btn {
        background: #fff; color: #636363; border: 1px solid #e8e8e8;
        width: 28px; height: 28px; border-radius: 4px; font-size: 14px;
        cursor: pointer; line-height: 1;
      }
      .close-btn:hover { background: #f7f7f7; color: #1a1a1a; }
      .msg {
        display: none; font-size: 12px; line-height: 1.5;
        padding: 8px 12px; border-radius: 6px; margin-bottom: 10px;
      }
      .msg.show { display: block; }
      .msg.warn  { background: #fef9c3; color: #854d0e; }
      .msg.error { background: #fff0f0; color: #b3262b; }
      .msg.info  { background: #eff6ff; color: #0e3191; }
      .tables { display: flex; gap: 18px; flex: 1; overflow: hidden; }
      .col { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
      .col h4 { margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #1a1a1a; }
      .search {
        width: 100%; padding: 6px 10px; margin-bottom: 8px; box-sizing: border-box;
        border: 1px solid #c2c2c2; border-radius: 4px; font-size: 12px;
      }
      .scroll { overflow-y: auto; flex: 1; border: 1px solid #e8e8e8; border-radius: 8px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td {
        border-bottom: 1px solid #e8e8e8; padding: 8px 8px; font-size: 12px;
        text-align: left; color: #3d3d3d; word-break: break-all;
      }
      th {
        background: #f7f7f7; position: sticky; top: 0;
        font-weight: 600; font-size: 11px; color: #636363;
      }
      th:first-child, td:first-child { width: 28px; text-align: center; color: #c2c2c2; }
      td.ac, th.ac { text-align: center; width: 48px; }
      tbody tr:hover { background: #f0f4fd; }
      a { color: #024ad8; cursor: pointer; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .fav-toggle { font-size: 15px; color: #f59e0b; text-decoration: none; }
      .remove-fav { color: #b3262b; font-size: 11px; }
      .scroll::-webkit-scrollbar { width: 8px; }
      .scroll::-webkit-scrollbar-thumb { background: #c2c2c2; border-radius: 4px; }
      .empty-row td { text-align: center; color: #636363; padding: 24px; }
    </style>
    <div class="overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>사용자 전환 <span class="domain"></span></h3>
          <button class="close-btn" title="닫기 (Esc)">✕</button>
        </div>
        <div class="msg"></div>
        <div class="tables">
          <div class="col">
            <h4>⭐ 즐겨찾기</h4>
            <div class="scroll">
              <table>
                <thead><tr><th>#</th><th>아이디</th><th>이름</th><th>부서</th><th class="ac"></th></tr></thead>
                <tbody class="fav-body"></tbody>
              </table>
            </div>
          </div>
          <div class="col">
            <h4>📋 전체 사용자</h4>
            <input class="search" placeholder="아이디 / 이름 / 부서 검색">
            <div class="scroll">
              <table>
                <thead><tr><th>#</th><th>아이디</th><th>이름</th><th>부서</th><th class="ac">즐겨찾기</th></tr></thead>
                <tbody class="user-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showMsg(text, kind) {
    if (!shadowRoot) return;
    const el = shadowRoot.querySelector('.msg');
    el.textContent = text;
    el.className = 'msg show ' + (kind || '');
  }

  // ---- 테이블 렌더링 ----
  function renderTables() {
    if (!shadowRoot) return;
    const q = shadowRoot.querySelector('.search').value.trim().toLowerCase();
    const userBody = shadowRoot.querySelector('.user-body');
    const favBody = shadowRoot.querySelector('.fav-body');

    const filtered = allUsers.filter(u => {
      if (!q) return true;
      return [u.usId, u.usName, u.usDeptName].some(v => (v || '').toLowerCase().includes(q));
    });

    if (filtered.length) {
      userBody.innerHTML = filtered.map((u, idx) => {
        const isFav = favList.includes(u.usId);
        return `<tr>
          <td>${idx + 1}</td>
          <td><a class="user-id" data-id="${escapeHtml(u.usId)}">${escapeHtml(u.usId)}</a></td>
          <td>${escapeHtml(u.usName)}</td>
          <td>${escapeHtml(u.usDeptName)}</td>
          <td class="ac"><a class="fav-toggle" data-id="${escapeHtml(u.usId)}">${isFav ? '★' : '☆'}</a></td>
        </tr>`;
      }).join('');
    } else {
      userBody.innerHTML = '<tr class="empty-row"><td colspan="5">사용자가 없습니다.</td></tr>';
    }

    const favUsers = allUsers.filter(u => favList.includes(u.usId));
    if (favUsers.length) {
      favBody.innerHTML = favUsers.map((u, idx) => `<tr>
          <td>${idx + 1}</td>
          <td><a class="change-login" data-id="${escapeHtml(u.usId)}">${escapeHtml(u.usId)}</a></td>
          <td>${escapeHtml(u.usName)}</td>
          <td>${escapeHtml(u.usDeptName)}</td>
          <td class="ac"><a class="remove-fav" data-id="${escapeHtml(u.usId)}">[해제]</a></td>
        </tr>`).join('');
    } else {
      favBody.innerHTML = '<tr class="empty-row"><td colspan="5">★ 표시로 즐겨찾기를 추가하세요.</td></tr>';
    }

    // 전체 목록: 아이디 클릭 → 로그인 전환
    userBody.querySelectorAll('.user-id').forEach(a => {
      a.onclick = () => doLogin(a.dataset.id);
    });
    // 전체 목록: 즐겨찾기 토글
    userBody.querySelectorAll('.fav-toggle').forEach(a => {
      a.onclick = async () => {
        const id = a.dataset.id;
        favList = favList.includes(id) ? favList.filter(f => f !== id) : [...favList, id];
        await saveFavorites(favList);
        renderTables();
      };
    });
    // 즐겨찾기 목록: 아이디 클릭 → 로그인 전환
    favBody.querySelectorAll('.change-login').forEach(a => {
      a.onclick = () => doLogin(a.dataset.id);
    });
    // 즐겨찾기 해제
    favBody.querySelectorAll('.remove-fav').forEach(a => {
      a.onclick = async () => {
        favList = favList.filter(f => f !== a.dataset.id);
        await saveFavorites(favList);
        renderTables();
      };
    });
  }

  // ---- 로그인 전환 실행 ----
  async function doLogin(usId) {
    if (!currentToken || !currentToken.clientKey) {
      showMsg(`API 토큰이 없어 전환할 수 없습니다. 확장 팝업 → 설정 탭에서 "${location.hostname}" 도메인의 토큰을 먼저 등록하세요.`, 'error');
      return;
    }
    showMsg(`'${usId}' 사용자로 전환 중...`, 'info');
    try {
      await changeLoginUserByApi(usId, currentToken.clientKey);
    } catch (err) {
      showMsg('전환 실패: ' + err.message, 'error');
    }
  }

  // ---- 모달 드래그 이동 ----
  // handle(헤더) 를 잡고 드래그하면 target(모달) 이 따라 움직인다.
  // overlay 의 flex 중앙정렬을 기준점으로 두고 transform 으로 누적 이동.
  function makeDraggable(handle, target) {
    let offsetX = 0, offsetY = 0; // 중앙 기준 누적 이동량

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.close-btn')) return; // 닫기 버튼 클릭은 드래그 제외
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

  // ---- 모달 열기 ----
  async function showModal() {
    if (document.getElementById(MODAL_ID)) return;

    const host = document.createElement('div');
    host.id = MODAL_ID;
    shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = TEMPLATE;
    document.documentElement.appendChild(host);

    shadowRoot.querySelector('.domain').textContent = location.hostname;
    shadowRoot.querySelector('.close-btn').onclick = closeModal;

    // 헤더를 잡고 드래그하면 모달 이동
    makeDraggable(shadowRoot.querySelector('.modal-header'), shadowRoot.querySelector('.modal'));

    const overlay = shadowRoot.querySelector('.overlay');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    shadowRoot.querySelector('.search').addEventListener('input', renderTables);

    // 도메인별 토큰 조회
    currentToken = await getDomainToken();
    if (!currentToken) {
      showMsg(`이 도메인(${location.hostname})에 등록된 API 토큰이 없습니다. 목록 조회는 가능하지만, 사용자 전환은 확장 팝업 → 설정 탭에서 토큰을 등록해야 동작합니다.`, 'warn');
    } else if (currentToken.label) {
      showMsg(`적용 토큰: ${currentToken.label}`, 'info');
    }

    favList = await getFavorites();

    try {
      const data = await getCompanyUserList();
      allUsers = (data && data.response) ? data.response : [];
      renderTables();
    } catch (err) {
      allUsers = [];
      renderTables();
      showMsg('사용자 목록 조회 실패: ' + err.message, 'error');
    }
  }

  function closeModal() {
    const host = document.getElementById(MODAL_ID);
    if (host) host.remove();
    shadowRoot = null;
    allUsers = [];
  }

  // ---- F3 토글 / Esc 닫기 ----
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F3') {
      e.preventDefault();
      document.getElementById(MODAL_ID) ? closeModal() : showModal();
    } else if (e.key === 'Escape' && document.getElementById(MODAL_ID)) {
      closeModal();
    }
  });
})();
