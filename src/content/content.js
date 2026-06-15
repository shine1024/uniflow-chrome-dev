// ============================================================
// UniFLOW DevTool - Content Script (접근경로 녹화)
// ============================================================

let recordingBar = null;
let clickHandler = null;
let inputHandler = null;
const inputDebounceTimers = new Map();

// ---- 셀렉터 생성 ----
function getSelector(el) {
  if (!el || el === document.body || el === document.documentElement) return 'body';
  if (el.id) return '#' + CSS.escape(el.id);

  const parts = [];
  let current = el;
  while (current && current !== document.body && parts.length < 4) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift('#' + CSS.escape(current.id));
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

// ---- Step 저장 ----
async function addStep(step) {
  const data = await chrome.storage.local.get(['steps']);
  const steps = data.steps || [];
  steps.push(step);
  await chrome.storage.local.set({ steps });
  updateCount(steps.length);
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
    </style>
    <div class="bar">
      <div class="dot"></div>
      <span class="label">녹화 중</span>
      <span class="count">0 클릭</span>
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

  return { host, shadow };
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

  // input/change/select 핸들러 (디바운싱 500ms)
  inputHandler = (e) => {
    const barHost = document.getElementById('uniflow-devtool-recording-bar');
    if (barHost && barHost.contains(e.target)) return;

    const el = e.target;
    const tag = el.tagName.toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tag)) return;

    const key = getSelector(el);
    clearTimeout(inputDebounceTimers.get(key));

    inputDebounceTimers.set(key, setTimeout(async () => {
      inputDebounceTimers.delete(key);
      const inputType = el.getAttribute('type') || tag;
      const rawValue = el.value || '';
      const maskedValue = inputType === 'password' ? '****' : rawValue.substring(0, 100);

      await addStep({
        type: 'input',
        timestamp: Date.now(),
        selector: key,
        tag,
        inputType,
        value: maskedValue,
        label: getLabel(el),
        url: location.href
      });
    }, 500));
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

  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true);
    clickHandler = null;
  }
  if (inputHandler) {
    document.removeEventListener('input', inputHandler, true);
    document.removeEventListener('change', inputHandler, true);
    inputHandler = null;
  }
  inputDebounceTimers.forEach(t => clearTimeout(t));
  inputDebounceTimers.clear();

  if (recordingBar) {
    recordingBar.host.remove();
    recordingBar = null;
  }
}

// ---- 녹화 바 제거만 (페이지 이동 시 cleanup) ----
function removeBar() {
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
  inputDebounceTimers.forEach(t => clearTimeout(t));
  inputDebounceTimers.clear();
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
