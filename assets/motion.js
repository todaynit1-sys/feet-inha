/* FEET Lab — 모션 무대 v1 (대표 과제 소개)
   순수 SVG + JS. 외부 라이브러리·소리 없음. 자막은 HTML.
   마크업: <section class="mstage" data-motion="platform"> … </section>
   디버그: 주소 뒤에 ?t=12.5 → 그 시각에서 멈춘 화면 (window.__mstage 로 조작) */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduced = false; }

  var C = {
    bg: '#0F2337', panel: '#132B43', panelLine: '#2B4866', block: '#17324D',
    fill: '#1E3D5C', line: '#B8CCE0', dim: '#56718D', mute: '#9FB4CA',
    text: '#DCE7F2', green: '#6BA03A', greenL: '#8BC35A', sky: '#7CC4E8',
    orange: '#F2A33A', red: '#E5533C'
  };
  var DISP = '"Space Grotesk","Pretendard Variable",Pretendard,sans-serif';
  var BODY = '"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif';

  /* ---------- 도우미 ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function eo(p) { return 1 - Math.pow(1 - p, 3); }
  function eio(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function back(p) {
    if (p <= 0) return 0;
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }
  function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function f2(v) { return Math.round(v * 100) / 100; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function mod(a, n) { return ((a % n) + n) % n; }

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, s, size, o) {
    o = o || {};
    var n = el('text', {
      x: x, y: y, 'font-size': size, fill: o.fill || C.text,
      'font-family': o.disp ? DISP : BODY, 'font-weight': o.w || 700,
      'text-anchor': o.anchor || 'start'
    }, parent);
    n.textContent = s;
    return n;
  }
  function A(n, k, v) { if (k === 'r' && typeof v === 'number' && v < 0) v = 0; n.setAttribute(k, typeof v === 'number' ? f2(v) : v); }
  function O(n, v) { n.setAttribute('opacity', f2(clamp(v, 0, 1))); }
  function T(n, s) { n.setAttribute('transform', s); }
  function vis(n, on) { n.style.display = on ? '' : 'none'; }

  /* 폴리라인을 고르게 나눈 점 [x, y, 각도] */
  function samplePoly(pts, n) {
    var lens = [], tot = 0, i;
    for (i = 1; i < pts.length; i++) {
      var d = Math.sqrt(Math.pow(pts[i][0] - pts[i - 1][0], 2) + Math.pow(pts[i][1] - pts[i - 1][1], 2));
      lens.push(d); tot += d;
    }
    var out = [];
    for (var k = 0; k <= n; k++) {
      var want = tot * k / n, s = 0;
      for (i = 0; i < lens.length; i++) {
        if (s + lens[i] >= want || i === lens.length - 1) {
          var p = lens[i] ? (want - s) / lens[i] : 0, a = pts[i], b = pts[i + 1];
          out.push([lerp(a[0], b[0], p), lerp(a[1], b[1], p), Math.atan2(b[1] - a[1], b[0] - a[0])]);
          break;
        }
        s += lens[i];
      }
    }
    return out;
  }
  function polyAt(samples, p) {
    var f = clamp(p, 0, 1) * (samples.length - 1), i = Math.floor(f), r = f - i;
    var a = samples[i], b = samples[Math.min(i + 1, samples.length - 1)];
    return [lerp(a[0], b[0], r), lerp(a[1], b[1], r), a[2]];
  }
  function bez(P, t) {
    var u = 1 - t;
    return [
      u * u * u * P[0] + 3 * u * u * t * P[2] + 3 * u * t * t * P[4] + t * t * t * P[6],
      u * u * u * P[1] + 3 * u * u * t * P[3] + 3 * u * t * t * P[5] + t * t * t * P[7]
    ];
  }
  function bezD(P) { return 'M' + P[0] + ' ' + P[1] + 'C' + P.slice(2).join(' '); }

  /* 작은 공장 (바닥 기준 0,0) */
  function factory(parent, fill, stroke, sw) {
    var g = el('g', {}, parent);
    el('rect', { x: -38, y: -98, width: 12, height: 54, fill: fill, stroke: stroke, 'stroke-width': sw }, g);
    el('path', { d: 'M-46 0V-46L-28-62V-46L-10-62V-46L8-62V-46L26-62V-46H46V0Z', fill: fill, stroke: stroke, 'stroke-width': sw, 'stroke-linejoin': 'round' }, g);
    el('rect', { x: -8, y: -22, width: 16, height: 22, fill: stroke, opacity: 0.45 }, g);
    return g;
  }

  /* =========================================================
     장면 1 — 사각지대
     ========================================================= */
  function sceneBlind(g) {
    var k;
    el('line', { x1: 0, y1: 764, x2: 1600, y2: 764, stroke: C.dim, 'stroke-width': 3 }, g);

    /* 큰 굴뚝 연기 */
    var smokeG = el('g', { fill: C.line }, g), smoke = [];
    for (k = 0; k < 16; k++) smoke.push(el('circle', { r: 10 }, smokeG));

    /* 대형 사업장 */
    var plant = el('g', {}, g);
    el('rect', { x: 1060, y: 582, width: 340, height: 182, rx: 8, fill: C.fill, stroke: C.line, 'stroke-width': 4 }, plant);
    for (k = 0; k < 5; k++) el('rect', { x: 1092 + k * 62, y: 624, width: 30, height: 42, rx: 4, fill: '#2A4C6E' }, plant);
    el('rect', { x: 1250, y: 222, width: 64, height: 362, fill: C.fill, stroke: C.line, 'stroke-width': 4 }, plant);
    el('rect', { x: 1238, y: 206, width: 88, height: 24, rx: 5, fill: C.fill, stroke: C.line, 'stroke-width': 4 }, plant);
    el('line', { x1: 1253, y1: 470, x2: 1311, y2: 470, stroke: C.dim, 'stroke-width': 4 }, plant);
    var tms = el('rect', { x: 1316, y: 338, width: 30, height: 40, rx: 5, fill: C.green }, plant);

    /* 감시 고리 */
    var ring = el('g', {}, g);
    var ringDash = el('circle', { cx: 1282, cy: 330, r: 104, fill: 'none', stroke: C.green, 'stroke-width': 4, 'stroke-dasharray': '16 12' }, ring);
    el('circle', { cx: 1282, cy: 330, r: 76, fill: 'none', stroke: C.green, 'stroke-width': 3, opacity: 0.7 }, ring);
    var pulse = el('circle', { cx: 1282, cy: 330, r: 76, fill: 'none', stroke: C.green, 'stroke-width': 3 }, ring);

    var lab = el('g', {}, g);
    var labDot = el('circle', { cx: 858, cy: 306, r: 9, fill: C.green }, lab);
    text(lab, 878, 317, 'TMS 실시간 감시', 32);
    el('line', { x1: 1140, y1: 312, x2: 1176, y2: 322, stroke: C.green, 'stroke-width': 3 }, lab);

    /* 92%+ */
    var numG = el('g', {}, g);
    var num = text(numG, 116, 250, '0%+', 150, { disp: true });
    text(numG, 122, 312, '전체 배출원 중 소규모 사업장', 32, { fill: C.mute, w: 600 });

    /* 작은 공장들 */
    var rows = [{ y: 630, s: 0.7, x0: 130, dx: 88, n: 10 }, { y: 700, s: 0.84, x0: 170, dx: 98, n: 9 }, { y: 764, s: 1, x0: 110, dx: 104, n: 9 }];
    var facs = [], r, c, idx = 0;
    for (r = 0; r < rows.length; r++) {
      for (c = 0; c < rows[r].n; c++) {
        var outer = el('g', {}, g);
        T(outer, 'translate(' + (rows[r].x0 + c * rows[r].dx) + ',' + rows[r].y + ') scale(' + rows[r].s + ')');
        var puffs = [el('circle', { fill: '#8EA2B7', r: 8 }, outer), el('circle', { fill: '#8EA2B7', r: 8 }, outer)];
        var inner = el('g', {}, outer);
        factory(inner, '#2B4765', '#8299B1', 3.5);
        facs.push({ outer: outer, inner: inner, puffs: puffs, ord: rnd(idx + 7), ph: rnd(idx + 31) * 2.6 });
        idx++;
      }
    }
    var sorted = facs.slice().sort(function (a, b) { return a.ord - b.ord; });
    for (k = 0; k < sorted.length; k++) sorted[k].delay = 1.5 + k * 0.085;

    /* 사각지대 표시 */
    var br = el('g', {}, g);
    var brRect = el('rect', { x: 60, y: 520, width: 952, height: 262, rx: 22, fill: 'none', stroke: C.orange, 'stroke-width': 4, 'stroke-dasharray': '18 12' }, br);
    var brLab = el('g', {}, br);
    el('rect', { x: 84, y: 488, width: 228, height: 54, rx: 27, fill: C.bg, stroke: C.orange, 'stroke-width': 3 }, brLab);
    text(brLab, 198, 525, '감시 사각지대', 30, { fill: C.orange, anchor: 'middle' });

    return function (l) {
      var a, e, k2;
      for (k2 = 0; k2 < smoke.length; k2++) {
        a = mod(l + k2 * 0.27, 4.3);
        A(smoke[k2], 'cx', 1282 + a * 58 + Math.sin(a * 1.7 + k2) * 10);
        A(smoke[k2], 'cy', 196 - a * 34);
        A(smoke[k2], 'r', 12 + a * 11);
        O(smoke[k2], 0.26 * (1 - a / 4.3) * seg(a, 0, 0.4));
      }
      e = eo(seg(l, 0.5, 1.3));
      O(ring, e);
      T(ringDash, 'rotate(' + f2(l * 24) + ' 1282 330)');
      a = mod(l, 1.6) / 1.6;
      A(pulse, 'r', 76 + 64 * a); O(pulse, (1 - a) * 0.9);
      O(tms, 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(l * 6)));
      e = eo(seg(l, 0.9, 1.6));
      O(lab, e); T(lab, 'translate(' + f2(-24 * (1 - e)) + ',0)');
      O(labDot, e * (0.5 + 0.5 * (0.5 + 0.5 * Math.sin(l * 6))));

      O(numG, seg(l, 1.5, 1.9));
      T(numG, 'translate(0,' + f2(18 * (1 - eo(seg(l, 1.5, 2.1)))) + ')');
      num.textContent = Math.round(92 * eo(seg(l, 1.7, 4.3))) + '%+';

      for (k2 = 0; k2 < facs.length; k2++) {
        var f = facs[k2], p = seg(l, f.delay, f.delay + 0.45);
        O(f.outer, seg(l, f.delay, f.delay + 0.12));
        T(f.inner, 'scale(1,' + f2(back(p)) + ')');
        for (var q = 0; q < 2; q++) {
          a = mod(l * 0.9 + f.ph + q * 1.3, 2.6);
          A(f.puffs[q], 'cx', -32 + a * 16 + Math.sin(a * 2 + k2) * 4);
          A(f.puffs[q], 'cy', -104 - a * 26);
          A(f.puffs[q], 'r', 8 + a * 6);
          O(f.puffs[q], 0.34 * (1 - a / 2.6) * seg(l, f.delay + 0.4, f.delay + 0.8));
        }
      }
      e = eo(seg(l, 4.4, 5.0));
      O(br, e);
      A(brRect, 'stroke-dashoffset', -l * 26);
      T(brLab, 'translate(198 515) scale(' + f2(0.6 + 0.4 * back(seg(l, 4.5, 5.0))) + ') translate(-198 -515)');
    };
  }

  /* =========================================================
     장면 2 — 달리며 잰다
     ========================================================= */
  function sceneDrive(g) {
    var V = [80, 285, 490, 695, 900], H = [110, 335, 560, 785], i, j, k;
    var roads = el('g', { stroke: '#1B3752', 'stroke-width': 34, 'stroke-linecap': 'round' }, g);
    for (i = 0; i < V.length; i++) el('line', { x1: V[i], y1: H[0], x2: V[i], y2: H[3] }, roads);
    for (j = 0; j < H.length; j++) el('line', { x1: V[0], y1: H[j], x2: V[4], y2: H[j] }, roads);
    var blocks = el('g', {}, g);
    for (i = 0; i < 4; i++) for (j = 0; j < 3; j++) {
      el('rect', { x: V[i] + 26, y: H[j] + 26, width: V[i + 1] - V[i] - 52, height: H[j + 1] - H[j] - 52, rx: 10, fill: C.block, stroke: C.panelLine, 'stroke-width': 3 }, blocks);
      if ((i + j) % 2 === 0) {
        var fx = factory(blocks, '#21405F', '#4F6C8A', 4);
        T(fx, 'translate(' + ((V[i] + V[i + 1]) / 2 + 6) + ',' + ((H[j] + H[j + 1]) / 2 + 36) + ') scale(.62)');
      }
    }

    /* 바람 줄기 */
    var WX = 0.8, WY = -0.6, wind = [], windG = el('g', { stroke: C.sky, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, g);
    var wb = [[170, 690], [380, 500], [600, 420], [240, 290], [540, 740], [720, 250]];
    var wAng = Math.atan2(WY, WX) * 180 / Math.PI;
    for (k = 0; k < wb.length; k++) wind.push(el('path', { d: 'M-22 0H16M5 -10L16 0L5 10' }, windG));

    /* 경로와 농도 흔적 */
    var route = [[80, 785], [80, 335], [490, 335], [490, 110], [900, 110], [900, 560], [695, 560], [695, 785], [80, 785]];
    var S = samplePoly(route, 240), N = 120, trail = [], trailG = el('g', { 'stroke-width': 12, 'stroke-linecap': 'round' }, g);
    function conc(x, y) {
      var a = (x - 800) * (x - 800) + (y - 330) * (y - 330), b = (x - 285) * (x - 285) + (y - 700) * (y - 700);
      return Math.exp(-a / (2 * 150 * 150)) + 0.7 * Math.exp(-b / (2 * 120 * 120));
    }
    for (k = 0; k < N; k++) {
      var p0 = S[k * 2], p1 = S[k * 2 + 2], v = conc((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
      trail.push(el('line', { x1: f2(p0[0]), y1: f2(p0[1]), x2: f2(p1[0]), y2: f2(p1[1]), stroke: v < 0.3 ? C.green : v < 0.6 ? C.orange : C.red }, trailG));
    }

    /* 측정 차량 (위에서 본 모습) */
    var car = el('g', {}, g);
    var ping = el('circle', { r: 20, fill: 'none', stroke: C.green, 'stroke-width': 3 }, car);
    var carBody = el('g', {}, car);
    el('rect', { x: -32, y: -18, width: 64, height: 36, rx: 9, fill: C.text }, carBody);
    el('rect', { x: 14, y: -14, width: 11, height: 28, rx: 3, fill: '#5E7A96' }, carBody);
    el('circle', { cx: -6, cy: 0, r: 7, fill: C.green }, carBody);
    el('circle', { cx: -22, cy: 0, r: 4.5, fill: C.sky }, carBody);

    /* 풍향 */
    var wl = el('g', {}, g);
    text(wl, 96, 866, '풍향', 28, { fill: C.mute });
    var warrow = el('g', { stroke: C.sky, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, wl);
    el('path', { d: 'M-34 0H30M16 -13L32 0L16 13' }, warrow);

    /* 오른쪽 계기판 */
    var panel = el('g', {}, g);
    el('rect', { x: 960, y: 80, width: 600, height: 760, rx: 24, fill: C.panel, stroke: C.panelLine, 'stroke-width': 3 }, panel);

    /* 옆에서 본 차량: 지붕 흡입구 + 기상 센서 */
    var van = el('g', { transform: 'translate(1000,100)' }, panel);
    var road = el('line', { x1: 0, y1: 160, x2: 300, y2: 160, stroke: C.dim, 'stroke-width': 4, 'stroke-dasharray': '22 16' }, van);
    el('rect', { x: 62, y: 16, width: 14, height: 46, fill: C.fill, stroke: C.line, 'stroke-width': 3 }, van);
    el('path', { d: 'M50 18H88L80 4H58Z', fill: C.fill, stroke: C.line, 'stroke-width': 3, 'stroke-linejoin': 'round' }, van);
    var air = [];
    for (k = 0; k < 4; k++) air.push(el('circle', { r: 4, fill: C.sky }, van));
    el('line', { x1: 196, y1: 62, x2: 196, y2: 12, stroke: C.line, 'stroke-width': 4 }, van);
    el('line', { x1: 170, y1: 12, x2: 222, y2: 12, stroke: C.line, 'stroke-width': 3 }, van);
    var cups = [];
    for (k = 0; k < 3; k++) cups.push(el('circle', { cy: 12, r: 7, fill: C.sky }, van));
    el('path', { d: 'M8 132V74Q8 62 20 62H190L224 92Q232 100 232 112V132Q232 138 226 138H14Q8 138 8 132Z', fill: C.fill, stroke: C.line, 'stroke-width': 4, 'stroke-linejoin': 'round' }, van);
    el('path', { d: 'M184 72H194L218 98H184Z', fill: '#5E7A96' }, van);
    var wheels = [];
    for (k = 0; k < 2; k++) {
      var wg = el('g', {}, van);
      el('circle', { cx: 0, cy: 0, r: 20, fill: C.bg, stroke: C.line, 'stroke-width': 4 }, wg);
      el('path', { d: 'M-12 0H12M0 -12V12', stroke: C.line, 'stroke-width': 3 }, wg);
      wheels.push({ g: wg, x: k ? 186 : 56 });
    }
    /* 측정 간격 */
    el('circle', { cx: 1450, cy: 178, r: 44, fill: 'none', stroke: C.panelLine, 'stroke-width': 8 }, panel);
    var tick = el('circle', { cx: 1450, cy: 178, r: 44, fill: 'none', stroke: C.green, 'stroke-width': 8, pathLength: 100, 'stroke-dasharray': '100 100', transform: 'rotate(-90 1450 178)' }, panel);
    text(panel, 1450, 188, '10 s', 28, { disp: true, anchor: 'middle' });
    text(panel, 1450, 262, '측정 간격', 26, { fill: C.mute, anchor: 'middle', w: 600 });

    /* 입경 분포 */
    text(panel, 992, 336, '입경 분포', 28);
    var bars = [], base = [];
    for (k = 0; k < 14; k++) {
      base.push(Math.min(1, 0.18 + 0.82 * Math.exp(-Math.pow(k - 8.5, 2) / 9) + 0.45 * Math.exp(-Math.pow(k - 3, 2) / 3)));
      bars.push(el('rect', { x: 995 + k * 38, width: 28, rx: 4, fill: C.sky }, panel));
    }
    el('line', { x1: 990, y1: 562, x2: 1530, y2: 562, stroke: C.dim, 'stroke-width': 3 }, panel);
    text(panel, 995, 600, '0.01', 26, { disp: true, fill: C.mute, w: 600 });
    text(panel, 1186, 600, '0.1', 26, { disp: true, fill: C.mute, w: 600, anchor: 'middle' });
    text(panel, 1364, 600, '1', 26, { disp: true, fill: C.mute, w: 600, anchor: 'middle' });
    text(panel, 1527, 600, '10 ㎛', 26, { disp: true, fill: C.mute, w: 600, anchor: 'end' });

    /* 가스 칩 */
    var gases = ['벤젠', '톨루엔', '에틸벤젠', '자일렌', 'SO₂', 'NOx', 'O₃', 'CO₂'], chips = [];
    for (k = 0; k < gases.length; k++) {
      var cg = el('g', {}, panel), cx = 990 + (k % 4) * 138, cy = 628 + Math.floor(k / 4) * 68;
      var cr = el('rect', { x: cx, y: cy, width: 126, height: 54, rx: 27, 'stroke-width': 3 }, cg);
      var ct = text(cg, cx + 63, cy + 36, gases[k], 26, { anchor: 'middle', disp: k > 3 });
      chips.push({ g: cg, r: cr, t: ct, cx: cx + 63, cy: cy + 27 });
    }
    var total = text(panel, 992, 808, '', 30, { fill: C.greenL });
    total.appendChild(document.createTextNode('가스 동시 측정 '));
    var ts = el('tspan', { fill: C.text, 'font-size': 34 }, total); ts.textContent = '15종 이상';

    return function (l) {
      var k2, a, e;
      /* 바람 */
      for (k2 = 0; k2 < wind.length; k2++) {
        a = mod(l * 60 + k2 * 41, 160);
        T(wind[k2], 'translate(' + f2(wb[k2][0] + WX * a) + ',' + f2(wb[k2][1] + WY * a) + ') rotate(' + f2(wAng) + ')');
        O(wind[k2], 0.5 * Math.sin(Math.PI * a / 160));
      }
      T(warrow, 'translate(196 856) rotate(' + f2(-37 + 6 * Math.sin(l * 1.3)) + ')');
      /* 차량 */
      var p = seg(l, 0.8, 6.3), pos = polyAt(S, p);
      for (k2 = 0; k2 < N; k2++) O(trail[k2], k2 < p * N ? 1 : 0);
      T(car, 'translate(' + f2(pos[0]) + ',' + f2(pos[1]) + ')');
      T(carBody, 'rotate(' + f2(pos[2] * 180 / Math.PI) + ')');
      O(car, seg(l, 0.3, 0.8));
      a = mod(l, 1.2) / 1.2;
      A(ping, 'r', 22 + 42 * a); O(ping, (1 - a) * seg(l, 0.8, 1));
      /* 옆 모습 */
      A(road, 'stroke-dashoffset', l * 140);
      for (k2 = 0; k2 < 2; k2++) T(wheels[k2].g, 'translate(' + wheels[k2].x + ',140) rotate(' + f2(l * 420) + ')');
      for (k2 = 0; k2 < 4; k2++) {
        a = mod(l * 1.4 + k2 * 0.25, 1);
        A(air[k2], 'cx', 69 + Math.sin(k2 * 2.1) * 22 * (1 - a));
        A(air[k2], 'cy', -36 + a * 40);
        O(air[k2], Math.sin(Math.PI * a));
      }
      for (k2 = 0; k2 < 3; k2++) {
        var th = l * 7 + k2 * 2.094;
        A(cups[k2], 'cx', 196 + 26 * Math.cos(th));
        O(cups[k2], 0.55 + 0.45 * Math.sin(th));
      }
      A(tick, 'stroke-dashoffset', 100 * (1 - mod(l, 1.4) / 1.4));
      /* 입경 분포 막대 */
      for (k2 = 0; k2 < bars.length; k2++) {
        e = eo(seg(l, 1.0 + k2 * 0.04, 1.8 + k2 * 0.04));
        var h = 190 * base[k2] * (0.74 + 0.26 * Math.sin(l * 2.6 + k2 * 0.9)) * e;
        A(bars[k2], 'y', 560 - h); A(bars[k2], 'height', Math.max(h, 0));
      }
      /* 가스 칩 */
      for (k2 = 0; k2 < chips.length; k2++) {
        var c = chips[k2], on = seg(l, 1.6 + k2 * 0.38, 1.8 + k2 * 0.38);
        A(c.r, 'fill', on > 0 ? 'rgba(107,160,58,' + f2(0.22 * on) + ')' : 'none');
        A(c.r, 'stroke', on > 0.5 ? C.green : C.panelLine);
        A(c.t, 'fill', on > 0.5 ? C.text : C.dim);
        var sc = 1 + 0.12 * Math.sin(Math.PI * on);
        T(c.g, 'translate(' + c.cx + ' ' + c.cy + ') scale(' + f2(sc) + ') translate(' + (-c.cx) + ' ' + (-c.cy) + ')');
      }
      e = eo(seg(l, 4.6, 5.2));
      O(total, e); T(total, 'translate(0,' + f2(12 * (1 - e)) + ')');
    };
  }

  /* =========================================================
     장면 3 — 굴뚝에서 직접
     ========================================================= */
  function sceneStack(g) {
    var k;
    /* 굴뚝 단면 */
    var gas = [], gasG = el('g', {}, g);
    for (k = 0; k < 38; k++) {
      gas.push({ n: el('circle', { r: 3 + rnd(k + 3) * 9, fill: rnd(k + 9) > 0.55 ? C.orange : C.line }, gasG), x: 228 + rnd(k + 1) * 164, ph: rnd(k + 5) * 860, sp: 150 + rnd(k + 11) * 80 });
    }
    var wallA = { fill: '#22405F', stroke: C.line, 'stroke-width': 3 };
    el('rect', { x: 196, y: 30, width: 18, height: 850, fill: wallA.fill, stroke: wallA.stroke, 'stroke-width': 3 }, g);
    el('rect', { x: 406, y: 30, width: 18, height: 378, fill: wallA.fill, stroke: wallA.stroke, 'stroke-width': 3 }, g);
    el('rect', { x: 406, y: 448, width: 18, height: 432, fill: wallA.fill, stroke: wallA.stroke, 'stroke-width': 3 }, g);
    var up = el('path', { d: 'M310 120V40M292 60L310 40L328 60', stroke: C.mute, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    text(g, 310, 864, '굴뚝', 30, { anchor: 'middle', fill: C.mute });

    /* 프로브 */
    var probe = el('g', {}, g);
    el('rect', { x: 296, y: 416, width: 428, height: 24, rx: 8, fill: '#2E5274', stroke: C.line, 'stroke-width': 3 }, probe);
    el('circle', { cx: 302, cy: 428, r: 6, fill: C.sky }, probe);

    /* 시료 관 */
    var tubePts = [[724, 428], [780, 428], [780, 120], [1080, 120], [1080, 154]];
    var tube = el('polyline', { points: tubePts.join(' '), fill: 'none', stroke: C.line, 'stroke-width': 8, 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1' }, g);
    var TS = samplePoly([[300, 428]].concat(tubePts), 200), flow = [];
    for (k = 0; k < 12; k++) flow.push(el('circle', { r: 5, fill: C.sky }, g));

    /* 온도계 */
    var th = el('g', {}, g);
    el('rect', { x: 524, y: 520, width: 32, height: 280, rx: 16, fill: C.panel, stroke: C.line, 'stroke-width': 3 }, th);
    var merc = el('rect', { x: 532, width: 16, rx: 8, fill: C.orange }, th);
    el('circle', { cx: 540, cy: 812, r: 28, fill: C.orange, stroke: C.line, 'stroke-width': 3 }, th);
    for (k = 0; k <= 4; k++) el('line', { x1: 562, y1: 790 - k * 60, x2: 576, y2: 790 - k * 60, stroke: C.mute, 'stroke-width': 3 }, th);
    var tv = text(th, 596, 724, '20℃', 64, { disp: true });

    /* 임팩터 10단 */
    var imp = el('g', {}, g);
    el('rect', { x: 960, y: 150, width: 240, height: 660, rx: 16, fill: C.panel, stroke: C.line, 'stroke-width': 3 }, imp);
    var deps = [];
    for (k = 0; k < 10; k++) {
      var py = 205 + k * 60;
      var col = k < 5 ? (k < 2 ? '#B8CCE0' : '#9FC3DD') : (k < 8 ? '#8CC6E6' : C.sky);
      deps.push(el('ellipse', { cx: 1080, cy: py - 4, rx: 0, ry: 0, fill: col }, imp));
      el('line', { x1: 990, y1: py, x2: 1170, y2: py, stroke: C.line, 'stroke-width': 6, 'stroke-linecap': 'round' }, imp);
    }
    var drops = [];
    for (k = 0; k < 40; k++) {
      var st = k % 10;
      drops.push({ n: el('circle', { r: Math.max(2.4, 9.5 - st * 0.8), fill: C.sky }, imp), st: st, ph: rnd(k + 21) * 1.1, jx: (rnd(k + 41) - 0.5) * 110 });
    }
    var sizeL = el('g', {}, g);
    text(sizeL, 940, 214, '큰 입자', 26, { fill: C.mute, anchor: 'end', w: 600 });
    text(sizeL, 940, 754, '작은 입자', 26, { fill: C.mute, anchor: 'end', w: 600 });
    el('path', { d: 'M920 240V716M908 700L920 716L932 700', stroke: C.dim, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, sizeL);
    var impL = text(g, 1080, 866, '입경별 10단 이상', 30, { anchor: 'middle' });

    /* 오른쪽: 범위와 분석 항목 */
    var rng = el('g', {}, g);
    text(rng, 1270, 228, '측정 범위', 26, { fill: C.mute, w: 600 });
    var r1 = text(rng, 1270, 290, 'ppb – ppm', 40, { disp: true, fill: C.sky, w: 600 });
    var r2 = text(rng, 1270, 352, '㎍/㎥ – ㎎/㎥', 36, { fill: C.sky, w: 600 });
    var anaL = text(g, 1270, 470, '분석 항목', 26, { fill: C.mute, w: 600 });
    var items = ['블랙카본', '중금속', '결정구조'], ana = [];
    for (k = 0; k < items.length; k++) {
      var ag = el('g', {}, g);
      el('rect', { x: 1270, y: 496 + k * 80, width: 250, height: 60, rx: 30, fill: 'rgba(107,160,58,.18)', stroke: C.green, 'stroke-width': 3 }, ag);
      text(ag, 1395, 536 + k * 80, items[k], 30, { anchor: 'middle' });
      ana.push(ag);
    }

    return function (l) {
      var k2, a, e;
      for (k2 = 0; k2 < gas.length; k2++) {
        var gp = gas[k2];
        a = mod(l * gp.sp + gp.ph, 860);
        A(gp.n, 'cx', gp.x + Math.sin(a / 60 + k2) * 8);
        A(gp.n, 'cy', 880 - a);
        O(gp.n, 0.55 * Math.sin(Math.PI * a / 860));
      }
      O(up, 0.5 + 0.5 * Math.sin(l * 3));
      e = eo(seg(l, 0.3, 1.3));
      T(probe, 'translate(' + f2(330 * (1 - e)) + ',0)');
      O(probe, seg(l, 0.3, 0.6));
      A(tube, 'stroke-dashoffset', 1 - eo(seg(l, 1.2, 1.9)));
      for (k2 = 0; k2 < flow.length; k2++) {
        a = mod(l * 0.45 + k2 / flow.length, 1);
        var fp = polyAt(TS, a);
        A(flow[k2], 'cx', fp[0]); A(flow[k2], 'cy', fp[1]);
        O(flow[k2], seg(l, 1.9, 2.2) * Math.min(1, a * 8, (1 - a) * 8));
      }
      var T0 = 20 + 160 * eo(seg(l, 0.8, 3.0));
      O(th, seg(l, 0.5, 0.9));
      var mh = 270 * (T0 / 200);
      A(merc, 'y', 796 - mh); A(merc, 'height', mh + 4);
      tv.textContent = Math.round(T0) + '℃';
      for (k2 = 0; k2 < deps.length; k2++) {
        e = eo(seg(l, 2.0 + k2 * 0.12, 5.2));
        A(deps[k2], 'rx', (64 - k2 * 2.5) * e); A(deps[k2], 'ry', (4 + 5 * e) * (e > 0 ? 1 : 0));
      }
      for (k2 = 0; k2 < drops.length; k2++) {
        var d = drops[k2];
        a = mod(l - 1.9 + d.ph, 1.1) / 1.1;
        var ty = 205 + d.st * 60 - 12;
        A(d.n, 'cx', 1080 + d.jx * a * 0.6); A(d.n, 'cy', 160 + (ty - 160) * eio(a));
        O(d.n, l < 1.9 ? 0 : Math.min(1, (1 - a) * 6, a * 10));
      }
      O(sizeL, seg(l, 2.2, 2.8)); O(impL, seg(l, 2.0, 2.6));
      e = eo(seg(l, 2.6, 3.1)); O(r1.parentNode, seg(l, 2.5, 2.7));
      O(r1, e); T(r1, 'translate(' + f2(20 * (1 - e)) + ',0)');
      e = eo(seg(l, 2.9, 3.4));
      O(r2, e); T(r2, 'translate(' + f2(20 * (1 - e)) + ',0)');
      O(anaL, seg(l, 3.3, 3.6));
      for (k2 = 0; k2 < ana.length; k2++) {
        e = seg(l, 3.5 + k2 * 0.45, 3.95 + k2 * 0.45);
        O(ana[k2], e);
        T(ana[k2], 'translate(1395 ' + (526 + k2 * 80) + ') scale(' + f2(0.7 + 0.3 * back(e)) + ') translate(-1395 ' + (-(526 + k2 * 80)) + ')');
      }
    };
  }

  /* =========================================================
     장면 4 — 모아서 추적
     ========================================================= */
  function sceneTrace(g) {
    var k, i, j;
    var MX = 560, MY = 110, MS = 680;
    /* 자료원 아이콘 */
    var src = el('g', {}, g), srcs = [];
    var s1 = el('g', { transform: 'translate(180,230)' }, src);
    el('path', { d: 'M-70 18V-12Q-70 -24 -58 -24H34L64 2Q70 8 70 16V18Z', fill: C.fill, stroke: C.line, 'stroke-width': 4, 'stroke-linejoin': 'round' }, s1);
    el('rect', { x: -44, y: -44, width: 12, height: 20, fill: C.green }, s1);
    el('circle', { cx: -40, cy: 22, r: 13, fill: C.bg, stroke: C.line, 'stroke-width': 4 }, s1);
    el('circle', { cx: 40, cy: 22, r: 13, fill: C.bg, stroke: C.line, 'stroke-width': 4 }, s1);
    text(src, 180, 302, '이동 측정', 28, { anchor: 'middle' });
    var s2 = el('g', { transform: 'translate(180,450)' }, src);
    el('rect', { x: -52, y: -34, width: 104, height: 70, rx: 6, fill: C.fill, stroke: C.line, 'stroke-width': 4 }, s2);
    el('line', { x1: 30, y1: -34, x2: 30, y2: -86, stroke: C.line, 'stroke-width': 4 }, s2);
    el('circle', { cx: 30, cy: -90, r: 8, fill: C.sky }, s2);
    el('rect', { x: -30, y: -12, width: 26, height: 26, rx: 4, fill: '#2A4C6E' }, s2);
    text(src, 180, 522, '고정 측정', 28, { anchor: 'middle' });
    var s3 = el('g', { transform: 'translate(180,668)' }, src);
    el('rect', { x: -30, y: -30, width: 60, height: 60, rx: 10, fill: C.fill, stroke: C.line, 'stroke-width': 4 }, s3);
    el('circle', { cx: 0, cy: 0, r: 9, fill: C.green }, s3);
    var waves = el('path', { d: 'M44 -18Q56 0 44 18M58 -30Q78 0 58 30', fill: 'none', stroke: C.sky, 'stroke-width': 4, 'stroke-linecap': 'round' }, s3);
    text(src, 180, 742, '센서', 28, { anchor: 'middle' });
    srcs.push(s1, s2, s3);

    /* 자료 줄기 */
    var ys = [230, 450, 668], ends = [300, 460, 620], streams = [];
    for (k = 0; k < 3; k++) {
      var P = [282, ys[k], 400, ys[k], 440, ends[k], MX + 6, ends[k]];
      var base = el('path', { d: bezD(P), fill: 'none', stroke: C.sky, 'stroke-width': 4, opacity: 0.35, pathLength: 1, 'stroke-dasharray': '1 1' }, g);
      var dots = [];
      for (j = 0; j < 3; j++) dots.push(el('circle', { r: 7, fill: C.sky }, g));
      streams.push({ P: P, base: base, dots: dots });
    }

    /* 지도 */
    var map = el('g', {}, g);
    el('rect', { x: MX, y: MY, width: MS, height: MS, rx: 16, fill: C.panel, stroke: C.line, 'stroke-width': 3 }, map);
    for (i = 0; i < 5; i++) for (j = 0; j < 5; j++) {
      el('rect', { x: MX + i * 136 + 16, y: MY + j * 136 + 16, width: 104, height: 104, rx: 8, fill: C.block, stroke: C.panelLine, 'stroke-width': 2 }, map);
    }
    var SX = MX + 136 * 1.5, SY = MY + 136 * 3.5, WX = 0.78, WY = -0.62;
    var srcFac = factory(map, '#2B4765', '#8299B1', 4);
    T(srcFac, 'translate(' + (SX + 6) + ',' + (SY + 34) + ') scale(.6)');
    var HX = SX + WX * 220, HY = SY + WY * 220;

    /* 농도 열지도 */
    var heat = el('g', {}, g), cells = [];
    var CS = 40, NC = MS / CS;
    for (i = 0; i < NC; i++) for (j = 0; j < NC; j++) {
      var cx = MX + i * CS + CS / 2, cy = MY + j * CS + CS / 2, dx = cx - SX, dy = cy - SY;
      var al = dx * WX + dy * WY, cr = Math.abs(dx * WY - dy * WX);
      var v = 0;
      if (al > -20) {
        var sp = 24 + 0.2 * Math.max(al, 0), aa = Math.max(al, 0) / 220, fa = aa * Math.exp(1 - aa);
        v = Math.exp(-cr * cr / (2 * sp * sp)) * fa * fa;
      }
      var bg = 0.08 + 0.1 * rnd(i * 31 + j);
      var plume = v > bg;
      if (!plume) v = bg;
      var cc = v < 0.3 ? C.green : v < 0.62 ? C.orange : C.red;
      var rc = el('rect', { x: MX + i * CS + 2, y: MY + j * CS + 2, width: CS - 4, height: CS - 4, rx: 5, fill: cc, opacity: 0 }, heat);
      var dc = Math.sqrt(Math.pow(cx - (MX + MS / 2), 2) + Math.pow(cy - (MY + MS / 2), 2));
      cells.push({ n: rc, v: v, plume: plume, al: al, dc: dc, ph: rnd(i * 7 + j * 13) * 6 });
    }

    /* 바람 화살표 */
    var arrows = [], ab = [[620, 760], [760, 300], [980, 700], [1100, 400], [640, 520]];
    var arrG = el('g', { stroke: C.line, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    for (k = 0; k < ab.length; k++) arrows.push(el('path', { d: 'M-24 0H18M6 -10L18 0L6 10' }, arrG));
    var wAng = Math.atan2(WY, WX) * 180 / Math.PI;

    /* 고농도 지점 */
    var hot = el('g', {}, g);
    var hRing = el('circle', { cx: HX, cy: HY, r: 18, fill: 'none', stroke: C.red, 'stroke-width': 4 }, hot);
    var hRing2 = el('circle', { cx: HX, cy: HY, r: 18, fill: 'none', stroke: C.red, 'stroke-width': 3 }, hot);
    el('circle', { cx: HX, cy: HY, r: 15, fill: C.red, stroke: C.text, 'stroke-width': 3 }, hot);

    /* 역추적 */
    var traceG = el('g', {}, g);
    var trace = el('line', { x1: HX, y1: HY, x2: HX, y2: HY, stroke: C.text, 'stroke-width': 5, 'stroke-dasharray': '14 10', 'stroke-linecap': 'round' }, traceG);
    var head = el('path', { d: 'M-14 -11L4 0L-14 11', fill: 'none', stroke: C.text, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, traceG);
    var tAng = Math.atan2(SY - HY, SX - HX) * 180 / Math.PI;

    /* 표적 */
    var tgt = el('g', {}, g), tgtR = el('g', {}, tgt);
    el('circle', { cx: 0, cy: 0, r: 50, fill: 'none', stroke: C.red, 'stroke-width': 4 }, tgtR);
    el('circle', { cx: 0, cy: 0, r: 28, fill: 'none', stroke: C.red, 'stroke-width': 3 }, tgtR);
    el('path', { d: 'M0 -66V-38M0 38V66M-66 0H-38M38 0H66', stroke: C.red, 'stroke-width': 4, 'stroke-linecap': 'round' }, tgtR);

    /* 오른쪽 범례 */
    var badge = el('g', {}, g);
    el('rect', { x: 1284, y: 128, width: 276, height: 66, rx: 33, fill: 'rgba(229,83,60,.2)', stroke: C.red, 'stroke-width': 3 }, badge);
    var bDot = el('circle', { cx: 1318, cy: 161, r: 9, fill: C.red }, badge);
    text(badge, 1340, 172, 'Hotspot 탐지', 30);
    var leg = el('g', {}, g);
    var la = el('g', { stroke: C.line, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, leg);
    el('path', { d: 'M-28 0H22M10 -11L22 0L10 11' }, la);
    T(la, 'translate(1320 296) rotate(' + f2(wAng) + ')');
    text(leg, 1374, 306, '바람', 28);
    text(leg, 1286, 404, '농도', 26, { fill: C.mute, w: 600 });
    el('rect', { x: 1286, y: 422, width: 82, height: 22, rx: 4, fill: C.green }, leg);
    el('rect', { x: 1376, y: 422, width: 82, height: 22, rx: 4, fill: C.orange }, leg);
    el('rect', { x: 1466, y: 422, width: 82, height: 22, rx: 4, fill: C.red }, leg);
    text(leg, 1286, 480, '낮음', 26, { fill: C.mute, w: 600 });
    text(leg, 1548, 480, '높음', 26, { fill: C.mute, w: 600, anchor: 'end' });
    var leg2 = el('g', {}, g);
    el('line', { x1: 1290, y1: 572, x2: 1356, y2: 572, stroke: C.text, 'stroke-width': 5, 'stroke-dasharray': '14 10', 'stroke-linecap': 'round' }, leg2);
    text(leg2, 1374, 582, '역추적', 28);
    var leg3 = el('g', {}, g);
    el('circle', { cx: 1322, cy: 658, r: 20, fill: 'none', stroke: C.red, 'stroke-width': 4 }, leg3);
    el('path', { d: 'M1322 630V644M1322 672V686M1294 658H1308M1336 658H1350', stroke: C.red, 'stroke-width': 4, 'stroke-linecap': 'round' }, leg3);
    text(leg3, 1374, 668, '배출원', 28);

    return function (l) {
      var k2, a, e, j2;
      for (k2 = 0; k2 < 3; k2++) O(srcs[k2], seg(l, 0.1 + k2 * 0.2, 0.5 + k2 * 0.2));
      O(waves, 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(l * 5)));
      for (k2 = 0; k2 < 3; k2++) {
        var s = streams[k2], st = 0.5 + k2 * 0.25;
        A(s.base, 'stroke-dashoffset', 1 - eo(seg(l, st, st + 0.7)));
        for (j2 = 0; j2 < s.dots.length; j2++) {
          a = mod(l * 0.8 + j2 / 3 + k2 * 0.11, 1);
          var bp = bez(s.P, a);
          A(s.dots[j2], 'cx', bp[0]); A(s.dots[j2], 'cy', bp[1]);
          O(s.dots[j2], seg(l, st + 0.7, st + 1) * Math.min(1, a * 6, (1 - a) * 6));
        }
      }
      var R = 760 * eo(seg(l, 1.6, 3.6)), Rb = 560 * eo(seg(l, 1.2, 2.8));
      for (k2 = 0; k2 < cells.length; k2++) {
        var c = cells[k2];
        var rev = c.plume ? seg(R - c.al, 0, 80) : seg(Rb - c.dc, 0, 80);
        if (rev <= 0) { O(c.n, 0); continue; }
        O(c.n, (0.14 + 0.6 * c.v) * rev * (0.88 + 0.12 * Math.sin(l * 2.4 + c.ph)));
      }
      for (k2 = 0; k2 < arrows.length; k2++) {
        a = mod(l * 46 + k2 * 37, 150);
        T(arrows[k2], 'translate(' + f2(ab[k2][0] + WX * a) + ',' + f2(ab[k2][1] + WY * a) + ') rotate(' + f2(wAng) + ')');
        O(arrows[k2], 0.45 * Math.sin(Math.PI * a / 150) * seg(l, 1.0, 1.6));
      }
      e = seg(l, 3.0, 3.4);
      O(hot, e);
      a = mod(l, 1.2) / 1.2;
      A(hRing, 'r', 18 + 50 * a); O(hRing, 1 - a);
      a = mod(l + 0.6, 1.2) / 1.2;
      A(hRing2, 'r', 18 + 50 * a); O(hRing2, 1 - a);
      e = eio(seg(l, 3.8, 4.9));
      var ex = lerp(HX, SX + 30, e), ey = lerp(HY, SY - 24, e);
      A(trace, 'x2', ex); A(trace, 'y2', ey); A(trace, 'stroke-dashoffset', l * 30);
      O(traceG, seg(l, 3.75, 3.9));
      T(head, 'translate(' + f2(ex) + ',' + f2(ey) + ') rotate(' + f2(tAng) + ')');
      e = seg(l, 4.8, 5.3);
      O(tgt, e);
      T(tgt, 'translate(' + SX + ',' + (SY - 6) + ') scale(' + f2(1.7 - 0.7 * eo(e)) + ')');
      T(tgtR, 'rotate(' + f2(l * 40) + ')');
      e = seg(l, 3.3, 3.6);
      O(badge, e);
      T(badge, 'translate(1422 161) scale(' + f2(0.7 + 0.3 * back(e)) + ') translate(-1422 -161)');
      O(bDot, 0.35 + 0.65 * (Math.sin(l * 8) > 0 ? 1 : 0.2));
      O(leg, seg(l, 1.4, 1.9)); O(leg2, seg(l, 3.9, 4.3)); O(leg3, seg(l, 4.9, 5.3));
    };
  }

  /* =========================================================
     장면 5 — 관리기관으로
     ========================================================= */
  function sceneLink(g) {
    var k;
    /* 대시보드 */
    var dash = el('g', {}, g);
    el('rect', { x: 385, y: 560, width: 60, height: 40, fill: C.fill }, dash);
    el('rect', { x: 300, y: 596, width: 230, height: 12, rx: 6, fill: C.dim }, dash);
    el('rect', { x: 90, y: 100, width: 650, height: 460, rx: 20, fill: C.panel, stroke: C.line, 'stroke-width': 4 }, dash);
    el('rect', { x: 120, y: 130, width: 270, height: 400, rx: 10, fill: C.block }, dash);
    for (k = 1; k < 4; k++) {
      el('line', { x1: 120 + k * 67.5, y1: 130, x2: 120 + k * 67.5, y2: 530, stroke: C.panelLine, 'stroke-width': 3 }, dash);
      el('line', { x1: 120, y1: 130 + k * 100, x2: 390, y2: 130 + k * 100, stroke: C.panelLine, 'stroke-width': 3 }, dash);
    }
    var mdots = [], md = [[170, 200, C.green], [300, 180, C.green], [230, 300, C.orange], [330, 330, C.green], [160, 430, C.green], [280, 460, C.red], [350, 480, C.green]];
    for (k = 0; k < md.length; k++) mdots.push(el('circle', { cx: md[k][0], cy: md[k][1], r: 12, fill: md[k][2] }, dash));
    el('line', { x1: 420, y1: 330, x2: 712, y2: 330, stroke: C.panelLine, 'stroke-width': 3 }, dash);
    el('line', { x1: 420, y1: 150, x2: 420, y2: 330, stroke: C.panelLine, 'stroke-width': 3 }, dash);
    var graph = el('polyline', { fill: 'none', stroke: C.sky, 'stroke-width': 5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, dash);
    var gbars = [];
    for (k = 0; k < 6; k++) gbars.push(el('rect', { x: 436 + k * 46, width: 30, rx: 4, fill: k === 4 ? C.orange : C.green }, dash));
    el('line', { x1: 420, y1: 520, x2: 712, y2: 520, stroke: C.panelLine, 'stroke-width': 3 }, dash);

    /* 연결선과 기관 */
    var orgs = ['국립환경과학원', '지방환경청', '지자체'], ny = [185, 335, 485], links = [], nodes = [];
    for (k = 0; k < 3; k++) {
      var P = [740, 330, 900, 330, 960, ny[k], 1130, ny[k]];
      var base = el('path', { d: bezD(P), fill: 'none', stroke: C.green, 'stroke-width': 4, opacity: 0.55, pathLength: 1, 'stroke-dasharray': '1 1' }, g);
      var pk = [el('circle', { r: 7, fill: C.greenL }, g), el('circle', { r: 7, fill: C.greenL }, g)];
      links.push({ P: P, base: base, pk: pk });
      var ng = el('g', {}, g);
      var nr = el('rect', { x: 1130, y: ny[k] - 45, width: 400, height: 90, rx: 18, fill: C.panel, 'stroke-width': 3 }, ng);
      el('path', { d: 'M1160 ' + (ny[k] - 6) + 'L1182 ' + (ny[k] - 22) + 'L1204 ' + (ny[k] - 6) + 'ZM1164 ' + (ny[k] + 18) + 'H1200M1168 ' + (ny[k] - 2) + 'V' + (ny[k] + 14) + 'M1182 ' + (ny[k] - 2) + 'V' + (ny[k] + 14) + 'M1196 ' + (ny[k] - 2) + 'V' + (ny[k] + 14), fill: 'none', stroke: C.line, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, ng);
      text(ng, 1226, ny[k] + 11, orgs[k], 32);
      nodes.push({ g: ng, r: nr });
    }

    /* 측정 → 분석 → 시각화 */
    var sx = [200, 415, 630], steps = [], conn = [];
    var icons = [
      'M-22 10A22 22 0 0 1 22 10M0 10L12 -10M-26 18H26',
      'M-18 18H18M-12 14V2M0 14V-14M12 14V-6',
      'M-20 -16H20V16H-20ZM-13 8L-4 -2L4 4L13 -8'
    ];
    var names = ['측정', '분석', '시각화'];
    for (k = 0; k < 3; k++) {
      if (k < 2) conn.push(el('path', { d: 'M' + (sx[k] + 58) + ' 690H' + (sx[k + 1] - 60) + 'M' + (sx[k + 1] - 74) + ' 678L' + (sx[k + 1] - 60) + ' 690L' + (sx[k + 1] - 74) + ' 702', fill: 'none', stroke: C.dim, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g));
      var sg = el('g', {}, g);
      var sc = el('circle', { cx: sx[k], cy: 690, r: 46, 'stroke-width': 4 }, sg);
      var ic = el('path', { d: icons[k], fill: 'none', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: 'translate(' + sx[k] + ',690)' }, sg);
      var tl = text(sg, sx[k], 784, names[k], 30, { anchor: 'middle' });
      steps.push({ g: sg, c: sc, i: ic, t: tl });
    }
    var runner = el('circle', { r: 7, fill: C.greenL }, g);

    /* 표제 */
    var title = el('g', {}, g);
    text(title, 1320, 708, '고정/이동형 측정 플랫폼', 44, { anchor: 'middle', w: 800 });
    text(title, 1320, 772, '2026–2030', 36, { anchor: 'middle', disp: true, fill: C.sky, w: 600 });
    var uline = el('line', { x1: 1180, y1: 806, x2: 1460, y2: 806, stroke: C.green, 'stroke-width': 4, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1 1' }, title);

    return function (l) {
      var k2, a, e, j2;
      O(dash, seg(l, 0, 0.5));
      for (k2 = 0; k2 < mdots.length; k2++) A(mdots[k2], 'r', 10 + 4 * Math.sin(l * 3 + k2 * 1.3));
      var n = Math.max(2, Math.round(30 * eo(seg(l, 0.4, 1.4)))), pts = [];
      for (k2 = 0; k2 < n; k2++) {
        var gv = 0.5 + 0.28 * Math.sin(k2 * 0.5 + l * 1.6) + 0.18 * Math.sin(k2 * 1.3 + l * 0.7);
        pts.push(f2(432 + k2 * 9.6) + ',' + f2(316 - 150 * gv));
      }
      A(graph, 'points', pts.join(' '));
      for (k2 = 0; k2 < gbars.length; k2++) {
        var bh = (60 + 70 * (0.5 + 0.5 * Math.sin(l * 1.8 + k2 * 1.1))) * eo(seg(l, 0.5 + k2 * 0.06, 1.2 + k2 * 0.06));
        A(gbars[k2], 'y', 518 - bh); A(gbars[k2], 'height', bh);
      }
      for (k2 = 0; k2 < 3; k2++) {
        var s = steps[k2], on = seg(l, 0.4 + k2 * 0.6, 0.7 + k2 * 0.6);
        A(s.c, 'fill', on > 0 ? 'rgba(107,160,58,' + f2(0.24 * on) + ')' : C.panel);
        A(s.c, 'stroke', on > 0.5 ? C.green : C.panelLine);
        A(s.i, 'stroke', on > 0.5 ? C.text : C.dim);
        A(s.t, 'fill', on > 0.5 ? C.text : C.dim);
        var sc2 = 1 + 0.12 * Math.sin(Math.PI * on);
        T(s.g, 'translate(' + sx[k2] + ' 690) scale(' + f2(sc2) + ') translate(' + (-sx[k2]) + ' -690)');
        if (k2 < 2) A(conn[k2], 'stroke', seg(l, 0.7 + k2 * 0.6, 1.0 + k2 * 0.6) > 0.5 ? C.green : C.dim);
      }
      /* 단계 사이를 도는 점 */
      a = mod(l * 0.5, 1);
      A(runner, 'cx', lerp(sx[0], sx[2], a)); A(runner, 'cy', 690 - 58 * Math.sin(Math.PI * mod(a * 2, 1)));
      O(runner, seg(l, 1.8, 2.1) * Math.min(1, a * 8, (1 - a) * 8));
      for (k2 = 0; k2 < 3; k2++) {
        var L = links[k2], st = 1.8 + k2 * 0.3;
        A(L.base, 'stroke-dashoffset', 1 - eo(seg(l, st, st + 0.6)));
        for (j2 = 0; j2 < 2; j2++) {
          a = mod(l * 0.7 + j2 * 0.5 + k2 * 0.17, 1);
          var bp = bez(L.P, a);
          A(L.pk[j2], 'cx', bp[0]); A(L.pk[j2], 'cy', bp[1]);
          O(L.pk[j2], seg(l, st + 0.6, st + 0.9) * Math.min(1, a * 6, (1 - a) * 6));
        }
        var nd = nodes[k2], on2 = seg(l, st + 0.5, st + 0.8);
        O(nd.g, seg(l, 1.6 + k2 * 0.2, 2.0 + k2 * 0.2));
        A(nd.r, 'stroke', on2 > 0.5 ? C.green : C.panelLine);
        A(nd.r, 'fill', on2 > 0 ? 'rgba(107,160,58,' + f2(0.12 * on2) + ')' : C.panel);
      }
      e = eo(seg(l, 3.2, 3.9));
      O(title, e); T(title, 'translate(0,' + f2(24 * (1 - e)) + ')');
      A(uline, 'stroke-dashoffset', 1 - eo(seg(l, 3.6, 4.3)));
    };
  }

  /* ---------- 장면 목록 ---------- */
  var SCENES = [
    { title: '사각지대', cap: '큰 굴뚝은 실시간으로 감시됩니다. 하지만 전체 배출원의 92% 이상인 소규모 사업장은 감시 사각지대에 있습니다.', dur: 6.5, cam: [800, 450, 1.07], build: sceneBlind },
    { title: '달리며 잰다', cap: '측정 차량이 산업단지를 돌며 공기 속 입자와 가스를 10초 간격으로 잽니다.', dur: 7, cam: [480, 450, 1.06], build: sceneDrive },
    { title: '굴뚝에서 직접', cap: '180℃에 이르는 뜨거운 굴뚝 가스도 그대로 뽑아, 입자를 크기별 10단계 이상으로 나눠 분석합니다.', dur: 6.5, cam: [420, 430, 1.08], build: sceneStack },
    { title: '모아서 추적', cap: '센서·이동 측정·고정 측정 자료를 한곳에 모아, 바람을 거슬러 실제 배출원을 찾아냅니다.', dur: 6.5, cam: [900, 450, 1.06], build: sceneTrace },
    { title: '관리기관으로', cap: '측정 → 분석 → 시각화. 결과는 관리기관의 감시 체계로 실시간 연결됩니다.', dur: 5.5, cam: [600, 400, 1.06], build: sceneLink }
  ];
  var XF = 0.45, START = [], TOTAL = 0;
  for (var si = 0; si < SCENES.length; si++) { START.push(TOTAL); TOTAL += SCENES[si].dur; }

  var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  var ICON_RESTART = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M4 4v5h5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var uid = 0;

  /* ---------- 무대 ---------- */
  function Stage(root) {
    var self = this;
    uid++;
    this.root = root;
    this.t = XF;
    this.cur = -1;
    this.playing = false;
    this.userPaused = false;
    this.inView = false;
    this.debug = false;
    this.raf = 0;
    this.last = 0;

    var fb = root.querySelector('.ms-fallback');
    if (fb) fb.hidden = true;
    root.className += ' ms-on' + (reduced ? ' ms-still' : '');

    /* 화면 */
    var screen = document.createElement('div');
    screen.className = 'ms-screen';
    screen.tabIndex = 0;
    screen.setAttribute('role', 'group');
    screen.setAttribute('aria-roledescription', '모션 그래픽');
    screen.setAttribute('aria-label', reduced
      ? '대표 과제 소개 그림. 아래 장면 버튼이나 좌우 화살표 키로 장면을 넘겨 볼 수 있습니다.'
      : '대표 과제 소개 모션 그래픽. 스페이스 키로 재생과 일시정지, 좌우 화살표 키로 장면 이동.');
    var svg = el('svg', { viewBox: '0 0 1600 900', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMid meet' });
    screen.appendChild(svg);

    var defs = el('defs', {}, svg);
    var pat = el('pattern', { id: 'msdot' + uid, width: 40, height: 40, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 20, cy: 20, r: 1.6, fill: '#1F3D5A' }, pat);
    el('rect', { width: 1600, height: 900, fill: C.bg }, svg);
    el('rect', { width: 1600, height: 900, fill: 'url(#msdot' + uid + ')' }, svg);

    /* 자막 */
    var cap = document.createElement('div');
    cap.className = 'ms-cap';
    cap.innerHTML = '<p class="ms-title"><b></b><span></span></p><p class="ms-sub" aria-live="polite"></p>';
    this.capEl = cap;
    this.capNo = cap.querySelector('b');
    this.capTitle = cap.querySelector('.ms-title span');
    this.capSub = cap.querySelector('.ms-sub');

    /* 조작부 */
    var ctrl = document.createElement('div');
    ctrl.className = 'ms-ctrl';
    var play = document.createElement('button');
    play.type = 'button'; play.className = 'ms-btn ms-play';
    var chipsOl = document.createElement('ol');
    chipsOl.className = 'ms-chips';
    chipsOl.setAttribute('aria-label', '장면 목록');
    var restart = document.createElement('button');
    restart.type = 'button'; restart.className = 'ms-btn ms-restart';
    restart.setAttribute('aria-label', '처음부터 다시 보기');
    restart.innerHTML = ICON_RESTART;
    this.chips = []; this.bars = [];
    for (var i = 0; i < SCENES.length; i++) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ms-chip';
      b.setAttribute('aria-label', '장면 ' + (i + 1) + ', ' + SCENES[i].title + (reduced ? ' 보기' : '부터 보기'));
      b.innerHTML = '<span class="n">0' + (i + 1) + '</span><span class="t">' + SCENES[i].title + '</span><span class="bar" aria-hidden="true"><i></i></span>';
      (function (idx) { b.addEventListener('click', function () { self.go(idx); }); })(i);
      li.appendChild(b); chipsOl.appendChild(li);
      this.chips.push(b); this.bars.push(b.querySelector('.bar i'));
    }
    ctrl.appendChild(play); ctrl.appendChild(chipsOl); ctrl.appendChild(restart);
    if (reduced) { play.hidden = true; restart.hidden = true; }
    this.playBtn = play;

    root.insertBefore(ctrl, root.firstChild);
    root.insertBefore(cap, ctrl);
    root.insertBefore(screen, cap);

    /* 장면 짓기 */
    this.scenes = [];
    for (i = 0; i < SCENES.length; i++) {
      var sg = el('g', {}, svg), cam = el('g', {}, sg);
      this.scenes.push({ g: sg, cam: cam, upd: SCENES[i].build(cam), def: SCENES[i] });
    }

    play.addEventListener('click', function () {
      if (self.userPaused || self.debug) { self.userPaused = false; self.debug = false; }
      else self.userPaused = true;
      self.sync();
    });
    restart.addEventListener('click', function () {
      self.t = XF; self.userPaused = false; self.debug = false; self.render(); self.sync();
    });
    root.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowLeft') {
        e.preventDefault();
        self.go((self.cur + (k === 'ArrowRight' ? 1 : SCENES.length - 1)) % SCENES.length);
      } else if ((k === ' ' || k === 'Spacebar' || k === 'Enter') && e.target === screen) {
        e.preventDefault();
        if (!reduced) play.click();
      } else if (k === 'Home' && e.target === screen) {
        e.preventDefault(); restart.click();
      }
    });

    /* 화면에 보일 때만 재생 */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        self.inView = en[0].isIntersecting;
        self.sync();
      }, { threshold: 0.3 }).observe(screen);
    } else {
      this.inView = true;
    }
    document.addEventListener('visibilitychange', function () { self.sync(); });

    /* 디버그 진입점: ?t=초 */
    var m = /[?&]t=([0-9.]+)/.exec(window.location.search);
    if (m) { this.debug = true; this.t = mod(parseFloat(m[1]) || 0, TOTAL); }

    if (reduced && !this.debug) this.t = this.stillTime(0);
    this.render();
    this.sync();
  }

  Stage.prototype.stillTime = function (i) { return START[i] + SCENES[i].dur - XF - 0.08; };

  Stage.prototype.go = function (i) {
    this.t = reduced ? this.stillTime(i) : START[i] + (i === 0 ? XF : 0.12);
    this.render();
    this.sync();
  };

  Stage.prototype.sync = function () {
    var want = !reduced && !this.debug && !this.userPaused && this.inView && !document.hidden;
    if (want && !this.playing) {
      var self = this;
      this.playing = true; this.last = 0;
      this.raf = requestAnimationFrame(function (ts) { self.tick(ts); });
    } else if (!want && this.playing) {
      this.playing = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    var showPause = this.playing || (!this.userPaused && !this.debug && !this.inView);
    this.playBtn.innerHTML = showPause ? ICON_PAUSE : ICON_PLAY;
    this.playBtn.setAttribute('aria-label', showPause ? '일시정지' : '재생');
    this.root.className = this.root.className.replace(' ms-paused', '') + (showPause ? '' : ' ms-paused');
  };

  Stage.prototype.tick = function (ts) {
    if (!this.playing) return;
    var self = this;
    var dt = this.last ? Math.min(ts - this.last, 60) / 1000 : 0;
    this.last = ts;
    this.t += dt;
    if (this.t >= TOTAL) this.t -= TOTAL;
    this.render();
    this.raf = requestAnimationFrame(function (t2) { self.tick(t2); });
  };

  Stage.prototype.render = function () {
    var t = this.t, i;
    for (i = 0; i < this.scenes.length; i++) {
      var s = this.scenes[i], d = s.def.dur, l = t - START[i];
      if (l < -XF) l += TOTAL; else if (l > d + XF) l -= TOTAL;
      var o = eio(seg(l, -XF, XF)) * (1 - eio(seg(l, d - XF, d + XF)));
      if (o <= 0.001) { vis(s.g, false); continue; }
      vis(s.g, true);
      O(s.g, o);
      var cm = s.def.cam;
      var sc = 1 + (cm[2] - 1) * (1 - eio(seg(l, -XF, 1.8))) + 0.03 * eio(seg(l, d - XF, d + XF));
      var dx = -10 * seg(l, 0, d);
      T(s.cam, 'translate(' + f2(cm[0] + dx) + ' ' + cm[1] + ') scale(' + f2(sc * 1000) / 1000 + ') translate(' + (-cm[0]) + ' ' + (-cm[1]) + ')');
      s.upd(l);
    }
    var cur = 0;
    for (i = 0; i < START.length; i++) if (t >= START[i]) cur = i;
    for (i = 0; i < this.bars.length; i++) {
      var p = i < cur ? 1 : i > cur ? 0 : seg(t, START[i], START[i] + SCENES[i].dur);
      if (reduced) p = i === cur ? 1 : 0;
      this.bars[i].style.transform = 'scaleX(' + f2(p) + ')';
    }
    if (cur !== this.cur) this.setCap(cur);
  };

  Stage.prototype.setCap = function (i) {
    var self = this, first = this.cur < 0;
    this.cur = i;
    for (var k = 0; k < this.chips.length; k++) {
      if (k === i) this.chips[k].setAttribute('aria-current', 'step');
      else this.chips[k].removeAttribute('aria-current');
    }
    function put() {
      self.capNo.textContent = '0' + (i + 1);
      self.capTitle.textContent = SCENES[i].title;
      self.capSub.textContent = SCENES[i].cap;
      self.capEl.className = 'ms-cap';
    }
    if (first || reduced) { put(); return; }
    this.capEl.className = 'ms-cap swap';
    clearTimeout(this.capT);
    this.capT = setTimeout(put, 200);
  };

  /* ---------- 다른 무대(assets/papers-motion.js)와 나눠 쓰는 도우미 ---------- */
  window.FEETMotionKit = {
    C: C, DISP: DISP, BODY: BODY, reduced: reduced,
    clamp: clamp, seg: seg, eo: eo, eio: eio, back: back, rnd: rnd, f2: f2, lerp: lerp, mod: mod,
    el: el, text: text, A: A, O: O, T: T, vis: vis,
    samplePoly: samplePoly, polyAt: polyAt, bez: bez, bezD: bezD,
    ICON_PAUSE: ICON_PAUSE, ICON_PLAY: ICON_PLAY, ICON_RESTART: ICON_RESTART
  };

  /* ---------- 시작 ---------- */
  var roots = document.querySelectorAll('[data-motion="platform"]'), list = [];
  for (var r = 0; r < roots.length; r++) {
    try { list.push(new Stage(roots[r])); } catch (err) { if (window.console) console.error(err); }
  }
  window.__mstage = {
    stages: list, total: TOTAL, starts: START,
    seek: function (t) { for (var q = 0; q < list.length; q++) { list[q].debug = true; list[q].t = mod(t, TOTAL); list[q].render(); list[q].sync(); } }
  };

  /* ---------- 스크롤에 따라 선 그리기: [data-draw] → --p (0–1) ---------- */
  var draws = document.querySelectorAll('[data-draw]');
  if (draws.length) {
    var dq = false;
    var drawUpd = function () {
      dq = false;
      var vh = window.innerHeight || 800;
      for (var q = 0; q < draws.length; q++) {
        var rc = draws[q].getBoundingClientRect();
        var p = reduced ? 1 : clamp((vh * 0.9 - rc.top) / (rc.height + vh * 0.4), 0, 1);
        draws[q].style.setProperty('--p', f2(p));
      }
    };
    window.addEventListener('scroll', function () {
      if (dq) return; dq = true; requestAnimationFrame(drawUpd);
    }, { passive: true });
    window.addEventListener('resize', drawUpd, { passive: true });
    drawUpd();
  }
})();
