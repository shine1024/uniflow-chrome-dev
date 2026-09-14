// ============================================================
// UniFLOW DevTool - Network Hook (MAIN world)
// 페이지의 fetch/XHR 을 관찰해 녹화 중 발생한 API 요청(메서드·URL·상태·시각)을 수집한다.
// 목적: 액션이 유발한 API 응답을 timestamp 로 상관해 waitForTimeout 대신 waitForResponse 생성.
// chrome.* 접근 불가(MAIN world) → window.postMessage 로 ISOLATED content.js 와 통신.
// ============================================================
(function () {
  if (window.__uniflowNetHook) return;   // 중복 주입 방지 (document_start · 재주입 대비)
  window.__uniflowNetHook = true;

  var RING_MAX = 100;
  var ring = [];       // enable 이전 버퍼 — 문서 로드 직후(네비게이션 후) 요청까지 보존
  var active = false;  // 녹화 중에만 live 전송

  function record(evt) {
    if (active) {
      post(evt);
    } else {
      ring.push(evt);
      if (ring.length > RING_MAX) ring.shift();
    }
  }

  function post(evt) {
    try { window.postMessage({ source: 'uniflow-net', payload: evt }, '*'); } catch (e) { /* 직렬화 실패 무시 */ }
  }

  function flushRing() {
    var buf = ring;
    ring = [];
    for (var i = 0; i < buf.length; i++) post(buf[i]);
  }

  // ---- 제어 메시지 수신 (content.js → hook) ----
  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || e.data.source !== 'uniflow-net-ctrl') return;
    if (e.data.type === 'enable') { active = true; flushRing(); }
    else if (e.data.type === 'disable') { active = false; ring = []; }
  }, false);

  function absUrl(u) {
    try { return new URL(u, document.baseURI).href; } catch (e) { return String(u || ''); }
  }

  // ---- fetch 래핑 ----
  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      var url = absUrl(typeof input === 'string' ? input : (input && input.url) || '');
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var startedAt = Date.now();
      return origFetch.apply(this, arguments).then(function (res) {
        record({ type: 'fetch', method: method, url: url, status: res.status, startedAt: startedAt, endedAt: Date.now() });
        return res;
      }, function (err) {
        record({ type: 'fetch', method: method, url: url, status: 0, startedAt: startedAt, endedAt: Date.now() });
        throw err;
      });
    };
  }

  // ---- XMLHttpRequest 래핑 ----
  var XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    var origOpen = XHR.prototype.open;
    var origSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__uniflowNet = { method: (method || 'GET').toUpperCase(), url: absUrl(url) };
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      var meta = this.__uniflowNet;
      if (meta) {
        var xhr = this;
        meta.startedAt = Date.now();
        this.addEventListener('loadend', function () {
          record({ type: 'xhr', method: meta.method, url: meta.url, status: xhr.status, startedAt: meta.startedAt, endedAt: Date.now() });
        });
      }
      return origSend.apply(this, arguments);
    };
  }
})();
