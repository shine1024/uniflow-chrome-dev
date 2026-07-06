// ============================================================
// UniFLOW DevTool — 시나리오 편집기
// 녹화 스텝(chrome.storage.local.steps) → 편집 가능한 시나리오 → Playwright
// 편집 결과는 chrome.storage.local.scenario 로 저장(재방문 시 복원)
// ============================================================

const $ = (id) => document.getElementById(id);
const stepList = $('stepList');
const nameInput = $('scenarioName');
const descEl = $('scenarioDesc');
const applyGapsEl = $('applyGaps');
const gapThresholdEl = $('gapThreshold');
const codeEl = $('code');
const stepCountEl = $('stepCount');

let scenario = { name: '', steps: [] };
let _idSeq = 0;
const nid = () => ++_idSeq;
let dragId = null;

// ---- 직렬화 헬퍼 ----
const js = (v) => JSON.stringify(v == null ? '' : v);          // 코드 문자열 리터럴
const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escHtml(s).replace(/"/g, '&quot;');

// ---- 녹화 원본 → 편집 모델 (gap = timestamp 차이) ----
function normalizeFromRaw(raw) {
  let prevTs = null;
  return (raw || []).map((s) => {
    const gapMs = (prevTs != null && s.timestamp) ? Math.max(0, s.timestamp - prevTs) : 0;
    if (s.timestamp) prevTs = s.timestamp;
    return {
      id: nid(),
      type: s.type,
      selector: s.selector || '',
      text: s.text || s.title || '',
      tag: s.tag || '',
      inputType: s.inputType || '',
      frameSelector: s.frameSelector || '',   // 리치텍스트(iframe) 편집 영역 — frameLocator 로 접근
      testid: s.testid || '',
      name: s.name || '',
      placeholder: s.placeholder || '',
      ariaLabel: s.ariaLabel || '',
      role: s.role || '',
      idStable: !!s.idStable,
      scope: s.scope || '',
      locatorStrategy: s.locatorStrategy || '',
      nameExact: s.nameExact,        // role 이름 exact 여부(아이콘 글리프면 false) — 유실되면 exact:true 로 되돌아감
      checked: s.checked,            // 체크박스·라디오 상태(setChecked)
      key: s.key || '',              // 키 입력(Enter 등) — press() 로 생성
      value: s.value !== undefined ? s.value : '',
      url: s.url || '',
      toUrl: s.toUrl || '',
      assertType: s.assertType || 'visible',
      expected: s.expected || '',
      gapMs,
      enabled: true,
    };
  });
}

// ---- 로드 ----
// 현재 녹화 식별자 (첫 스텝 timestamp). 새로 녹화하면 값이 달라진다.
function recordingId(steps) {
  return (steps && steps[0] && steps[0].timestamp) || 0;
}

async function load() {
  const data = await chrome.storage.local.get(['steps', 'scenario']);
  const recId = recordingId(data.steps);
  const sc = data.scenario;
  const scValid = sc && Array.isArray(sc.steps) && sc.steps.length;
  const hasRecording = !!(data.steps && data.steps.length);
  // 저장된 편집본이 "현재 녹화"의 것이면(또는 현재 녹화가 없으면) 편집본 유지,
  // 새 녹화가 감지되면 그 녹화를 자동으로 불러온다.
  if (scValid && (!hasRecording || sc.sourceRecId === recId)) {
    scenario = sc;
    scenario.steps.forEach((s) => { if (!s.id) s.id = nid(); if (s.enabled === undefined) s.enabled = true; });
  } else {
    scenario = { name: '', description: '', steps: normalizeFromRaw(data.steps), sourceRecId: recId };
  }
  nameInput.value = scenario.name || '';
  descEl.value = scenario.description || '';
  render();
}

async function reloadFromRecording() {
  const data = await chrome.storage.local.get(['steps']);
  scenario.steps = normalizeFromRaw(data.steps);
  scenario.sourceRecId = recordingId(data.steps);
  render();
}

async function save() {
  scenario.name = nameInput.value.trim();
  scenario.description = descEl.value.trim();
  await chrome.storage.local.set({ scenario });
  flash($('saveBtn'), '저장됨');
}

// ---- 렌더 ----
const TYPE_LABEL = { start: '시작', navigate: '이동', click: '클릭', input: '입력', key: '키', assert: '검증' };

function targetText(s) {
  if (s.type === 'start') return s.url;
  if (s.type === 'navigate') return s.toUrl || s.url;
  if (s.type === 'click') return s.text || s.selector;
  if (s.type === 'input') return (s.frameSelector ? s.frameSelector + ' › ' : '') + s.selector;
  if (s.type === 'key') return (s.key || 'Enter') + (s.text || s.selector ? ' · ' + (s.text || s.selector) : '');
  if (s.type === 'assert') {
    const at = s.assertType || 'visible';
    const tgt = s.selector || s.text || '?';
    if (at === 'url') return 'URL = ' + (s.expected || '');
    if (at === 'hasText') return tgt + ' 텍스트 = "' + (s.expected || '') + '"';
    if (at === 'containsText') return tgt + ' ⊇ "' + (s.expected || '') + '"';
    if (at === 'hasValue') return tgt + ' 값 = "' + (s.expected || '') + '"';
    return tgt + ' 보임';
  }
  return '';
}

function fieldsHtml(s) {
  if (s.type === 'start') {
    return field('URL', 'url', s.url);
  }
  if (s.type === 'navigate') {
    return field('URL', 'toUrl', s.toUrl || s.url);
  }
  if (s.type === 'click') {
    return field('텍스트', 'text', s.text) + field('셀렉터', 'selector', s.selector);
  }
  if (s.type === 'input') {
    return field('셀렉터', 'selector', s.selector) + field('값', 'value', s.value);
  }
  if (s.type === 'assert') {
    const at = s.assertType || 'visible';
    const opt = (v, l) => `<option value="${v}" ${at === v ? 'selected' : ''}>${l}</option>`;
    let h = `<div class="field"><label>유형</label><select data-act="assertType">` +
      opt('visible', '요소 보임') +
      opt('hasText', '텍스트 일치') +
      opt('containsText', '텍스트 포함') +
      opt('hasValue', '입력값 일치') +
      opt('url', 'URL 일치') +
      `</select></div>`;
    if (at === 'url') h += field('기대 URL', 'expected', s.expected);
    else if (at === 'visible') h += field('셀렉터', 'selector', s.selector);
    else if (at === 'hasValue') h += field('셀렉터', 'selector', s.selector) + field('기대 값', 'expected', s.expected);
    else h += field('셀렉터', 'selector', s.selector) + field('기대 텍스트', 'expected', s.expected); // hasText, containsText
    return h;
  }
  return '';
}

function field(label, act, value) {
  return `<div class="field"><label>${label}</label>` +
    `<input type="text" data-act="${act}" value="${escAttr(value)}"></div>`;
}

function renderCards() {
  if (!scenario.steps.length) {
    stepList.innerHTML = '<div class="empty">녹화된 이벤트가 없습니다.<br>팝업에서 녹화한 뒤 "녹화에서 불러오기"를 누르세요.</div>';
    return;
  }
  let html = '';
  scenario.steps.forEach((s, i) => {
    if (i > 0) {
      html += `<div class="gap"><span class="gap-chip">⏱ <input type="number" min="0" step="50" data-act="gap" data-id="${s.id}" value="${s.gapMs || 0}"> ms 대기</span></div>`;
    }
    html += `<div class="card ${s.enabled === false ? 'disabled' : ''}" data-id="${s.id}">
      <span class="num">${i + 1}</span>
      <div class="body">
        <div class="row1">
          <span class="tag ${s.type}">${TYPE_LABEL[s.type] || s.type}</span>
          <span class="target">${escHtml(targetText(s))}</span>
        </div>
        <div class="fields">${fieldsHtml(s)}</div>
      </div>
      <div class="actions">
        <span class="drag-handle" draggable="true" title="드래그로 순서 변경">⋮⋮</span>
        <input type="checkbox" data-act="enabled" ${s.enabled === false ? '' : 'checked'} title="사용 여부">
        <button class="icon-btn del" data-act="del" title="삭제">✕</button>
      </div>
    </div>`;
  });
  stepList.innerHTML = html;
}

function renderCode() {
  const code = toPlaywright();
  codeEl.textContent = code;
  const active = scenario.steps.filter((s) => s.enabled !== false).length;
  stepCountEl.textContent = `${active} / ${scenario.steps.length} steps`;
}

function render() {
  renderCards();
  renderCode();
}

// ---- Playwright 코드 생성 ----
function tagToRole(s) {
  if (s.role) return s.role;                 // 명시적 role 속성 우선 (녹화 시 판별과 일치)
  const t = (s.tag || '').toLowerCase();
  if (t === 'a') return 'link';
  if (t === 'button') return 'button';
  if (t === 'input') {
    const it = (s.inputType || '').toLowerCase();
    if (it === 'submit' || it === 'button') return 'button';
    if (it === 'checkbox') return 'checkbox';
    if (it === 'radio') return 'radio';
  }
  return null;
}

// CSS 속성 선택자 조각 (name='userId') — 값의 작은따옴표만 이스케이프
function cssAttr(name, val) {
  return `${name}='${String(val).replace(/'/g, "\\'")}'`;
}

// 셀렉터 우선순위(견고성): data-testid → 안정적 #id → role+name → name 속성 → placeholder → 텍스트 → CSS 폴백
function pickLocator(s) {
  const tag = (s.tag || '').toLowerCase();
  const isForm = ['input', 'textarea', 'select'].includes(tag);
  const scope = s.scope ? `page.locator(${js(s.scope)})` : 'page';
  // 녹화 시 확장이 라이브 DOM 으로 검증해 고른 전략을 코드로 옮긴다.
  const emit = (strategy) => {
    switch (strategy) {
      case 'testid': return { expr: `page.getByTestId(${js(s.testid)})`, desc: `testid=${s.testid}` };
      case 'id': return { expr: `page.locator(${js(s.selector)})`, desc: s.selector };
      case 'role': {
        const role = tagToRole(s);
        // 접근 이름에 아이콘 글리프가 섞이는 요소는 exact 가 깨지므로 부분일치로 (녹화 시 판별)
        const nameOpt = s.nameExact === false ? `{ name: ${js(s.text)} }` : `{ name: ${js(s.text)}, exact: true }`;
        return { expr: `${scope}.getByRole(${js(role)}, ${nameOpt})`, desc: `${role}=${s.text}` };
      }
      case 'name': { const sel = `${tag}[${cssAttr('name', s.name)}]`; return { expr: `page.locator(${js(sel)})`, desc: sel }; }
      case 'placeholder': return { expr: `page.getByPlaceholder(${js(s.placeholder)})`, desc: `placeholder=${s.placeholder}` };
      case 'text': return { expr: `${scope}.getByText(${js(s.text)}, { exact: true }).filter({ visible: true })`, desc: `text=${s.text}` };
      case 'css': return { expr: s.selector ? `page.locator(${js(s.selector)})` : `page.locator('body')`, desc: s.selector || 'body' };
      default: return null;
    }
  };

  if (s.locatorStrategy) { const r = emit(s.locatorStrategy); if (r) return r; }

  // 폴백 — 전략이 없을 때(구 녹화 데이터 등) 기존 휴리스틱 순서
  if (s.testid) return emit('testid');
  if (s.idStable && s.selector && s.selector.charAt(0) === '#') return emit('id');
  const role = tagToRole(s);
  if (!isForm && role && s.text) return emit('role');
  if (s.name) return emit('name');
  if (isForm && s.placeholder) return emit('placeholder');
  if (!isForm && s.text) return emit('text');
  if (s.selector) return emit('css');
  return { expr: `page.locator('body')`, desc: 'body' };
}

function clickLocator(s) {
  return pickLocator(s).expr;
}

function assertLocator(s) {
  if (s.selector) return `page.locator(${js(s.selector)})`;
  if (s.text) return `page.getByText(${js(s.text)})`;
  return `page.locator('body')`;
}

function assertLine(s) {
  const at = s.assertType || 'visible';
  if (at === 'url') return `await expect(page).toHaveURL(${js(s.expected)});`;
  if (at === 'hasText') return `await expect(${assertLocator(s)}).toHaveText(${js(s.expected)});`;
  if (at === 'containsText') return `await expect(${assertLocator(s)}).toContainText(${js(s.expected)});`;
  if (at === 'hasValue') return `await expect(${assertLocator(s)}).toHaveValue(${js(s.expected)});`;
  return `await expect(${assertLocator(s)}).toBeVisible();`;
}

function stepLine(s) {
  switch (s.type) {
    case 'start': return `await page.goto(${js(s.url)});`;
    case 'navigate': return `await page.waitForURL(${js(s.toUrl || s.url)});`;
    case 'click': return `await ${clickLocator(s)}.click();`;
    case 'key': return `await ${pickLocator(s).expr}.press(${js(s.key || 'Enter')});`;
    case 'assert': return assertLine(s);
    case 'input': {
      const it = (s.inputType || '').toLowerCase();
      // 리치텍스트(contenteditable, TinyMCE 등)
      if (it === 'richtext') {
        // iframe 편집기(TinyMCE): fill·키입력은 에디터 모델에 반영되지 않아 저장 시 본문이 비어 검증에 걸린다.
        // → 에디터 API 로 본문을 직접 설정한다(editorId = iframe id 에서 '_ifr' 제거).
        if (s.frameSelector) {
          const edId = s.frameSelector.replace(/^#/, '').replace(/_ifr$/, '');
          const getter = edId
            ? `window.tinymce && (window.tinymce.get(${js(edId)}) || window.tinymce.activeEditor)`
            : 'window.tinymce && window.tinymce.activeEditor';
          return `await page.evaluate((html) => { const ed = ${getter}; if (ed) { ed.setContent(html); ed.save(); } }, ${js(s.value)});`;
        }
        // inline contenteditable 은 fill 로 (프레임 없음)
        return `await page.locator(${js(s.selector || 'body')}).fill(${js(s.value)});`;
      }
      // 체크박스·라디오는 fill 이 아니라 setChecked (fill 은 Playwright 에서 에러)
      if (it === 'checkbox' || it === 'radio') {
        const checked = s.checked !== false; // 상태 미저장 구 데이터는 체크로 간주
        return `await ${pickLocator(s).expr}.setChecked(${checked});`;
      }
      const masked = s.value === '****'; // 녹화 시 마스킹된 비밀번호 (편집 전)
      const val = masked ? "process.env.PASSWORD ?? ''" : js(s.value);
      const tail = masked ? '  // TODO: 비밀번호는 환경변수(PASSWORD)로 주입' : '';
      return `await ${pickLocator(s).expr}.fill(${val});${tail}`;
    }
    default: return `// (알 수 없는 스텝: ${s.type})`;
  }
}

// 실패 시 리포트·trace 에서 어느 동작인지 즉시 지목되도록 스텝 제목을 만든다.
function stepTitle(s, i) {
  const label = targetText(s) || TYPE_LABEL[s.type] || s.type;
  return `${i + 1}. ${TYPE_LABEL[s.type] || s.type} · ${label}`;
}

function toPlaywright() {
  const steps = scenario.steps.filter((s) => s.enabled !== false);
  const name = nameInput.value.trim() || '녹화 시나리오';
  const apply = applyGapsEl.checked;
  const thr = parseInt(gapThresholdEl.value, 10) || 0;

  const desc = descEl.value.trim();
  const L = ["import { test, expect } from '@playwright/test';", ''];
  if (desc) desc.split('\n').forEach((line) => L.push('// ' + line));
  L.push('// 실패 시 trace·스크린샷을 남기려면 playwright.config.ts 에 아래를 추가:');
  L.push("//   use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }");
  L.push('//   실패 후:  npx playwright show-trace  로 타임라인·네트워크·DOM 스냅샷 확인');
  L.push('// 로그인 세션이 필요한 화면은 storageState 등으로 인증을 먼저 구성하세요.');
  L.push(`test(${js(name)}, async ({ page }) => {`);
  steps.forEach((s, i) => {
    if (apply && i > 0 && s.gapMs > 0 && s.gapMs >= thr) {
      L.push(`  await page.waitForTimeout(${s.gapMs});`);
    }
    L.push(`  await test.step(${js(stepTitle(s, i))}, async () => {`);
    L.push(`    ${stepLine(s)}`);
    L.push('  });');
  });
  L.push('});');
  L.push('');
  return L.join('\n');
}

// ---- 편집 인터랙션 ----
function findStep(id) { return scenario.steps.find((x) => String(x.id) === String(id)); }
function indexOf(id) { return scenario.steps.findIndex((x) => String(x.id) === String(id)); }

// 인라인 값/갭 입력 (포커스 유지를 위해 코드만 갱신)
stepList.addEventListener('input', (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  const id = e.target.dataset.id || e.target.closest('.card')?.dataset.id;
  const s = findStep(id);
  if (!s) return;
  if (act === 'gap') s.gapMs = Math.max(0, parseInt(e.target.value, 10) || 0);
  else if (act === 'text') s.text = e.target.value;
  else if (act === 'selector') s.selector = e.target.value;
  else if (act === 'value') s.value = e.target.value;
  else if (act === 'url') s.url = e.target.value;
  else if (act === 'toUrl') s.toUrl = e.target.value;
  else if (act === 'expected') s.expected = e.target.value;
  renderCode();
});

// 사용 여부 토글 / 검증 유형 변경
stepList.addEventListener('change', (e) => {
  const act = e.target.dataset.act;
  if (act !== 'enabled' && act !== 'assertType') return;
  const s = findStep(e.target.closest('.card').dataset.id);
  if (!s) return;
  if (act === 'enabled') s.enabled = e.target.checked;
  else if (act === 'assertType') s.assertType = e.target.value;
  render();
});

// 삭제
stepList.addEventListener('click', (e) => {
  const del = e.target.closest('[data-act="del"]');
  if (!del) return;
  const id = del.closest('.card').dataset.id;
  scenario.steps = scenario.steps.filter((x) => String(x.id) !== String(id));
  render();
});

// 드래그 재정렬 (드래그 핸들 기준)
stepList.addEventListener('dragstart', (e) => {
  const handle = e.target.closest('.drag-handle');
  if (!handle) return;
  const card = handle.closest('.card');
  dragId = card.dataset.id;
  card.classList.add('dragging');
});
stepList.addEventListener('dragend', (e) => {
  const card = e.target.closest('.card');
  if (card) card.classList.remove('dragging');
  dragId = null;
});
stepList.addEventListener('dragover', (e) => { if (dragId) e.preventDefault(); });
stepList.addEventListener('drop', (e) => {
  e.preventDefault();
  const card = e.target.closest('.card');
  if (!card || !dragId) return;
  const from = indexOf(dragId);
  const to = indexOf(card.dataset.id);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = scenario.steps.splice(from, 1);
  scenario.steps.splice(to, 0, moved);
  dragId = null;
  render();
});

// ---- 헤더 컨트롤 ----
nameInput.addEventListener('input', renderCode);
descEl.addEventListener('input', renderCode);
applyGapsEl.addEventListener('change', renderCode);
gapThresholdEl.addEventListener('input', renderCode);
$('addAssertBtn').addEventListener('click', () => {
  scenario.steps.push({ id: nid(), type: 'assert', assertType: 'visible', selector: '', text: '', expected: '', gapMs: 0, enabled: true });
  render();
});
$('reloadBtn').addEventListener('click', reloadFromRecording);
$('saveBtn').addEventListener('click', save);
$('copyBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText(toPlaywright());
  flash($('copyBtn'), '복사됨!');
});
$('downloadBtn').addEventListener('click', () => {
  const blob = new Blob([toPlaywright()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (nameInput.value.trim() || 'scenario').replace(/[^\w가-힣-]+/g, '_') + '.spec.ts';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

function flash(btn, text) {
  const orig = btn.textContent;
  btn.textContent = text;
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
}

load();
