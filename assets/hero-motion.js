/* FEET Lab — 홈 첫 화면 연구실 소개 모션 v1 (약 14초 반복)
   4막: 측정 → 추적 → 합성 → 로고. 입자 48개가 끊기지 않고 다음 형태로 옮겨 간다.
   motion.js(FEETMotionKit)·motion-audio.js 다음에 불러올 것.
   마크업: <div class="hero-motion" data-hero-motion><div class="hm-screen">(대체 그림)</div></div>
   디버그: ?hero=12.8 → 그 시각에서 멈춘 화면. window.__hero.seek(초) */
(function () {
  'use strict';

  var K = window.FEETMotionKit;
  var root = document.querySelector('[data-hero-motion]');
  if (!K || !root) return;

  var el = K.el, A = K.A, O = K.O, T = K.T, seg = K.seg, eo = K.eo, eio = K.eio,
    rnd = K.rnd, f2 = K.f2, lerp = K.lerp, mod = K.mod, clamp = K.clamp, bez = K.bez;
  var reduced = K.reduced, DISP = K.DISP, BODY = K.BODY;

  var TOTAL = 14, STILL = 12.9, N = 48;
  var NAVY = '#1D4E86', GREEN = '#6BA03A', GREY = '#8DA2B8';
  var C = { x: 430, y: 300 };
  var VB_DESK = '0 0 800 600', VB_MOB = '0 45 800 510';

  /* 로고 마크(images/logo-mark.png, 420×381)의 칠해진 픽셀에서 고르게 뽑은 48점 [x, y, 초록?] */
  var LOGO_PTS = [[102,189,0],[306,297,1],[243,27,0],[318,150,1],[168,324,1],[219,216,1],[144,84,0],[228,123,0],[96,273,0],[240,336,1],[168,162,0],[285,213,1],[168,258,1],[96,126,0],[201,69,0],[210,291,1],[126,231,0],[264,273,1],[180,114,0],[216,168,0],[138,291,0],[312,246,1],[243,75,0],[138,132,0],[168,204,0],[282,171,1],[201,348,1],[270,312,1],[252,237,1],[207,252,1],[249,195,1],[132,168,0],[174,291,1],[198,141,0],[117,102,0],[135,201,0],[96,222,0],[240,303,1],[216,42,0],[243,150,0],[183,231,1],[102,156,0],[132,261,0],[171,69,0],[192,186,0],[198,318,1],[210,96,0],[153,111,0]];
  var LOGO = { x: 299, y: 128, w: 242, h: 220 }, LS = 242 / 420;

  /* 바람 줄기 3개: 공장 굴뚝 → 오른쪽(드론, 가운데, 측정 차량) */
  var STACK = [128, 298];
  var STREAM = [
    [128, 298, 250, 240, 430, 200, 650, 194],
    [128, 298, 300, 290, 500, 280, 760, 268],
    [128, 298, 280, 350, 420, 392, 506, 384]
  ];

  /* ---------- 입자 위치 ---------- */
  var P = [];
  (function () {
    var k, hex = [], a = 38, s3 = Math.sqrt(3);
    for (var i = -8; i <= 8; i++) for (var j = -8; j <= 8; j++) {
      var bx = C.x + i * s3 * a + j * s3 * a / 2, by = C.y - 10 + j * 1.5 * a;
      hex.push([bx, by], [bx, by + a]);
    }
    hex.sort(function (p, q) { return (Math.pow(p[0] - C.x, 2) + Math.pow(p[1] - C.y, 2)) - (Math.pow(q[0] - C.x, 2) + Math.pow(q[1] - C.y, 2)); });
    hex = hex.slice(0, N);
    for (k = 0; k < N; k++) {
      var x, y, tries = 0;
      do {
        x = 140 + rnd(k * 7 + 3 + tries) * 640; y = 165 + rnd(k * 11 + 5 + tries) * 360; tries += 17;
      } while ((x < 360 && y < 160) || (x > 540 && y > 430) || (Math.pow(x - C.x, 2) / 1.6 + Math.pow(y - C.y, 2) > 240 * 240 && tries < 300));
      var lp = LOGO_PTS[k];
      var ang = Math.atan2(y - C.y, x - C.x);
      P.push({
        p1: [x, y], ph: rnd(k * 13) * 6.28, d: rnd(k * 19) * 0.3,
        s: k % 3, u0: rnd(k * 23), off: (rnd(k * 29) - 0.5) * 22,
        lg: [LOGO.x + lp[0] * LS, LOGO.y + lp[1] * LS], col: lp[2] ? GREEN : NAVY,
        bang: ang, brad: 250 + rnd(k * 31) * 90
      });
    }
    /* 격자 자리 배정: 둘 다 x 순서로 맞춰 교차를 줄인다 */
    var idx = P.map(function (_, q) { return q; });
    function flowX(q) { return bez(STREAM[P[q].s], mod(P[q].u0 + 6.9 * 0.11, 1))[0]; }
    idx.sort(function (p, q) { return flowX(p) - flowX(q); });
    var hx = hex.slice().sort(function (p, q) { return p[0] - q[0]; });
    for (k = 0; k < N; k++) P[idx[k]].hx = hx[k];
  })();
  /* 격자 결합 */
  var BONDS = [];
  for (var bi = 0; bi < N; bi++) for (var bj = bi + 1; bj < N; bj++) {
    var dx = P[bi].hx[0] - P[bj].hx[0], dy = P[bi].hx[1] - P[bj].hx[1];
    if (Math.abs(Math.sqrt(dx * dx + dy * dy) - 38) < 1) BONDS.push([bi, bj]);
  }

  function flow(p, t) {
    var u = mod(p.u0 + t * 0.11, 1), b = bez(STREAM[p.s], u), b2 = bez(STREAM[p.s], Math.min(u + 0.01, 1));
    var nx = -(b2[1] - b[1]), ny = b2[0] - b[0], nl = Math.sqrt(nx * nx + ny * ny) || 1;
    return [b[0] + nx / nl * p.off * u, b[1] + ny / nl * p.off * u];
  }
  function drift(p, t) {
    var w = 2 * Math.PI / TOTAL;
    return [p.p1[0] + 7 * Math.sin(w * t * 2 + p.ph), p.p1[1] + 6 * Math.cos(w * t * 3 + p.ph)];
  }
  function L2(a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]; }
  function state(p, t) {
    var k1 = eio(seg(t, 3.3 + p.d, 4.0 + p.d)), k2 = eio(seg(t, 6.9 + p.d, 7.7 + p.d)), k3 = eo(seg(t, 10.4, 11.0)),
      k4 = eio(seg(t, 11.0 + p.d * 0.5, 11.85 + p.d * 0.5)), k5 = eio(seg(t, 13.3, 14.0));
    var pos = drift(p, t);
    if (k1 > 0) pos = L2(pos, flow(p, t), k1);
    if (k2 > 0) pos = L2(pos, [p.hx[0] + Math.sin(t * 3 + p.ph) * 1.2, p.hx[1] + Math.cos(t * 2.6 + p.ph) * 1.2], k2);
    if (k3 > 0) pos = L2(pos, [C.x + Math.cos(p.bang) * p.brad, C.y + Math.sin(p.bang) * p.brad * 0.72], k3);
    if (k4 > 0) pos = L2(pos, p.lg, k4);
    if (k5 > 0) pos = L2(pos, drift(p, t), k5);
    return { x: pos[0], y: pos[1], k1: k1, k2: k2, k4: k4, k5: k5 };
  }
  function scanR(t) { return 360 * eo(seg(t, 0.4, 2.9)); }

  /* ---------- 무대 짓기 ---------- */
  var screen = root.querySelector('.hm-screen');
  root.classList.add('hm-on');
  if (reduced) root.classList.add('hm-still');
  var svg = el('svg', { viewBox: VB_DESK, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false' });
  screen.setAttribute('role', 'img');
  screen.setAttribute('aria-label', '연구실 소개 모션: 대기오염물질을 측정합니다, 대기오염원을 추적합니다, 새로운 소재를 합성합니다. 마지막에 FEET 로고.');
  screen.appendChild(svg);
  var defs = el('defs', {}, svg);
  var gl = el('filter', { id: 'hmglow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  el('feGaussianBlur', { stdDeviation: 28 }, gl);

  /* 2막: 실루엣·바람 줄기·거슬러 오르는 점선 */
  var act2 = el('g', {}, svg);
  var streamG = el('g', { fill: 'none', stroke: NAVY, 'stroke-width': 1.5, opacity: 0.22, 'stroke-dasharray': '2 7', 'stroke-linecap': 'round' }, act2);
  for (var s = 0; s < 3; s++) el('path', { d: K.bezD(STREAM[s]) }, streamG);
  var fac = el('g', { fill: '#EAF1F8', stroke: NAVY, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, act2);
  el('rect', { x: 117, y: 302, width: 22, height: 96 }, fac);
  el('path', { d: 'M84 446V392L112 370V392L140 370V392L168 370V392L196 370V392L224 370V392H252V446Z' }, fac);
  el('line', { x1: 40, y1: 446, x2: 300, y2: 446, stroke: NAVY, 'stroke-width': 2, opacity: 0.35 }, act2);
  /* 측정 차량 */
  var van = el('g', { fill: '#EAF1F8', stroke: NAVY, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, act2);
  el('rect', { x: 484, y: 402, width: 112, height: 34, rx: 7 }, van);
  el('path', { d: 'M568 402V390H586L596 404', fill: 'none' }, van);
  el('circle', { cx: 508, cy: 440, r: 9 }, van);
  el('circle', { cx: 574, cy: 440, r: 9 }, van);
  el('line', { x1: 506, y1: 402, x2: 506, y2: 388 }, van);
  el('circle', { cx: 506, cy: 384, r: 4, fill: GREEN, stroke: 'none' }, van);
  el('line', { x1: 440, y1: 449, x2: 640, y2: 449, stroke: NAVY, 'stroke-width': 2, opacity: 0.35 }, act2);
  /* 드론 */
  var drn = el('g', { fill: '#EAF1F8', stroke: NAVY, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, act2);
  el('line', { x1: 622, y1: 182, x2: 678, y2: 182 }, drn);
  el('rect', { x: 634, y: 178, width: 32, height: 14, rx: 5 }, drn);
  var props = [el('line', { x1: 610, y1: 175, x2: 634, y2: 175 }, drn), el('line', { x1: 666, y1: 175, x2: 690, y2: 175 }, drn)];
  el('line', { x1: 622, y1: 182, x2: 622, y2: 175 }, drn);
  el('line', { x1: 678, y1: 182, x2: 678, y2: 175 }, drn);
  /* 거슬러 오르는 점선(마스크로 그려 나간다) */
  var traces = [];
  [0, 2].forEach(function (si, q) {
    var S = STREAM[si], rev = 'M' + S[6] + ' ' + S[7] + 'C' + S[4] + ' ' + S[5] + ' ' + S[2] + ' ' + S[3] + ' ' + S[0] + ' ' + S[1];
    var mid = 'hmtr' + q;
    var mk = el('mask', { id: mid, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 800, height: 600 }, defs);
    var mp = el('path', { d: rev, fill: 'none', stroke: '#fff', 'stroke-width': 12, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, mk);
    el('path', { d: rev, fill: 'none', stroke: GREEN, 'stroke-width': 3, 'stroke-dasharray': '9 8', 'stroke-linecap': 'round', mask: 'url(#' + mid + ')' }, act2);
    traces.push(mp);
  });
  var stackRing = el('circle', { cx: STACK[0], cy: STACK[1], r: 8, fill: 'none', stroke: GREEN, 'stroke-width': 2.4 }, act2);

  /* 3막: 격자 빛 + 결합 */
  var halo = el('circle', { cx: C.x, cy: C.y + 8, r: 170, fill: GREEN, filter: 'url(#hmglow)', opacity: 0 }, svg);
  var bondG = el('g', { stroke: GREEN, 'stroke-linecap': 'round' }, svg), bonds = [];
  for (var b = 0; b < BONDS.length; b++) {
    var mx = (P[BONDS[b][0]].hx[0] + P[BONDS[b][1]].hx[0]) / 2, my = (P[BONDS[b][0]].hx[1] + P[BONDS[b][1]].hx[1]) / 2;
    bonds.push({ n: el('line', { 'stroke-width': 2 }, bondG), d: Math.sqrt(Math.pow(mx - C.x, 2) + Math.pow(my - C.y, 2)) });
  }

  /* 1막: 스캔 고리 */
  var scan = el('g', { fill: 'none' }, svg);
  var scanA = el('circle', { cx: C.x, cy: C.y, r: 0, stroke: GREEN, 'stroke-width': 2.4 }, scan);
  var scanB = el('circle', { cx: C.x, cy: C.y, r: 0, stroke: NAVY, 'stroke-width': 1.4, 'stroke-dasharray': '3 9', opacity: 0.5 }, scan);

  /* 입자 */
  var pg = el('g', {}, svg), parts = [];
  for (var k = 0; k < N; k++) {
    var g = el('g', {}, pg);
    parts.push({ g: g, ring: el('circle', { r: 9, fill: 'none', stroke: P[k].col, 'stroke-width': 1.6 }, g), core: el('circle', { r: 2, fill: GREY }, g) });
  }

  /* 4막: 로고 */
  var logoG = el('g', {}, svg);
  var logoImg = el('image', { x: LOGO.x, y: LOGO.y, width: LOGO.w, height: LOGO.h, preserveAspectRatio: 'xMidYMid meet' }, logoG);
  logoImg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'images/logo-mark.png');
  logoImg.setAttribute('href', 'images/logo-mark.png');
  var tagline = el('text', { x: 420, y: 408, 'font-size': 31, 'font-family': DISP, 'font-weight': 600, fill: NAVY, 'text-anchor': 'middle', 'letter-spacing': '0.01em' }, svg);
  tagline.textContent = 'Fine Energy & Environment Technology';

  /* 동사 */
  var vclip = el('clipPath', { id: 'hmvclip' }, defs);
  el('rect', { x: 0, y: 40, width: 800, height: 100 }, vclip);
  var vg = el('g', { 'clip-path': 'url(#hmvclip)' }, svg);
  var VERBS = [['대기오염물질을 측정합니다', 0.3, 3.25], ['대기오염원을 추적합니다', 3.7, 6.75], ['새로운 소재를 합성합니다', 7.2, 10.25]], verbs = [];
  for (k = 0; k < VERBS.length; k++) {
    var vt = el('text', { x: 40, y: 112, 'font-size': 52, 'font-family': BODY, 'font-weight': 800, fill: NAVY, 'letter-spacing': '-0.03em' }, vg);
    vt.textContent = VERBS[k][0];
    verbs.push(vt);
  }

  /* ---------- 그리기 ---------- */
  function render(t) {
    var q, e;
    var R = scanR(t), scanOn = seg(t, 0.3, 0.6) * (1 - seg(t, 2.6, 3.2));
    A(scanA, 'r', R); A(scanB, 'r', Math.max(0, R - 26));
    O(scan, scanOn);
    var a2 = seg(t, 3.6, 4.2) * (1 - seg(t, 6.9, 7.4));
    O(act2, a2);
    for (q = 0; q < 2; q++) {
      A(traces[q], 'stroke-dashoffset', f2(1 - eio(seg(t, 4.6 + q * 0.25, 5.9 + q * 0.25))));
      A(props[q], 'x1', (q ? 678 : 622) - 12 * Math.abs(Math.cos(t * 30 + q)));
      A(props[q], 'x2', (q ? 678 : 622) + 12 * Math.abs(Math.cos(t * 30 + q)));
    }
    var sr = seg(t, 6.0, 6.9);
    A(stackRing, 'r', 8 + 26 * sr); O(stackRing, sr > 0 ? 1 - sr : 0);

    var logoVis = seg(t, 12.0, 12.45) * (1 - seg(t, 13.3, 13.7));
    var pts = [];
    for (q = 0; q < N; q++) {
      var p = P[q], st = state(p, t), pr = parts[q];
      pts.push(st);
      var rho;
      if (t < 3.4) rho = eo(seg(R - Math.sqrt(Math.pow(p.p1[0] - C.x, 2) + Math.pow(p.p1[1] - C.y, 2)), 0, 46));
      else rho = 1;
      rho *= 1 - st.k5;
      T(pr.g, 'translate(' + f2(st.x) + ',' + f2(st.y) + ')');
      var r = lerp(2, 4.6, rho);
      r = lerp(r, 6.4, st.k2 * (1 - st.k4));
      r = lerp(r, 5.2, st.k4 * (1 - st.k5));
      A(pr.core, 'r', r);
      A(pr.core, 'fill', rho > 0.3 ? p.col : GREY);
      O(pr.core, lerp(0.45, 1, rho) * (1 - 0.92 * logoVis));
      A(pr.ring, 'r', f2(lerp(20, 9.5, rho)));
      O(pr.ring, rho * 0.6 * (1 - st.k1) * (t < 3.6 ? 1 : 0));
    }
    var bo = seg(t, 7.9, 8.5) * (1 - seg(t, 10.3, 10.6)), wv = 300 * seg(t, 8.7, 9.7), inWave = t > 8.7 && t < 9.8;
    O(bondG, bo);
    if (bo > 0) {
      for (q = 0; q < bonds.length; q++) {
        var bb = BONDS[q], ga = inWave ? Math.exp(-Math.pow((bonds[q].d - wv) / 40, 2)) : 0;
        var n = bonds[q].n, p0 = pts[bb[0]], p1 = pts[bb[1]];
        A(n, 'x1', p0.x); A(n, 'y1', p0.y); A(n, 'x2', p1.x); A(n, 'y2', p1.y);
        A(n, 'stroke-width', f2(2 + 2.4 * ga));
        A(n, 'stroke-opacity', f2(0.45 + 0.55 * ga));
      }
    }
    O(halo, 0.3 * Math.sin(Math.PI * seg(t, 8.6, 10.0)));
    e = eo(seg(t, 12.0, 12.6));
    O(logoG, logoVis);
    T(logoG, 'translate(420 240) scale(' + f2(0.96 + 0.04 * e) + ') translate(-420 -240)');
    O(tagline, seg(t, 12.3, 12.8) * (1 - seg(t, 13.3, 13.7)));
    for (q = 0; q < verbs.length; q++) {
      var vi = eo(seg(t, VERBS[q][1], VERBS[q][1] + 0.45)), vo = eio(seg(t, VERBS[q][2] - 0.35, VERBS[q][2]));
      O(verbs[q], vi * (1 - vo));
      T(verbs[q], 'translate(0,' + f2(70 * (1 - vi) - 70 * vo) + ')');
    }
  }

  /* ---------- 조작부: 재생/일시정지 + 소리 ---------- */
  var ctrl = document.createElement('div');
  ctrl.className = 'hm-ctrl';
  var play = document.createElement('button');
  play.type = 'button'; play.className = 'hm-btn hm-play';
  if (reduced) play.hidden = true;
  ctrl.appendChild(play);
  root.appendChild(ctrl);
  var AUD = window.FEETAudio || null;
  var snd = AUD ? AUD.attach({ theme: 'hero', screen: screen, ctrl: ctrl, btnClass: 'hm-btn' }) : null;
  var CUES = [[0.95, 'ping', 0], [1.55, 'ping', 3], [2.15, 'ping', 7], [3.4, 'whoosh'], [5.95, 'ping', 5], [6.9, 'whoosh'], [8.75, 'chime'], [10.4, 'whoosh'], [11.95, 'chime']];

  var st = { t: reduced ? STILL : 0, playing: false, userPaused: false, inView: false, debug: false, raf: 0, last: 0 };
  var mq = null;
  try { mq = window.matchMedia('(max-width: 767px)'); } catch (e2) { mq = null; }
  function fitVB() { svg.setAttribute('viewBox', mq && mq.matches ? VB_MOB : VB_DESK); }
  fitVB();
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', fitVB); else if (mq.addListener) mq.addListener(fitVB); }

  function sync() {
    var want = !reduced && !st.debug && !st.userPaused && st.inView && !document.hidden;
    if (want && !st.playing) { st.playing = true; st.last = 0; st.raf = requestAnimationFrame(tick); }
    else if (!want && st.playing) { st.playing = false; cancelAnimationFrame(st.raf); st.raf = 0; }
    var showPause = st.playing || (!st.userPaused && !st.debug && !st.inView);
    play.innerHTML = showPause ? K.ICON_PAUSE : K.ICON_PLAY;
    play.setAttribute('aria-label', showPause ? '소개 모션 일시정지' : '소개 모션 재생');
    if (snd) snd.active(st.playing);
  }
  function tick(ts) {
    if (!st.playing) return;
    var dt = st.last ? Math.min(ts - st.last, 60) / 1000 : 0;
    st.last = ts;
    var prev = st.t;
    st.t += dt;
    if (st.t >= TOTAL) st.t -= TOTAL;
    if (snd && dt > 0) snd.cues(prev, st.t, CUES, TOTAL);
    render(st.t);
    st.raf = requestAnimationFrame(tick);
  }
  play.addEventListener('click', function () {
    if (st.userPaused || st.debug) { st.userPaused = false; st.debug = false; } else st.userPaused = true;
    sync();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { st.inView = en[0].isIntersecting; sync(); }, { threshold: 0.25 }).observe(screen);
  } else st.inView = true;
  document.addEventListener('visibilitychange', sync);

  var m = /[?&]hero=([0-9.]+)/.exec(location.search);
  if (m) { st.debug = true; st.t = mod(parseFloat(m[1]) || 0, TOTAL); }
  render(st.t);
  sync();

  window.__hero = {
    total: TOTAL, state: st,
    seek: function (t) { st.debug = true; st.t = mod(t, TOTAL); render(st.t); sync(); },
    play: function () { st.debug = false; st.userPaused = false; sync(); }
  };
  void clamp;
})();
