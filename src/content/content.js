// ============================================================
// UniFLOW DevTool - Content Script (접근경로 녹화)
// ============================================================

let recordingBar = null;
let clickHandler = null;
let inputHandler = null;
let keyHandler = null;
const pendingInputs = new Map(); // 디바운스 대기 중인 입력 (selector -> {timer, commit})
const lastCommitted = new Map(); // selector -> 마지막 커밋 시그니처 (동일 값 중복 스텝 방지)
let assertMode = false;       // 검증 요소 선택 모드 활성
let assertStage = null;       // 'pick'(요소 선택) | 'type'(유형 선택)
let assertHover = null;       // 현재 하이라이트된 요소
let highlightBox = null;      // 인스펙터 하이라이트 오버레이
let hoverMoveHandler = null;  // 하이라이트용 mousemove 핸들러
let typeMenuHost = null;      // 검증 유형 선택 메뉴 (Shadow DOM)
let pickCursorStyle = null;   // 선택 모드 커서
let frameObserver = null;     // same-origin iframe 감시 (동적 생성 TinyMCE 등)
let frameRescan = null;       // iframe 재스캔 인터벌 (doc.write 로 지워진 리스너 재부착)
const framedDocs = [];        // input/change 리스너를 부착한 iframe 문서 (중지 시 정리)

// ---- 셀렉터 생성 ----
function isUniqueSelector(sel) {
  try { return document.querySelectorAll(sel).length === 1; }
  catch (e) { return false; }
}

// id 셀렉터 형태 — 깔끔한 식별자는 #id, 숫자로 시작하거나 특수문자를 포함하면
// [id="..."] 로 (codegen 스타일, CSS.escape 의 읽기 나쁜 "\35 " 형태 회피)
function idSelector(id) {
  return /^[A-Za-z_][\w-]*$/.test(id) ? '#' + id : '[id="' + id.replace(/["\\]/g, '\\$&') + '"]';
}

function getSelector(el) {
  if (!el || el === document.body || el === document.documentElement) return 'body';
  const elId = el.getAttribute('id');
  if (elId) { const s = idSelector(elId); if (isUniqueSelector(s)) return s; }

  const parts = [];
  let current = el;
  while (current && current !== document.body && parts.length < 6) {
    let selector = current.tagName.toLowerCase();

    // 유일한 id 를 만나면 강한 앵커로 사용 (경로까지 합쳐 유일하면 확정)
    const curId = current.getAttribute('id');
    const curIdSel = curId ? idSelector(curId) : '';
    if (curIdSel && isUniqueSelector(curIdSel)) {
      const anchored = [curIdSel].concat(parts).join(' > ');
      if (isUniqueSelector(anchored)) return anchored;
      parts.unshift(curIdSel);
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

    // 유일해지면 조기 종료 — 불필요하게 길고 취약한 셀렉터 방지
    if (isUniqueSelector(parts.join(' > '))) return parts.join(' > ');
  }

  return parts.join(' > ');
}

// ---- 로케이터 후보 수집 (셀렉터 보강) ----
// 재생 시 Playwright 가 안정적 로케이터를 고르도록, 녹화 시점에 여러 후보 속성을 함께 저장한다.
function collectLocator(el) {
  if (!el || el.nodeType !== 1) return {};
  const attr = (n) => (el.getAttribute(n) || '').trim();
  const id = attr('id');
  const base = {
    testid: attr('data-testid') || attr('data-test') || attr('data-qa') || attr('data-cy'),
    name: attr('name'),
    placeholder: attr('placeholder'),
    ariaLabel: attr('aria-label'),
    role: attr('role'),
    idStable: !!id && isStableId(id)
  };
  const choice = chooseLocatorStrategy(el, base);   // 전략과 함께 "필요할 때만" 스코프를 결정
  base.locatorStrategy = choice.strategy;
  base.scope = choice.scope;
  if (choice.nameExact === false) base.nameExact = false;   // role 이름에 아이콘 글리프 섞임 → 편집기에서 exact 생략
  return base;
}

// id 가 페이지에서 유일하고 자동생성(난수·긴 숫자) 패턴이 아니면 안정적이라 본다.
function isStableId(id) {
  try {
    if (document.querySelectorAll('#' + CSS.escape(id)).length !== 1) return false;
  } catch (e) { return false; }
  if (/^\d/.test(id)) return false;           // 숫자로 시작
  if (/[0-9a-f]{8,}/i.test(id)) return false; // 해시성 연속 hex
  if (/\d{4,}/.test(id)) return false;        // 긴 숫자 시퀀스
  return true;
}

// 스코프 앵커로 쓸 만한 id 인지 — 안정 조건에 더해 의미 있는 형태만(너무 짧거나
// 이상한 문자를 포함한 프레임워크 자동생성 id, 예: "R", "[object HTMLInputElement]" 배제)
function isGoodScopeId(id) {
  if (!id || id.length < 3) return false;
  if (!/^[A-Za-z][\w-]*$/.test(id)) return false;
  return isStableId(id);
}

// 텍스트/role 로 요소를 찾을 때 같은 텍스트가 여러 곳에 있어도 의도한 영역에서만 찾도록,
// 가장 가까운 "쓸 만한" id 조상을 영역 앵커로 수집한다.
function findScopeAnchor(el) {
  let cur = el.parentElement;
  let hops = 0;
  while (cur && cur !== document.body && cur !== document.documentElement && hops < 8) {
    const id = cur.getAttribute('id');
    if (id && isGoodScopeId(id)) return '#' + CSS.escape(id);
    cur = cur.parentElement;
    hops++;
  }
  return '';
}

// ---- 로케이터 자동 판별 (녹화 시점, 실제 DOM 기준) ----
// 각 후보 로케이터를 라이브 DOM 에 맞춰보고, 클릭된 요소에 정확히(유일·보임) 걸리는
// 가장 읽기 좋은 전략을 고른다. 어느 것도 검증되지 않으면 유일성이 보장된 CSS 로 폴백.
// 이렇게 하면 getByText 가 실제로는 0개/여러 개인 경우를 확장이 그 자리에서 걸러낸다.
const ROLE_SCAN = {
  button: 'button, [role=button], input[type=button], input[type=submit], input[type=reset]',
  link: 'a[href], [role=link]',
  checkbox: 'input[type=checkbox], [role=checkbox]',
  radio: 'input[type=radio], [role=radio]',
  tab: '[role=tab]',
  menuitem: '[role=menuitem]'
};

function normText(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

function isElVisible(el) {
  if (!el || !el.isConnected) return false;
  const st = getComputedStyle(el);
  if (st.visibility === 'hidden' || st.visibility === 'collapse' || st.display === 'none') return false;
  return el.getClientRects().length > 0;
}

function isAriaHidden(el) {
  let cur = el;
  while (cur && cur.nodeType === 1) {
    if (cur.getAttribute('aria-hidden') === 'true') return true;
    cur = cur.parentElement;
  }
  return false;
}

function cssQuote(v) { return '"' + String(v).replace(/["\\]/g, '\\$&') + '"'; }

function uniqueHits(sel, el) {
  try { const n = document.querySelectorAll(sel); return n.length === 1 && n[0] === el; }
  catch (e) { return false; }
}

// Playwright getByRole 이 인식하는 역할(암시적/명시적) 근사
function liveRole(el) {
  const explicit = (el.getAttribute('role') || '').trim();
  if (explicit) return explicit;
  const t = el.tagName.toLowerCase();
  if (t === 'a') return el.hasAttribute('href') ? 'link' : null;
  if (t === 'button') return 'button';
  if (t === 'input') {
    const it = (el.getAttribute('type') || '').toLowerCase();
    if (it === 'submit' || it === 'button' || it === 'reset') return 'button';
    if (it === 'checkbox') return 'checkbox';
    if (it === 'radio') return 'radio';
  }
  return null;
}

// 접근 이름 근사 (aria-label → aria-labelledby → 연결 label → 텍스트/placeholder/title)
function accessibleName(el) {
  const al = el.getAttribute('aria-label');
  if (al) return al;
  const lb = el.getAttribute('aria-labelledby');
  if (lb) {
    const ref = document.getElementById(lb);
    if (ref) return ref.textContent;
  }
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const id = el.getAttribute('id');
    if (id) {
      let lab = null;
      try { lab = document.querySelector('label[for=' + cssQuote(id) + ']'); } catch (e) { lab = null; }
      if (lab) return lab.textContent;
    }
    const wrap = el.closest('label');
    if (wrap) return wrap.textContent;
    return el.getAttribute('placeholder') || '';
  }
  return el.textContent || el.getAttribute('title') || '';
}

// Playwright getByText 근사: 텍스트가 일치하는 "가장 작은" 요소들
function emulateGetByText(root, text, exact) {
  const t = normText(text);
  if (!t) return [];
  const out = [];
  const list = root.querySelectorAll('*');
  for (const el of list) {
    const own = normText(el.textContent);
    const hit = exact ? own === t : own.indexOf(t) !== -1;
    if (!hit) continue;
    let childHit = false;
    for (const c of el.children) {
      const ct = normText(c.textContent);
      if (exact ? ct === t : ct.indexOf(t) !== -1) { childHit = true; break; }
    }
    if (!childHit) out.push(el);
  }
  return out;
}

// 요소의 접근 이름에 아이콘 폰트 글리프(::before/::after 생성 콘텐츠)가 섞이는지.
// 섞이면 Playwright 가 계산하는 실제 접근 이름에 비공백 글리프가 들어가 exact 매칭이 깨진다
// (예: fa-folder-open 의 U+E8A5). 이 경우 getByRole 은 non-exact(부분일치)로 내보내야 한다.
function hasPseudoGlyph(el) {
  const hit = (node) => {
    // Playwright 접근 이름은 숨김·aria-hidden 요소를 제외한다 — 이름에 안 들어가는 글리프는 무시
    if (!isElVisible(node) || isAriaHidden(node)) return false;
    for (const pe of ['::before', '::after']) {
      let c;
      try { c = getComputedStyle(node, pe).content; } catch (e) { continue; }
      if (!c || c === 'none' || c === 'normal') continue;
      const s = c.replace(/^["']|["']$/g, '');
      if (s.indexOf('url(') === 0) continue;   // 이미지 content 는 이름에 안 섞임
      if (/\S/.test(s)) return true;            // 공백이 아닌 글리프 → 이름 오염
    }
    return false;
  };
  if (hit(el)) return true;
  const kids = el.querySelectorAll('*');
  const cap = Math.min(kids.length, 30);
  for (let i = 0; i < cap; i++) if (hit(kids[i])) return true;
  return false;
}

function roleResolvesTo(el, scopeSel, role, name, exact) {
  const scan = ROLE_SCAN[role];
  if (!scan) return false;
  const root = (scopeSel && document.querySelector(scopeSel)) || document;
  const wanted = normText(name);
  const hits = [];
  let list;
  try { list = root.querySelectorAll(scan); } catch (e) { return false; }
  for (const c of list) {
    if (!isElVisible(c) || isAriaHidden(c)) continue;
    const cand = normText(accessibleName(c));
    const match = exact ? cand === wanted : cand.indexOf(wanted) !== -1;
    if (match) hits.push(c);
  }
  return hits.length === 1 && (hits[0] === el || hits[0].contains(el) || el.contains(hits[0]));
}

function textResolvesTo(el, scopeSel, text) {
  const root = (scopeSel && document.querySelector(scopeSel)) || document;
  const matches = emulateGetByText(root, text, true).filter(isElVisible);
  if (matches.length !== 1) return false;
  const m = matches[0];
  return m === el || m.contains(el) || el.contains(m);
}

// 반환: { strategy, scope } — scope 는 텍스트/role 이 문서 전역에서 애매할 때만 채워진다.
function chooseLocatorStrategy(el, m) {
  const tag = el.tagName.toLowerCase();
  const isForm = tag === 'input' || tag === 'textarea' || tag === 'select';
  const text = getLabel(el);

  if (m.testid && uniqueHits('[data-testid=' + cssQuote(m.testid) + ']', el)) return { strategy: 'testid', scope: '' };

  const id = el.getAttribute('id');
  if (m.idStable && id && uniqueHits('#' + CSS.escape(id), el)) return { strategy: 'id', scope: '' };

  const role = liveRole(el);
  if (role && text) {
    const exact = !hasPseudoGlyph(el);   // 아이콘 글리프가 이름에 섞이면 exact 로는 못 잡음 → 부분일치
    if (roleResolvesTo(el, '', role, text, exact)) return { strategy: 'role', scope: '', nameExact: exact };          // 전역 유일 → 스코프 불필요
    const sc = findScopeAnchor(el);
    if (sc && roleResolvesTo(el, sc, role, text, exact)) return { strategy: 'role', scope: sc, nameExact: exact };     // 영역 한정으로 유일
  }

  if (m.name && uniqueHits(tag + '[name=' + cssQuote(m.name) + ']', el)) return { strategy: 'name', scope: '' };

  if (isForm && m.placeholder && uniqueHits('[placeholder=' + cssQuote(m.placeholder) + ']', el)) return { strategy: 'placeholder', scope: '' };

  if (!isForm && text) {
    if (textResolvesTo(el, '', text)) return { strategy: 'text', scope: '' };
    const sc = findScopeAnchor(el);
    if (sc && textResolvesTo(el, sc, text)) return { strategy: 'text', scope: sc };
  }

  return { strategy: 'css', scope: '' };                                                       // 좋은 앵커가 없으면 구체 CSS 로
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

// 체크박스/라디오(또는 그 라벨) 클릭인지 — 토글은 click 이 아니라 change 로 기록하려고 판별한다.
function isToggleClick(el) {
  const isCb = (n) => n && n.tagName === 'INPUT' && (n.type === 'checkbox' || n.type === 'radio');
  if (isCb(el)) return true;
  const label = el && el.closest ? el.closest('label') : null;
  if (label) {
    const ctrl = label.control || (label.htmlFor ? document.getElementById(label.htmlFor) : null) || label.querySelector('input');
    if (isCb(ctrl)) return true;
  }
  return false;
}

// ---- 클릭 대상 요소 찾기 ----
// codegen 처럼 "클릭한 정확한 요소"를 잡는다. 두 가지 예외만 둔다.
function findClickTarget(el) {
  // ① jstree 펼침 가능 노드는 펼침 화살표(.jstree-ocl)로 리다이렉트 — 라벨을 눌러도
  //    선택만 되고 펼쳐지지 않으므로(펼침은 화살표/더블클릭), 재생 시 펼침이 재현되도록.
  const node = el.closest('li.jstree-node');
  if (node && !node.classList.contains('jstree-leaf')) {
    const ocl = node.querySelector(':scope > .jstree-icon.jstree-ocl');
    if (ocl) return ocl;
  }

  // ② 텍스트·아이콘이 명백한 컨트롤 안이면 그 컨트롤로 승격
  const meaningful = el.closest('a, button, [role="button"], [role="tab"], [role="menuitem"], input, select, textarea, [onclick], [data-action], [data-click]');
  if (meaningful) return meaningful;

  // 그 외엔 클릭한 정확한 요소 그대로 — coarse 조상으로 기어오르지 않는다(더 작은 단위 유지).
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

// ---- 네트워크 이벤트 브리지 (MAIN world netHook → 여기 → storage) ----
// netHook.js(MAIN)가 감시한 fetch/XHR 을 postMessage 로 받아 스텝과 같은 시계(Date.now)로
// networkEvents 스트림에 적재한다. 편집기가 timestamp 로 액션과 상관해 waitForResponse 를 만든다.
let netMsgHandler = null;
let netQueue = Promise.resolve();
const NET_MAX = 1000;   // 폴링 등으로 무한 증가 방지 (오래된 것부터 버림)
function addNetEvent(evt) {
  netQueue = netQueue.then(async () => {
    const data = await chrome.storage.local.get(['networkEvents']);
    const list = data.networkEvents || [];
    list.push(evt);
    if (list.length > NET_MAX) list.splice(0, list.length - NET_MAX);
    await chrome.storage.local.set({ networkEvents: list });
  });
  return netQueue;
}

function startNetCapture() {
  if (netMsgHandler) return;
  netMsgHandler = (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'uniflow-net') return;
    const p = e.data.payload;
    if (p && p.url) addNetEvent(p);
  };
  window.addEventListener('message', netMsgHandler, false);   // enable 전에 리스너부터 등록
  window.postMessage({ source: 'uniflow-net-ctrl', type: 'enable' }, '*');
}

function stopNetCapture() {
  window.postMessage({ source: 'uniflow-net-ctrl', type: 'disable' }, '*');
  if (netMsgHandler) { window.removeEventListener('message', netMsgHandler, false); netMsgHandler = null; }
}

// ---- 리치텍스트 에디터(contenteditable) 입력 ----
// TinyMCE 등은 편집 영역이 input/textarea 가 아니라 contenteditable(주로 iframe 내부 body)이라
// 일반 입력 경로로는 안 잡힌다. 값은 요소 내용, iframe 안이면 frameSelector 를 병기해 재생 시 frameLocator 로 접근한다.
const RICHTEXT_MAX = 5000;

// contenteditable 이벤트는 하위 요소에서도 올라오므로 최상위 편집 호스트(주로 iframe body)를 찾는다.
function editingHost(el) {
  let host = el && el.nodeType === 1 ? el : (el && el.parentElement);
  while (host && host.parentElement && host.parentElement.isContentEditable) host = host.parentElement;
  return host;
}

function handleRichInput(el) {
  const host = editingHost(el);
  if (!host) return;
  const doc = host.ownerDocument;
  const frameEl = doc.defaultView && doc.defaultView.frameElement;   // 상위 문서의 <iframe> (최상위면 null)
  const frameSelector = frameEl ? getSelector(frameEl) : '';         // frameEl 은 상위 문서 소속 → getSelector(전역 document) 로 정확
  let innerSel;
  if (host === doc.body) innerSel = 'body';
  else if (frameEl) innerSel = host.id ? idSelector(host.id) : 'body';
  else innerSel = getSelector(host);                                 // inline(최상위 문서) — 전역 document 기준 정확
  const key = 'rich::' + frameSelector + '::' + innerSel;

  const prev = pendingInputs.get(key);
  if (prev) clearTimeout(prev.timer);

  const commit = () => {
    pendingInputs.delete(key);
    const value = (host.innerText || host.textContent || '').replace(/\r\n/g, '\n').trim().substring(0, RICHTEXT_MAX);
    if (lastCommitted.get(key) === value) return;
    lastCommitted.set(key, value);
    const step = {
      type: 'input',
      timestamp: Date.now(),
      selector: innerSel,
      tag: host.tagName.toLowerCase(),
      inputType: 'richtext',
      value: value,
      label: (frameEl && getLabel(frameEl)) || '서식 편집기',
      url: location.href
    };
    if (frameSelector) step.frameSelector = frameSelector;
    addStep(step);
  };
  pendingInputs.set(key, { timer: setTimeout(commit, 500), commit });
}

// ---- same-origin iframe 감시 ----
// iframe 내부 이벤트는 상위 문서로 버블링되지 않으므로 각 iframe 문서에 리스너를 직접 붙인다.
// 주의: TinyMCE 등은 iframe 생성 후 doc.open/write 로 내부 문서를 다시 써서, 같은 Document 객체를
// 유지한 채 등록된 리스너를 모두 지운다. 그래서 재부착을 doc 동일성으로 막지 않고(동일 리스너 재등록은
// 자동 무시=중복 없음) 관찰자 + 주기 재스캔으로 다시 붙인다. cross-origin 은 접근 불가 → 조용히 건너뛴다.
function attachToFrame(iframe) {
  if (!inputHandler) return;
  let doc;
  try { doc = iframe.contentDocument; } catch (e) { return; }   // cross-origin
  if (!doc) return;
  doc.addEventListener('input', inputHandler, true);
  doc.addEventListener('change', inputHandler, true);
  if (framedDocs.indexOf(doc) === -1) framedDocs.push(doc);     // 정리용 목록(중복 방지)
}

function scanFrames() {
  document.querySelectorAll('iframe').forEach(attachToFrame);
}

function setupFrameWatch() {
  scanFrames();
  frameObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!n || n.nodeType !== 1) continue;
        if (n.tagName === 'IFRAME') attachToFrame(n);
        else if (n.querySelectorAll) n.querySelectorAll('iframe').forEach(attachToFrame);
      }
    }
  });
  frameObserver.observe(document.documentElement, { childList: true, subtree: true });
  // TinyMCE 등이 doc.write 로 리스너를 지운 뒤(같은 Document) 다시 붙이려면 주기 재스캔이 필요
  frameRescan = setInterval(scanFrames, 700);
}

function teardownFrameWatch() {
  if (frameObserver) { frameObserver.disconnect(); frameObserver = null; }
  if (frameRescan) { clearInterval(frameRescan); frameRescan = null; }
  framedDocs.forEach((doc) => {
    try {
      doc.removeEventListener('input', inputHandler, true);
      doc.removeEventListener('change', inputHandler, true);
    } catch (e) { /* 문서 파기됨 */ }
  });
  framedDocs.length = 0;
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
        background: linear-gradient(135deg, #ff5050, #b3262b);
        color: white;
        padding: 10px 24px;
        border-radius: 0 0 14px 14px;
        display: flex; align-items: center; gap: 14px;
        font-family: -apple-system, 'Malgun Gothic', sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 20px rgba(179,38,43,0.4);
        user-select: none;
      }
      .dot {
        width: 10px; height: 10px;
        background: #f9d4d2;
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
        background: white; color: #b3262b;
        border: none; padding: 5px 16px;
        border-radius: 4px; font-size: 12px;
        font-weight: 700; cursor: pointer;
        transition: background 0.15s;
      }
      .stop-btn:hover { background: #fff0f0; }
      .assert-btn {
        background: rgba(255,255,255,0.18); color: #fff;
        border: 1px solid rgba(255,255,255,0.45); padding: 5px 14px;
        border-radius: 4px; font-size: 12px; font-weight: 700; cursor: pointer;
        transition: background 0.15s;
      }
      .assert-btn:hover { background: rgba(255,255,255,0.32); }
      .assert-btn.active { background: #fff; color: #024ad8; border-color: #fff; }
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
    'background:rgba(2,74,216,0.16);border:2px solid #024ad8;border-radius:2px;' +
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
        background: #fff; border: 1px solid #e8e8e8; border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25); padding: 6px;
        font-family: 'Segoe UI', 'Malgun Gothic', sans-serif;
      }
      .head { font-size: 11px; color: #636363; padding: 5px 9px 7px; }
      button {
        display: block; width: 100%; text-align: left; border: none; background: none;
        padding: 8px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; color: #1a1a1a;
      }
      button:hover { background: #eef3fd; }
      button small { display: block; color: #636363; font-size: 11px; margin-top: 1px; }
      .cancel { color: #b3262b; border-top: 1px solid #e8e8e8; margin-top: 4px; }
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
    selector, text, expected, url: location.href,
    ...collectLocator(el)
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

    // 순수 유저 트리거만 기록 — 합성 click(폼 제출 forward·키보드 활성화 = detail 0)과
    // 프로그램적 click(isTrusted=false)은 "결과" 이벤트이므로 제외(원인은 keydown/실클릭이 잡음).
    if (!e.isTrusted || e.detail === 0) return;

    // 체크박스·라디오 토글은 라벨/인풋 클릭(포워딩 포함)이 여러 번 잡혀 자기상쇄된다 —
    // click 은 기록하지 않고 change 로 .setChecked(최종상태) 한 스텝만 남긴다.
    if (isToggleClick(e.target)) return;

    // 클릭 직전, 대기 중인 입력을 먼저 커밋 (예: 비밀번호 입력 후 바로 로그인 클릭 → 이동)
    flushPendingInputs();

    const target = findClickTarget(e.target);
    const step = {
      type: 'click',
      timestamp: Date.now(),
      selector: getSelector(target),
      text: getLabel(target),
      tag: target.tagName.toLowerCase(),
      url: location.href,
      ...collectLocator(target)
    };

    await addStep(step);
  };

  // input/change 핸들러 — input은 500ms 디바운스, change(blur)는 즉시 커밋
  inputHandler = (e) => {
    const barHost = document.getElementById('uniflow-devtool-recording-bar');
    if (barHost && barHost.contains(e.target)) return;

    const el = e.target;
    // 리치텍스트 에디터(contenteditable, TinyMCE 등 — iframe 내부 포함)는 별도 경로로
    if (el && el.nodeType === 1 && el.isContentEditable && e.type === 'input') { handleRichInput(el); return; }

    const tag = el.tagName.toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tag)) return;
    if (el.ownerDocument !== document) return;   // 서브프레임 내 일반 입력은 셀렉터를 최상위 문서 기준으로 못 잡음 → 스킵(리치텍스트만 프레임 지원)

    const key = getSelector(el);
    const prev = pendingInputs.get(key);
    if (prev) clearTimeout(prev.timer);

    const commit = () => {
      pendingInputs.delete(key);
      const inputType = el.getAttribute('type') || tag;
      const isToggle = inputType === 'checkbox' || inputType === 'radio';
      // 테스트 목적: 비밀번호도 실제 입력값 그대로 기록(시나리오 재현 시 로그인되도록).
      // 주의 — 평문이 chrome.storage·생성 코드에 저장된다.
      const value = (el.value || '').substring(0, 100);
      const sig = isToggle ? value + '|' + (!!el.checked) : value;
      if (lastCommitted.get(key) === sig) return; // 직전 커밋과 동일 → 중복 방지(Enter flush 직후 change 등)
      lastCommitted.set(key, sig);
      const step = {
        type: 'input',
        timestamp: Date.now(),
        selector: key,
        tag,
        inputType,
        value: value,
        label: getLabel(el),
        url: location.href,
        ...collectLocator(el)
      };
      // 체크박스·라디오는 fill 이 아니라 체크 상태가 동작 — 상태를 함께 저장(편집기에서 setChecked)
      if (isToggle) step.checked = !!el.checked;
      addStep(step);
    };

    if (e.type === 'change') {
      commit(); // blur 시 즉시 (예: 비밀번호 입력 후 로그인 버튼 클릭)
    } else {
      pendingInputs.set(key, { timer: setTimeout(commit, 500), commit });
    }
  };

  // keydown 핸들러 — 입력칸에서 누른 Enter(검색·제출 실행)를 press('Enter') 스텝으로.
  // 버튼·링크의 Enter 는 click 이 이미 잡으므로 폼 필드에서만 캡처한다.
  keyHandler = async (e) => {
    const barHost = document.getElementById('uniflow-devtool-recording-bar');
    if (barHost && barHost.contains(e.target)) return;
    if (assertMode) return;
    if (e.key !== 'Enter') return;
    const el = e.target;
    if ((el.tagName || '').toLowerCase() !== 'input') return; // textarea=줄바꿈, 그 외 무시
    // Enter(원인)만 기록한다. 이로 인한 폼 제출의 합성 click(결과)은 clickHandler 가 detail=0 으로 필터하므로
    // 이중 제출이 안 생긴다. (검색창처럼 제출 버튼 없이 JS 로 처리하는 Enter 도 동일하게 원인으로 기록)
    flushPendingInputs(); // Enter 직전 대기 입력(예: 검색어)을 먼저 커밋
    await addStep({
      type: 'key',
      key: 'Enter',
      timestamp: Date.now(),
      selector: getSelector(el),
      text: getLabel(el),
      tag: 'input',
      url: location.href,
      ...collectLocator(el)
    });
  };

  document.addEventListener('click', clickHandler, true);
  document.addEventListener('input', inputHandler, true);
  document.addEventListener('change', inputHandler, true);
  document.addEventListener('keydown', keyHandler, true);

  // same-origin iframe(TinyMCE 등) 편집 영역에도 입력 리스너 부착
  setupFrameWatch();

  // URL 변경 감지 (SPA 대응)
  setupUrlWatcher();

  // MAIN world 네트워크 훅 활성화 (액션이 유발한 API 응답 수집)
  startNetCapture();
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
  stopNetCapture();

  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true);
    clickHandler = null;
  }
  teardownFrameWatch();   // inputHandler 참조로 iframe 리스너 제거 — 아래에서 null 되기 전에
  if (inputHandler) {
    document.removeEventListener('input', inputHandler, true);
    document.removeEventListener('change', inputHandler, true);
    inputHandler = null;
  }
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler, true);
    keyHandler = null;
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
  stopNetCapture();
  if (recordingBar) {
    recordingBar.host.remove();
    recordingBar = null;
  }
  if (clickHandler) {
    document.removeEventListener('click', clickHandler, true);
    clickHandler = null;
  }
  teardownFrameWatch();
  if (inputHandler) {
    document.removeEventListener('input', inputHandler, true);
    document.removeEventListener('change', inputHandler, true);
    inputHandler = null;
  }
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler, true);
    keyHandler = null;
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
