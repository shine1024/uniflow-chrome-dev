// ============================================================
// UniFLOW DevTool - Content Script (접근경로 녹화)
// ============================================================

let recordingBar = null;
let clickHandler = null;
let inputHandler = null;
const pendingInputs = new Map(); // 디바운스 대기 중인 입력 (selector -> {timer, commit})
let assertMode = false;       // 검증 요소 선택 모드 활성
let assertStage = null;       // 'pick'(요소 선택) | 'type'(유형 선택)
let assertHover = null;       // 현재 하이라이트된 요소
let highlightBox = null;      // 인스펙터 하이라이트 오버레이
let hoverMoveHandler = null;  // 하이라이트용 mousemove 핸들러
let typeMenuHost = null;      // 검증 유형 선택 메뉴 (Shadow DOM)
let pickCursorStyle = null;   // 선택 모드 커서

// ---- 셀렉터 생성 ----
function getSelector(el) {
  if (!el || el === document.body || el === document.documentElement) return 'body';
  const elId = el.getAttribute('id');
  if (elId) return '#' + CSS.escape(elId);

  const parts = [];
  let current = el;
  while (current && current !== document.body && parts.length < 4) {
    let selector = current.tagName.toLowerCase();

    const curId = current.getAttribute('id');
    if (curId) {
      parts.unshift('#' + CSS.escape(curId));
      break;
    }

    // 의미 있는 클래스만 (동적/상태 클래스 제외)
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/)
        .filter(c => c && !c.startsWith('ng-') && !c.startsWith('is-') &&
                  !c.startsWith('ui-') && !c.startsWith('active') &&
                  !c.startsWith('hover') && !c.startsWith('focus') &&
                  c.length < 40)
        .slice(0, 2);
      if (classes.length) selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }

    // 같은 태그 형제 중 위치
    const parent = current.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter(c => c.tagName === current.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += ':nth-of-type(' + idx + ')';
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}

// ---- 텍스트 라벨 추출 ----
function getLabel(el) {
  if (!el) return '';
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim().substring(0, 60);

  const title = el.getAttribute('title');
  if (title) return title.trim().substring(0, 60);

  // 직접 텍스트 (자식 요소 제외하고 얕은 텍스트)
  let text = '';
  // 버튼, 링크, span 등은 전체 텍스트
  if (['BUTTON', 'A', 'SPAN', 'LABEL', 'TH', 'TD', 'LI', 'OPTION'].includes(el.tagName)) {
    text = el.textContent || '';
  } else {
    // 그 외는 직접 자식 텍스트노드만
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    }
  }
  text = text.trim().replace(/\s+/g, ' ').substring(0, 60);
  if (text) return text;

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder.trim().substring(0, 60);

  const value = el.value;
  if (value && typeof value === 'string') return value.trim().substring(0, 60);

  return '';
}

// ---- 클릭 대상 요소 찾기 (이벤트 target → 의미있는 상위 요소) ----
function findClickTarget(el) {
  // 이미 의미있는 요소면 그대로
  const meaningful = el.closest('a, button, [role="button"], [role="tab"], [role="menuitem"], input, select, textarea, [onclick], [data-action], [data-click]');
  if (meaningful) return meaningful;

  // 텍스트가 있는 가장 가까운 요소
  let current = el;
  while (current && current !== document.body) {
    const text = current.textContent?.trim();
    if (text && text.length < 80 && text.length > 0) return current;
    current = current.parentElement;
  }
  return el;
}

// ---- Step 저장 (직렬화 — 동시 호출 시 경쟁 방지) ----
let stepQueue = Promise.resolve();
function addStep(step) {
  stepQueue = stepQueue.then(async () => {
    const data = await chrome.storage.local.get(['steps']);
    const steps = data.steps || [];
    steps.push(step);
    await chrome.storage.local.set({ steps });
    updateCount(steps.length);
  });
  return stepQueue;
}

// 대기 중인 입력을 즉시 커밋 (클릭/이동 직전에 호출해 누락 방지)
function flushPendingInputs() {
  const list = [...pendingInputs.values()];
  pendingInputs.clear();
  list.forEach((p) => { clearTimeout(p.timer); p.commit(); });
}

// ---- 녹화 바 카운트 업데이트 ----
function updateCount(count) {
  if (!recordingBar) return;
  const countEl = recordingBar.shadow.querySelector('.count');
  if (countEl) countEl.textContent = count + ' 이벤트';
}

// ---- 녹화 바 생성 (Shadow DOM) ----
function createRecordingBar() {
  const host = document.createElement('div');
  host.id = 'uniflow-devtool-recording-bar';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .bar {
        position: fixed; top: 0; left: 50%; transform: translateX(-50%);
        z-index: 2147483647;
        background: linear-gradient(135deg, #dc2626, #b91c1c);
        color: white;
        padding: 10px 24px;
        border-radius: 0 0 14px 14px;
        display: flex; align-items: center; gap: 14px;
        font-family: -apple-system, 'Malgun Gothic', sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 20px rgba(220,38,38,0.4);
        user-select: none;
      }
      .dot {
        width: 10px; height: 10px;
        background: #fca5a5;
        border-radius: 50%;
        animation: blink 1s ease-in-out infinite;
      }
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
      .label { font-weight: 500; }
      .count {
        font-weight: 700;
        background: rgba(255,255,255,0.2);
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 12px;
      }
      .stop-btn {
        background: white; color: #dc2626;
        border: none; padding: 5px 16px;
        border-radius: 8px; font-size: 12px;
        font-weight: 700; cursor: pointer;
        transition: background 0.15s;
      }
      .stop-btn:hover { background: #fee2e2; }
      .assert-btn {
        background: rgba(255,255,255,0.18); color: #fff;
        border: 1px solid rgba(255,255,255,0.45); padding: 5px 14px;
        border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
        transition: background 0.15s;
      }
      .assert-btn:hover { background: rgba(255,255,255,0.32); }
      .assert-btn.active { background: #fff; color: #16a34a; border-color: #fff; }
    </style>
    <div class="bar">
      <div class="dot"></div>
      <span class="label">녹화 중</span>
      <span class="count">0 클릭</span>
      <button class="assert-btn">✓ 검증 추가</button>
      <button class="stop-btn">중지</button>
    </div>
  `;

  document.documentElement.appendChild(host);

  // 중지 버튼
  shadow.querySelector('.stop-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    stopRecording();
  });

  // 검증 추가 버튼 — 다음에 클릭한 페이지 요소를 검증(assert) 대상으로 캡처
  shadow.querySelector('.assert-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    setAssertMode(!assertMode);
  });

  return { host, shadow };
}

// ---- 검증(assert) 선택 모드 ----
// 켜면 개발자도구 인스펙터처럼 요소를 하이라이트하고, 클릭하면 검증 유형 메뉴를 띄운다.
function setAssertMode(on) {
  assertMode = on;
  if (on) startAssertPick(); else stopAssertPick();
  if (!recordingBar) return;
  const btn = recordingBar.shadow.querySelector('.assert-btn');
  const label = recordingBar.shadow.querySelector('.label');
  if (btn) { btn.classList.toggle('active', on); btn.textContent = on ? '취소' : '✓ 검증 추가'; }
  if (label) label.textContent = on ? '✓ 검증할 요소에 마우스를 올려 클릭하세요' : '녹화 중';
}

function startAssertPick() {
  assertStage = 'pick';
  highlightBox = document.createElement('div');
  highlightBox.id = 'uniflow-assert-highlight';
  highlightBox.style.cssText =
    'position:fixed;z-index:2147483646;pointer-events:none;display:none;' +
    'background:rgba(35,131,226,0.18);border:2px solid #2383e2;border-radius:2px;' +
    'box-shadow:0 0 0 1px rgba(255,255,255,0.5);';
  document.documentElement.appendChild(highlightBox);

  hoverMoveHandler = (e) => {
    const el = pageElementUnder(e.target);
    if (!el) { highlightBox.style.display = 'none'; assertHover = null; return; }
    assertHover = el;
    const r = el.getBoundingClientRect();
    highlightBox.style.display = 'block';
    highlightBox.style.left = r.left + 'px';
    highlightBox.style.top = r.top + 'px';
    highlightBox.style.width = r.width + 'px';
    highlightBox.style.height = r.height + 'px';
  };
  document.addEventListener('mousemove', hoverMoveHandler, true);
  setPickCursor(true);
}

function stopAssertPick() {
  assertStage = null;
  assertHover = null;
  if (hoverMoveHandler) { document.removeEventListener('mousemove', hoverMoveHandler, true); hoverMoveHandler = null; }
  if (highlightBox) { highlightBox.remove(); highlightBox = null; }
  removeTypeMenu();
  setPickCursor(false);
}

// 우리 UI(녹화 바·하이라이트·메뉴)는 제외하고 실제 페이지 요소만 반환
function pageElementUnder(target) {
  if (!target || target.nodeType !== 1) return null;
  if (target.id === 'uniflow-assert-highlight') return null;
  if (target.closest && (target.closest('#uniflow-devtool-recording-bar') || target.closest('#uniflow-assert-typemenu'))) return null;
  return target;
}

function setPickCursor(on) {
  if (on && !pickCursorStyle) {
    pickCursorStyle = document.createElement('style');
    pickCursorStyle.textContent = '*, *:hover { cursor: crosshair !important; }';
    document.documentElement.appendChild(pickCursorStyle);
  } else if (!on && pickCursorStyle) {
    pickCursorStyle.remove(); pickCursorStyle = null;
  }
}

// 클릭한 요소를 어떻게 검증할지 고르는 메뉴
const ASSERT_TYPES = [
  { v: 'visible', label: '요소 보임', desc: '이 요소가 화면에 있나' },
  { v: 'hasText', label: '텍스트 일치', desc: '텍스트가 정확히 같나' },
  { v: 'containsText', label: '텍스트 포함', desc: '텍스트를 포함하나' },
  { v: 'hasValue', label: '입력값 일치', desc: 'input 값이 같나', formOnly: true },
];

function showTypeMenu(x, y, el) {
  removeTypeMenu();
  const isForm = ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase());
  const items = ASSERT_TYPES.filter((t) => !t.formOnly || isForm);
  const host = document.createElement('div');
  host.id = 'uniflow-assert-typemenu';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .menu {
        position: fixed; z-index: 2147483647; min-width: 210px;
        background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25); padding: 6px;
        font-family: 'Segoe UI', 'Malgun Gothic', sans-serif;
      }
      .head { font-size: 11px; color: #9ca3af; padding: 5px 9px 7px; }
      button {
        display: block; width: 100%; text-align: left; border: none; background: none;
        padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; color: #1a1a2e;
      }
      button:hover { background: #eff6ff; }
      button small { display: block; color: #9ca3af; font-size: 11px; margin-top: 1px; }
      .cancel { color: #dc2626; border-top: 1px solid #f3f4f6; margin-top: 4px; }
    </style>
    <div class="menu">
      <div class="head">이 요소를 어떻게 검증할까요?</div>
      ${items.map((t) => `<button data-v="${t.v}">${t.label}<small>${t.desc}</small></button>`).join('')}
      <button class="cancel" data-v="__cancel">취소</button>
    </div>
  `;
  document.documentElement.appendChild(host);
  const menu = shadow.querySelector('.menu');
  const rows = items.length + 2;
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - 230)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rows * 42)) + 'px';
  shadow.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const v = b.dataset.v;
      if (v === '__cancel') { setAssertMode(false); return; }
      captureAssert(v, el);
    });
  });
  typeMenuHost = host;
}

function removeTypeMenu() {
  if (typeMenuHost) { typeMenuHost.remove(); typeMenuHost = null; }
}

async function captureAssert(assertType, el) {
  const selector = getSelector(el);
  const text = getLabel(el);
  let expected = '';
  if (assertType === 'hasText' || assertType === 'containsText') expected = text;
  else if (assertType === 'hasValue') expected = (el.value != null ? String(el.value) : '');
  await addStep({
    type: 'assert', assertType, timestamp: Date.now(),
    selector, text, expected, url: location.href
  });
  setAssertMode(false);
}

// ---- 녹화 시작 ----
async function startRecording() {
  if (recordingBar) return; // 이미 녹화 중

  recordingBar = createRecordingBar();

  // 기존 step 수 가져와서 카운트 표시
  const data = await chrome.storage.local.get(['steps']);
  updateCount((data.steps || []).length);

  // 클릭 핸들러
  clickHandler = async (e) => {
    const barHost = document.getElementById('uniflow-devtool-recording-bar');
    if (barHost && barHost.contains(e.target)) return;
    if (typeMenuHost && typeMenuHost.contains(e.target)) return; // 유형 메뉴 클릭은 메뉴가 처리

    // 검증 선택 모드: 요소 클릭 → 유형 선택 메뉴 / 메뉴 밖 클릭 → 취소 (페이지 동작은 막음)
    if (assertMode) {
      e.preventDefault();
      e.stopPropagation();
      if (assertStage === 'pick') {
        const el = assertHover || pageElementUnder(e.target);
        if (el) {
          assertStage = 'type';
          if (highlightBox) highlightBox.style.display = 'none';
          if (hoverMoveHandler) { document.removeEventListener('mousemove', hoverMoveHandler, true); hoverMoveHandler = null; }
          setPickCursor(false);
          showTypeMenu(e.clientX, e.clientY, el);
        }
      } else if (assertStage === 'type') {
        setAssertMode(false); // 메뉴 밖 클릭 → 취소
      }
      return;
    }

    // 클릭 직전, 대기 중인 입력을 먼저 커밋 (예: 비밀번호 입력 후 바로 로그인 클릭 → 이동)
    flushPendingInputs();

    const target = findClickTarget(e.target);
    const step = {
      type: 'click',
      timestamp: Date.now(),
      selector: getSelector(target),
      text: getLabel(target),
      tag: target.tagName.toLowerCase(),
      url: location.href
    };

    await addStep(step);
  };

  // input/change 핸들러 — input은 500ms 디바운스, change(blur)는 즉시 커밋
  inputHandler = (e) => {
    const barHost = document.getElementById('uniflow-devtool-recording-bar');
    if (barHost && barHost.contains(e.target)) return;

    const el = e.target;
    const tag = el.tagName.toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tag)) return;

    const key = getSelector(el);
    const prev = pendingInputs.get(key);
    if (prev) clearTimeout(prev.timer);

    const commit = () => {
      pendingInputs.delete(key);
      const inputType = el.getAttribute('type') || tag;
      // 테스트 목적: 비밀번호도 실제 입력값 그대로 기록(시나리오 재현 시 로그인되도록).
      // 주의 — 평문이 chrome.storage·생성 코드에 저장된다.
      const value = (el.value || '').substring(0, 100);
      addStep({
        type: 'input',
        timestamp: Date.now(),
        selector: key,
        tag,
        inputType,
        value: value,
        label: getLabel(el),
        url: location.href
      });
    };

    if (e.type === 'change') {
      commit(); // blur 시 즉시 (예: 비밀번호 입력 후 로그인 버튼 클릭)
    } else {
      pendingInputs.set(key, { timer: setTimeout(commit, 500), commit });
    }
  };

  document.addEventListener('click', clickHandler, true);
  document.addEventListener('input', inputHandler, true);
  document.addEventListener('change', inputHandler, true);

  // URL 변경 감지 (SPA 대응)
  setupUrlWatcher();
}

// ---- URL 변경 감지 ----
let lastUrl = location.href;

function setupUrlWatcher() {
  // pushState / replaceState 오버라이드
  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function () {
    origPush.apply(this, arguments);
    checkUrlChange();
  };
  history.replaceState = function () {
    origReplace.apply(this, arguments);
    checkUrlChange();
  };

  window.addEventListener('popstate', checkUrlChange);
  window.addEventListener('hashchange', checkUrlChange);
}

async function checkUrlChange() {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    await addStep({
      type: 'navigate',
      timestamp: Date.now(),
      fromUrl: lastUrl,
      toUrl: currentUrl,
      url: currentUrl
    });
    lastUrl = currentUrl;
  }
}

// ---- 녹화 중지 ----
async function stopRecording() {
  await chrome.storage.local.set({ recording: false });
  assertMode = false; stopAssertPick();

  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true);
    clickHandler = null;
  }
  if (inputHandler) {
    document.removeEventListener('input', inputHandler, true);
    document.removeEventListener('change', inputHandler, true);
    inputHandler = null;
  }
  flushPendingInputs();

  if (recordingBar) {
    recordingBar.host.remove();
    recordingBar = null;
  }
}

// ---- 녹화 바 제거만 (페이지 이동 시 cleanup) ----
function removeBar() {
  assertMode = false; stopAssertPick();
  if (recordingBar) {
    recordingBar.host.remove();
    recordingBar = null;
  }
  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true);
    clickHandler = null;
  }
  if (inputHandler) {
    document.removeEventListener('input', inputHandler, true);
    document.removeEventListener('change', inputHandler, true);
    inputHandler = null;
  }
  flushPendingInputs();
}

// ---- 초기화: 페이지 로드 시 녹화 상태 확인 ----
async function init() {
  const data = await chrome.storage.local.get(['recording']);
  if (data.recording) {
    // 페이지 이동 후에도 녹화 계속 — URL 변경 기록
    const stepsData = await chrome.storage.local.get(['steps']);
    const steps = stepsData.steps || [];
    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      if (lastStep.url !== location.href) {
        // 페이지 네비게이션 발생 (전체 페이지 로드)
        steps.push({
          type: 'navigate',
          timestamp: Date.now(),
          fromUrl: lastStep.url,
          toUrl: location.href,
          url: location.href
        });
        await chrome.storage.local.set({ steps });
      }
    }
    lastUrl = location.href;
    startRecording();
  }
}

// ---- 메시지 수신 (popup → content) ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startRecording') {
    lastUrl = location.href;
    startRecording();
    sendResponse({ ok: true });
  } else if (msg.action === 'stopRecording') {
    stopRecording();
    sendResponse({ ok: true });
  } else if (msg.action === 'ping') {
    sendResponse({ ok: true, recording: !!recordingBar });
  }
});

// 시작
init();
