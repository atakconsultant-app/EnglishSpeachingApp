/* トップページのスクロール演出。#s-intro がスクロールコンテナ。 */
(function () {
  var scroller = document.getElementById('s-intro');
  if (!scroller || !('IntersectionObserver' in window)) return;

  var features = document.getElementById('fx-features');
  var steps = document.getElementById('fx-steps');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STEP_VARIANTS = ['a', 'b', 'c', 'd', 'e', 'f'];

  document.documentElement.classList.add('fx-ready');

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    });
    requestUpdate();
  }, { root: scroller, threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

  function replay(section) {
    var items = section.querySelectorAll('[data-reveal]');
    items.forEach(function (el) { el.classList.remove('is-in', 'is-focus', 'was-focus', 'is-reached'); });
    void section.offsetWidth;
    items.forEach(function (el) { observer.observe(el); });
  }

  var clamp = function (v) { return Math.max(0, Math.min(1, v)); };

  function updateFeatures(view) {
    var cards = features.querySelectorAll('.feature-card');
    var focusLine = view.top + view.height * 0.6;
    var focus = null;
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      var shrink = 0;
      if (i < cards.length - 1 && !reduceMotion) {
        var next = cards[i + 1].getBoundingClientRect();
        shrink = clamp((r.bottom - next.top) / r.height);
      }
      cards[i].style.setProperty('--shrink', shrink.toFixed(3));
      if (r.top < focusLine && r.bottom > view.top) focus = cards[i];
    }
    cards.forEach(function (card) { card.classList.toggle('is-focus', card === focus); });
    if (focus) focus.classList.add('was-focus');
  }

  function reachedLine(view) { return view.top + view.height * 0.6; }

  function updateTimeline(view) {
    var list = steps.querySelector('.steps-list');
    var r = list.getBoundingClientRect();
    var line = reachedLine(view);
    list.style.setProperty('--p', clamp((line - r.top - 28) / (r.height - 56)).toFixed(3));
    steps.querySelectorAll('.step-item').forEach(function (item) {
      var n = item.querySelector('.step-num').getBoundingClientRect();
      item.classList.toggle('is-reached', n.top + n.height / 2 <= line);
    });
  }

  function updateProgress() {
    steps.style.setProperty('--done', steps.querySelectorAll('.step-item.is-in').length);
  }

  function setFocusByIndex(items, index) {
    items.forEach(function (item, i) { item.classList.toggle('is-focus', i === index); });
  }

  function updateHorizontal(view) {
    var stage = steps.querySelector('.steps-stage');
    var list = steps.querySelector('.steps-list');
    var items = steps.querySelectorAll('.step-item');
    steps.style.setProperty('--stage-h', view.height + 'px');
    var r = stage.getBoundingClientRect();
    var p = clamp((view.top - r.top) / Math.max(1, r.height - view.height));
    var distance = Math.max(0, list.scrollWidth - stage.clientWidth);
    list.style.setProperty('--hx', (p * distance).toFixed(1));
    setFocusByIndex(items, Math.min(items.length - 1, Math.floor(p * items.length)));
  }

  function updateRing(view) {
    var items = steps.querySelectorAll('.step-item');
    var center = view.top + view.height / 2;
    var index = 0;
    items.forEach(function (item, i) { if (item.getBoundingClientRect().top < center) index = i; });
    var first = items[0].getBoundingClientRect();
    var last = items[items.length - 1].getBoundingClientRect();
    var p = clamp((center - first.top) / Math.max(1, last.top + last.height / 2 - first.top));
    steps.querySelector('.steps-ring').style.setProperty('--p', Math.max(p, 0.04).toFixed(3));
    steps.querySelector('.steps-ring-num').textContent = String(index + 1);
    setFocusByIndex(items, index);
  }

  var ticking = false;
  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (!scroller.classList.contains('active')) return;
      var view = scroller.getBoundingClientRect();
      updateFeatures(view);
      var sx = steps.dataset.fx;
      if (sx === 'a') updateTimeline(view);
      if (sx === 'b') updateProgress();
      if (sx === 'd') updateHorizontal(view);
      if (sx === 'f') updateRing(view);
    });
  }

  function setStepVariant(value) {
    if (STEP_VARIANTS.indexOf(value) === -1 || steps.dataset.fx === value) return;
    steps.dataset.fx = value;
    document.querySelectorAll('.fx-switcher button[data-target="fx-steps"]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.value === value));
    });
    replay(steps);
    requestUpdate();
  }

  var VOICE_IMAGES = ['feature-voice', 'feature-voice-b', 'feature-voice-c', 'feature-voice-d', 'feature-voice-e'];
  var voiceImg = document.getElementById('voice-img');

  function setVoiceImage(value) {
    if (!voiceImg || VOICE_IMAGES.indexOf(value) === -1) return;
    voiceImg.src = 'images/' + value + '.png';
    document.querySelectorAll('.fx-switcher button[data-target="voice-img"]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.value === value));
    });
  }

  var params = new URLSearchParams(location.search);
  setStepVariant(params.get('steps'));
  if (params.get('voice')) setVoiceImage('feature-voice' + (params.get('voice') === 'a' ? '' : '-' + params.get('voice')));

  var switcher = document.getElementById('fx-switcher');
  var isProduction = /(^|\.)scoopitch\.com$/.test(location.hostname);
  if (switcher && !isProduction) {
    switcher.hidden = false;
    switcher.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-target]');
      if (!btn) return;
      var behavior = reduceMotion ? 'auto' : 'smooth';
      if (btn.dataset.target === 'voice-img') {
        setVoiceImage(btn.dataset.value);
        voiceImg.closest('.feature-card').scrollIntoView({ behavior: behavior, block: 'center' });
        return;
      }
      setStepVariant(btn.dataset.value);
      steps.scrollIntoView({ behavior: behavior, block: 'start' });
    });
  }

  scroller.querySelectorAll('[data-reveal]').forEach(function (el) { observer.observe(el); });
  scroller.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
})();
