/* ScooPitch アクセス解析・広告の効果測定（Google アナリティクス 4 / Meta ピクセル / LinkedIn Insight タグ）
 *
 * - 下の CONFIG に各サービスの ID を入れると有効になる（空のままなら何も読み込まない）。ID は秘密の情報ではない。
 * - ヨーロッパの時間帯（Europe/...）の人には、Cookie の同意バナーを出し、「同意する」まではタグを読み込まない
 *   （EU・英国などの GDPR / ePrivacy 対策）。それ以外の地域では、プライバシーポリシーでの公表（外部送信規律）のうえで読み込む。
 * - どの地域の人も「Cookie の設定」からいつでも拒否・同意を切り替えられる（localStorage: ns_consent）。
 * - アプリからは NSA.event('sign_up') / NSA.page() のように呼ぶ。読み込み前の呼び出しはためておき、読み込み後に送る。
 */
(function () {
  'use strict';

  var CONFIG = {
    ga4: 'G-JYYM8G6H7E',             // Google アナリティクス 4 の測定ID
    metaPixel: '',                   // Meta ピクセル（データセット）ID（数字）
    linkedin: '',                    // LinkedIn Insight タグのパートナーID（数字）
    linkedinConversions: {},         // LinkedIn のコンバージョンID（例: { sign_up: '12345678' }）
  };
  var KEY = 'ns_consent';

  // アプリのイベント名 → Meta の標準イベント（ないものはカスタムイベントで送る）
  var META_EVENTS = { sign_up: 'CompleteRegistration' };

  function active() { return !!(CONFIG.ga4 || CONFIG.metaPixel || CONFIG.linkedin); }
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function inEurope() {
    try { return /^Europe\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); } catch (e) { return false; }
  }
  function allowed() {
    var s = stored();
    if (s === 'denied') return false;
    if (s === 'granted') return true;
    return !inEurope();
  }
  function tr(s) { return window.I18N ? window.I18N.t(s) : s; }

  var loaded = false;
  var queue = [];

  function addScript(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  function load() {
    if (loaded || !active()) return;
    loaded = true;
    if (CONFIG.ga4) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      // 画面の切り替え（#home など）を自分で送るので、自動のページビューは止める
      window.gtag('config', CONFIG.ga4, { send_page_view: false });
      addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CONFIG.ga4));
    }
    if (CONFIG.metaPixel) {
      /* Meta ピクセルの公式の読み込み手順を、読みやすく書き直したもの */
      var f = window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
      if (!window._fbq) window._fbq = f;
      f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
      addScript('https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', CONFIG.metaPixel);
    }
    if (CONFIG.linkedin) {
      window._linkedin_partner_id = CONFIG.linkedin;
      window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
      window._linkedin_data_partner_ids.push(CONFIG.linkedin);
      if (!window.lintrk) {
        window.lintrk = function (a, b) { window.lintrk.q.push([a, b]); };
        window.lintrk.q = [];
      }
      addScript('https://snap.licdn.com/li.lms-analytics/insight.min.js');
    }
    var q = queue; queue = [];
    for (var i = 0; i < q.length; i++) q[i]();
  }

  function run(fn) {
    if (!active() || !allowed()) return;
    if (loaded) fn(); else queue.push(fn);
  }

  var lastPage = '';
  function page() {
    if (!active() || !allowed()) return;
    if (location.href === lastPage) return; // 同じ画面を二重に数えない
    lastPage = location.href;
    run(function () {
      if (window.gtag && CONFIG.ga4) {
        window.gtag('event', 'page_view', { page_location: location.href, page_title: document.title });
      }
      if (window.fbq && CONFIG.metaPixel) window.fbq('track', 'PageView');
    });
  }

  function event(name, params) {
    run(function () {
      if (window.gtag && CONFIG.ga4) window.gtag('event', name, params || {});
      if (window.fbq && CONFIG.metaPixel) {
        if (META_EVENTS[name]) window.fbq('track', META_EVENTS[name], params || {});
        else window.fbq('trackCustom', name, params || {});
      }
      var conv = CONFIG.linkedinConversions[name];
      if (window.lintrk && CONFIG.linkedin && conv) window.lintrk('track', { conversion_id: Number(conv) });
    });
  }

  // ── Cookie の同意バナー ──
  function closeBanner() {
    var b = document.getElementById('ns-consent');
    if (b) b.remove();
  }
  function choose(v) {
    store(v);
    closeBanner();
    if (v === 'granted') { load(); page(); }
    else if (loaded) location.reload(); // 読み込み済みのタグを止めるため、拒否したら読み込み直す
  }
  function showBanner() {
    if (!active() || document.getElementById('ns-consent')) return;
    var b = document.createElement('div');
    b.id = 'ns-consent';
    b.className = 'consent-banner';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', tr('Cookie の設定'));
    b.innerHTML =
      '<p>' + tr('アクセス解析と広告の効果測定のために Cookie を使います。') +
      ' <a href="/legal/privacy.html#cookie" target="_blank" rel="noopener">' + tr('詳しく見る') + '</a></p>' +
      '<div class="consent-btns">' +
      '<button type="button" class="consent-no">' + tr('拒否する') + '</button>' +
      '<button type="button" class="consent-yes">' + tr('同意する') + '</button></div>';
    b.querySelector('.consent-yes').addEventListener('click', function () { choose('granted'); });
    b.querySelector('.consent-no').addEventListener('click', function () { choose('denied'); });
    document.body.appendChild(b);
  }

  window.NSA = {
    event: event,
    page: page,
    get active() { return active(); },
    // 「Cookie の設定」から、いつでも選び直せる
    openSettings: function () {
      if (!active()) { alert(tr('現在、アクセス解析や広告の Cookie は使っていません。')); return; }
      showBanner();
    },
  };

  function start() {
    if (!active()) return;
    if (allowed()) { load(); page(); }
    else if (!stored()) showBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
