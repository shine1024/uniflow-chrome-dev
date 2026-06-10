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
    } else if (step.type === 'screenshot') {
      const thumb = step.imageData
        ? `<img class="screenshot-thumb" src="${step.imageData}" alt="screenshot">`
        : (step.driveFileId ? `<img class="screenshot-thumb" src="https://drive.google.com/uc?id=${step.driveFileId}" alt="screenshot">` : '');
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
        target: { tabId: tab.id }, files: ['content.js']
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

// UI 상태 업데이트
async function updateRecordUI() {
  const data = await chrome.storage.local.get(['recording', 'steps']);
  const recording = data.recording;
  const steps = data.steps || [];

  const btn = document.getElementById('recordBtn');
  const status = document.getElementById('recordingStatus');
  const copyBtn = document.getElementById('copyRecordBtn');
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
    clearBtn.style.display = 'inline-block';
  } else {
    copyBtn.style.display = 'none';
    clearBtn.style.display = 'none';
  }
}

// ============================================================
// Google 저장 기능
// ============================================================

// 스프레드시트 ID 로드/저장
async function loadSheetId() {
  const data = await chrome.storage.sync.get(['spreadsheetId']);
  return data.spreadsheetId || '';
}

async function saveSheetId(id) {
  await chrome.storage.sync.set({ spreadsheetId: id.trim() });
}

document.getElementById('sheetIdSaveBtn').addEventListener('click', async () => {
  const id = document.getElementById('sheetIdInput').value.trim();
  if (!id) return;
  await saveSheetId(id);
  document.getElementById('sheetIdInput').value = '';
  document.getElementById('sheetIdInput').placeholder = '(이미 저장됨 — 변경 시 새로 입력)';
  const statusEl = document.getElementById('sheetIdStatus');
  statusEl.style.color = '#059669';
  statusEl.textContent = '✓ 저장됨';
});

document.getElementById('saveToGoogleBtn').addEventListener('click', async () => {
  const sheetId = await loadSheetId();
  if (!sheetId) {
    document.getElementById('googleSaveStatus').textContent = '설정 탭에서 스프레드시트 ID를 먼저 입력해주세요.';
    document.getElementById('googleSaveStatus').style.color = '#dc2626';
    return;
  }

  const statusEl = document.getElementById('googleSaveStatus');
  statusEl.style.color = '#6b7280';
  statusEl.textContent = '저장 중...';

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'saveToGoogle',
      spreadsheetId: sheetId
    });

    if (result.ok) {
      statusEl.innerHTML = `완료! <a href="${result.sheetUrl}" target="_blank" style="color:#2563eb;">시트 열기</a>`;
    } else {
      statusEl.textContent = '저장 실패: ' + (result.error || '알 수 없는 오류');
      statusEl.style.color = '#dc2626';
    }
  } catch (err) {
    statusEl.textContent = '저장 실패: ' + err.message;
    statusEl.style.color = '#dc2626';
  }
});

// ---- 유틸 ----
function flashCopied(btnId) {
  const btn = document.getElementById(btnId);
  btn.textContent = '복사됨!';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = '복사'; btn.classList.remove('copied'); }, 1500);
}

// ============================================================
// 설정 탭 — 서비스 계정 관리
// ============================================================

async function loadCredentialsStatus() {
  const data = await chrome.storage.local.get(['serviceAccountCredentials']);
  const creds = data.serviceAccountCredentials;
  const statusEl = document.getElementById('credentialsStatus');
  if (creds && creds.client_email) {
    statusEl.style.color = '#059669';
    statusEl.textContent = '✓ 설정됨: ' + creds.client_email;
    document.getElementById('serviceAccountJson').value = '';
    document.getElementById('serviceAccountJson').placeholder = '(이미 저장됨 — 변경 시 새로 붙여넣기)';
  } else {
    statusEl.textContent = '';
  }
}

document.getElementById('saveCredentialsBtn').addEventListener('click', async () => {
  const raw = document.getElementById('serviceAccountJson').value.trim();
  if (!raw) return;
  const statusEl = document.getElementById('credentialsStatus');
  try {
    const creds = JSON.parse(raw);
    if (!creds.client_email || !creds.private_key) throw new Error('client_email / private_key 필드 없음');
    await chrome.storage.local.set({ serviceAccountCredentials: creds });
    statusEl.style.color = '#059669';
    statusEl.textContent = '✓ 저장됨: ' + creds.client_email;
    document.getElementById('serviceAccountJson').value = '';
    document.getElementById('serviceAccountJson').placeholder = '(이미 저장됨 — 변경 시 새로 붙여넣기)';
  } catch (e) {
    statusEl.style.color = '#dc2626';
    statusEl.textContent = '오류: ' + e.message;
  }
});

document.getElementById('clearCredentialsBtn').addEventListener('click', async () => {
  await chrome.storage.local.remove(['serviceAccountCredentials']);
  document.getElementById('credentialsStatus').textContent = '';
  document.getElementById('credentialsStatus').style.color = '#6b7280';
  document.getElementById('serviceAccountJson').value = '';
  document.getElementById('serviceAccountJson').placeholder =
    '{"type":"service_account","project_id":"...","client_email":"...","private_key":"...",...}';
});

// ---- 초기 로드 ----
(async () => {
  const savedId = await loadSheetId();
  if (savedId) {
    document.getElementById('sheetIdInput').placeholder = '(이미 저장됨 — 변경 시 새로 입력)';
    document.getElementById('sheetIdStatus').style.color = '#059669';
    document.getElementById('sheetIdStatus').textContent = '✓ 저장됨';
  }
  await loadCredentialsStatus();
})();

updateRecordUI();
