// ============================================================
// UniFLOW DevTool - Popup Script
// ============================================================

// ---- 공통 유틸 ----
const COMMON_PATTERNS = [
  '/lib/', '/libs/', '/vendor/', '/node_modules/',
  'jquery', 'require.js', 'requirejs', 'bootstrap',
  'moment.js', 'lodash', 'underscore',
  '/common/lib/', '/plugin/', '/plugins/',
  '/webjars/', 'jstree',
  'message-file.js', 'common.js'
];

function isCommonFile(url) {
  const lower = url.toLowerCase();
  return COMMON_PATTERNS.some(p => lower.includes(p));
}

function shortenUrl(url) {
  try { return new URL(url).pathname; }
  catch { return url.split('?')[0]; }
}

// ---- 탭 전환 ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ============================================================
// 파일 추출 기능
// ============================================================

function extractPageInfo() {
  const result = {
    url: location.href, title: document.title,
    scripts: [], requireModules: [], requireFetchedUrls: [], styles: [],
    viewInfo: null
  };

  try {
    const v = window.__viewInfo && window.__viewInfo.view;
    if (v && v.viewProgramPath) {
      result.viewInfo = {
        viewId: v.viewId || null,
        viewNm: v.viewNm || null,
        viewDesc: v.viewDesc || null,
        viewJspPath: v.viewJspPath || null,
        viewProgramPath: v.viewProgramPath,
        defMenuId: v.defMenuId || null,
        svcId: v.svcId || null,
        was: v.was || null
      };
    }
  } catch {}

  document.querySelectorAll('script[src]').forEach(el => {
    result.scripts.push({
      src: el.src,
      isMain: !!el.hasAttribute('data-main') || !!el.dataset.main,
      dataMain: el.getAttribute('data-main') || null
    });
  });

  try {
    if (window.require && window.require.s && window.require.s.contexts) {
      const ctx = window.require.s.contexts._;
      if (ctx && ctx.defined) {
        result.requireModules = Object.keys(ctx.defined).map(name => {
          let url = null;
          try { url = window.require.toUrl(name + '.js'); } catch {}
          return { name, url };
        });
      }
      if (ctx && ctx.urlFetched) {
        result.requireFetchedUrls = Object.keys(ctx.urlFetched);
      }
    }
  } catch {}

  document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    if (el.href) result.styles.push({ href: el.href });
  });

  document.querySelectorAll('style').forEach(el => {
    const imports = (el.textContent || '').match(/@import\s+url\(['"]?([^'")\s]+)['"]?\)/g);
    if (imports) imports.forEach(imp => {
      const m = imp.match(/url\(['"]?([^'")\s]+)['"]?\)/);
      if (m) result.styles.push({ href: m[1] });
    });
  });

  // 중복 제거
  const seen = new Set();
  result.styles = result.styles.filter(s => {
    const key = s.href.split('?')[0];
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  return result;
}

function toExtractMarkdown(data, filterCommon) {
  const vi = data.viewInfo;
  const heading = vi && vi.viewNm ? `# 화면: ${vi.viewNm}${vi.viewDesc ? ' — ' + vi.viewDesc : ''}` : `# 화면: ${data.title}`;
  const lines = [heading, `- URL: ${data.url}`];

  if (vi) {
    if (vi.viewJspPath)      lines.push(`- JSP: ${vi.viewJspPath}`);
    if (vi.viewProgramPath)  lines.push(`- JS: ${vi.viewProgramPath}`);
    if (vi.viewId)           lines.push(`- viewId: ${vi.viewId}`);
    if (vi.defMenuId)        lines.push(`- menuId: ${vi.defMenuId}`);
  } else {
    // viewInfo 없는 화면은 기존 방식으로 폴백
    const scripts = filterCommon ? data.scripts.filter(s => !isCommonFile(s.src)) : data.scripts;
    const scriptSrcs = new Set(scripts.map(s => s.src));
    const reqFiles = data.requireFetchedUrls
      .filter(url => !scriptSrcs.has(url))
      .filter(url => !filterCommon || !isCommonFile(url));
    lines.push('');
    lines.push(`## JS 파일 (${scripts.length + reqFiles.length})`);
    scripts.forEach(s => lines.push(`- ${s.isMain ? '[MAIN] ' : ''}${shortenUrl(s.src)}`));
    reqFiles.forEach(url => lines.push(`- [RequireJS] ${shortenUrl(url)}`));
  }

  const styles = filterCommon ? data.styles.filter(s => !isCommonFile(s.href)) : data.styles;
  lines.push('');
  lines.push(`## CSS 파일 (${styles.length})`);
  styles.forEach(s => lines.push(`- ${shortenUrl(s.href)}`));
  return lines.join('\n');
}

function renderExtractResult(data, filterCommon) {
  const vi = data.viewInfo;
  const scripts = filterCommon ? data.scripts.filter(s => !isCommonFile(s.src)) : data.scripts;
  const scriptSrcs = new Set(scripts.map(s => s.src.split('?')[0]));
  const mainViewUrl = vi && vi.viewProgramPath
    ? data.requireFetchedUrls.find(u => u.includes(vi.viewProgramPath))
    : null;
  const reqFiles = data.requireFetchedUrls
    .filter(url => !scriptSrcs.has(url.split('?')[0]))
    .filter(url => !filterCommon || !isCommonFile(url));
  const styles = filterCommon ? data.styles.filter(s => !isCommonFile(s.href)) : data.styles;

  let html = '';

  if (vi) {
    html += '<div class="section"><div class="section-title">화면 정보</div><ul class="file-list">';
    if (vi.viewNm)          html += `<li><span class="tag tag-start">화면명</span>${vi.viewNm}${vi.viewDesc ? ' — ' + vi.viewDesc : ''}</li>`;
                            html += `<li><span class="tag tag-script">URL</span>${data.url}</li>`;
    if (vi.viewJspPath)     html += `<li><span class="tag tag-nav">JSP</span>${vi.viewJspPath}</li>`;
    if (vi.viewProgramPath) html += `<li class="main-file"><span class="tag tag-main">JS</span>${vi.viewProgramPath}</li>`;
    if (vi.viewId)          html += `<li><span class="tag tag-script">viewId</span>${vi.viewId}</li>`;
    if (vi.defMenuId)       html += `<li><span class="tag tag-script">menuId</span>${vi.defMenuId}</li>`;
    html += '</ul></div>';
  }

  const jsCount = scripts.length + reqFiles.length;
  html += `<div class="section"><div class="section-title">JS 파일 <span class="count">${jsCount}</span></div>`;
  if (jsCount > 0) {
    html += '<ul class="file-list">';
    scripts.forEach(s => {
      const cls = s.isMain ? ' main-file' : '';
      const tag = s.isMain ? '<span class="tag tag-main">MAIN</span>' : '<span class="tag tag-script">script</span>';
      html += `<li class="${cls}">${tag}${shortenUrl(s.src)}</li>`;
    });
    reqFiles.forEach(url => {
      const isMainView = mainViewUrl && url === mainViewUrl;
      const cls = isMainView ? ' main-file' : '';
      const tag = isMainView
        ? '<span class="tag tag-main">MAIN VIEW</span>'
        : '<span class="tag tag-require">require</span>';
      html += `<li class="${cls}">${tag}${shortenUrl(url)}</li>`;
    });
    html += '</ul>';
  } else html += '<div style="color:#9ca3af;font-size:12px;">JS 파일 없음</div>';
  html += '</div>';

  html += `<div class="section"><div class="section-title">CSS 파일 <span class="count">${styles.length}</span></div>`;
  if (styles.length > 0) {
    html += '<ul class="file-list">';
    styles.forEach(s => html += `<li><span class="tag tag-style">css</span>${shortenUrl(s.href)}</li>`);
    html += '</ul>';
  } else html += '<div style="color:#9ca3af;font-size:12px;">CSS 파일 없음</div>';
  html += '</div>';
  return html;
}

let lastExtractData = null;

document.getElementById('extractBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN', func: extractPageInfo
    });
    const data = results[0].result;
    lastExtractData = data;

    document.getElementById('pageInfo').style.display = 'block';
    const vi = data.viewInfo;
    const displayName = vi && vi.viewNm ? vi.viewNm : data.title;
    const displaySub = vi && vi.viewProgramPath
      ? `<span style="color:#2563eb;font-weight:600;">${vi.viewProgramPath}</span>`
      : data.url;
    document.getElementById('pageInfo').innerHTML = `<strong>${displayName}</strong><br>${displaySub}`;
    document.getElementById('filterRow').classList.add('show');
    document.getElementById('extractResult').innerHTML =
      renderExtractResult(data, document.getElementById('filterCommon').checked);
    document.getElementById('copyExtractBtn').style.display = 'inline-block';
  } catch (err) {
    document.getElementById('extractResult').innerHTML =
      `<div class="empty" style="color:#ef4444;">추출 실패<br><span style="font-size:11px;">${err.message}</span></div>`;
  }
});

document.getElementById('filterCommon').addEventListener('change', () => {
  if (!lastExtractData) return;
  document.getElementById('extractResult').innerHTML =
    renderExtractResult(lastExtractData, document.getElementById('filterCommon').checked);
});

document.getElementById('copyExtractBtn').addEventListener('click', async () => {
  if (!lastExtractData) return;
  await navigator.clipboard.writeText(
    toExtractMarkdown(lastExtractData, document.getElementById('filterCommon').checked)
  );
  flashCopied('copyExtractBtn');
});

// ============================================================
// 접근경로 녹화 기능
// ============================================================

function renderRecordResult(steps) {
  if (!steps || steps.length === 0) {
    return '<div class="empty">녹화된 경로가 없습니다.</div>';
  }

  // elements_map은 표시 제외
  const visible = steps.filter(s => s.type !== 'elements_map');

  let html = '<div class="section"><div class="section-title">접근경로 <span class="count">' +
    visible.length + ' steps</span></div><ul class="file-list">';

  visible.forEach((step) => {
    if (step.type === 'start') {
      html += `<li><span class="tag tag-start">시작</span>${shortenUrl(step.url)}` +
        (step.title ? `<span class="step-text">(${step.title})</span>` : '') + '</li>';
    } else if (step.type === 'navigate') {
      html += `<li><span class="tag tag-nav">이동</span>${shortenUrl(step.toUrl || step.url)}</li>`;
    } else if (step.type === 'click') {
      const text = step.text ? `<span class="step-text">("${step.text}")</span>` : '';
      html += `<li><span class="tag tag-click">클릭</span>${step.selector} ${text}</li>`;
    } else if (step.type === 'input') {
      const val = step.value !== undefined ? `<span class="step-text">→ "${step.value}"</span>` : '';
      html += `<li><span class="tag tag-input">입력</span>${step.selector} ${val}</li>`;
    } else if (step.type === 'assert') {
      const a = step.assertType === 'url' ? ('URL = ' + (step.expected || ''))
        : step.assertType === 'containsText' ? ((step.selector || step.text || '') + ' ⊇ "' + (step.expected || '') + '"')
        : ((step.text || step.selector || '') + ' 보임');
      html += `<li><span class="tag tag-assert">검증</span>${a}</li>`;
    } else if (step.type === 'screenshot') {
      const thumb = step.imageData
        ? `<img class="screenshot-thumb" src="${step.imageData}" alt="screenshot">`
        : '';
      html += `<li class="screenshot-step"><span class="tag tag-screenshot">화면</span>${shortenUrl(step.url)} ${thumb}</li>`;
    }
  });

  html += '</ul></div>';
  return html;
}

function toRecordMarkdown(steps) {
  if (!steps || steps.length === 0) return '';
  const lines = ['## 접근경로', ''];
  let idx = 0;
  steps.forEach((step) => {
    if (step.type === 'start') {
      lines.push(`- 시작: ${step.url}${step.title ? ' (' + step.title + ')' : ''}`);
    } else if (step.type === 'navigate') {
      lines.push(`${++idx}. navigate: ${step.toUrl || step.url}`);
    } else if (step.type === 'click') {
      const text = step.text ? ` ("${step.text}")` : '';
      lines.push(`${++idx}. click: ${step.selector}${text}`);
    } else if (step.type === 'input') {
      lines.push(`${++idx}. input: ${step.selector} → "${step.value}"`);
    } else if (step.type === 'assert') {
      const a = step.assertType === 'url' ? ('URL = ' + (step.expected || ''))
        : step.assertType === 'containsText' ? ((step.selector || step.text || '') + ' contains "' + (step.expected || '') + '"')
        : ((step.text || step.selector || '') + ' visible');
      lines.push(`${++idx}. assert: ${a}`);
    } else if (step.type === 'elements_map' && step.elements) {
      lines.push(`${++idx}. elements_map:`);
      lines.push('```json');
      lines.push(JSON.stringify(step.elements, null, 2));
      lines.push('```');
    }
  });
  return lines.join('\n');
}

// 녹화 시작/중지
document.getElementById('recordBtn').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['recording']);

  if (data.recording) {
    // 중지
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try { await chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' }); } catch {}
    }
    await chrome.storage.local.set({ recording: false });
    updateRecordUI();
  } else {
    // 시작
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // 초기화: 시작 페이지를 첫 step으로
    const startStep = { type: 'start', timestamp: Date.now(), url: tab.url, title: tab.title };
    await chrome.storage.local.set({ recording: true, steps: [startStep] });

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'startRecording' });
    } catch {
      // content script가 아직 없을 수 있음 — inject
      await chrome.scripting.executeScript({
        target: { tabId: tab.id }, files: ['src/content/content.js']
      });
      await chrome.tabs.sendMessage(tab.id, { action: 'startRecording' });
    }

    // popup 닫힘 (녹화 중에는 페이지와 상호작용해야 하므로)
    window.close();
  }
});

// 초기화
document.getElementById('clearBtn').addEventListener('click', async () => {
  await chrome.storage.local.set({ recording: false, steps: [] });
  updateRecordUI();
});

// 복사
document.getElementById('copyRecordBtn').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['steps']);
  const md = toRecordMarkdown(data.steps || []);
  await navigator.clipboard.writeText(md);
  flashCopied('copyRecordBtn');
});

// Playwright 시나리오 편집기 열기 (별도 탭)
document.getElementById('openEditorBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/editor/editor.html') });
});

// UI 상태 업데이트
async function updateRecordUI() {
  const data = await chrome.storage.local.get(['recording', 'steps']);
  const recording = data.recording;
  const steps = data.steps || [];

  const btn = document.getElementById('recordBtn');
  const status = document.getElementById('recordingStatus');
  const copyBtn = document.getElementById('copyRecordBtn');
  const editorBtn = document.getElementById('openEditorBtn');
  const clearBtn = document.getElementById('clearBtn');

  if (recording) {
    btn.textContent = '녹화 중지';
    btn.classList.add('recording');
    status.style.display = 'flex';
  } else {
    btn.textContent = '녹화 시작';
    btn.classList.remove('recording');
    status.style.display = 'none';
  }

  document.getElementById('recordResult').innerHTML = renderRecordResult(steps);

  if (steps.length > 0 && !recording) {
    copyBtn.style.display = 'inline-block';
    editorBtn.style.display = 'inline-block';
    clearBtn.style.display = 'inline-block';
  } else {
    copyBtn.style.display = 'none';
    editorBtn.style.display = 'none';
    clearBtn.style.display = 'none';
  }
}

// ---- 유틸 ----
function flashCopied(btnId) {
  const btn = document.getElementById(btnId);
  btn.textContent = '복사됨!';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = '복사'; btn.classList.remove('copied'); }, 1500);
}

// ============================================================
// 설정 탭 — 도메인별 API 토큰 관리 (F3 사용자 전환)
// chrome.storage.local: domainTokens = { "<host>": { clientKey, label } }
// ============================================================

const DOMAIN_TOKENS_KEY = 'domainTokens';

async function loadDomainTokens() {
  const data = await chrome.storage.local.get([DOMAIN_TOKENS_KEY]);
  return data[DOMAIN_TOKENS_KEY] || {};
}

async function saveDomainTokens(map) {
  await chrome.storage.local.set({ [DOMAIN_TOKENS_KEY]: map });
}

function maskToken(t) {
  if (!t) return '';
  return t.length <= 8 ? '****' : t.slice(0, 4) + '****' + t.slice(-4);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderTokenList() {
  const map = await loadDomainTokens();
  const ul = document.getElementById('tokenList');
  const domains = Object.keys(map);

  if (!domains.length) {
    ul.innerHTML = '<li style="color:#9ca3af;border:none;background:none;padding:4px 0;">등록된 도메인이 없습니다.</li>';
    return;
  }

  ul.innerHTML = domains.map(d => {
    const entry = map[d];
    const label = entry.label ? ` <span style="color:#6b7280;">(${escapeHtml(entry.label)})</span>` : '';
    return `<li style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span style="word-break:break-all;">
          <strong>${escapeHtml(d)}</strong>${label}<br>
          <span style="color:#9ca3af;font-size:10px;">${escapeHtml(maskToken(entry.clientKey))}</span>
        </span>
        <a class="token-del" data-domain="${escapeHtml(d)}"
           style="color:#dc2626;cursor:pointer;white-space:nowrap;text-decoration:none;">[삭제]</a>
      </li>`;
  }).join('');

  ul.querySelectorAll('.token-del').forEach(a => {
    a.onclick = async () => {
      const m = await loadDomainTokens();
      delete m[a.dataset.domain];
      await saveDomainTokens(m);
      renderTokenList();
    };
  });
}

document.getElementById('fillCurrentDomainBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    try { document.getElementById('tokenDomainInput').value = new URL(tab.url).hostname; } catch {}
  }
});

document.getElementById('tokenAddBtn').addEventListener('click', async () => {
  const domain = document.getElementById('tokenDomainInput').value.trim();
  const clientKey = document.getElementById('tokenKeyInput').value.trim();
  const label = document.getElementById('tokenLabelInput').value.trim();
  const statusEl = document.getElementById('tokenStatus');

  if (!domain || !clientKey) {
    statusEl.style.color = '#dc2626';
    statusEl.textContent = '도메인과 clientKey 토큰을 모두 입력하세요.';
    return;
  }

  const map = await loadDomainTokens();
  map[domain] = { clientKey, label };
  await saveDomainTokens(map);

  document.getElementById('tokenDomainInput').value = '';
  document.getElementById('tokenKeyInput').value = '';
  document.getElementById('tokenLabelInput').value = '';
  statusEl.style.color = '#059669';
  statusEl.textContent = '✓ 등록됨: ' + domain;
  renderTokenList();
});

// ---- 초기 로드 ----
(async () => {
  await renderTokenList();
})();

updateRecordUI();
