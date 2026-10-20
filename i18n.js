/* NewSpeak 多言語化（i18n）
 *
 * 画面の文言は日本語のまま HTML / JS に書き、ここで利用者の言語に置き換える。
 * 訳は i18n/<言語>.js に「日本語の原文 → 訳」の形で並べてある（日本語は原文そのものなので辞書なし）。
 *
 * 仕組み
 * - このファイルは <head> の先頭で読み込む。言語を決め、その言語の辞書を同期的に読み込む。
 * - MutationObserver でページ全体を見張り、追加・変更された文字（テキスト・placeholder・title・aria-label・alt）を
 *   辞書で置き換える。HTML を読み込む途中から働くので、日本語が一瞬見えることはない。
 *   JS が後から差し込む文言（エラーメッセージなど）も自動で訳される。
 * - <strong> や <br> を含む文は、要素の innerHTML 全体を1つの原文として訳す（語順が言語ごとに違うため）。
 * - 数値などを埋め込む文は JS 側で I18N.t('今日練習しないと {n}日の記録が途切れます', {n}) のように書く。
 * - AIの返答・利用者の入力・記事本文など、訳してはいけない場所は SKIP_SELECTOR で除外する。
 * - 言語は 1) 利用者が選んだ言語（localStorage: ns_lang） 2) ブラウザの言語 3) 日本語 の順で決める。
 */
(function () {
  'use strict';

  var LANGS = {
    ja: { name: '日本語', locale: 'ja-JP', ai: 'Japanese', home: 'Japan', homeShort: 'Japan' },
    ko: { name: '한국어', locale: 'ko-KR', ai: 'Korean', home: 'South Korea', homeShort: 'Korea' },
    'zh-TW': { name: '繁體中文', locale: 'zh-TW', ai: 'Traditional Chinese as used in Taiwan', home: 'Taiwan', homeShort: 'Taiwan' },
    fr: { name: 'Français', locale: 'fr-FR', ai: 'French', home: 'France', homeShort: 'France' },
    es: { name: 'Español', locale: 'es-ES', ai: 'Spanish', home: 'Spain', homeShort: 'Spain' },
  };
  var ORDER = ['ja', 'ko', 'zh-TW', 'fr', 'es'];
  var STORE_KEY = 'ns_lang';

  // 訳さない場所（AIの返答、利用者の入力、記事のタイトル・本文、メールアドレスなど）
  var SKIP_SELECTOR = [
    'script', 'style', 'textarea', '[translate="no"]',
    '.bubble', '.translation', '.feedback-text', '.strip-title', '#a-summary', '#a-source',
    '.result-title', '.mt-recent-title', '.mt-recent-scene', '.vocab-word', '.vocab-note',
    '.rv-word', '.rv-note', '.best-phrase', '.best-why', '.improve-text', '#yesterday-title',
    '.last-title', '#nav-email', '#acc-email', '.lang-switch',
  ].join(',');
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var INLINE_TAGS = { STRONG: 1, EM: 1, B: 1, I: 1, BR: 1, SMALL: 1, A: 1 };

  function matchLang(code) {
    if (!code) return null;
    var c = String(code).toLowerCase();
    if (c === 'ja' || c.indexOf('ja-') === 0) return 'ja';
    if (c === 'ko' || c.indexOf('ko-') === 0) return 'ko';
    if (c === 'zh-tw' || c === 'zh-hk' || c === 'zh-mo' || c.indexOf('zh-hant') === 0) return 'zh-TW';
    if (c === 'fr' || c.indexOf('fr-') === 0) return 'fr';
    if (c === 'es' || c.indexOf('es-') === 0) return 'es';
    return null;
  }
  function detect() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (q && LANGS[q]) return q;
    try { var s = localStorage.getItem(STORE_KEY); if (s && LANGS[s]) return s; } catch (e) {}
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
    for (var i = 0; i < list.length; i++) { var m = matchLang(list[i]); if (m) return m; }
    return 'ja';
  }

  var dicts = {};          // lang -> { 原文: 訳 }
  var reverse = {};        // lang -> { 訳: 原文 }（言語を切り替えるときの手がかり）
  var origText = new WeakMap();   // テキストノード -> 原文
  var origBlock = new WeakMap();  // innerHTML 単位で訳した要素 -> 原文
  var origAttr = new WeakMap();   // 要素 -> { 属性名: 原文 }
  var applied = new WeakMap();    // ノード -> { v: 最後にこちらで書き込んだ値, lang }
  var listeners = [];
  var lang = detect();

  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function dict() { return dicts[lang] || null; }
  function lookup(key) {
    if (lang === 'ja') return null;
    var d = dict();
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    // 開発用：訳が見つからない日本語を集める（window.NS_I18N_MISSING に Set を置いたときだけ）
    if (window.NS_I18N_MISSING && /[\u3040-\u30ff\u4e00-\u9fff]/.test(key)) window.NS_I18N_MISSING.add(key);
    return null;
  }
  // 画面上の文字から原文（日本語）を探す。こちらで訳した記録がなければ、各言語の訳から逆引きする
  function sourceOf(value) {
    var v = norm(value);
    if (!v) return null;
    for (var l in reverse) {
      if (Object.prototype.hasOwnProperty.call(reverse[l], v)) return reverse[l][v];
    }
    return v;
  }
  function format(s, params) {
    if (!params) return s;
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : m;
    });
  }
  function skipped(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    return !el || !!el.closest(SKIP_SELECTOR);
  }

  // こちらで最後に書き込んだ値と言語を覚えておき、自分の変更や同じ言語への二重の書き込みを避ける
  function translateTextNode(node) {
    var v = node.nodeValue;
    if (!v || !/\S/.test(v)) return;
    var a = applied.get(node);
    var ours = !!a && a.v === v;
    if (ours && a.lang === lang) return;
    var key = ours ? origText.get(node) : sourceOf(v);
    if (!key) return;
    var foreign = ours || key !== norm(v); // いま表示されているのが訳文（＝原文に戻す必要がある）
    var tr = lang === 'ja' ? null : lookup(key);
    if (tr == null) tr = foreign ? key : null;
    if (tr == null) return;
    var lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
    var next = lead + tr + trail;
    origText.set(node, key);
    applied.set(node, { v: next, lang: lang });
    if (next !== v) node.nodeValue = next;
  }

  function translateAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var name = ATTRS[i];
      if (!el.hasAttribute(name)) continue;
      var v = el.getAttribute(name);
      var rec = origAttr.get(el) || {};
      var mine = applied.get(el) || {};
      var a = mine[name];
      var ours = !!a && a.v === v;
      if (ours && a.lang === lang) continue;
      var key = ours ? rec[name] : sourceOf(v);
      if (!key) continue;
      var foreign = ours || key !== norm(v);
      var tr = lang === 'ja' ? null : lookup(key);
      if (tr == null) tr = foreign ? key : null;
      if (tr == null) continue;
      rec[name] = key; mine[name] = { v: tr, lang: lang };
      origAttr.set(el, rec); applied.set(el, mine);
      if (tr !== v) el.setAttribute(name, tr);
    }
  }

  // <strong> や <br> だけを含む文は innerHTML 単位で訳す
  function isBlock(el) {
    var hasEl = false, hasText = false;
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1) {
        if (!INLINE_TAGS[c.tagName]) return false;
        for (var g = c.firstChild; g; g = g.nextSibling) if (g.nodeType === 1 && !INLINE_TAGS[g.tagName]) return false;
        hasEl = true;
      } else if (c.nodeType === 3 && /\S/.test(c.nodeValue)) hasText = true;
    }
    return hasEl && hasText;
  }
  function translateBlock(el) {
    var html = norm(el.innerHTML);
    var mine = applied.get(el) || {};
    var a = mine.__html;
    var ours = !!a && a.v === html;
    if (ours && a.lang === lang) return true;
    var key = ours ? origBlock.get(el) : sourceOf(html);
    if (!key) return false;
    var foreign = ours || key !== html;
    var tr = lang === 'ja' ? null : lookup(key);
    if (tr == null) tr = foreign ? key : null;
    if (tr == null) return false;
    origBlock.set(el, key);
    el.innerHTML = tr;
    mine.__html = { v: norm(el.innerHTML), lang: lang };
    applied.set(el, mine);
    return true;
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipped(root)) translateTextNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    var start = root.nodeType === 9 ? root.documentElement : root;
    if (start && start.tagName === 'TEXTAREA') { translateAttrs(start); return; }
    if (!start || (start.nodeType === 1 && skipped(start))) return;
    var stack = [start];
    while (stack.length) {
      var el = stack.pop();
      if (el.nodeType === 1) {
        // 入力欄（textarea）は中身（利用者の入力）は訳さず、placeholder などの属性だけ訳す
        if (el.tagName === 'TEXTAREA') { translateAttrs(el); continue; }
        if (el.matches(SKIP_SELECTOR)) continue;
        translateAttrs(el);
        if ((origBlock.has(el) || isBlock(el)) && translateBlock(el)) continue;
      }
      for (var c = el.lastChild; c; c = c.previousSibling) {
        if (c.nodeType === 3) translateTextNode(c);
        else if (c.nodeType === 1) stack.push(c);
      }
    }
  }

  var observer = new MutationObserver(function (records) {
    if (lang === 'ja') return;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type === 'childList') {
        for (var j = 0; j < r.addedNodes.length; j++) {
          var n = r.addedNodes[j];
          if (n.isConnected) translateTree(n);
        }
        // innerHTML 単位で訳した要素の中身が書き換えられたら、その要素ごと訳し直す
        var t = r.target;
        if (t.nodeType === 1 && t.isConnected && !skipped(t) && isBlock(t)) translateBlock(t);
      } else if (r.type === 'characterData') {
        if (r.target.isConnected && !skipped(r.target)) translateTextNode(r.target);
      } else if (r.type === 'attributes') {
        if (r.target.isConnected && (r.target.tagName === 'TEXTAREA' || !skipped(r.target))) translateAttrs(r.target);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS,
  });

  function setHtmlLang() { document.documentElement.lang = lang; }

  function loadDict(l, cb) {
    if (l === 'ja' || dicts[l]) { cb(); return; }
    var s = document.createElement('script');
    s.src = (window.NS_I18N_BASE || '') + 'i18n/' + l + '.js';
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  window.I18N = {
    langs: LANGS,
    order: ORDER,
    get lang() { return lang; },
    get locale() { return LANGS[lang].locale; },
    get aiLanguage() { return LANGS[lang].ai; },
    get home() { return LANGS[lang].home; },
    get homeShort() { return LANGS[lang].homeShort; },
    // 辞書ファイルから呼ばれる
    add: function (l, table) {
      dicts[l] = dicts[l] || {};
      reverse[l] = reverse[l] || {};
      for (var k in table) {
        if (!Object.prototype.hasOwnProperty.call(table, k)) continue;
        var key = norm(k);
        dicts[l][key] = table[k];
        reverse[l][norm(table[k])] = key;
      }
    },
    // 「日@unit」のように @ 以降で同じ原文の使い分けを示せる（日本語では @ より前だけを表示）
    t: function (key, params) {
      var tr = lookup(norm(key));
      if (tr == null) tr = String(key).replace(/@[\w-]+$/, '');
      return format(tr, params);
    },
    has: function (key) { return lookup(norm(key)) != null; },
    apply: function (root) { translateTree(root || document); },
    onChange: function (fn) { listeners.push(fn); },
    set: function (l, done) {
      if (!LANGS[l]) return;
      try { localStorage.setItem(STORE_KEY, l); } catch (e) {}
      loadDict(l, function () {
        lang = l;
        setHtmlLang();
        translateTree(document);
        for (var i = 0; i < listeners.length; i++) { try { listeners[i](l); } catch (e) { console.error(e); } }
        if (done) done();
      });
    },
  };
  window.t = window.I18N.t;

  setHtmlLang();
  // 日本語以外は、その言語の辞書を HTML の読み込みを止めて先に読み込む（日本語が一瞬見えないように）
  if (lang !== 'ja') {
    document.write('<script src="' + (window.NS_I18N_BASE || '') + 'i18n/' + lang + '.js"><\/script>');
  }
  document.addEventListener('DOMContentLoaded', function () { if (lang !== 'ja') translateTree(document); });
})();
