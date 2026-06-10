// ============================================================
// UniFLOW DevTool - Background Service Worker
// ============================================================

// ---- 서비스 계정 JWT 인증 ----

function base64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlEncodeBuffer(buffer) {
  let str = '';
  new Uint8Array(buffer).forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function importPrivateKey(pem) {
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(pemBody);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8', buf.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

async function getServiceAccountToken(credentials) {
  const scope = [
    'https://www.googleapis.com/auth/spreadsheets'
  ].join(' ');

  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64urlEncode(JSON.stringify({
    iss: credentials.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));

  const sigInput = `${header}.${payload}`;
  const key = await importPrivateKey(credentials.private_key);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(sigInput)
  );

  const jwt = `${sigInput}.${base64urlEncodeBuffer(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('토큰 획득 실패: ' + JSON.stringify(data));
  return data.access_token;
}

// ---- Sheets: 첫 번째 시트명 조회 ----
async function getFirstSheetName(token, spreadsheetId) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (data.error) throw new Error('시트 정보 조회 실패: ' + data.error.message);
  return data.sheets[0].properties.title;
}

// ---- Sheets: 행 추가 ----
async function appendToSheet(token, spreadsheetId, sheetName, rows) {
  const range = encodeURIComponent(sheetName);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows })
    }
  );
  const data = await res.json();
  if (data.error) throw new Error('Sheets 기록 실패: ' + data.error.message);
  return data;
}

// ---- steps → Sheets 행 변환 ----
function stepsToSheetRows(steps) {
  return steps
    .filter(s => !['screenshot', 'elements_map'].includes(s.type))
    .map(step => {
      const time = new Date(step.timestamp).toLocaleString('ko-KR');
      const url = step.url || '';
      const title = step.title || '';
      const stepType = step.type;
      const selector = step.selector || '';
      const text = step.text || (step.type === 'navigate' ? (step.toUrl || '') : '');
      const inputValue = step.value || '';
      return [time, url, title, stepType, selector, text, inputValue];
    });
}

// ---- 메시지 수신 ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'saveToGoogle') {
    handleSaveToGoogle(msg).then(sendResponse).catch(err => {
      console.warn('[UniFLOW DevTool] google save error:', err);
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
});

async function handleSaveToGoogle(msg) {
  const { spreadsheetId } = msg;
  if (!spreadsheetId) throw new Error('spreadsheetId 없음');

  const stored = await chrome.storage.local.get(['serviceAccountCredentials']);
  const credentials = stored.serviceAccountCredentials;
  if (!credentials || !credentials.client_email || !credentials.private_key) {
    throw new Error('서비스 계정 JSON이 설정되지 않았습니다.');
  }

  const token = await getServiceAccountToken(credentials);
  const sheetName = await getFirstSheetName(token, spreadsheetId);

  const data = await chrome.storage.local.get(['steps']);
  const steps = data.steps || [];

  const header = [['시간', 'URL', '제목', 'step_type', 'selector', 'text', 'input_value']];
  await appendToSheet(token, spreadsheetId, sheetName, header);
  await appendToSheet(token, spreadsheetId, sheetName, stepsToSheetRows(steps));

  return { ok: true, sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` };
}
