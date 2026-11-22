/* FEET Lab — 연구 흐름도 무대 v1 (research.html #flow)
   노드 그래프 + 카메라 투어 + 단계 표시줄. 순수 SVG + JS, 외부 라이브러리 없음.
   assets/motion-audio.js(FEETAudio, 테마 'flow') → assets/motion.js(FEETMotionKit) 다음에 불러온다.
   - 흐름도는 무대보다 넓은 '세계' 좌표(약 3100×1200)에 그리고, 최상위 <g> 의 transform 으로
     카메라(세계 좌표 중심 x·y, 배율 s)를 움직인다. viewBox 는 무대의 실제 CSS 픽셀 크기와 같게 맞추므로
     배율 s 가 곧 화면 배율이다(세계 글자 30 × s = 화면 px).
   - 카드 테두리·연결선은 vector-effect: non-scaling-stroke 로 확대해도 굵어지지 않는다.
   - 확대 배율은 무대 크기(데스크톱 16:9 / 모바일 4:5)마다 다시 계산한다. 제목 15px·칩 12px 이상이
     안 되면 묶음 대신 노드 하나씩 비춘다.
   마크업: <div class="fstage" data-flow><ol class="fs-fallback">…</ol></div>
   디버그: ?flow=12.5 → 그 시각에서 멈춘 화면. window.__flow.seek(초), __flow.focus(단계번호 1–5), __flow.overview() */
(function () {
  'use strict';

  var K = window.FEETMotionKit;
  var ROOT = document.querySelector('[data-flow]');
  if (!K || !ROOT) return;

  var el = K.el, clamp = K.clamp, seg = K.seg, eo = K.eo, eio = K.eio, back = K.back,
    rnd = K.rnd, f2 = K.f2, lerp = K.lerp, mod = K.mod, A = K.A, O = K.O, T = K.T, vis = K.vis;
  var reduced = K.reduced;
  var BODY = K.BODY;
  var AUD = window.FEETAudio || null;

  var C = {
    card: '#141E2E', line: '#2A3B52', green: '#6BA03A', lime: '#A8D65C', sky: '#7DB8F0',
    text: '#E6EEF7', sub: '#8FA3B8', orange: '#F2A33A', dim: '#3B4D64', idle: '#5C6F86',
    cell: '#18243A', deep: '#0F1826'
  };

  /* ---------- 색 섞기 ---------- */
  var HC = {};
  function rgb(c) {
    if (!HC[c]) HC[c] = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    return HC[c];
  }
  function mix(a, b, p) {
    p = clamp(p, 0, 1);
    if (p <= 0) return a;
    if (p >= 1) return b;
    var x = rgb(a), y = rgb(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * p) + ',' + Math.round(x[1] + (y[1] - x[1]) * p) + ',' + Math.round(x[2] + (y[2] - x[2]) * p) + ')';
  }
  function tx(parent, x, y, s, size, fill, o) {
    o = o || {};
    var n = el('text', {
      x: x, y: y, 'font-size': size, fill: fill, 'font-family': BODY,
      'font-weight': o.w || 700, 'text-anchor': o.anchor || 'start', 'letter-spacing': o.ls || '-0.4'
    }, parent);
    n.textContent = s;
    return n;
  }
  /* 같은 값이면 DOM 을 건드리지 않는다 */
  function S(n, k, v) {
    var key = '_' + k;
    if (n[key] === v) return;
    n[key] = v;
    n.setAttribute(k, v);
  }
  function NS(n) { n.setAttribute('vector-effect', 'non-scaling-stroke'); return n; }

  /* ---------- 칩(둥근 알약) 줄: 글꼴이 들어온 뒤 실제 글자 폭으로 다시 맞춘다 ---------- */
  var ROWS = [];
  function chipRow(parent, x, y, labels, size, gap) {
    var row = { x: x, y: y, size: size, gap: gap, items: [] }, h = Math.round(size * 1.8);
    for (var i = 0; i < labels.length; i++) {
      var g = el('g', {}, parent);
      var r = el('rect', { y: y, height: h, rx: h / 2, fill: 'none', 'stroke-width': 1.6 }, g);
      var t = tx(g, 0, f2(y + h / 2 + size * 0.36), labels[i], size, C.idle, { w: 600, ls: '-0.2' });
      row.items.push({ g: g, r: r, t: t, label: labels[i], w: size * 1.5 + labels[i].length * size * 0.9, h: h, cx: 0, cy: y + h / 2 });
    }
    row.layout = function () {
      var cx = row.x;
      for (var k = 0; k < row.items.length; k++) {
        var it = row.items[k];
        try { var tw = it.t.getComputedTextLength(); if (tw > 0) it.w = tw + size * 1.5; } catch (e) { /* 그대로 */ }
        A(it.r, 'x', cx); A(it.r, 'width', it.w);
        A(it.t, 'x', cx + size * 0.75);
        it.cx = cx + it.w / 2;
        cx += it.w + row.gap;
      }
    };
    row.layout();
    ROWS.push(row);
    return row.items;
  }
  /* p: 0 → 1 (켜짐), pop: 켜지는 순간 살짝 커졌다 돌아옴 */
  function setChip(it, p, R) {
    var q = p * R;
    S(it.r, 'fill', q > 0.001 ? 'rgba(168,214,92,' + f2(0.15 * q) + ')' : 'none');
    S(it.r, 'stroke', mix(C.dim, C.lime, q));
    S(it.t, 'fill', mix(C.idle, C.text, q));
    var sc = 1 + 0.1 * Math.sin(Math.PI * clamp(p, 0, 1)) * R;
    S(it.g, 'transform', sc === 1 ? '' : 'translate(' + f2(it.cx) + ' ' + f2(it.cy) + ') scale(' + f2(sc) + ') translate(' + f2(-it.cx) + ' ' + f2(-it.cy) + ')');
  }

  /* 무대 아래 '링크처럼 보이는' 글자 + 밑줄 + 화살표 */
  var LINKS = [];
  function linkText(parent, x, y, label, size) {
    var g = el('g', {}, parent);
    var t = tx(g, x, y, label, size, C.idle, { w: 700, ls: '-0.2' });
    var u = el('line', { x1: x, y1: y + 8, x2: x + label.length * size * 0.9, y2: y + 8, 'stroke-width': 1.6 }, g);
    var ar = el('path', { d: 'M0 0H16M9 -7L16 0L9 7', fill: 'none', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    var L = { g: g, t: t, u: u, ar: ar, x: x, y: y, size: size };
    L.layout = function () {
      var w = label.length * size * 0.9;
      try { var tw = t.getComputedTextLength(); if (tw > 0) w = tw; } catch (e) { /* 그대로 */ }
      A(u, 'x2', x + w);
      T(ar, 'translate(' + f2(x + w + 12) + ' ' + f2(y - size * 0.34) + ')');
    };
    L.layout();
    LINKS.push(L);
    return L;
  }
  function setLink(L, p, R) {
    var q = p * R, c = mix(C.idle, C.sky, q);
    S(L.t, 'fill', c); S(L.u, 'stroke', c); S(L.ar, 'stroke', c);
    O(L.u, 0.35 + 0.65 * q);
  }

  /* =========================================================
     노드 내용. 각 함수는 카드 안 좌표(왼쪽 위 0,0)로 그리고,
     upd(u, R) 를 돌려준다. u = 노드 시각(초, 음수면 아직 안 켜짐), R = 되돌림(1 → 0)
     ========================================================= */

  /* 01 현장 */
  function bSite(g) {
    var k;
    var art = el('g', { fill: 'none', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
    var ground = el('line', { x1: 28, y1: 276, x2: 412, y2: 276 }, art);
    var roof = el('path', { d: 'M40 276V206L76 180V206L112 180V206L148 180V206L184 180V206L206 206V276' }, art);
    var chim = el('path', { d: 'M230 276V130H262V276M226 130H266' }, art);
    var band = el('rect', { x: 232, y: 152, width: 28, height: 8, rx: 2, stroke: 'none' }, g);
    var B = [[288, 172, 36], [334, 126, 42], [386, 192, 26]], blds = [], wins = [];
    for (k = 0; k < B.length; k++) {
      blds.push(el('rect', { x: B[k][0], y: B[k][1], width: B[k][2], height: 276 - B[k][1], rx: 3 }, art));
      for (var r = 0; r < 4; r++) for (var c2 = 0; c2 < 2; c2++) {
        var wy = B[k][1] + 14 + r * 22;
        if (wy > 262) continue;
        wins.push({ n: el('rect', { x: B[k][0] + 8 + c2 * (B[k][2] - 22), y: wy, width: 6, height: 8, rx: 1.5 }, g), d: rnd(k * 17 + r * 5 + c2) });
      }
    }
    var smoke = [], smG = el('g', {}, g);
    for (k = 0; k < 7; k++) smoke.push(el('circle', { r: 8 }, smG));
    var parts = [], pG = el('g', {}, g);
    for (k = 0; k < 16; k++) parts.push({ n: el('circle', { r: 2 + rnd(k + 4) * 2.4 }, pG), x: 30 + rnd(k + 1) * 380, y: 92 + rnd(k + 9) * 160, ph: rnd(k + 13) * 6.28, sp: 6 + rnd(k + 21) * 10 });

    var items = ['산업단지', '사업장 굴뚝', '도시 대기'], rows = [];
    for (k = 0; k < items.length; k++) {
      var y0 = 312 + k * 50;
      var rg = el('g', {}, g);
      rows.push({
        bg: el('rect', { x: 28, y: y0, width: 384, height: 40, rx: 12, 'stroke-width': 1.2 }, rg),
        dot: el('circle', { cx: 50, cy: y0 + 20, r: 5 }, rg),
        t: tx(rg, 68, y0 + 28.5, '', 24, C.text, { w: 600 }),
        s: items[k], at: 0.9 + k * 0.6, shown: -1
      });
    }
    return function (u, R) {
      var a, i, lit = seg(u, 0, 0.5) * R;
      S(ground, 'stroke', mix(C.dim, C.sub, lit));
      S(roof, 'stroke', mix(C.dim, C.sky, seg(u, 0, 0.5) * R));
      S(chim, 'stroke', mix(C.dim, C.text, seg(u, 0.15, 0.65) * R));
      S(band, 'fill', mix(C.dim, C.lime, seg(u, 0.15, 0.65) * R));
      for (i = 0; i < blds.length; i++) S(blds[i], 'stroke', mix(C.dim, C.sky, seg(u, 0.3 + i * 0.1, 0.8 + i * 0.1) * R));
      for (i = 0; i < wins.length; i++) {
        var wp = seg(u, 0.5 + wins[i].d * 1.2, 0.7 + wins[i].d * 1.2) * R;
        S(wins[i].n, 'fill', mix(C.line, i % 3 ? C.sky : C.lime, wp * (0.75 + 0.25 * Math.sin(u * 1.3 + i))));
      }
      for (i = 0; i < smoke.length; i++) {
        a = mod(u * 0.55 + i / smoke.length, 1);
        A(smoke[i], 'cx', 246 + a * 70 + Math.sin(a * 5 + i) * 6);
        A(smoke[i], 'cy', 120 - a * 46);
        A(smoke[i], 'r', 6 + a * 14);
        S(smoke[i], 'fill', C.sub);
        O(smoke[i], 0.3 * Math.sin(Math.PI * a) * seg(u, 0.4, 1) * R);
      }
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        A(p.n, 'cx', 30 + mod(p.x - 30 + u * p.sp, 380));
        A(p.n, 'cy', p.y + Math.sin(u * 0.8 + p.ph) * 8);
        S(p.n, 'fill', i % 4 ? C.sub : C.lime);
        O(p.n, 0.55 * seg(u, 0.3, 1.2) * R);
      }
      for (i = 0; i < rows.length; i++) {
        var rw = rows[i], tp = seg(u, rw.at, rw.at + 0.45), on = seg(u, rw.at - 0.05, rw.at + 0.15) * R;
        var n = tp <= 0 ? 0 : Math.ceil(rw.s.length * tp);
        if (n !== rw.shown) { rw.t.textContent = rw.s.slice(0, n); rw.shown = n; }
        O(rw.t, R);
        S(rw.bg, 'fill', on > 0.001 ? 'rgba(168,214,92,' + f2(0.08 * on) + ')' : '#172234');
        S(rw.bg, 'stroke', mix(C.line, '#4E6E3A', on));
        S(rw.dot, 'fill', mix(C.dim, C.lime, on));
      }
    };
  }

  /* 02 측정 차량 · 이동 측정 */
  var VAN_SP = 0.9, VAN_X0 = 30, VAN_RUN = 248;
  function vanX(u) { return VAN_X0 + VAN_RUN * (0.5 - 0.5 * Math.cos(Math.max(u, 0) * VAN_SP)); }
  function bCar(g) {
    var k;
    var road = el('line', { x1: 24, y1: 178, x2: 396, y2: 178, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, g);
    var xs = [104, 146, 188, 230, 272, 314], pts = [];
    for (k = 0; k < xs.length; k++) {
      var c = xs[k] - 56, first = Math.acos(clamp(1 - 2 * (c - VAN_X0) / VAN_RUN, -1, 1)) / VAN_SP;
      pts.push({ ring: el('circle', { cx: xs[k], cy: 178, r: 6, fill: 'none', 'stroke-width': 2 }, g), dot: el('circle', { cx: xs[k], cy: 178, r: 5 }, g), at: first });
    }
    var van = el('g', {}, g), body = el('g', {}, van);
    var inlet = el('path', { d: 'M22 4V-10M17 -10H29', fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round' }, body);
    var shell = el('path', { d: 'M0 40V12Q0 4 8 4H86L106 22Q112 27 112 34V40Q112 44 108 44H4Q0 44 0 40Z', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, body);
    var win = el('path', { d: 'M84 10H89L102 24H84Z' }, body);
    var wheels = [];
    for (k = 0; k < 2; k++) {
      var wg = el('g', {}, body);
      el('circle', { r: 10, fill: C.deep, 'stroke-width': 2.5 }, wg);
      el('path', { d: 'M-6 0H6M0 -6V6', 'stroke-width': 2 }, wg);
      wheels.push({ g: wg, x: k ? 88 : 24 });
    }
    var air = [];
    for (k = 0; k < 3; k++) air.push(el('circle', { r: 2.6 }, body));
    return function (u, R) {
      var i, lit = seg(u, 0, 0.4) * R, x = vanX(u), dir = Math.sin(Math.max(u, 0) * VAN_SP) >= 0 ? 1 : -1;
      S(road, 'stroke', mix(C.dim, C.sub, lit));
      T(van, 'translate(' + f2(x) + ',124)');
      T(body, dir > 0 ? '' : 'translate(112,0) scale(-1,1)');
      var st = mix(C.dim, C.text, lit);
      S(shell, 'stroke', st); S(shell, 'fill', C.card); S(inlet, 'stroke', mix(C.dim, C.lime, lit)); S(win, 'fill', mix(C.line, '#35506E', lit));
      for (i = 0; i < 2; i++) {
        T(wheels[i].g, 'translate(' + wheels[i].x + ',44) rotate(' + f2(x * 4 * dir) + ')');
        wheels[i].g.setAttribute('stroke', st);
      }
      for (i = 0; i < air.length; i++) {
        var a = mod(u * 1.6 + i / 3, 1);
        A(air[i], 'cx', 22 + Math.sin(i * 2.3) * 9 * (1 - a));
        A(air[i], 'cy', -30 + a * 22);
        S(air[i], 'fill', C.sky);
        O(air[i], Math.sin(Math.PI * a) * lit);
      }
      for (i = 0; i < pts.length; i++) {
        var pp = pts[i], on = u >= pp.at ? 1 : 0, rp = clamp((u - pp.at) / 0.7, 0, 1);
        S(pp.dot, 'fill', on && R > 0 ? mix(C.dim, C.lime, R) : C.dim);
        A(pp.ring, 'r', 6 + 16 * rp);
        S(pp.ring, 'stroke', C.lime);
        O(pp.ring, on ? (1 - rp) * R : 0);
      }
    };
  }

  /* 02 드론 · 상공 시료 채취 */
  function bDrone(g) {
    var k;
    var dr = el('g', {}, g);
    var frame = el('g', { fill: 'none', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, dr);
    el('path', { d: 'M-64 -6H64M-56 -6V-13M56 -6V-13M-16 10L-24 20M16 10L24 20' }, frame);
    var bodyR = el('rect', { x: -26, y: -12, width: 52, height: 20, rx: 8, 'stroke-width': 2.5 }, dr);
    var props = [el('ellipse', { cx: -56, cy: -15, rx: 30, ry: 3.5 }, dr), el('ellipse', { cx: 56, cy: -15, rx: 30, ry: 3.5 }, dr)];
    var tether = el('line', { x1: 0, y1: 8, x2: 0, y2: 30, 'stroke-width': 2 }, dr);
    var bag = el('path', { d: 'M-16 0H16Q22 0 22 8V30Q22 40 12 40H-12Q-22 40 -22 30V8Q-22 0 -16 0Z', 'stroke-width': 2.2 }, dr);
    var parts = [];
    for (k = 0; k < 6; k++) parts.push({ n: el('circle', { r: 2.6 }, g), side: k % 2 ? 1 : -1, ph: k / 6, dy: (rnd(k + 3) - 0.5) * 30 });
    return function (u, R) {
      var i, lit = seg(u, 0, 0.4) * R, bob = Math.sin(Math.max(u, 0) * 2.2) * 4 * lit;
      T(dr, 'translate(262,' + f2(98 + bob) + ')');
      var st = mix(C.dim, C.text, lit);
      frame.setAttribute('stroke', st);
      S(bodyR, 'stroke', st); S(bodyR, 'fill', C.card);
      for (i = 0; i < 2; i++) {
        var rx = lit > 0 ? Math.max(4, 30 * Math.abs(Math.cos(u * 24 + i))) : 30;
        A(props[i], 'rx', rx);
        S(props[i], 'fill', mix(C.dim, C.sky, lit));
        O(props[i], 0.55 + 0.45 * (1 - lit));
      }
      S(tether, 'stroke', mix(C.dim, C.sub, lit));
      var inf = eo(seg(u, 0.6, 2.4)) * R;
      T(bag, 'translate(0,30) scale(' + f2(0.4 + 0.6 * inf) + ')');
      S(bag, 'stroke', mix(C.dim, C.sky, lit));
      S(bag, 'fill', inf > 0.001 ? 'rgba(125,184,240,' + f2(0.08 + 0.22 * inf) + ')' : 'none');
      for (i = 0; i < parts.length; i++) {
        var p = parts[i], a = mod(u * 0.7 + p.ph, 1);
        A(p.n, 'cx', 262 + p.side * (150 - 140 * a));
        A(p.n, 'cy', 98 + 50 + p.dy * (1 - a) + bob);
        S(p.n, 'fill', C.sky);
        O(p.n, Math.sin(Math.PI * a) * 0.8 * seg(u, 0.6, 1.2) * R);
      }
    };
  }

  /* 02 고정 측정 · 연속 측정 */
  function bFixed(g) {
    var k;
    var st = el('g', { fill: 'none', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    var box = el('rect', { x: 40, y: 122, width: 112, height: 58, rx: 6 }, st);
    el('path', { d: 'M128 122V80M64 180V188M128 180V188' }, st);
    var scr = el('rect', { x: 54, y: 136, width: 46, height: 22, rx: 3 }, g);
    var tip = el('circle', { cx: 128, cy: 76, r: 5 }, g);
    var rings = [];
    for (k = 0; k < 3; k++) rings.push(el('path', { fill: 'none', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, g));
    var axis = el('path', { d: 'M190 92V178H396', fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
    var trace = el('polyline', { fill: 'none', 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
    var head = el('circle', { r: 4.5 }, g);
    return function (u, R) {
      var i, lit = seg(u, 0, 0.4) * R;
      st.setAttribute('stroke', mix(C.dim, C.text, lit));
      S(scr, 'fill', mix(C.line, '#2E4A3A', lit));
      S(tip, 'fill', mix(C.dim, C.lime, lit));
      for (i = 0; i < rings.length; i++) {
        var a = mod(u / 1.2 + i / 3, 1), r = 10 + 34 * a;
        A(rings[i], 'd', 'M' + f2(128 - r * 0.8) + ' ' + f2(76 - r * 0.6) + 'A' + f2(r) + ' ' + f2(r) + ' 0 0 1 ' + f2(128 + r * 0.8) + ' ' + f2(76 - r * 0.6));
        S(rings[i], 'stroke', C.lime);
        O(rings[i], (1 - a) * seg(u, 0.2, 0.6) * R);
      }
      S(axis, 'stroke', mix(C.dim, C.sub, lit));
      var w = seg(u, 0.3, 1.5), n = 36, pts = [], last = null;
      if (w > 0 && R > 0) {
        var m = Math.max(2, Math.round(n * w));
        for (i = 0; i < m; i++) {
          var q = i + Math.max(u, 0) * 7;
          var v = 0.5 + 0.22 * Math.sin(q * 0.31) + 0.14 * Math.sin(q * 0.83 + 1.3) + 0.06 * Math.sin(q * 1.9);
          last = [196 + i * (196 / (n - 1)), 170 - 70 * v];
          pts.push(f2(last[0]) + ',' + f2(last[1]));
        }
      }
      A(trace, 'points', pts.join(' '));
      S(trace, 'stroke', C.sky);
      O(trace, R);
      if (last) { A(head, 'cx', last[0]); A(head, 'cy', last[1]); }
      S(head, 'fill', C.lime);
      O(head, last ? R : 0);
    };
  }

  /* 03 가스상 성분 분석 */
  function bGas(g) {
    var k;
    var chips = chipRow(g, 28, 78, ['SIFT-MS'], 21, 10);
    var X0 = 44, X1 = 432, YB = 300, YT = 150, N = 160;
    var axis = el('path', { d: 'M' + X0 + ' 140V' + YB + 'H' + X1, fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
    var PK = [[0.07, 0.34, 0.012], [0.15, 0.62, 0.01], [0.23, 0.26, 0.014], [0.32, 0.92, 0.009], [0.4, 0.44, 0.012], [0.49, 0.7, 0.01],
      [0.56, 0.2, 0.014], [0.64, 0.55, 0.01], [0.72, 0.36, 0.012], [0.8, 0.84, 0.009], [0.88, 0.3, 0.012], [0.94, 0.5, 0.01]];
    var P = [];
    for (k = 0; k <= N; k++) {
      var x = k / N, v = 0.03;
      for (var j = 0; j < PK.length; j++) v += PK[j][1] * Math.exp(-Math.pow(x - PK[j][0], 2) / (2 * PK[j][2] * PK[j][2]));
      P.push([X0 + 6 + x * (X1 - X0 - 12), YB - 2 - (YB - YT) * Math.min(v, 1)]);
    }
    var allPts = [];
    for (k = 0; k < P.length; k++) allPts.push(f2(P[k][0]) + ',' + f2(P[k][1]));
    var ghost = el('polyline', { points: allPts.join(' '), fill: 'none', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, g);
    var area = el('polygon', { stroke: 'none' }, g);
    var curve = el('polyline', { fill: 'none', 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
    var cursor = el('line', { y1: YT - 8, y2: YB, 'stroke-width': 2, 'stroke-dasharray': '4 5' }, g);
    var tops = [], TOP = [3, 9, 5];
    for (k = 0; k < TOP.length; k++) {
      var px = X0 + 6 + PK[TOP[k]][0] * (X1 - X0 - 12), py = YB - 2 - (YB - YT) * Math.min(1, PK[TOP[k]][1] + 0.03);
      tops.push({ n: el('circle', { cx: f2(px), cy: f2(py - 10), r: 5 }, g), x: (px - X0 - 6) / (X1 - X0 - 12) });
    }
    var shown = -1;
    return function (u, R) {
      var i, lit = seg(u, 0, 0.4) * R;
      setChip(chips[0], seg(u, 0.3, 0.55), R);
      S(axis, 'stroke', mix(C.dim, C.sub, lit));
      S(ghost, 'stroke', C.line);
      var c = seg(u, 0.7, 2.7), m = Math.round(c * N);
      if (R <= 0) m = 0;
      if (m !== shown) {
        shown = m;
        if (m < 1) { A(curve, 'points', ''); A(area, 'points', ''); }
        else {
          var pts = allPts.slice(0, m + 1);
          A(curve, 'points', pts.join(' '));
          A(area, 'points', f2(P[0][0]) + ',' + (YB - 1) + ' ' + pts.join(' ') + ' ' + f2(P[m][0]) + ',' + (YB - 1));
        }
      }
      S(curve, 'stroke', C.sky); O(curve, R);
      S(area, 'fill', 'rgba(125,184,240,.14)'); O(area, R);
      var cx = X0 + 6 + c * (X1 - X0 - 12);
      A(cursor, 'x1', cx); A(cursor, 'x2', cx);
      S(cursor, 'stroke', C.lime);
      O(cursor, c > 0 && c < 1 ? 0.8 * R : 0);
      for (i = 0; i < tops.length; i++) {
        var on = seg(c, tops[i].x + 0.02, tops[i].x + 0.08) * R;
        S(tops[i].n, 'fill', C.lime);
        O(tops[i].n, on);
        A(tops[i].n, 'r', 5 * (0.4 + 0.6 * back(on)));
      }
    };
  }

  /* 03 단일 입자 분석 */
  var CLIPS = 0;
  function bParticle(g, uidp) {
    var k;
    var chips = chipRow(g, 28, 78, ['형광 현미경', '라만 분광', 'SEM/EDX'], 21, 10);
    var LX = 318, LY = 226, LR = 76;
    var small = el('circle', { cx: 74, cy: 236, r: 7 }, g);
    var conn = el('path', { d: 'M80 231L' + LX + ' ' + (LY - LR) + 'M80 241L' + LX + ' ' + (LY + LR), fill: 'none', 'stroke-width': 1.8, 'stroke-dasharray': '5 6' }, g);
    var lens = el('circle', { cx: LX, cy: LY, r: LR, 'stroke-width': 2.2 }, g);
    var cid = 'flclip' + uidp + '-' + (CLIPS++);
    var cp = el('clipPath', { id: cid }, g);
    el('circle', { cx: LX, cy: LY, r: LR - 2 }, cp);
    var inner = el('g', { 'clip-path': 'url(#' + cid + ')' }, g);
    var pg = el('g', {}, inner);
    var d = '';
    for (k = 0; k <= 48; k++) {
      var th = k / 48 * Math.PI * 2, r = 50 * (1 + 0.09 * Math.sin(3 * th) + 0.06 * Math.sin(5 * th + 1) + 0.04 * Math.sin(7 * th + 2));
      d += (k ? 'L' : 'M') + f2(Math.cos(th) * r) + ' ' + f2(Math.sin(th) * r);
    }
    var blob = el('path', { d: d + 'Z', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, pg);
    var INC = [[-18, -14, 7, 'sky'], [14, -20, 5, 'lime'], [22, 10, 8, 'sky'], [-6, 18, 6, 'lime'], [-26, 8, 4, 'sub'], [4, -2, 4, 'sub'], [30, -6, 3.5, 'lime']], incs = [];
    for (k = 0; k < INC.length; k++) incs.push({ n: el('circle', { cx: INC[k][0], cy: INC[k][1], r: INC[k][2] }, pg), c: C[INC[k][3]], at: 2.2 + k * 0.08 });
    var scan = el('line', { x1: LX - LR, x2: LX + LR, 'stroke-width': 2 }, inner);
    return function (u, R) {
      var i, lit = seg(u, 0, 0.4) * R;
      for (i = 0; i < chips.length; i++) setChip(chips[i], seg(u, 0.3 + i * 0.6, 0.55 + i * 0.6), R);
      S(small, 'fill', mix(C.dim, C.sub, lit));
      S(conn, 'stroke', mix(C.line, C.dim, lit));
      O(conn, 0.5 + 0.5 * seg(u, 1.3, 1.7) * R);
      S(lens, 'stroke', mix(C.dim, C.sub, seg(u, 1.2, 1.6) * R));
      S(lens, 'fill', C.deep);
      var gp = seg(u, 1.6, 2.6) * R, sc = 0.12 + 0.88 * (gp > 0 ? back(gp) : 0);
      T(pg, 'translate(' + LX + ' ' + LY + ') rotate(' + f2(Math.max(u, 0) * 6) + ') scale(' + f2(sc) + ')');
      S(blob, 'fill', '#1D2C42');
      S(blob, 'stroke', mix(C.dim, C.lime, gp));
      for (i = 0; i < incs.length; i++) {
        S(incs[i].n, 'fill', incs[i].c);
        O(incs[i].n, seg(u, incs[i].at, incs[i].at + 0.3) * R);
      }
      var sa = mod(Math.max(u, 0) * 0.45, 1);
      A(scan, 'y1', LY - LR + sa * LR * 2); A(scan, 'y2', LY - LR + sa * LR * 2);
      S(scan, 'stroke', C.lime);
      O(scan, 0.55 * seg(u, 2.8, 3.1) * R);
    };
  }

  /* 04 배출원 추적 */
  function bTrace(g) {
    var i, j, k;
    var chips = chipRow(g, 28, 76, ['공간 통계', '기상 자료'], 23, 10);   /* 16:9 좁은 무대에서도 12px 이상 */
    var X0 = 28, Y0 = 140, MW = 444, MH = 352, NC = 9, NR = 7, CW = MW / NC, CH = MH / NR;
    var frame = el('rect', { x: X0 - 4, y: Y0 - 4, width: MW + 8, height: MH + 8, rx: 10, fill: 'none', 'stroke-width': 1.6 }, g);
    var SX = X0 + 1.4 * CW, SY = Y0 + 5.5 * CH, WX = 0.8, WY = -0.6;
    var cells = [], vmax = 0;
    for (i = 0; i < NC; i++) for (j = 0; j < NR; j++) {
      var cx = X0 + (i + 0.5) * CW, cy = Y0 + (j + 0.5) * CH, dx = cx - SX, dy = cy - SY;
      var al = dx * WX + dy * WY, cr = Math.abs(dx * WY - dy * WX), v = 0;
      if (al > 0) {
        var sp = 0.5 * CW + 0.24 * al, aa = al / (3.4 * CW), fa = aa * Math.exp(1 - aa);
        v = Math.exp(-cr * cr / (2 * sp * sp)) * fa;
      }
      cells.push({ n: el('rect', { x: f2(X0 + i * CW + 2), y: f2(Y0 + j * CH + 2), width: f2(CW - 4), height: f2(CH - 4), rx: 6 }, g), v: v, i: i, j: j, cx: cx, cy: cy });
      if (v > vmax) vmax = v;
    }
    var hot = null;
    for (k = 0; k < cells.length; k++) {
      var c = cells[k];
      c.v = Math.max(c.v / vmax, 0.05 + 0.08 * rnd(c.i * 31 + c.j * 7));
      var col = c.v < 0.5 ? mix(C.green, C.lime, c.v / 0.5) : mix(C.lime, C.orange, (c.v - 0.5) / 0.5);
      c.col = col;
      c.at = 0.6 + (c.i + (NR - 1 - c.j) * 0.55) / (NC + NR * 0.55) * 1.5;
      if (c.v >= 0.8) {
        if (!hot) hot = { x0: c.i, x1: c.i, y0: c.j, y1: c.j, sx: 0, sy: 0, n: 0 };
        hot.x0 = Math.min(hot.x0, c.i); hot.x1 = Math.max(hot.x1, c.i); hot.y0 = Math.min(hot.y0, c.j); hot.y1 = Math.max(hot.y1, c.j);
        hot.sx += c.cx; hot.sy += c.cy; hot.n++;
      }
    }
    var HX = hot.sx / hot.n, HY = hot.sy / hot.n;
    var box = el('rect', { x: f2(X0 + hot.x0 * CW - 3), y: f2(Y0 + hot.y0 * CH - 3), width: f2((hot.x1 - hot.x0 + 1) * CW + 6), height: f2((hot.y1 - hot.y0 + 1) * CH + 6), rx: 10, fill: 'none', 'stroke-width': 2.6, 'stroke-dasharray': '10 7' }, g);
    var wind = [], WB = [[80, 470], [200, 420], [120, 300], [300, 330], [240, 220]], wAng = Math.atan2(WY, WX) * 180 / Math.PI;
    var wG = el('g', { fill: 'none', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    for (k = 0; k < WB.length; k++) wind.push(el('path', { d: 'M-16 0H12M3 -8L13 0L3 8' }, wG));
    var tr = el('line', { x1: f2(HX), y1: f2(HY), x2: f2(HX), y2: f2(HY), 'stroke-width': 3, 'stroke-dasharray': '0.1 9', 'stroke-linecap': 'round' }, g);
    var head = el('path', { d: 'M-10 -8L2 0L-10 8', fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    var tAng = Math.atan2(SY - HY, SX - HX) * 180 / Math.PI;
    var src = el('g', {}, g);
    var srcP = el('path', { d: 'M-18 12V-2L-9 -8V-2L0 -8V-2H5V-22H12V12Z', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, src);
    var puff = el('circle', { cx: 9, cy: -30, r: 5 }, src);
    return function (u, R) {
      var k2, lit = seg(u, 0, 0.4) * R;
      setChip(chips[0], seg(u, 0.3, 0.55), R);
      setChip(chips[1], seg(u, 0.8, 1.05), R);
      S(frame, 'stroke', mix(C.line, C.dim, lit));
      for (k2 = 0; k2 < cells.length; k2++) {
        var c2 = cells[k2], on = seg(u, c2.at, c2.at + 0.3) * R;
        S(c2.n, 'fill', on > 0.01 ? c2.col : C.cell);
        O(c2.n, on > 0.01 ? (0.25 + 0.7 * c2.v) * on + (1 - on) * 0.9 : 1);
      }
      var bp = seg(u, 2.3, 2.6) * R;
      S(box, 'stroke', C.text);
      O(box, bp);
      A(box, 'stroke-dashoffset', -Math.max(u, 0) * 14);
      var wv = seg(u, 0.9, 1.3) * R;
      wG.setAttribute('stroke', C.sky);
      for (k2 = 0; k2 < wind.length; k2++) {
        var a = mod(Math.max(u, 0) * 40 + k2 * 23, 110);
        T(wind[k2], 'translate(' + f2(WB[k2][0] + WX * a) + ',' + f2(WB[k2][1] + WY * a) + ') rotate(' + f2(wAng) + ')');
        O(wind[k2], 0.85 * Math.sin(Math.PI * a / 110) * wv);
      }
      var e = eio(seg(u, 2.9, 3.9));
      var ex = lerp(HX, SX + 16, e), ey = lerp(HY, SY - 12, e);
      A(tr, 'x2', ex); A(tr, 'y2', ey);
      S(tr, 'stroke', C.lime); S(head, 'stroke', C.lime);
      O(tr, seg(u, 2.85, 2.95) * R);
      O(head, seg(u, 2.85, 2.95) * (1 - seg(u, 3.9, 4.1)) * R);
      T(head, 'translate(' + f2(ex) + ',' + f2(ey) + ') rotate(' + f2(tAng) + ')');
      var sp2 = seg(u, 3.8, 4.2) * R;
      O(src, sp2);
      T(src, 'translate(' + f2(SX) + ',' + f2(SY + 4) + ') scale(' + f2(0.6 + 0.4 * back(sp2)) + ')');
      S(srcP, 'fill', C.card); S(srcP, 'stroke', C.lime);
      S(puff, 'fill', C.sub);
      O(puff, 0.5 + 0.3 * Math.sin(Math.max(u, 0) * 3));
    };
  }

  /* 05 논문 */
  function bPaper(g) {
    var k, papers = [];
    for (k = 0; k < 3; k++) {
      var pg = el('g', {}, g);
      var sh = el('path', { d: 'M0 0H58L78 20V104H0Z', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, pg);
      var ln = el('path', { d: 'M58 0V20H78M14 38H62M14 52H62M14 66H62M14 80H44', fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, pg);
      papers.push({ g: pg, sh: sh, ln: ln, x: 138 + k * 24, y: 86 + k * 18, at: 0.3 + k * 0.5 });
    }
    var link = linkText(g, 28, 270, '논문 모션 보기', 22);
    return function (u, R) {
      for (var i = 0; i < papers.length; i++) {
        var p = papers[i], e = eo(seg(u, p.at, p.at + 0.45)) * R;
        T(p.g, 'translate(' + p.x + ',' + f2(p.y - 34 * (1 - e)) + ')');
        O(p.g, e);
        S(p.sh, 'fill', C.card); S(p.sh, 'stroke', i === 2 ? C.lime : C.text);
        S(p.ln, 'stroke', C.sub);
      }
      setLink(link, seg(u, 1.9, 2.2), R);
    };
  }

  /* 05 측정 플랫폼 */
  function bPlatform(g) {
    var k;
    var fr = el('rect', { x: 28, y: 82, width: 344, height: 152, rx: 10, 'stroke-width': 2.2 }, g);
    var chrome = [];
    for (k = 0; k < 3; k++) chrome.push(el('circle', { cx: 44 + k * 13, cy: 97, r: 3.5 }, g));
    var map = el('rect', { x: 40, y: 112, width: 132, height: 110, rx: 6 }, g);
    var grid = el('path', { d: 'M84 112V222M128 112V222M40 149H172M40 186H172', fill: 'none', 'stroke-width': 1.4 }, g);
    var MD = [[62, 130, 'green'], [108, 128, 'green'], [150, 160, 'orange'], [70, 200, 'green'], [118, 176, 'lime'], [154, 206, 'green']], mdots = [];
    for (k = 0; k < MD.length; k++) mdots.push({ n: el('circle', { cx: MD[k][0], cy: MD[k][1], r: 6 }, g), c: C[MD[k][2]], at: 0.4 + k * 0.12 });
    var bars = [], BH = [0.45, 0.7, 0.55, 0.9, 0.62, 0.78];
    for (k = 0; k < BH.length; k++) bars.push(el('rect', { x: 192 + k * 28, width: 16, rx: 3 }, g));
    var base = el('line', { x1: 186, y1: 222, x2: 360, y2: 222, 'stroke-width': 1.6 }, g);
    var spark = el('polyline', { fill: 'none', 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
    var link = linkText(g, 28, 270, '대표 과제 보기', 22);
    return function (u, R) {
      var i, lit = seg(u, 0, 0.4) * R;
      S(fr, 'stroke', mix(C.dim, C.text, lit)); S(fr, 'fill', '#111A28');
      for (i = 0; i < 3; i++) S(chrome[i], 'fill', mix(C.line, i ? C.dim : C.lime, lit));
      S(map, 'fill', C.cell);
      S(grid, 'stroke', C.line);
      for (i = 0; i < mdots.length; i++) {
        var on = seg(u, mdots[i].at, mdots[i].at + 0.25) * R;
        S(mdots[i].n, 'fill', mdots[i].c);
        O(mdots[i].n, on);
        A(mdots[i].n, 'r', 6 * (0.5 + 0.5 * back(on)) + (on > 0.99 ? Math.sin(u * 3 + i) * 0.8 : 0));
      }
      for (i = 0; i < bars.length; i++) {
        var h = 70 * BH[i] * eo(seg(u, 0.5 + i * 0.08, 1.1 + i * 0.08)) * R * (0.92 + 0.08 * Math.sin(u * 1.7 + i));
        A(bars[i], 'y', 221 - h); A(bars[i], 'height', Math.max(h, 0));
        S(bars[i], 'fill', i === 3 ? C.lime : C.green);
      }
      S(base, 'stroke', mix(C.line, C.dim, lit));
      var w = seg(u, 0.4, 1.4) * R, pts = [];
      if (w > 0) {
        var m = Math.max(2, Math.round(18 * w));
        for (i = 0; i < m; i++) {
          var v = 0.5 + 0.25 * Math.sin(i * 0.7 + 0.4) + 0.15 * Math.sin(i * 1.6 + Math.max(u, 0) * 0.8);
          pts.push(f2(192 + i * (164 / 17)) + ',' + f2(144 - 36 * v));
        }
      }
      A(spark, 'points', pts.join(' '));
      S(spark, 'stroke', C.sky);
      setLink(link, seg(u, 2.2, 2.5), R);
    };
  }

  /* =========================================================
     흐름도 정의 (문구는 확정본 그대로)
     ========================================================= */
  var STEPS = [
    { no: '01', name: '현장', cap: '산업단지, 사업장 굴뚝, 도시 대기. 대기오염물질이 배출되고 이동하는 현장에서 연구가 시작됩니다.' },
    { no: '02', name: '측정', cap: '측정 차량, 드론, 고정 측정 장비로 입자상·가스상 물질을 측정하고 시료를 채취합니다.', bundle: true },
    { no: '03', name: '분석', cap: '채취한 시료와 측정 자료의 성분과 물리·화학적 특성을 분석합니다.' },
    { no: '04', name: '추적', cap: '측정 자료와 기상 자료를 통합하고 공간 통계로 고농도 지역을 선별해 배출원을 추적합니다.' },
    { no: '05', name: '활용', cap: '결과는 논문으로 발표하고, 관리기관이 활용할 수 있는 측정 플랫폼 기술로 개발합니다.' }
  ];
  /* tz: 제목 글자 크기, minTx: 안쪽 칩·항목 중 가장 작은 글자 크기(없으면 제목) — 확대 배율 하한 계산용
     ev: [노드 시각, 효과음, 인자] */
  var NODES = [
    { id: 's1', step: 0, x: 80, y: 470, w: 440, h: 470, title: '현장', tz: 30, minTx: 24, build: bSite, ev: [[0.9, 'ping', 0], [1.5, 'ping', 4], [2.1, 'ping', 7]] },
    { id: 's2a', step: 1, x: 720, y: 300, w: 420, h: 200, title: '측정 차량 · 이동 측정', tz: 28, minTx: 28, build: bCar, ev: [[0, 'ping', 0]] },
    { id: 's2b', step: 1, x: 720, y: 530, w: 420, h: 200, title: '드론 · 상공 시료 채취', tz: 28, minTx: 28, build: bDrone, ev: [[0, 'ping', 4]] },
    { id: 's2c', step: 1, x: 720, y: 760, w: 420, h: 200, title: '고정 측정 · 연속 측정', tz: 28, minTx: 28, build: bFixed, ev: [[0, 'ping', 7]] },
    { id: 's3a', step: 2, x: 1360, y: 300, w: 460, h: 330, title: '가스상 성분 분석', tz: 30, minTx: 21, build: bGas, ev: [[0.3, 'ping', 0]] },
    { id: 's3b', step: 2, x: 1360, y: 660, w: 460, h: 330, title: '단일 입자 분석', tz: 30, minTx: 21, build: bParticle, ev: [[0.3, 'ping', 2], [0.9, 'ping', 4], [1.5, 'ping', 7]] },
    { id: 's4', step: 3, x: 1980, y: 385, w: 500, h: 520, title: '배출원 추적', tz: 30, minTx: 23, build: bTrace, ev: [[0.3, 'ping', 0], [0.8, 'ping', 4], [2.3, 'ping', 7], [3.8, 'ping', 12]] },
    { id: 's5a', step: 4, x: 2680, y: 330, w: 400, h: 300, title: '논문', tz: 30, minTx: 22, build: bPaper, href: 'publications.html#paper-voc', ev: [[0.3, 'ping', 0], [0.8, 'ping', 2], [1.3, 'ping', 4]] },
    { id: 's5b', step: 4, x: 2680, y: 670, w: 400, h: 300, title: '측정 플랫폼', tz: 30, minTx: 22, build: bPlatform, href: 'platform.html', ev: [[2.2, 'ping', 7]] }
  ];
  var J23 = [1250, 630];
  var RET_LABEL = '관리 · 재측정', RET_Y = 1132, RET_X = 1590;
  var WORLD = { x: 60, y: 280, w: 3040, h: 900 };

  /* 시간표(초) */
  var OV = 2.0, STEP = 5.8, MOVE = 1.6, TRAVEL = 0.8, OUT = OV + STEP * 5, TOTAL = 34;
  var ST = [];
  for (var sk = 0; sk <= 5; sk++) ST.push(OV + STEP * sk);   /* ST[5] = OUT */
  var RET = [OUT + 0.2, OUT + 2.7];           /* 순환선 빛 점 */
  var RESET = [OUT + 2.2, OUT + 2.95];        /* 모든 노드가 처음 상태로 */

  var ICON_PAUSE = K.ICON_PAUSE, ICON_PLAY = K.ICON_PLAY, ICON_RESTART = K.ICON_RESTART;
  var ICON_ALL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="6" height="5" rx="1.5"/><rect x="15" y="3.5" width="6" height="5" rx="1.5"/><rect x="15" y="15.5" width="6" height="5" rx="1.5"/><path d="M9 7.5h2.5a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 0 1.5 1.5H15M13 6h2"/></svg>';

  /* 탭(좌표 포함) / 좌우 스와이프 */
  function gestures(target, onTap, onSwipe) {
    var sx = 0, sy = 0, st = 0, pid = null;
    if (!window.PointerEvent) { target.addEventListener('click', function (e) { onTap(e.clientX, e.clientY); }); return; }
    target.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY; st = Date.now();
    });
    target.addEventListener('pointerup', function (e) {
      if (pid === null || e.pointerId !== pid) return;
      pid = null;
      var dx = e.clientX - sx, dy = e.clientY - sy, ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax >= 40 && ax > ay * 1.6) onSwipe(dx < 0 ? 1 : -1);
      else if (ax < 12 && ay < 12 && Date.now() - st < 600) onTap(e.clientX, e.clientY);
    });
    target.addEventListener('pointercancel', function () { pid = null; });
  }

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* =========================================================
     무대
     ========================================================= */
  var UID = 0;
  function Flow(root) {
    var self = this, i, k;
    UID++;
    this.root = root;
    this.t = 0;
    this.mode = reduced ? 'still' : 'tour';   /* tour | overview | still */
    this.playing = false; this.userPaused = false; this.inView = false; this.debug = false;
    this.raf = 0; this.last = 0; this.cur = -1; this.blend = null; this.lastCam = null;
    this.still = { step: 0, shot: -1 };       /* still: shot -1 = 전체 보기 */

    var fb = root.querySelector('.fs-fallback');
    if (fb) fb.hidden = true;
    root.classList.add('fs-on');
    if (reduced) root.classList.add('fs-still');

    /* ---- 틀 ---- */
    var frame = document.createElement('div'); frame.className = 'fs-frame';
    var top = document.createElement('div'); top.className = 'fs-top';
    var steps = document.createElement('ol'); steps.className = 'fs-steps'; steps.setAttribute('aria-label', '연구 단계');
    this.stepBtns = []; this.bars = [];
    for (i = 0; i < STEPS.length; i++) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'fs-step';
      b.innerHTML = '<span class="n">' + STEPS[i].no + '</span> <span class="t">' + STEPS[i].name + '</span><span class="bar" aria-hidden="true"><i></i></span>';
      (function (idx) { b.addEventListener('click', function () { self.go(idx); }); })(i);
      li.appendChild(b); steps.appendChild(li);
      this.stepBtns.push(b); this.bars.push(b.querySelector('.bar i'));
    }
    top.appendChild(steps);
    var screen = document.createElement('div');
    screen.className = 'fs-screen'; screen.tabIndex = 0;
    screen.setAttribute('role', 'group');
    screen.setAttribute('aria-roledescription', '모션 그래픽');
    screen.setAttribute('aria-label', reduced
      ? '연구 흐름도. 위 단계 버튼이나 좌우 화살표 키로 단계를 넘겨 볼 수 있습니다.'
      : '연구 흐름도 모션 그래픽. 스페이스 키나 탭으로 재생과 일시정지, 좌우 화살표 키나 옆으로 밀어 단계 이동.');
    var route = document.createElement('span'); route.className = 'fs-route'; route.setAttribute('aria-hidden', 'true');
    route.textContent = '현장 → 배출원';
    screen.appendChild(route);
    frame.appendChild(top); frame.appendChild(screen);
    this.screen = screen;

    /* ---- 자막 ---- */
    var cap = document.createElement('div'); cap.className = 'fs-cap';
    cap.innerHTML = '<p class="fs-title"><b></b><span></span></p><p class="fs-sub" aria-live="polite"></p>';
    this.capEl = cap; this.capNo = cap.querySelector('b'); this.capTitle = cap.querySelector('.fs-title span'); this.capSub = cap.querySelector('.fs-sub');

    /* ---- 조작부 ---- */
    var ctrl = document.createElement('div'); ctrl.className = 'fs-ctrl';
    var play = document.createElement('button'); play.type = 'button'; play.className = 'ms-btn fs-play';
    var restart = document.createElement('button'); restart.type = 'button'; restart.className = 'ms-btn fs-restart';
    restart.setAttribute('aria-label', '처음부터 다시 보기'); restart.innerHTML = ICON_RESTART;
    var all = document.createElement('button'); all.type = 'button'; all.className = 'fs-all';
    all.innerHTML = ICON_ALL + '<span>전체 보기</span>';
    all.setAttribute('aria-pressed', 'false');
    ctrl.appendChild(play); ctrl.appendChild(restart);
    this.snd = AUD ? AUD.attach({ theme: 'flow', ctrl: ctrl, btnClass: 'ms-btn', pill: false }) : null;
    ctrl.appendChild(all);
    if (reduced) { play.hidden = true; restart.hidden = true; }
    this.playBtn = play; this.allBtn = all;

    root.insertBefore(ctrl, root.firstChild);
    root.insertBefore(cap, ctrl);
    root.insertBefore(frame, cap);

    /* ---- SVG ---- */
    var svg = el('svg', { 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMid meet' });
    screen.insertBefore(svg, route);
    this.svg = svg;
    var defs = el('defs', {}, svg);
    var gid = 'flg' + UID, pid2 = 'flp' + UID, fid = 'flf' + UID;
    var lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#0C1420' }, lg);
    el('stop', { offset: 1, 'stop-color': '#0F2337' }, lg);
    this.pat = el('pattern', { id: pid2, width: 26, height: 26, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 13, cy: 13, r: 1.2, fill: '#22324A' }, this.pat);
    var flt = el('filter', { id: fid, x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    el('feGaussianBlur', { stdDeviation: 16 }, flt);
    this.bg = el('rect', { x: 0, y: 0, fill: 'url(#' + gid + ')' }, svg);
    this.grid = el('rect', { x: 0, y: 0, fill: 'url(#' + pid2 + ')' }, svg);
    var cam = this.cam = el('g', {}, svg);

    /* 바깥 빛(blur 한 곳): 활성 노드의 빛 사각형만 보이게 */
    var glowG = el('g', { filter: 'url(#' + fid + ')' }, cam);
    var edgeG = el('g', { fill: 'none' }, cam);
    var dotG = el('g', {}, cam);
    var nodeG = el('g', {}, cam);

    /* ---- 노드 ---- */
    this.nodes = [];
    var stepIdx = [0, 0, 0, 0, 0];
    for (i = 0; i < NODES.length; i++) {
      var nd = NODES[i];
      var ng = el('g', { transform: 'translate(' + nd.x + ',' + nd.y + ')' }, nodeG);
      var card = NS(el('rect', { width: nd.w, height: nd.h, rx: 22, fill: C.card, stroke: C.line, 'stroke-width': 1 }, ng));
      var small = nd.h <= 200;
      var title = tx(ng, small ? 24 : 28, small ? 46 : 54, nd.title, nd.tz, C.sub, { w: 700, ls: '-0.6' });
      var inner = el('g', {}, ng);
      var glow = el('rect', { x: nd.x - 6, y: nd.y - 6, width: nd.w + 12, height: nd.h + 12, rx: 26, fill: 'none', stroke: C.lime, 'stroke-width': 10 }, glowG);
      vis(glow, false);
      this.nodes.push({ d: nd, g: ng, card: card, title: title, glow: glow, idx: stepIdx[nd.step]++, upd: nd.build(inner, UID) });
    }

    /* ---- 연결선 ---- */
    function port(n, side) { return [side > 0 ? n.x + n.w : n.x, n.y + n.h / 2]; }
    function curve(a, b) {
      var d = Math.max(40, (b[0] - a[0]) * 0.5);
      return 'M' + a[0] + ' ' + a[1] + 'C' + (a[0] + d) + ' ' + a[1] + ' ' + (b[0] - d) + ' ' + b[1] + ' ' + b[0] + ' ' + b[1];
    }
    var N = {};
    for (i = 0; i < NODES.length; i++) N[NODES[i].id] = NODES[i];
    var E = [];
    ['s2a', 's2b', 's2c'].forEach(function (id) { E.push({ d: curve(port(N.s1, 1), port(N[id], -1)), step: 1, ph: [0, 1] }); });
    ['s2a', 's2b', 's2c'].forEach(function (id) { E.push({ d: curve(port(N[id], 1), J23), step: 2, ph: [0, 0.5] }); });
    ['s3a', 's3b'].forEach(function (id) { E.push({ d: curve(J23, port(N[id], -1)), step: 2, ph: [0.5, 1] }); });
    ['s3a', 's3b'].forEach(function (id) { E.push({ d: curve(port(N[id], 1), port(N.s4, -1)), step: 3, ph: [0, 1] }); });
    ['s5a', 's5b'].forEach(function (id) { E.push({ d: curve(port(N.s4, 1), port(N[id], -1)), step: 4, ph: [0, 1] }); });
    /* 순환선: 측정 플랫폼 아래 → 아래쪽 긴 선 → 현장 아래 */
    var rx0 = N.s5b.x + N.s5b.w / 2, ry0 = N.s5b.y + N.s5b.h, rx1 = N.s1.x + N.s1.w / 2, ry1 = N.s1.y + N.s1.h, RC = 44;
    E.push({
      d: 'M' + rx0 + ' ' + ry0 + 'V' + (RET_Y - RC) + 'Q' + rx0 + ' ' + RET_Y + ' ' + (rx0 - RC) + ' ' + RET_Y +
        'H' + (rx1 + RC) + 'Q' + rx1 + ' ' + RET_Y + ' ' + rx1 + ' ' + (RET_Y - RC) + 'V' + ry1, step: 5, ph: [0, 1], ret: true
    });
    this.edges = [];
    for (i = 0; i < E.length; i++) {
      var base = NS(el('path', { d: E[i].d, stroke: C.line, 'stroke-width': 1.4, 'stroke-dasharray': E[i].ret ? '6 6' : '' }, edgeG));
      var lit = NS(el('path', { d: E[i].d, stroke: C.green, 'stroke-width': 2, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, edgeG));
      var dg = el('g', {}, dotG), dots = [];
      for (k = 0; k < 4; k++) dots.push(el('circle', { r: 4, fill: k ? C.lime : '#F4FFE0' }, dg));
      var halo = el('circle', { r: 12, fill: C.lime, opacity: 0.22 }, dg);
      dg.insertBefore(halo, dg.firstChild);
      vis(dg, false);
      var len = 1, samp = [];
      try { len = base.getTotalLength(); for (k = 0; k <= 80; k++) { var pt = base.getPointAtLength(len * k / 80); samp.push([pt.x, pt.y]); } }
      catch (e) { samp = [[0, 0], [0, 0]]; }
      this.edges.push({ e: E[i], base: base, lit: lit, dg: dg, dots: dots, halo: halo, samp: samp, len: len });
    }
    /* 합류점 */
    this.junction = NS(el('circle', { cx: J23[0], cy: J23[1], r: 7, fill: C.deep, stroke: C.line, 'stroke-width': 1.4 }, edgeG));
    /* 순환선 이름표 */
    var rl = this.retLab = el('g', {}, edgeG);
    this.retRect = NS(el('rect', { y: RET_Y - 23, height: 46, rx: 23, fill: C.deep, stroke: C.line, 'stroke-width': 1.2 }, rl));
    this.retText = tx(rl, RET_X, RET_Y + 8.5, RET_LABEL, 24, C.sub, { w: 600, anchor: 'middle', ls: '-0.2' });
    this.fitText();

    /* ---- 조작 ---- */
    play.addEventListener('click', function () {
      if (self.mode !== 'tour') { self.exitOverview(); self.userPaused = false; }
      else if (self.userPaused || self.debug) { self.userPaused = false; self.debug = false; }
      else self.userPaused = true;
      self.sync();
    });
    restart.addEventListener('click', function () {
      self.startBlend(); self.mode = 'tour'; self.t = 0; self.userPaused = false; self.debug = false;
      self.render(); self.sync();
    });
    all.addEventListener('click', function () {
      if (self.mode === 'overview' || (reduced && self.still.shot < 0)) {
        if (reduced) return;
        self.exitOverview(); self.userPaused = false; self.sync();
      } else self.enterOverview();
    });
    gestures(screen, function (cx, cy) { self.tap(cx, cy); }, function (dir) { self.swipe(dir); });
    root.addEventListener('keydown', function (e) {
      var key = e.key;
      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        e.preventDefault();
        self.swipe(key === 'ArrowRight' ? 1 : -1);
      } else if ((key === ' ' || key === 'Spacebar' || key === 'Enter') && e.target === screen) {
        e.preventDefault();
        if (!reduced) play.click();
      }
    });
    /* 마우스: 전체 보기에서 노드 위면 손가락 모양 */
    screen.addEventListener('mousemove', function (e) {
      var n = (self.mode === 'overview' || self.mode === 'still') ? self.nodeAt(e.clientX, e.clientY) : null;
      screen.style.cursor = n ? 'pointer' : '';
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { self.inView = en[0].isIntersecting; self.sync(); }, { threshold: 0.3 }).observe(screen);
    } else this.inView = true;
    document.addEventListener('visibilitychange', function () { self.sync(); });

    /* 크기 */
    this.layout();
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { var w = self.W, h = self.H; self.layout(); if (w !== self.W || h !== self.H) self.render(); }).observe(screen);
    } else window.addEventListener('resize', function () { self.layout(); self.render(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { self.fitText(); self.render(); });

    var m = /[?&]flow=([0-9.]+)/.exec(window.location.search);
    if (m) { this.debug = true; this.mode = 'tour'; this.t = mod(parseFloat(m[1]) || 0, TOTAL); }
    this.render();
    this.sync();
  }

  Flow.prototype.fitText = function () {
    for (var i = 0; i < ROWS.length; i++) ROWS[i].layout();
    for (i = 0; i < LINKS.length; i++) LINKS[i].layout();
    var w = 170;
    try { var tw = this.retText.getComputedTextLength(); if (tw > 0) w = tw + 44; } catch (e) { /* 그대로 */ }
    A(this.retRect, 'x', RET_X - w / 2); A(this.retRect, 'width', w);
  };

  /* ---------- 카메라 ---------- */
  Flow.prototype.layout = function () {
    var W = this.screen.clientWidth, H = this.screen.clientHeight;
    if (W < 120 || H < 120) return;   /* 아직 배치 전(스타일 적용 전) */
    this.W = W; this.H = H;
    A(this.svg, 'viewBox', '0 0 ' + W + ' ' + H);
    A(this.bg, 'width', W); A(this.bg, 'height', H);
    A(this.grid, 'width', W); A(this.grid, 'height', H);
    var portrait = H > W * 1.05;
    this.portrait = portrait;
    var topR = portrait ? 30 : 58, botR = portrait ? 6 : 10;
    this.pad = portrait ? 14 : 22;
    this.smax = portrait ? 1.1 : 1.15;
    this.U = { x: 0, y: topR, w: W, h: H - topR - botR };
    this.ov = this.fit(WORLD);
    this.ov.ov = true;
    this.shots = []; this.split = []; this.arrive = []; this.shotOf = {};
    for (var k = 0; k < STEPS.length; k++) {
      var list = [], need = 0, j;
      for (j = 0; j < NODES.length; j++) if (NODES[j].step === k) {
        list.push(NODES[j]);
        need = Math.max(need, 15 / NODES[j].tz, 12 / NODES[j].minTx);
      }
      var union = this.fit(boxOf(list));
      var split = list.length > 1 && ((portrait && !STEPS[k].bundle) || union.s < need);
      var shots = split ? list.map(function (n) { return this.fit(boxOf([n])); }, this) : [union];
      var arr = [], slot = (STEP - MOVE) / shots.length;
      for (j = 0; j < shots.length; j++) arr.push(ST[k] + MOVE + j * slot);
      for (j = 0; j < list.length; j++) this.shotOf[list[j].id] = split ? j : 0;
      this.shots.push(shots); this.split.push(split); this.arrive.push(arr);
    }
    this.buildTrack();
    this.buildCues();
  };
  function boxOf(list) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < list.length; i++) {
      x0 = Math.min(x0, list[i].x); y0 = Math.min(y0, list[i].y);
      x1 = Math.max(x1, list[i].x + list[i].w); y1 = Math.max(y1, list[i].y + list[i].h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  Flow.prototype.fit = function (b) {
    var U = this.U, p = this.pad;
    var s = Math.max(0.02, Math.min((U.w - 2 * p) / b.w, (U.h - 2 * p) / b.h, this.smax));
    return { x: b.x + b.w / 2, y: b.y + b.h / 2, s: s, box: b };
  };
  Flow.prototype.visBox = function (c) {
    var w = this.U.w / c.s, h = this.U.h / c.s;
    return { x: c.x - w / 2, y: c.y - h / 2, w: w, h: h };
  };
  /* 두 화면 사이를 옮길 때: 가운데쯤에서 둘 다 보이도록 잠깐 물러나는 양(로그 배율) */
  Flow.prototype.bumpOf = function (a, b, tight) {
    var ba = tight && a.box ? a.box : this.visBox(a), bb = tight && b.box ? b.box : this.visBox(b);
    var x0 = Math.min(ba.x, bb.x), y0 = Math.min(ba.y, bb.y);
    var u = this.fit({ x: x0, y: y0, w: Math.max(ba.x + ba.w, bb.x + bb.w) - x0, h: Math.max(ba.y + ba.h, bb.y + bb.h) - y0 });
    var mid = (Math.log(a.s) + Math.log(b.s)) / 2;
    return clamp(mid - Math.log(u.s), 0, 1.2);
  };
  function moveCam(a, b, p, bump) {
    var e = eio(p), ls = lerp(Math.log(a.s), Math.log(b.s), e) - bump * Math.pow(Math.sin(Math.PI * p), 2);
    return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), s: Math.exp(ls) };
  }
  Flow.prototype.buildTrack = function () {
    var tr = [], prev = this.ov, prevOv = true, k, j;
    tr.push({ t0: 0, t1: ST[0], hold: this.ov, drift: 0 });
    for (k = 0; k < STEPS.length; k++) {
      var sh = this.shots[k], arr = this.arrive[k];
      tr.push({ t0: ST[k], t1: ST[k] + MOVE, a: prev, b: sh[0], bump: prevOv ? 0 : this.bumpOf(prev, sh[0], true) });
      for (j = 0; j < sh.length; j++) {
        var end = j < sh.length - 1 ? arr[j + 1] - 0.9 : ST[k + 1];
        var drift = 0.02 * (end - arr[j]) / (STEP - MOVE);
        tr.push({ t0: arr[j], t1: end, hold: sh[j], drift: drift });
        prev = { x: sh[j].x, y: sh[j].y, s: sh[j].s * (1 + drift), box: sh[j].box };
        if (j < sh.length - 1) tr.push({ t0: end, t1: arr[j + 1], a: prev, b: sh[j + 1], bump: this.bumpOf(prev, sh[j + 1], true) * 0.8 });
      }
      prevOv = false;
    }
    tr.push({ t0: OUT, t1: OUT + 1.4, a: prev, b: this.ov, bump: 0 });
    tr.push({ t0: OUT + 1.4, t1: TOTAL + 0.01, hold: this.ov, drift: 0 });
    this.track = tr;
  };
  Flow.prototype.camAt = function (t) {
    var tr = this.track;
    for (var i = 0; i < tr.length; i++) {
      var s = tr[i];
      if (t >= s.t0 && t < s.t1) {
        if (s.hold) return { x: s.hold.x, y: s.hold.y, s: s.hold.s * (1 + s.drift * seg(t, s.t0, s.t1)) };
        return moveCam(s.a, s.b, seg(t, s.t0, s.t1), s.bump);
      }
    }
    return { x: this.ov.x, y: this.ov.y, s: this.ov.s };
  };
  /* 노드 시각 */
  Flow.prototype.nodeU = function (n, t) {
    var k = n.d.step, l = t - ST[k];
    if (l < 0) return -1;
    if (this.split[k]) {
      var a = this.arrive[k][this.shotOf[n.d.id]] - ST[k];
      return (l - (a - 0.5)) * 1.4;
    }
    return l - TRAVEL - 0.3 * n.idx;
  };
  /* 효과음 큐(전역 시각) */
  Flow.prototype.buildCues = function () {
    var cues = [], k, i, j;
    for (k = 0; k < STEPS.length; k++) {
      cues.push([mod(ST[k] - 0.05, TOTAL), 'whoosh']);
      cues.push([ST[k] + MOVE - 0.1, 'land']);
    }
    for (i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i], ev = n.d.ev || [];
      k = n.d.step;
      for (j = 0; j < ev.length; j++) {
        var at;
        if (this.split[k]) at = ST[k] + this.arrive[k][this.shotOf[n.d.id]] - ST[k] - 0.5 + ev[j][0] / 1.4;
        else at = ST[k] + TRAVEL + 0.3 * n.idx + ev[j][0];
        cues.push([at, ev[j][1], ev[j][2]]);
      }
    }
    cues.push([OUT + 0.1, 'whoosh']);
    cues.push([RET[1] - 0.05, 'ping', 12]);
    cues.sort(function (a, b) { return a[0] - b[0]; });
    this.cues = cues;
  };

  /* ---------- 그리기 ---------- */
  Flow.prototype.curStep = function (t) {
    var c = 0;
    for (var k = 0; k < STEPS.length; k++) if (t >= ST[k]) c = k;
    return c;
  };
  Flow.prototype.render = function () {
    if (!this.W) this.layout();
    if (!this.W) return;
    var t = this.t, mode = this.mode, i, k;
    var full = mode !== 'tour';
    var R = full ? 1 : 1 - seg(t, RESET[0], RESET[1]);

    /* 카메라 */
    var cam;
    if (mode === 'overview') cam = { x: this.ov.x, y: this.ov.y, s: this.ov.s };
    else if (mode === 'still') {
      var sp = this.still;
      cam = sp.shot < 0 ? this.ov : this.shots[sp.step][sp.shot];
      cam = { x: cam.x, y: cam.y, s: cam.s };
    } else cam = this.camAt(t);
    if (this.blend) {
      var bp = (now() - this.blend.t0) / this.blend.dur;
      if (bp >= 1) this.blend = null;
      else cam = moveCam(this.blend.from, cam, bp, this.bumpOf(this.blend.from, cam) * 0.7);
    }
    this.lastCam = cam;
    var U = this.U;
    T(this.cam, 'translate(' + f2(U.x + U.w / 2) + ' ' + f2(U.y + U.h / 2) + ') scale(' + cam.s.toFixed(4) + ') translate(' + f2(-cam.x) + ' ' + f2(-cam.y) + ')');
    /* 점 격자: 카메라의 0.3 배로 따라 움직임(깊이감) */
    var gx = mod(-cam.x * cam.s * 0.3, 26), gy = mod(-cam.y * cam.s * 0.3, 26);
    A(this.pat, 'patternTransform', 'translate(' + f2(gx) + ' ' + f2(gy) + ')');

    /* 노드 */
    var cur = mode === 'still' ? this.still.step : this.curStep(t);
    for (i = 0; i < this.nodes.length; i++) {
      var n = this.nodes[i], st = n.d.step;
      var u = full ? 99 : this.nodeU(n, t);
      var act;
      if (mode === 'still') act = this.still.shot >= 0 && st === this.still.step ? 1 : 0;
      else if (full) act = 0;
      else act = seg(t, ST[st] + 0.6, ST[st] + 1.2) * (1 - seg(t, ST[st + 1], ST[st + 1] + 0.5));
      var tl = seg(u, -0.2, 0.3) * R;
      S(n.title, 'fill', mix(C.sub, C.text, tl));
      S(n.card, 'stroke', mix(C.line, C.lime, act));
      S(n.card, 'stroke-width', act > 0.5 ? 1.6 : 1);
      if (act > 0.01) { vis(n.glow, true); O(n.glow, act * (0.42 + 0.1 * Math.sin(t * 2.4))); }
      else vis(n.glow, false);
      n.upd(u, R);
    }

    /* 연결선과 빛 점 */
    var dr = 4.5 / cam.s;
    for (i = 0; i < this.edges.length; i++) {
      var ed = this.edges[i], e = ed.e, p, dotP = -1;
      if (full) p = 1;
      else if (e.ret) { p = eio(seg(t, RET[0], RET[1])); dotP = t > RET[0] && t < RET[1] ? p : -1; }
      else {
        var ts = ST[e.step] + e.ph[0] * TRAVEL, te = ST[e.step] + e.ph[1] * TRAVEL;
        p = t < ts ? 0 : eio(seg(t, ts, te));
        if (t > ts && t < te) dotP = p;
      }
      A(ed.lit, 'stroke-dashoffset', 1 - p);
      O(ed.lit, (e.ret ? 0.75 : 0.9) * R);
      if (dotP >= 0) {
        vis(ed.dg, true);
        for (k = 0; k < ed.dots.length; k++) {
          var q = dotP - k * (11 / cam.s) / ed.len;   /* 꼬리 간격: 화면에서 약 11px */
          if (q < 0) { O(ed.dots[k], 0); continue; }
          var pt = sampleAt(ed.samp, q);
          A(ed.dots[k], 'cx', pt[0]); A(ed.dots[k], 'cy', pt[1]);
          A(ed.dots[k], 'r', dr * (k ? 0.85 - k * 0.15 : 1));
          O(ed.dots[k], k ? 0.7 - k * 0.18 : 1);
          if (!k) { A(ed.halo, 'cx', pt[0]); A(ed.halo, 'cy', pt[1]); A(ed.halo, 'r', dr * 3); }
        }
      } else vis(ed.dg, false);
    }
    var jl = full ? 1 : seg(t, ST[2] + 0.35, ST[2] + 0.45) * R;
    S(this.junction, 'stroke', mix(C.line, C.green, jl));
    var rp = full ? 1 : seg(t, RET[0], RET[0] + 0.4) * R;
    S(this.retText, 'fill', mix(C.sub, C.text, rp));
    S(this.retRect, 'stroke', mix(C.line, C.green, rp));

    /* 단계 표시줄 */
    for (k = 0; k < this.bars.length; k++) {
      var bpg;
      if (mode === 'still') bpg = k === cur && this.still.shot >= 0 ? 1 : 0;
      else if (mode === 'overview') bpg = k < cur ? 1 : k === cur ? 1 : 0;
      else bpg = k < cur ? 1 : k > cur ? 0 : seg(t, ST[k], ST[k + 1]);
      if (mode === 'tour' && t < ST[0]) bpg = 0;
      this.bars[k].style.transform = 'scaleX(' + f2(bpg) + ')';
    }
    if (cur !== this.cur) this.setCap(cur);
  };
  function sampleAt(s, p) {
    var f = clamp(p, 0, 1) * (s.length - 1), i = Math.floor(f), r = f - i, a = s[i], b = s[Math.min(i + 1, s.length - 1)];
    return [lerp(a[0], b[0], r), lerp(a[1], b[1], r)];
  }

  Flow.prototype.setCap = function (i) {
    var self = this, first = this.cur < 0;
    this.cur = i;
    for (var k = 0; k < this.stepBtns.length; k++) {
      if (k === i) this.stepBtns[k].setAttribute('aria-current', 'step');
      else this.stepBtns[k].removeAttribute('aria-current');
    }
    function put() {
      self.capNo.textContent = STEPS[i].no;
      self.capTitle.textContent = STEPS[i].name;
      self.capSub.textContent = STEPS[i].cap;
      self.capEl.className = 'fs-cap';
    }
    if (first || reduced) { put(); return; }
    this.capEl.className = 'fs-cap swap';
    clearTimeout(this.capT);
    this.capT = setTimeout(put, 200);
  };

  /* ---------- 조작 ---------- */
  Flow.prototype.startBlend = function () {
    if (reduced || !this.lastCam) { this.blend = null; return; }
    this.blend = { from: this.lastCam, t0: now(), dur: 950 };
    this.kick();
  };
  /* 멈춘 상태에서도 카메라 전환이 끝날 때까지 그린다 */
  Flow.prototype.kick = function () {
    var self = this;
    if (this.playing || this.kraf) return;
    var loop = function () {
      self.kraf = 0;
      if (self.playing) return;
      self.render();
      if (self.blend) self.kraf = requestAnimationFrame(loop);
    };
    this.kraf = requestAnimationFrame(loop);
  };
  Flow.prototype.enterOverview = function () {
    if (reduced) { this.still.shot = -1; this.render(); this.syncAll(); return; }
    this.startBlend();
    this.mode = 'overview';
    this.render(); this.sync();
  };
  Flow.prototype.exitOverview = function () {
    if (this.mode === 'tour') return;
    this.startBlend();
    this.mode = 'tour';
  };
  Flow.prototype.go = function (k) {
    k = (k + STEPS.length) % STEPS.length;
    if (reduced) {
      this.still = { step: k, shot: 0 };
      this.render(); this.syncAll();
      if (this.snd) this.snd.sfx('whoosh');
      return;
    }
    this.startBlend();
    this.mode = 'tour'; this.debug = false; this.userPaused = false;
    this.t = ST[k] + 1.0;
    this.render(); this.sync();
  };
  Flow.prototype.goNode = function (n) {
    var k = n.d.step;
    if (reduced) {
      this.still = { step: k, shot: this.shotOf[n.d.id] };
      this.render(); this.syncAll();
      if (this.snd) this.snd.sfx('whoosh');
      return;
    }
    this.go(k);
  };
  Flow.prototype.swipe = function (dir) {
    if (reduced) {
      /* 움직임 줄이기: 비추는 화면(묶음이 나뉘면 노드 하나씩) 단위로 넘긴다 */
      var flat = [], i, j;
      for (i = 0; i < this.shots.length; i++) for (j = 0; j < this.shots[i].length; j++) flat.push([i, j]);
      var at = -1;
      for (i = 0; i < flat.length; i++) if (flat[i][0] === this.still.step && flat[i][1] === this.still.shot) at = i;
      var nx = at < 0 ? (dir > 0 ? 0 : flat.length - 1) : (at + dir + flat.length) % flat.length;
      this.still = { step: flat[nx][0], shot: flat[nx][1] };
      this.render(); this.syncAll();
      if (this.snd) this.snd.sfx('whoosh');
      return;
    }
    var cur = this.mode === 'tour' ? this.curStep(this.t) : this.cur;
    if (this.mode === 'tour' && this.t < ST[0] && dir > 0) cur = -1;
    this.go(cur + dir);
  };
  Flow.prototype.nodeAt = function (cx, cy) {
    var c = this.lastCam;
    if (!c) return null;
    var r = this.screen.getBoundingClientRect(), U = this.U;
    var wx = (cx - r.left - (U.x + U.w / 2)) / c.s + c.x, wy = (cy - r.top - (U.y + U.h / 2)) / c.s + c.y, m = 8 / c.s;
    for (var i = 0; i < this.nodes.length; i++) {
      var d = this.nodes[i].d;
      if (wx >= d.x - m && wx <= d.x + d.w + m && wy >= d.y - m && wy <= d.y + d.h + m) return this.nodes[i];
    }
    return null;
  };
  Flow.prototype.tap = function (cx, cy) {
    var n = this.nodeAt(cx, cy);
    var focused5 = this.mode === 'tour' && this.curStep(this.t) === 4 && this.t >= ST[4] + MOVE && this.t < OUT;
    if (this.mode === 'still' && reduced && this.still.shot >= 0 && this.still.step === 4) focused5 = true;
    if (n && n.d.href && (this.mode === 'overview' || (this.mode === 'still' && this.still.shot < 0) || focused5)) {
      window.location.href = n.d.href;
      return;
    }
    if (this.mode === 'overview' || this.mode === 'still') {
      if (n) this.goNode(n);
      return;
    }
    if (!reduced) this.playBtn.click();
  };
  Flow.prototype.syncAll = function () {
    var ov = this.mode === 'overview' || (this.mode === 'still' && this.still.shot < 0);
    this.allBtn.setAttribute('aria-pressed', ov ? 'true' : 'false');
    this.root.classList.toggle('fs-ov', ov);
  };
  Flow.prototype.sync = function () {
    var want = !reduced && !this.debug && !this.userPaused && this.mode === 'tour' && this.inView && !document.hidden;
    if (want && !this.playing) {
      var self = this;
      this.playing = true; this.last = 0;
      if (this.kraf) { cancelAnimationFrame(this.kraf); this.kraf = 0; }
      this.raf = requestAnimationFrame(function (ts) { self.tick(ts); });
    } else if (!want && this.playing) {
      this.playing = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.blend) this.kick();
    }
    var showPause = this.mode === 'tour' && (this.playing || (!this.userPaused && !this.debug && !this.inView));
    this.playBtn.innerHTML = showPause ? ICON_PAUSE : ICON_PLAY;
    this.playBtn.setAttribute('aria-label', showPause ? '일시정지' : '재생');
    this.root.classList.toggle('fs-held', this.mode === 'tour' && this.userPaused && !this.debug);
    this.syncAll();
    if (this.snd) this.snd.active(this.playing);
  };
  Flow.prototype.tick = function (ts) {
    if (!this.playing) return;
    var self = this;
    var dt = this.last ? Math.min(ts - this.last, 60) / 1000 : 0;
    this.last = ts;
    var prev = this.t;
    this.t += dt;
    if (this.t >= TOTAL) this.t -= TOTAL;
    if (this.snd && dt > 0) this.snd.cues(prev, this.t, this.cues, TOTAL);
    this.render();
    this.raf = requestAnimationFrame(function (t2) { self.tick(t2); });
  };

  /* ---------- 시작 ---------- */
  var flow = null;
  try { flow = new Flow(ROOT); } catch (err) { if (window.console) console.error(err); }
  window.__flow = {
    stage: flow, total: TOTAL, starts: ST,
    seek: function (t) { if (!flow) return; flow.blend = null; flow.debug = true; flow.mode = 'tour'; flow.t = mod(t, TOTAL); flow.render(); flow.sync(); },
    focus: function (n) { this.seek(ST[clamp(Math.round(n), 1, 5) - 1] + STEP - 0.25); },
    overview: function () { if (!flow) return; flow.blend = null; flow.debug = true; flow.mode = reduced ? 'still' : 'overview'; flow.still.shot = -1; flow.render(); flow.sync(); },
    cam: function () { return flow && flow.lastCam; }
  };
})();
