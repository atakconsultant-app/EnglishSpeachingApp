/* トップページのスクロール演出。#s-intro がスクロールコンテナ。 */
(function () {
  var scroller = document.getElementById('s-intro');
  if (!scroller || !('IntersectionObserver' in window)) return;

  var features = document.getElementById('fx-features');
  var steps = document.getElementById('fx-steps');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var VARIANTS = ['a', 'b', 'c'];

  document.documentElement.classList.add('fx-ready');

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    });
    requestUpdate();
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

  function observeReveals(scope) {
    scope.querySelectorAll('[data-reveal]').forEach(function (el) { observer.observe(el); });
  }

  function replay(section) {
    var items = section.querySelectorAll('[data-reveal]');
    items.forEach(function (el) { el.classList.remove('is-in', 'is-focus', 'is-reached'); el.style.removeProperty('--shrink'); });
    section.classList.remove('has-focus');
    void section.offsetWidth;
    items.forEach(function (el) { observer.observe(el); });
  }

  var clamp = function (v) { return Math.max(0, Math.min(1, v)); };

  function updateStack() {
    var cards = features.querySelectorAll('.feature-card');
    for (var i = 0; i < cards.length; i++) {
      var shrink = 0;
      if (i < cards.length - 1) {
        var r = cards[i].getBoundingClientRect();
        var next = cards[i + 1].getBoundingClientRect();
        shrink = clamp((r.bottom - next.top) / r.height);
      }
      cards[i].style.setProperty('--shrink', shrink.toFixed(3));
    }
  }

  function updateSpotlight(view) {
    var cards = features.querySelectorAll('.feature-card');
    var center = view.top + view.height / 2;
    var best = null, bestDist = Infinity;
    cards.forEach(function (card) {
      var r = card.getBoundingClientRect();
      if (r.bottom < view.top || r.top > view.bottom) return;
      var d = Math.abs(r.top + r.height / 2 - center);
      if (d < bestDist) { bestDist = d; best = card; }
    });
    cards.forEach(function (card) { card.classList.toggle('is-focus', card === best); });
    features.classList.toggle('has-focus', !!best);
  }

  function updateTimeline(view) {
    var list = steps.querySelector('.steps-list');
    var r = list.getBoundingClientRect();
    var line = view.top + view.height * 0.6;
    list.style.setProperty('--p', clamp((line - r.top - 28) / (r.height - 56)).toFixed(3));
    steps.querySelectorAll('.step-item').forEach(function (item) {
      var n = item.querySelector('.step-num').getBoundingClientRect();
      item.classList.toggle('is-reached', n.top + n.height / 2 <= line);
    });
  }

  function updateProgress() {
    steps.style.setProperty('--done', steps.querySelectorAll('.step-item.is-in').length);
  }

  var ticking = false;
  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (!scroller.classList.contains('active')) return;
      var view = scroller.getBoundingClientRect();
      var fx = features.dataset.fx, sx = steps.dataset.fx;
      if (fx === 'a' && !reduceMotion) updateStack();
      if (fx === 'c') updateSpotlight(view);
      if (sx === 'a') updateTimeline(view);
      if (sx === 'b') updateProgress();
    });
  }

  function setVariant(section, value) {
    if (VARIANTS.indexOf(value) === -1 || section.dataset.fx === value) return;
    section.dataset.fx = value;
    document.querySelectorAll('.fx-switcher button[data-target="' + section.id + '"]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.value === value));
    });
    replay(section);
    requestUpdate();
  }

  var params = new URLSearchParams(location.search);
  setVariant(features, params.get('features'));
  setVariant(steps, params.get('steps'));

  var switcher = document.getElementById('fx-switcher');
  var isProduction = /(^|\.)scoopitch\.com$/.test(location.hostname);
  if (switcher && !isProduction) {
    switcher.hidden = false;
    switcher.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-target]');
      if (!btn) return;
      setVariant(document.getElementById(btn.dataset.target), btn.dataset.value);
      document.getElementById(btn.dataset.target).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  }

  observeReveals(scroller);
  scroller.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
})();
