/* FEET Lab — 논문 모션 플레이어 v2 (논문마다 장면 수가 달라도 된다)
   assets/motion.js 의 도우미(window.FEETMotionKit)를 그대로 쓴다. motion.js 다음에 불러올 것.
   소리: assets/motion-audio.js(있으면). 장면마다 sfx 큐 목록.
   마크업: <div class="pm-player" data-papers-motion> … (publications.html), 탭 id = paper-<key>
   논문: voc(5장면), bc(4장면), amp(4장면)
   디버그: ?paper=voc&t=12 → 그 논문, 그 시각에서 멈춘 화면. window.__pmotion.seek('amp', 8) */
(function () {
  'use strict';

  var K = window.FEETMotionKit;
  var root = document.querySelector('[data-papers-motion]');
  if (!K || !root) return;

  var el = K.el, A = K.A, O = K.O, T = K.T, vis = K.vis, seg = K.seg, eo = K.eo, eio = K.eio,
    back = K.back, rnd = K.rnd, f2 = K.f2, lerp = K.lerp, mod = K.mod, clamp = K.clamp;
  var reduced = K.reduced, DISP = K.DISP, BODY = K.BODY;

  var W = 1200, H = 900, CX = 600, CY = 450;
  var P = {
    bg: '#0B1A2B', bg2: '#0F2337', ink: '#DCE7F2', mute: '#9FB4CA', dim: '#56718D', line: '#B8CCE0',
    hair: '#2B4866', fill: '#17324D', core: '#05080C', ember: '#F2A33A', red: '#E5533C',
    teal: '#4FC3D9', green: '#6BA03A', ray: '#F3E7D3'
  };
  var MIN_STILL = 0.95; /* 장면 끝에서 이만큼 앞 = 완성 정지 화면 */

  /* ---------- 작은 도우미 ---------- */
  /* 카메라 층 안의 선 두께: 확대해도 굵어지지 않게 (CSS .pm-w1 … 가 var(--zs) 로 나눔) */
  function w(n) { return 'pm-w' + n; }
  function txt(parent, x, y, s, size, o) {
    o = o || {};
    var n = el('text', {
      x: x, y: y, 'font-size': size, fill: o.fill || P.ink,
      'font-family': o.disp ? DISP : BODY, 'font-weight': o.w || 700,
      'text-anchor': o.anchor || 'start'
    }, parent);
    if (o.ls) n.setAttribute('letter-spacing', o.ls);
    n.textContent = s;
    return n;
  }
  function fade(g, l, a, b, dy) {
    var e = eo(seg(l, a, b));
    O(g, e);
    if (dy) T(g, 'translate(0,' + f2(dy * (1 - e)) + ')');
    return e;
  }
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /* 카메라 상태 → 화면 좌표 */
  function scr(cam, x, y) { return [cam.sx + (cam.dx || 0) + (x - cam.fx) * cam.s, cam.sy + (y - cam.fy) * cam.s]; }

  /* 큰 숫자: 마스크 뒤에서 밀려 올라온다 */
  function BigNum(ctx, parent, x, y, size, o) {
    o = o || {};
    var id = ctx.id('n');
    var cp = el('clipPath', { id: id, clipPathUnits: 'userSpaceOnUse' }, ctx.defs);
    el('rect', { x: 0, y: f2(y - size * 0.86), width: W, height: f2(size * 1.0) }, cp);
    var g = el('g', { 'clip-path': 'url(#' + id + ')' }, parent);
    var inner = el('g', {}, g);
    var t = txt(inner, x, y, o.init || '', size, { disp: true, fill: o.fill || P.ink, anchor: o.anchor, ls: '-0.03em' });
    return {
      g: g, t: t,
      set: function (p, s) {
        T(inner, 'translate(0,' + f2((1 - eo(clamp(p, 0, 1))) * size * 0.95) + ')');
        O(inner, p > 0 ? 1 : 0);
        if (s != null) t.textContent = s;
      }
    };
  }

  /* 먼지 입자 (배경 층) */
  function dust(parent, n, seed, o) {
    o = o || {};
    var list = [], g = el('g', { fill: o.fill || '#3A5A7A' }, parent);
    for (var k = 0; k < n; k++) {
      list.push({
        n: el('circle', { r: f2((o.r0 || 1.4) + rnd(seed + k * 3) * (o.r1 || 2.4)) }, g),
        x: rnd(seed + k * 7) * (W + 200) - 100, y: rnd(seed + k * 11) * H,
        vx: (o.vx || 10) * (0.5 + rnd(seed + k * 13)), ph: rnd(seed + k * 17) * 6.28,
        a: (o.a || 0.5) * (0.4 + 0.6 * rnd(seed + k * 19))
      });
    }
    return function (l) {
      for (var q = 0; q < list.length; q++) {
        var d = list[q];
        A(d.n, 'cx', mod(d.x + l * d.vx, W + 200) - 100);
        A(d.n, 'cy', d.y + Math.sin(l * 0.7 + d.ph) * 8);
        O(d.n, d.a * (0.6 + 0.4 * Math.sin(l * 1.3 + d.ph)));
      }
    };
  }

  /* 그을음 덩어리(블랙카본 핵): 작은 원이 뭉친 모양 */
  function soot(parent, r, seed) {
    var g = el('g', {}, parent);
    var n = 7;
    for (var k = 0; k < n; k++) {
      var a = k / n * 6.283 + rnd(seed + k) * 0.7, d = k === 0 ? 0 : r * (0.38 + rnd(seed + k * 5) * 0.22);
      el('circle', {
        cx: f2(Math.cos(a) * d), cy: f2(Math.sin(a) * d), r: f2(r * (0.42 + rnd(seed + k * 9) * 0.16)),
        fill: P.core, stroke: '#3B4A5C', 'class': w(1)
      }, g);
    }
    return g;
  }

  /* 도시 스카이라인 */
  function skyline(parent, seed, base, hMin, hMax, fill, stroke, windows) {
    var g = el('g', {}, parent), x = -120, k = 0, wins = [];
    while (x < W + 120) {
      var bw = 46 + rnd(seed + k) * 70, bh = hMin + rnd(seed + k * 3) * (hMax - hMin);
      el('rect', { x: f2(x), y: f2(base - bh), width: f2(bw), height: f2(bh + 200), fill: fill, stroke: stroke || 'none', 'class': stroke ? w(1) : '' }, g);
      if (windows) {
        for (var wy = base - bh + 22; wy < base - 16; wy += 34) {
          for (var wx = x + 12; wx < x + bw - 16; wx += 22) {
            if (rnd(wx * 0.37 + wy * 0.11 + seed) > 0.72) {
              wins.push({ n: el('rect', { x: f2(wx), y: f2(wy), width: 8, height: 12, fill: '#4A6585' }, g), ph: rnd(wx + wy) * 30 });
            }
          }
        }
      }
      x += bw + 6 + rnd(seed + k * 7) * 18;
      k++;
    }
    return function (l, lit) {
      for (var q = 0; q < wins.length; q++) {
        var on = 0.35 + 0.65 * (Math.sin(l * 0.6 + wins[q].ph) > -0.6 ? 1 : 0);
        O(wins[q].n, on * (lit == null ? 0.6 : lit));
      }
    };
  }

  /* 불규칙한 조각(미세플라스틱) 모양: 단위 좌표 */
  var FRAG = [[-1, -0.35], [-0.55, -0.92], [0.18, -0.78], [0.72, -0.95], [1, -0.2], [0.62, 0.42], [0.85, 0.86], [0.05, 0.74], [-0.6, 0.95], [-0.88, 0.3]];
  function fragD(s, rot) {
    var c = Math.cos(rot || 0), sn = Math.sin(rot || 0), d = '';
    for (var k = 0; k < FRAG.length; k++) {
      var x = FRAG[k][0] * s, y = FRAG[k][1] * s;
      d += (k ? 'L' : 'M') + f2(x * c - y * sn) + ' ' + f2(x * sn + y * c);
    }
    return d + 'Z';
  }

  /* =========================================================
     논문 1 — 블랙카본
     ========================================================= */
  var BC1 = { x: 600, y: 470, R: 170, r: 58 };
  var BC2 = { x0: 616, y0: 196, p: 56, r: 20, fr: 4, fc: 2 }; /* 확대 시작 칸 */
  var BC3 = { lx: 300, rx: 900, y: 235, R: 112 };
  var BC4 = { x: 720, y: 400, R: 250 };
  var MATCH_R = 300; /* 매치컷 순간 화면 속 원의 반지름 */

  function bcModel(L, hud, ctx) {
    var k;
    var dB = dust(L.back, 46, 3);
    var dF = dust(L.front, 7, 41, { r0: 4, r1: 6, a: 0.18, vx: 26, fill: '#56718D' });

    var guide = el('circle', { cx: BC1.x, cy: BC1.y, r: 236, fill: 'none', stroke: P.hair, 'class': w(1), 'stroke-dasharray': '4 10' }, L.mid);
    /* 빛줄기 */
    var rays = [], rayG = el('g', { 'stroke-linecap': 'round' }, L.mid);
    for (k = 0; k < 9; k++) {
      var dy = (k - 4) * 36, y = BC1.y + dy;
      var hit = Math.abs(dy) < 46;
      var xin = BC1.x - Math.sqrt(BC1.R * BC1.R - dy * dy);
      var xout = BC1.x + Math.sqrt(BC1.R * BC1.R - dy * dy);
      var xcore = BC1.x - Math.sqrt(Math.max(BC1.r * BC1.r - dy * dy, 0)) + 4;
      var preB = el('line', { x1: -60, y1: y, x2: -60, y2: y, stroke: P.ray, 'class': w(1), opacity: 0.22 }, rayG);
      var pre = el('line', { x1: -60, y1: y, x2: -60, y2: y, stroke: P.ray, 'class': w(2), 'stroke-dasharray': '110 330' }, rayG);
      var postB = hit ? null : el('line', { x1: xout, y1: y, x2: xout, y2: y, stroke: P.ray, 'class': w(1), opacity: 0.12 }, rayG);
      var post = hit ? null : el('line', { x1: xout, y1: y, x2: xout, y2: y, stroke: P.ray, 'class': w(2), 'stroke-dasharray': '110 330' }, rayG);
      var flash = hit ? el('circle', { cx: f2(xcore), cy: y, r: 6, fill: P.ember }, L.mid) : null;
      rays.push({ pre: pre, preB: preB, post: post, postB: postB, flash: flash, end: hit ? xcore : xin, xout: xout, hit: hit, d: k * 0.05, off: rnd(k * 31) * 440 });
    }
    /* 입자 */
    var glow = el('circle', { cx: BC1.x, cy: BC1.y, r: 72, fill: P.ember, filter: 'url(#' + ctx.glowId + ')' }, L.mid);
    el('circle', { cx: BC1.x, cy: BC1.y, r: BC1.R, fill: 'rgba(184,204,224,.06)', stroke: P.line, 'class': w(2) }, L.mid);
    el('circle', { cx: BC1.x, cy: BC1.y, r: BC1.R - 18, fill: 'none', stroke: P.line, 'class': w(1), opacity: 0.25 }, L.mid);
    el('path', { d: 'M' + (BC1.x - 120) + ' ' + (BC1.y - 70) + 'A140 140 0 0 1 ' + (BC1.x - 40) + ' ' + (BC1.y - 136), fill: 'none', stroke: P.ink, 'class': w(2), opacity: 0.4, 'stroke-linecap': 'round' }, L.mid);
    var coreWrap = el('g', { transform: 'translate(' + BC1.x + ',' + BC1.y + ')' }, L.mid);
    var core = soot(coreWrap, BC1.r, 5);

    /* HUD */
    var tag = el('g', {}, hud);
    txt(tag, 64, 104, '기후 모델의 가정', 38, { fill: P.mute, w: 600 });
    var lab = el('g', {}, hud);
    var leader = el('polyline', { fill: 'none', stroke: P.ember, 'stroke-width': 2 }, lab);
    var ldot = el('circle', { r: 6, fill: P.ember }, lab);
    txt(lab, 1136, 252, '핵 1개', 64, { anchor: 'end', w: 800 });
    var labU = el('line', { x1: 960, y1: 276, x2: 1136, y2: 276, stroke: P.ember, 'stroke-width': 3 }, lab);

    return function (l, cam, d) {
      var q, e, a;
      dB(l); dF(l);
      T(guide, 'rotate(' + f2(l * 8) + ' ' + BC1.x + ' ' + BC1.y + ')');
      T(core, 'rotate(' + f2(l * 9) + ')');
      for (q = 0; q < rays.length; q++) {
        var r = rays[q];
        e = eio(seg(l, 0.5 + r.d, 1.5 + r.d));
        A(r.pre, 'x2', lerp(-60, r.end, e)); A(r.preB, 'x2', lerp(-60, r.end, e));
        A(r.pre, 'stroke-dashoffset', -l * 300 - r.off);
        O(r.pre, r.hit ? 0.95 : 0.6);
        if (r.post) {
          var e2 = eio(seg(l, 1.3 + r.d, 2.1 + r.d));
          A(r.post, 'x2', lerp(r.xout, W + 60, e2)); A(r.postB, 'x2', lerp(r.xout, W + 60, e2));
          A(r.post, 'stroke-dashoffset', -l * 300 - r.off);
          O(r.post, 0.3 * (e2 > 0 ? 1 : 0));
        }
        if (r.flash) {
          a = mod(l * 1.6 + q * 0.3, 1);
          A(r.flash, 'r', 4 + 8 * a);
          O(r.flash, e >= 1 ? (1 - a) * 0.9 : 0);
        }
      }
      var absorb = seg(l, 1.4, 2.2);
      O(glow, (0.42 + 0.18 * Math.sin(l * 3)) * absorb);
      fade(tag, l, 0.2, 0.8, 14);
      /* 라벨: 핵을 가리키는 선 */
      var cp = scr(cam, BC1.x + 34, BC1.y - 34);
      e = eo(seg(l, 1.8, 2.5));
      var hideE = 1 - seg(l, d - 0.85, d - 0.6);
      A(leader, 'points', f2(cp[0]) + ',' + f2(cp[1]) + ' ' + f2(lerp(cp[0], 900, e)) + ',' + f2(lerp(cp[1], 276, e)) + ' ' + f2(lerp(cp[0], 960, e)) + ',' + f2(lerp(cp[1], 276, e)));
      A(ldot, 'cx', cp[0]); A(ldot, 'cy', cp[1]);
      O(lab, seg(l, 1.8, 2.0) * hideE);
      A(labU, 'x2', lerp(960, 1136, eo(seg(l, 2.2, 2.8))));
      O(tag, eo(seg(l, 0.2, 0.8)) * hideE);
    };
  }

  function bcShare(L, hud, ctx) {
    var r, c, k;
    var dB = dust(L.back, 40, 61);
    var dF = dust(L.front, 6, 71, { r0: 4, r1: 6, a: 0.16, vx: 22, fill: '#56718D' });
    /* 21개 고르기: 확대 시작 칸은 제외 */
    var order = [];
    for (k = 0; k < 100; k++) order.push({ k: k, v: rnd(k * 3 + 17) });
    order.sort(function (a, b) { return a.v - b.v; });
    var pick = {}, cnt = 0, focusK = BC2.fr * 10 + BC2.fc;
    for (k = 0; k < 100 && cnt < 21; k++) {
      if (order[k].k === focusK) continue;
      pick[order[k].k] = cnt++;
    }
    var cells = [], grid = el('g', {}, L.mid);
    for (r = 0; r < 10; r++) for (c = 0; c < 10; c++) {
      k = r * 10 + c;
      var cx = BC2.x0 + c * BC2.p, cy = BC2.y0 + r * BC2.p;
      var g = el('g', {}, grid);
      var shell = el('circle', { cx: 0, cy: 0, r: BC2.r, fill: 'rgba(184,204,224,.05)', stroke: P.line, 'class': w(2) }, g);
      var multi = pick[k] != null, cores = [];
      var n = multi ? 2 + Math.floor(rnd(k * 5 + 1) * 3) : 1;
      for (var q = 0; q < n; q++) {
        var ang = q / n * 6.283 + rnd(k + q) * 1.2;
        cores.push({ n: el('circle', { cx: 0, cy: 0, r: 7, fill: P.core, stroke: '#3B4A5C', 'class': w(1) }, g), tx: Math.cos(ang) * 8.5, ty: Math.sin(ang) * 8.5 });
      }
      cells.push({ g: g, shell: shell, cores: cores, multi: multi, at: multi ? 1.7 + pick[k] * 0.085 : 0, cx: cx, cy: cy, ph: rnd(k * 7) * 6.28 });
    }
    var scan = el('line', { y1: 150, y2: 746, stroke: P.ember, 'class': w(2) }, L.mid);

    var tag = el('g', {}, hud);
    txt(tag, 64, 104, '산불 연기 속 블랙카본 입자', 38, { fill: P.mute, w: 600 });
    var num = BigNum(ctx, hud, 56, 560, 210, { fill: P.ember });
    var lab = el('g', {}, hud);
    txt(lab, 64, 640, '핵이 여러 개인 입자', 46, { w: 700 });
    var legend = el('g', {}, hud);
    el('circle', { cx: 84, cy: 724, r: 18, fill: 'rgba(242,163,58,.2)', stroke: P.ember, 'stroke-width': 2 }, legend);
    el('circle', { cx: 78, cy: 720, r: 5, fill: P.core }, legend);
    el('circle', { cx: 90, cy: 728, r: 5, fill: P.core }, legend);
    txt(legend, 116, 737, '입자 100개 중', 38, { fill: P.mute, w: 600 });

    return function (l, cam) {
      var q, k2, lit = 0;
      dB(l); dF(l);
      var sx = mod(l - 1.2, 2.4) / 2.4, scanX = lerp(580, 1160, sx);
      A(scan, 'x1', scanX); A(scan, 'x2', scanX);
      O(scan, seg(l, 1.2, 1.5) * 0.55 * Math.sin(Math.PI * sx));
      for (k2 = 0; k2 < cells.length; k2++) {
        var ce = cells[k2];
        var bob = Math.sin(l * 1.4 + ce.ph) * 1.6;
        var p = ce.multi ? seg(l, ce.at, ce.at + 0.4) : 0;
        var near = ce.multi && p > 0 ? Math.max(0, 1 - Math.abs(ce.cx - scanX) / 60) : 0;
        var sc = 1 + 0.25 * Math.sin(Math.PI * p) + 0.06 * near;
        T(ce.g, 'translate(' + ce.cx + ',' + f2(ce.cy + bob) + ') scale(' + f2(sc) + ')');
        if (ce.multi) {
          if (p >= 0.5) lit++;
          A(ce.shell, 'fill', p > 0 ? 'rgba(242,163,58,' + f2(0.08 + 0.14 * p + 0.12 * near) + ')' : 'rgba(184,204,224,.05)');
          A(ce.shell, 'stroke', p > 0.3 ? P.ember : P.line);
          var e = eo(p);
          for (q = 0; q < ce.cores.length; q++) {
            var co = ce.cores[q];
            A(co.n, 'cx', co.tx * e); A(co.n, 'cy', co.ty * e); A(co.n, 'r', lerp(7, 5.2, e));
          }
        } else {
          O(ce.g, 1 - 0.45 * seg(l, 1.8, 3.2));
        }
      }
      fade(tag, l, 0.9, 1.4, 14);
      num.set(seg(l, 1.5, 2.0), lit + '%');
      fade(lab, l, 2.1, 2.6, 16);
      fade(legend, l, 2.4, 2.9, 12);
    };
  }

  function bcRatio(L, hud, ctx) {
    var k;
    var dB = dust(L.back, 40, 91);
    var dF = dust(L.front, 6, 97, { r0: 4, r1: 6, a: 0.16, vx: 22, fill: '#56718D' });
    var base = 640;
    function particle(x, multi) {
      var g = el('g', {}, L.mid);
      var glow = el('circle', { cx: x, cy: BC3.y, r: multi ? 86 : 50, fill: P.ember, filter: 'url(#' + ctx.glowId + ')' }, g);
      var shell = el('circle', { cx: x, cy: BC3.y, r: BC3.R, fill: 'rgba(184,204,224,.06)', stroke: P.line, 'class': w(2) }, g);
      el('path', { d: 'M' + (x - 80) + ' ' + (BC3.y - 46) + 'A96 96 0 0 1 ' + (x - 26) + ' ' + (BC3.y - 90), fill: 'none', stroke: P.ink, 'class': w(2), opacity: 0.4, 'stroke-linecap': 'round' }, g);
      var cores = [], pos = multi ? [[-34, -20, 28], [30, -26, 24], [2, 32, 27]] : [[0, 0, 42]];
      for (var q = 0; q < pos.length; q++) {
        var wrap = el('g', { transform: 'translate(' + (x + pos[q][0]) + ',' + (BC3.y + pos[q][1]) + ')' }, g);
        cores.push({ g: soot(wrap, pos[q][2], 11 + q * 13 + (multi ? 40 : 0)), x: pos[q][0], r: pos[q][2] });
      }
      /* 위에서 내려오는 같은 빛줄기 5개 */
      var rays = [];
      for (q = 0; q < 5; q++) {
        var dx = (q - 2) * 34, hitY = null;
        for (var j = 0; j < pos.length; j++) {
          if (Math.abs(dx - pos[j][0]) < pos[j][2] * 0.85) {
            var yy = BC3.y + pos[j][1] - Math.sqrt(Math.pow(pos[j][2], 2) - Math.pow(dx - pos[j][0], 2)) + 6;
            if (hitY === null || yy < hitY) hitY = yy;
          }
        }
        var yin = BC3.y - Math.sqrt(BC3.R * BC3.R - dx * dx), yout = BC3.y + Math.sqrt(BC3.R * BC3.R - dx * dx);
        var preB = el('line', { x1: x + dx, x2: x + dx, y1: -40, y2: -40, stroke: P.ray, 'class': w(1), opacity: 0.22 }, g);
        var pre = el('line', { x1: x + dx, x2: x + dx, y1: -40, y2: -40, stroke: P.ray, 'class': w(2), 'stroke-dasharray': '80 220', 'stroke-linecap': 'round' }, g);
        var postB = hitY === null ? el('line', { x1: x + dx, x2: x + dx, y1: yout, y2: yout, stroke: P.ray, 'class': w(1), opacity: 0.12 }, g) : null;
        var post = hitY === null ? el('line', { x1: x + dx, x2: x + dx, y1: yout, y2: yout, stroke: P.ray, 'class': w(2), 'stroke-dasharray': '80 220', 'stroke-linecap': 'round' }, g) : null;
        var fl = hitY !== null ? el('circle', { cx: x + dx, cy: f2(hitY), r: 5, fill: P.ember }, g) : null;
        rays.push({ pre: pre, preB: preB, post: post, postB: postB, fl: fl, end: hitY !== null ? hitY : yin, yout: yout, d: q * 0.06, off: rnd(q * 17 + x) * 300 });
      }
      var heat = [el('circle', { cx: x, cy: BC3.y, r: BC3.R, fill: 'none', stroke: P.ember, 'class': w(2) }, g),
        el('circle', { cx: x, cy: BC3.y, r: BC3.R, fill: 'none', stroke: P.red, 'class': w(1) }, g)];
      return { g: g, glow: glow, shell: shell, cores: cores, rays: rays, heat: heat, multi: multi };
    }
    var pl = particle(BC3.lx, false), pr = particle(BC3.rx, true);
    /* 막대 */
    el('line', { x1: 120, y1: base, x2: 1080, y2: base, stroke: P.dim, 'class': w(2) }, L.mid);
    var barL = el('rect', { x: BC3.lx - 60, width: 120, fill: 'rgba(184,204,224,.28)', stroke: P.line, 'class': w(1) }, L.mid);
    var barR = el('rect', { x: BC3.rx - 60, width: 120, fill: 'rgba(242,163,58,.55)', stroke: P.ember, 'class': w(1) }, L.mid);
    var unit = 110;

    var vL = el('g', {}, hud), vR = el('g', {}, hud);
    var tL = txt(vL, BC3.lx, 0, '1', 48, { anchor: 'middle', disp: true });
    var tR = txt(vR, BC3.rx, 0, '1.81', 48, { anchor: 'middle', disp: true, fill: P.ember });
    var labs = el('g', {}, hud);
    txt(labs, BC3.lx, 694, '핵 1개', 38, { anchor: 'middle', fill: P.mute, w: 600 });
    txt(labs, BC3.rx, 694, '핵 여러 개', 38, { anchor: 'middle', fill: P.mute, w: 600 });
    var num = BigNum(ctx, hud, 56, 852, 190, { fill: P.ember });
    var sub = el('g', {}, hud);
    txt(sub, 1140, 852, '지름 400 nm 초과 입자', 38, { anchor: 'end', fill: P.ink, w: 600 });

    function updP(pp, l, hotAmt) {
      var q, e, a;
      for (q = 0; q < pp.rays.length; q++) {
        var r = pp.rays[q];
        e = eio(seg(l, 0.4 + r.d, 1.3 + r.d));
        A(r.pre, 'y2', lerp(-40, r.end, e)); A(r.preB, 'y2', lerp(-40, r.end, e));
        A(r.pre, 'stroke-dashoffset', -l * 240 - r.off);
        O(r.pre, 0.85);
        if (r.post) {
          var e2 = eio(seg(l, 1.1 + r.d, 1.8 + r.d));
          A(r.post, 'y2', lerp(r.yout, base - 6, e2)); A(r.postB, 'y2', lerp(r.yout, base - 6, e2));
          A(r.post, 'stroke-dashoffset', -l * 240 - r.off);
          O(r.post, 0.3 * (e2 > 0 ? 1 : 0));
        }
        if (r.fl) {
          a = mod(l * 1.7 + q * 0.27, 1);
          A(r.fl, 'r', 3 + 7 * a);
          O(r.fl, e >= 1 ? (1 - a) * 0.9 : 0);
        }
      }
      for (q = 0; q < pp.cores.length; q++) T(pp.cores[q].g, 'rotate(' + f2(l * (8 + q * 3) * (q % 2 ? -1 : 1)) + ')');
      O(pp.glow, (0.16 + 0.1 * Math.sin(l * 3)) * seg(l, 1.2, 2.0) * (0.5 + hotAmt));
      if (pp.multi) {
        A(pp.shell, 'fill', 'rgba(242,163,58,' + f2(0.04 + 0.12 * hotAmt) + ')');
        A(pp.shell, 'stroke', hotAmt > 0.5 ? P.ember : P.line);
        for (q = 0; q < 2; q++) {
          a = mod(l * 0.8 + q * 0.5, 1);
          A(pp.heat[q], 'r', BC3.R + 6 + 46 * a);
          O(pp.heat[q], hotAmt * (1 - a) * 0.7);
        }
      } else {
        O(pp.heat[0], 0); O(pp.heat[1], 0);
      }
    }

    return function (l, cam, d) {
      dB(l); dF(l);
      var hot = eo(seg(l, 1.6, 3.2));
      updP(pl, l, 0); updP(pr, l, hot);
      var e = eo(seg(l, 1.8, 2.6)), hL = unit * e, k1 = eo(seg(l, 2.2, 3.4)), hR = unit * lerp(1, 1.81, k1) * e;
      A(barL, 'y', base - hL); A(barL, 'height', hL);
      A(barR, 'y', base - hR); A(barR, 'height', hR);
      var hideE = 1 - seg(l, d - 0.85, d - 0.55);
      var pL = scr(cam, BC3.lx, base - hL - 16), pR = scr(cam, BC3.rx, base - hR - 16);
      A(tL, 'y', f2(pL[1])); A(tL, 'x', f2(pL[0]));
      A(tR, 'y', f2(pR[1])); A(tR, 'x', f2(pR[0]));
      tR.textContent = lerp(1, 1.81, k1).toFixed(2);
      O(vL, seg(l, 2.4, 2.7) * hideE); O(vR, seg(l, 2.4, 2.7) * hideE);
      O(labs, eo(seg(l, 1.9, 2.4)) * hideE);
      num.set(seg(l, 2.0, 2.5), lerp(1, 1.81, k1).toFixed(2) + '×');
      O(num.g, hideE);
      fade(sub, l, 2.8, 3.3, 14);
      O(sub, eo(seg(l, 2.8, 3.3)) * hideE);
    };
  }

  function bcGlobe(L, hud, ctx) {
    var k;
    var stars = [], sg = el('g', { fill: P.ink }, L.back);
    for (k = 0; k < 70; k++) stars.push({ n: el('circle', { cx: f2(rnd(k * 3 + 5) * W), cy: f2(rnd(k * 5 + 9) * H), r: f2(0.8 + rnd(k * 7) * 1.6) }, sg), ph: rnd(k * 11) * 6.28 });
    var E = BC4;
    var halo = el('circle', { cx: E.x, cy: E.y, r: E.R + 24, fill: P.ember, filter: 'url(#' + ctx.glowId + ')' }, L.mid);
    var gl = el('g', { transform: 'rotate(-16 ' + E.x + ' ' + E.y + ')' }, L.mid);
    var cid = ctx.id('g');
    var cp = el('clipPath', { id: cid }, ctx.defs);
    el('circle', { cx: E.x, cy: E.y, r: E.R }, cp);
    el('circle', { cx: E.x, cy: E.y, r: E.R, fill: '#0E2640' }, gl);
    var inner = el('g', { 'clip-path': 'url(#' + cid + ')' }, gl);
    /* 추상 대륙 */
    var blobs = [
      [[50, -20], [62, 10], [48, 40], [30, 30], [20, 0], [35, -25]],
      [[20, -100], [40, -80], [30, -60], [5, -70], [-10, -85]],
      [[-10, -60], [5, -40], [-20, -35], [-45, -60], [-30, -70]],
      [[30, 60], [50, 90], [45, 130], [20, 120], [10, 90]],
      [[0, 15], [15, 35], [0, 45], [-30, 30], [-20, 15]],
      [[-20, 120], [-15, 145], [-35, 150], [-38, 125]],
      [[60, -140], [70, -100], [60, -70], [55, -110]]
    ];
    var land = [];
    for (k = 0; k < blobs.length; k++) land.push(el('path', { fill: '#183650', stroke: '#35587A', 'class': w(1) }, inner));
    /* 위도선(직선)과 경도선 */
    var lat = [-60, -30, 0, 30, 60];
    for (k = 0; k < lat.length; k++) {
      var yy = E.y - E.R * Math.sin(lat[k] * Math.PI / 180), hw = E.R * Math.cos(lat[k] * Math.PI / 180);
      el('line', { x1: f2(E.x - hw), x2: f2(E.x + hw), y1: f2(yy), y2: f2(yy), stroke: '#2E5172', 'class': w(1), opacity: 0.8 }, inner);
    }
    var mer = [];
    for (k = 0; k < 12; k++) mer.push(el('path', { fill: 'none', stroke: '#2E5172', 'class': w(1), opacity: 0.8 }, inner));
    /* 불씨 지점 */
    var fires = [[38, -118], [-12, -55], [-8, 22], [55, 105], [-25, 135], [12, 80], [45, -10], [62, -150]], fs = [];
    for (k = 0; k < fires.length; k++) {
      var fg = el('g', {}, inner);
      var haze = el('circle', { r: 10, fill: 'url(#pmhaze)' }, fg);
      var ring = el('circle', { r: 8, fill: 'none', stroke: P.ember, 'class': w(2) }, fg);
      var dot = el('circle', { r: 6, fill: P.ember, stroke: P.red, 'class': w(1) }, fg);
      fs.push({ g: fg, haze: haze, ring: ring, dot: dot, lat: fires[k][0], lon: fires[k][1], at: 1.0 + k * 0.16 });
    }
    el('circle', { cx: E.x, cy: E.y, r: E.R, fill: 'none', stroke: P.line, 'class': w(2) }, gl);
    var atm = el('circle', { cx: E.x, cy: E.y, r: E.R + 10, fill: 'none', stroke: P.ember, 'class': w(4) }, gl);
    var atm2 = el('circle', { cx: E.x, cy: E.y, r: E.R + 26, fill: 'none', stroke: P.ember, 'class': w(1), 'stroke-dasharray': '3 9' }, gl);

    function proj(la, lo) {
      var a = la * Math.PI / 180, b = lo * Math.PI / 180;
      var X = Math.cos(a) * Math.sin(b), Y = Math.sin(a), Z = Math.cos(a) * Math.cos(b);
      if (Z < 0) { var m = Math.sqrt(X * X + Y * Y) || 1; X /= m; Y /= m; }
      return [E.x + E.R * X, E.y - E.R * Y, Z];
    }

    var tag = el('g', {}, hud);
    txt(tag, 64, 104, '전 지구 모델에 넣으면', 38, { fill: P.mute, w: 600 });
    var num = BigNum(ctx, hud, 56, 800, 200, { fill: P.ember });
    var lab = el('g', {}, hud);
    txt(lab, 64, 866, '전 지구 에어로졸 흡수', 44, { w: 700 });

    return function (l) {
      var q, j;
      for (q = 0; q < stars.length; q++) O(stars[q].n, 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(l * 1.4 + stars[q].ph)));
      var rot = -30 + l * 16;
      for (q = 0; q < blobs.length; q++) {
        var dd = '', vis2 = 0;
        for (j = 0; j < blobs[q].length; j++) {
          var p = proj(blobs[q][j][0], blobs[q][j][1] + rot);
          if (p[2] > 0) vis2++;
          dd += (j ? 'L' : 'M') + f2(p[0]) + ' ' + f2(p[1]);
        }
        A(land[q], 'd', vis2 ? dd + 'Z' : 'M0 0');
      }
      for (q = 0; q < mer.length; q++) {
        var lo = mod(q * 30 + rot, 360) * Math.PI / 180;
        if (Math.cos(lo) <= 0) { A(mer[q], 'd', 'M0 0'); continue; }
        var rx = Math.abs(E.R * Math.sin(lo)), sw = Math.sin(lo) > 0 ? 1 : 0;
        A(mer[q], 'd', 'M' + E.x + ' ' + (E.y - E.R) + 'A' + f2(rx) + ' ' + E.R + ' 0 0 ' + sw + ' ' + E.x + ' ' + (E.y + E.R));
      }
      var spread = eo(seg(l, 1.6, 3.6));
      for (q = 0; q < fs.length; q++) {
        var f = fs[q], pp = proj(f.lat, f.lon + rot);
        var on = seg(l, f.at, f.at + 0.3) * (pp[2] > 0.08 ? Math.min(1, pp[2] * 3) : 0);
        T(f.g, 'translate(' + f2(pp[0]) + ',' + f2(pp[1]) + ')');
        O(f.g, on);
        var a = mod(l * 1.1 + q * 0.37, 1);
        A(f.ring, 'r', 6 + 26 * a); O(f.ring, 1 - a);
        A(f.dot, 'r', 5 + 2 * Math.sin(l * 5 + q));
        A(f.haze, 'r', 10 + 70 * spread * pp[2]); O(f.haze, 0.9 * spread);
      }
      var absorb = eo(seg(l, 1.8, 3.4));
      O(halo, (0.14 + 0.05 * Math.sin(l * 2)) * absorb);
      O(atm, 0.55 * absorb);
      O(atm2, 0.6 * absorb);
      T(atm2, 'rotate(' + f2(l * 6) + ' ' + E.x + ' ' + E.y + ')');
      fade(tag, l, 0.9, 1.4, 14);
      num.set(seg(l, 1.8, 2.3), '+' + Math.round(19 * eo(seg(l, 2.0, 3.4))) + '%');
      fade(lab, l, 2.6, 3.1, 14);
    };
  }

  /* =========================================================
     논문 2 — 미세플라스틱
     ========================================================= */
  var AM1 = { x: 700, y: 352, s: 24 };    /* 확대해 들어갈 조각 */
  var AM2 = { x: 640, y: 360, s: 128 };   /* 다음 장면의 같은 조각 */

  function amAir(L, hud, ctx) {
    var k;
    var dB = dust(L.back, 36, 201, { a: 0.35 });
    var farSky = skyline(L.back, 7, 760, 90, 260, '#0F2439');
    var nearSky = skyline(L.mid, 23, 800, 60, 230, '#081522', P.hair, true);
    var parts = [], pg = el('g', {}, L.mid), fg = el('g', {}, L.front);
    for (k = 0; k < 58; k++) {
      var type = k % 3, hot = k % 5 === 1, front = k % 7 === 3;
      var g = el('g', {}, front ? fg : pg), shape, sz = 8 + rnd(k * 3 + 1) * 10;
      if (type === 0) shape = el('circle', { r: f2(sz * 0.5), fill: '#8EA2B7' }, g);
      else if (type === 1) shape = el('path', { d: fragD(sz * 0.8, rnd(k) * 6), fill: '#8EA2B7' }, g);
      else shape = el('path', { d: 'M' + f2(-sz * 1.3) + ' 2Q0 ' + f2(-sz) + ' ' + f2(sz * 1.3) + ' -2', fill: 'none', stroke: '#8EA2B7', 'class': w(3), 'stroke-linecap': 'round' }, g);
      var ret = null;
      if (hot && type !== 0) {
        var R = sz * 1.6 + 8;
        ret = el('path', {
          d: 'M' + (-R) + ' ' + (-R + 10) + 'V' + (-R) + 'H' + (-R + 10) + 'M' + (R - 10) + ' ' + (-R) + 'H' + R + 'V' + (-R + 10) +
            'M' + R + ' ' + (R - 10) + 'V' + R + 'H' + (R - 10) + 'M' + (-R + 10) + ' ' + R + 'H' + (-R) + 'V' + (R - 10),
          fill: 'none', stroke: P.teal, 'class': w(2)
        }, g);
      }
      parts.push({ g: g, s: shape, ret: ret, type: type, hot: hot && type !== 0, x: rnd(k * 7 + 3) * (W + 160) - 80, y: 240 + rnd(k * 11 + 5) * 420, vx: 8 + rnd(k * 13) * 16, ph: rnd(k * 17) * 6.28, at: 1.2 + rnd(k * 19) * 2.0, rot: rnd(k * 23) * 360 });
    }
    /* 확대해 들어갈 조각 */
    var focus = el('g', {}, L.mid);
    var fShape = el('path', { d: fragD(AM1.s, 0.3), fill: 'rgba(79,195,217,.25)', stroke: P.teal, 'class': w(2) }, focus);
    var fRet = el('circle', { r: AM1.s + 18, fill: 'none', stroke: P.teal, 'class': w(1), 'stroke-dasharray': '6 8' }, focus);

    var tag = el('g', {}, hud);
    txt(tag, 64, 128, 'PM10', 76, { disp: true, w: 700 });
    txt(tag, 64, 184, '도시 공기 속 미세먼지', 38, { fill: P.mute, w: 600 });
    var leg = el('g', {}, hud);
    el('rect', { x: 64, y: 762, width: 340, height: 72, rx: 36, fill: 'rgba(8,21,34,.82)', stroke: P.teal, 'stroke-width': 2 }, leg);
    el('path', { d: fragD(15, 0.3), transform: 'translate(104,798)', fill: 'rgba(79,195,217,.3)', stroke: P.teal, 'stroke-width': 2 }, leg);
    txt(leg, 134, 812, '플라스틱 조각', 40, { w: 700 });

    return function (l, cam, d) {
      var q, a;
      dB(l); farSky(l); nearSky(l, 0.7);
      for (q = 0; q < parts.length; q++) {
        var p = parts[q];
        var x = mod(p.x + l * p.vx, W + 160) - 80, y = p.y + Math.sin(l * 0.9 + p.ph) * 10;
        T(p.g, 'translate(' + f2(x) + ',' + f2(y) + ') rotate(' + f2(p.rot + l * 14) + ')');
        var on = p.hot ? eo(seg(l, p.at, p.at + 0.4)) : 0;
        if (p.type === 2) A(p.s, 'stroke', on > 0.3 ? P.teal : '#8EA2B7');
        else A(p.s, 'fill', on > 0.3 ? 'rgba(79,195,217,.55)' : '#8EA2B7');
        O(p.s, p.hot ? 0.6 + 0.4 * on : 0.55);
        if (p.ret) { O(p.ret, on); T(p.ret, 'rotate(' + f2(-(p.rot + l * 14)) + ') scale(' + f2(1.6 - 0.6 * on) + ')'); }
      }
      a = eo(seg(l, 0.8, 1.3));
      T(focus, 'translate(' + AM1.x + ',' + f2(AM1.y + Math.sin(l * 0.9) * 4) + ')');
      O(fRet, a); T(fRet, 'rotate(' + f2(l * 30) + ')');
      A(fShape, 'fill', 'rgba(79,195,217,' + f2(0.1 + 0.2 * a) + ')');
      var hideE = 1 - seg(l, d - 0.85, d - 0.55);
      O(tag, eo(seg(l, 0.3, 0.8)) * hideE); T(tag, 'translate(0,' + f2(14 * (1 - eo(seg(l, 0.3, 0.8)))) + ')');
      O(leg, eo(seg(l, 2.4, 2.9)) * hideE);
    };
  }

  function amLens(L, hud, ctx) {
    var k;
    var dB = dust(L.back, 40, 301, { a: 0.35 });
    var F = AM2;
    var glow = el('circle', { cx: F.x, cy: F.y, r: F.s * 0.9, fill: P.teal, filter: 'url(#' + ctx.glowId + ')' }, L.mid);
    var part = el('g', { transform: 'translate(' + F.x + ',' + F.y + ')' }, L.mid);
    var pid = ctx.id('f');
    var pcp = el('clipPath', { id: pid }, ctx.defs);
    el('path', { d: fragD(F.s, 0.3), transform: 'translate(' + F.x + ',' + F.y + ')' }, pcp);
    var body = el('path', { d: fragD(F.s, 0.3), fill: 'rgba(79,195,217,.1)', stroke: P.teal, 'class': w(2) }, part);
    /* SEM 질감과 EDX 점 */
    var semG = el('g', { 'clip-path': 'url(#' + pid + ')' }, L.mid);
    for (k = 0; k < 16; k++) {
      var yy = F.y - F.s + k * 17;
      el('path', { d: 'M' + (F.x - F.s - 20) + ' ' + yy + 'Q' + F.x + ' ' + (yy + 22 * Math.sin(k)) + ' ' + (F.x + F.s + 20) + ' ' + (yy + 8), fill: 'none', stroke: '#B8CCE0', 'class': w(1), opacity: 0.5 }, semG);
    }
    var edx = [];
    for (k = 0; k < 26; k++) edx.push(el('circle', { cx: f2(F.x + (rnd(k * 3 + 1) - 0.5) * F.s * 1.6), cy: f2(F.y + (rnd(k * 5 + 2) - 0.5) * F.s * 1.5), r: 4, fill: k % 3 ? P.green : P.teal }, semG));
    var scan = el('line', { x1: F.x - 200, x2: F.x + 200, stroke: P.teal, 'class': w(3) }, el('g', { 'clip-path': 'url(#' + pid + ')' }, L.mid));
    /* 렌즈 세 개 */
    var lens = [], from = [[-520, 0], [520, 40], [0, -560]], off = [[-14, 6], [14, -4], [0, 12]];
    for (k = 0; k < 3; k++) {
      var lg = el('g', {}, L.front);
      var ring = el('g', {}, lg);
      el('circle', { r: 196, fill: 'none', stroke: P.teal, 'class': w(2) }, ring);
      el('circle', { r: 210, fill: 'none', stroke: P.hair, 'class': w(1) }, ring);
      var tk = '';
      for (var q = 0; q < 36; q++) {
        var an = q * 10 * Math.PI / 180, r0 = q % 3 ? 200 : 192;
        tk += 'M' + f2(Math.cos(an) * r0) + ' ' + f2(Math.sin(an) * r0) + 'L' + f2(Math.cos(an) * 210) + ' ' + f2(Math.sin(an) * 210);
      }
      el('path', { d: tk, stroke: P.teal, 'class': w(1), opacity: 0.7 }, ring);
      lens.push({ g: lg, ring: ring, fx: from[k][0], fy: from[k][1], ox: off[k][0], oy: off[k][1], at: 0.9 + k * 1.15 });
    }
    /* HUD: 기법 목록 */
    var names = ['형광 현미경', '라만 분광', 'SEM/EDX'], items = [];
    for (k = 0; k < 3; k++) {
      var ig = el('g', {}, hud);
      var bar = el('rect', { x: 64, y: 196 + k * 96, width: 6, height: 52, rx: 3, fill: P.teal }, ig);
      var tt = txt(ig, 90, 238 + k * 96, names[k], 44, { w: 700, disp: k === 2 });
      items.push({ g: ig, bar: bar, t: tt, at: 0.9 + k * 1.15 });
    }
    var tag = el('g', {}, hud);
    txt(tag, 64, 128, '입자 하나씩 확인', 38, { fill: P.mute, w: 600 });
    /* 스펙트럼 */
    var spec = el('g', {}, hud);
    el('line', { x1: 120, y1: 820, x2: 1080, y2: 820, stroke: P.dim, 'stroke-width': 2 }, spec);
    var sd = '', N = 160;
    for (k = 0; k <= N; k++) {
      var xx = k / N, v = 0.06 + 0.04 * Math.sin(xx * 40);
      v += 0.75 * Math.exp(-Math.pow((xx - 0.22) / 0.012, 2)) + 0.45 * Math.exp(-Math.pow((xx - 0.47) / 0.016, 2)) +
        0.95 * Math.exp(-Math.pow((xx - 0.63) / 0.01, 2)) + 0.35 * Math.exp(-Math.pow((xx - 0.81) / 0.02, 2));
      sd += (k ? 'L' : 'M') + f2(120 + xx * 960) + ' ' + f2(812 - v * 150);
    }
    var curve = el('path', { d: sd, fill: 'none', stroke: P.teal, 'stroke-width': 3, 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1' }, spec);
    var specL = txt(spec, 1080, 640, '라만 스펙트럼', 38, { anchor: 'end', fill: P.mute, w: 600 });

    return function (l) {
      var q, e, a;
      dB(l);
      T(part, 'translate(' + F.x + ',' + F.y + ') rotate(' + f2(Math.sin(l * 0.6) * 3) + ')');
      var fluo = eo(seg(l, 1.1, 1.8)), sem = eo(seg(l, 3.3, 4.0));
      O(glow, (0.3 + 0.08 * Math.sin(l * 3)) * fluo * (1 - 0.7 * sem));
      A(body, 'fill', sem > 0.5 ? 'rgba(184,204,224,' + f2(0.08 + 0.1 * sem) + ')' : 'rgba(79,195,217,' + f2(0.1 + 0.4 * fluo) + ')');
      A(body, 'stroke', sem > 0.5 ? P.ink : P.teal);
      O(semG, sem);
      for (q = 0; q < edx.length; q++) O(edx[q], seg(l, 3.6 + q * 0.03, 3.8 + q * 0.03) * (0.6 + 0.4 * Math.sin(l * 4 + q)));
      /* 라만 스캔선 */
      a = mod(l - 2.1, 1.1) / 1.1;
      var sy = F.y - F.s + a * F.s * 2;
      A(scan, 'y1', sy); A(scan, 'y2', sy);
      O(scan, l > 2.1 ? 0.9 * Math.sin(Math.PI * a) * (1 - 0.6 * sem) : 0);
      for (q = 0; q < lens.length; q++) {
        var ln = lens[q];
        e = eio(seg(l, ln.at, ln.at + 0.6));
        T(ln.g, 'translate(' + f2(F.x + ln.ox + ln.fx * (1 - e)) + ',' + f2(F.y + ln.oy + ln.fy * (1 - e)) + ')');
        O(ln.g, seg(l, ln.at, ln.at + 0.2) * (q === 2 || l < lens[q + 1].at + 0.6 ? 1 : 0.4));
        T(ln.ring, 'rotate(' + f2(l * (q % 2 ? -12 : 12)) + ')');
      }
      for (q = 0; q < items.length; q++) {
        var it = items[q], act = l >= it.at && (q === 2 || l < items[q + 1].at);
        O(it.g, seg(l, 0.5, 0.9));
        A(it.t, 'fill', act ? P.teal : l >= it.at ? P.ink : P.dim);
        O(it.bar, act ? 1 : 0);
      }
      fade(tag, l, 0.4, 0.9, 12);
      A(curve, 'stroke-dashoffset', 1 - eio(seg(l, 2.2, 3.3)));
      O(spec, seg(l, 2.0, 2.3));
      O(specL, seg(l, 2.3, 2.7));
    };
  }

  function amNight(L, hud, ctx) {
    var k;
    var sky = el('rect', { x: -200, y: -200, width: W + 400, height: H + 400 }, L.back);
    var stars = [], sg = el('g', { fill: P.ink }, L.back);
    for (k = 0; k < 50; k++) stars.push({ n: el('circle', { cx: f2(rnd(k * 3 + 1) * W), cy: f2(40 + rnd(k * 5 + 7) * 420), r: f2(0.8 + rnd(k * 7) * 1.6) }, sg), ph: rnd(k * 9) * 6.28 });
    var sun = el('circle', { r: 44, fill: '#E9DDB8' }, L.back);
    var moon = el('g', {}, L.back);
    var mid = ctx.id('m');
    var mm = el('mask', { id: mid }, ctx.defs);
    el('rect', { x: -60, y: -60, width: 120, height: 120, fill: '#fff' }, mm);
    el('circle', { cx: 18, cy: -12, r: 36, fill: '#000' }, mm);
    el('circle', { r: 40, fill: '#DCE7F2', mask: 'url(#' + mid + ')' }, moon);
    var farSky = skyline(L.back, 51, 770, 80, 230, '#0C1F33');
    var ground = 800;
    var ceil = el('line', { x1: -100, x2: W + 100, stroke: P.teal, 'class': w(2), 'stroke-dasharray': '14 12' }, L.mid);
    var nearSky = skyline(L.mid, 63, 830, 40, 150, '#06111C', P.hair, true);
    var parts = [], pg = el('g', {}, L.mid);
    for (k = 0; k < 80; k++) {
      parts.push({ n: el('circle', { r: f2(3 + rnd(k * 3 + 2) * 3.5), fill: P.teal }, pg), u: 0.04 + rnd(k * 5 + 1) * 0.92, x: rnd(k * 7 + 4) * (W + 80) - 40, vx: 6 + rnd(k * 11) * 12, ph: rnd(k * 13) * 6.28, extra: k >= 50, at: 2.4 + (k - 50) * 0.04 });
    }

    var n1 = BigNum(ctx, hud, 56, 206, 150, { fill: P.ink });
    var u1 = el('g', {}, hud);
    txt(u1, 64, 266, '공기 1㎥당 평균, 개', 38, { fill: P.mute, w: 600 });
    var n2 = BigNum(ctx, hud, 56, 426, 150, { fill: P.teal });
    var u2 = el('g', {}, hud);
    txt(u2, 64, 486, '밤, 낮보다', 38, { fill: P.mute, w: 600 });
    var ceilL = el('g', {}, hud);
    var ceilT = txt(ceilL, 1140, 0, '혼합층', 38, { anchor: 'end', fill: P.teal, w: 700 });
    var dn = el('g', {}, hud);
    var dayT = txt(dn, 1140, 96, '낮', 48, { anchor: 'end', w: 800 });
    var nightT = txt(dn, 1140, 96, '밤', 48, { anchor: 'end', w: 800 });

    function mix(a, b, p) {
      var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), out = '#';
      for (var s = 16; s >= 0; s -= 8) {
        var v = Math.round(lerp((x >> s) & 255, (y >> s) & 255, p));
        out += (v < 16 ? '0' : '') + v.toString(16);
      }
      return out;
    }

    return function (l, cam) {
      var q;
      var night = eio(seg(l, 1.8, 3.2));
      A(sky, 'fill', mix('#183B58', '#060E18', night));
      for (q = 0; q < stars.length; q++) O(stars[q].n, night * (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(l * 2 + stars[q].ph))));
      var sp = eio(seg(l, 1.4, 2.8));
      A(sun, 'cx', lerp(960, 1080, sp)); A(sun, 'cy', lerp(190, 860, sp));
      var mp = eo(seg(l, 2.4, 3.8));
      T(moon, 'translate(' + f2(lerp(860, 980, mp)) + ',' + f2(lerp(880, 210, mp)) + ')');
      farSky(l); nearSky(l, 0.3 + 0.7 * night);
      var cy = lerp(500, 612, eio(seg(l, 2.3, 3.5)));
      A(ceil, 'y1', cy); A(ceil, 'y2', cy); A(ceil, 'stroke-dashoffset', -l * 20);
      O(ceil, eo(seg(l, 0.4, 0.9)));
      for (q = 0; q < parts.length; q++) {
        var p = parts[q];
        var x = mod(p.x + l * p.vx, W + 80) - 40;
        var y = ground - p.u * (ground - cy - 8) + Math.sin(l * 1.2 + p.ph) * 6;
        A(p.n, 'cx', f2(x)); A(p.n, 'cy', f2(y));
        O(p.n, (p.extra ? eo(seg(l, p.at, p.at + 0.4)) : seg(l, 0.2 + q * 0.008, 0.6 + q * 0.008)) * 0.85);
      }
      n1.set(seg(l, 0.6, 1.1), comma(Math.round(1300 * eo(seg(l, 0.7, 1.9)) / 10) * 10));
      fade(u1, l, 1.2, 1.6, 12);
      n2.set(seg(l, 2.8, 3.3), '+' + Math.round(60 * eo(seg(l, 2.9, 3.9))) + '%');
      fade(u2, l, 3.3, 3.8, 12);
      var cp = scr(cam, 0, cy);
      A(ceilT, 'y', f2(cp[1] - 16));
      O(ceilL, eo(seg(l, 0.6, 1.1)));
      O(dayT, 1 - night); O(nightT, night);
    };
  }

  function amSize(L, hud, ctx) {
    var k;
    var dB = dust(L.back, 30, 401, { a: 0.3 });
    var streaks = [], stG = el('g', { stroke: P.teal, 'stroke-linecap': 'round' }, L.back);
    for (k = 0; k < 9; k++) streaks.push({ n: el('line', { x1: 0, x2: 90 + rnd(k) * 80, y1: 0, y2: 0, 'class': w(2) }, stG), y: 90 + rnd(k * 3 + 1) * 260, ph: rnd(k * 5) * 1400, v: 160 + rnd(k * 7) * 120 });
    var AX = 690, X25 = 440, X10 = 880;
    var zoneA = el('rect', { x: 90, y: 340, width: X10 - 90, height: AX - 340, fill: 'rgba(79,195,217,.07)' }, L.mid);
    var zoneB = el('rect', { x: 90, y: 340, width: X25 - 90, height: AX - 340, fill: 'rgba(107,160,58,.09)' }, L.mid);
    el('line', { x1: 90, y1: AX, x2: 1110, y2: AX, stroke: P.line, 'class': w(2) }, L.mid);
    var g25 = el('line', { x1: X25, x2: X25, y1: 330, y2: AX + 10, stroke: P.green, 'class': w(2), 'stroke-dasharray': '8 8' }, L.mid);
    var g10 = el('line', { x1: X10, x2: X10, y1: 330, y2: AX + 10, stroke: P.teal, 'class': w(2), 'stroke-dasharray': '8 8' }, L.mid);
    /* 입자 40개: 16개는 2.5 ㎛ 아래, 22개는 2.5–10 ㎛, 2개는 10 ㎛ 위 (40% / 95%) */
    var parts = [], pg = el('g', {}, L.mid);
    for (k = 0; k < 40; k++) {
      var tx, zone = k < 16 ? 0 : k < 38 ? 1 : 2;
      if (zone === 0) tx = 116 + (k / 15) * 296;
      else if (zone === 1) tx = 470 + ((k - 16) / 21) * 380;
      else tx = 950 + (k - 38) * 100;
      var r = zone === 0 ? 4 + (k / 15) * 5 : zone === 1 ? 9 + ((k - 16) / 21) * 9 : 22 + (k - 38) * 4;
      var row = zone === 2 ? 0 : k % 2;
      var ty = AX - r - 8 - row * 44 - (zone === 1 ? (k % 4 > 1 ? 88 : 0) : 0);
      var shape = k % 3 === 1 ? el('path', { d: fragD(r, rnd(k) * 6), fill: zone === 0 ? 'rgba(107,160,58,.7)' : 'rgba(79,195,217,.6)', stroke: zone === 0 ? P.green : P.teal, 'class': w(1) }, pg)
        : el('circle', { r: f2(r), fill: zone === 0 ? 'rgba(107,160,58,.7)' : zone === 1 ? 'rgba(79,195,217,.6)' : 'rgba(184,204,224,.35)', stroke: zone === 0 ? P.green : zone === 1 ? P.teal : P.line, 'class': w(1) }, pg);
      parts.push({ n: shape, tx: tx, ty: ty, sx: 120 + rnd(k * 3 + 9) * 960, sy: 60 + rnd(k * 5 + 3) * 220, at: 0.5 + rnd(k * 7 + 1) * 1.2, ph: rnd(k * 11) * 6.28 });
    }
    var brA = el('path', { d: 'M90 330V316H' + X10 + 'V330', fill: 'none', stroke: P.teal, 'class': w(3) }, L.mid);
    var brB = el('path', { d: 'M90 330V300H' + X25 + 'V330', fill: 'none', stroke: P.green, 'class': w(3) }, L.mid);

    var axL = el('g', {}, hud);
    txt(axL, X25, 752, '2.5 ㎛', 42, { anchor: 'middle', disp: true, fill: P.ink });
    txt(axL, X10, 752, '10 ㎛', 42, { anchor: 'middle', disp: true, fill: P.ink });
    txt(axL, 90, 820, '작은 입자', 36, { fill: P.mute, w: 600 });
    txt(axL, 1110, 820, '큰 입자', 36, { anchor: 'end', fill: P.mute, w: 600 });
    var n95 = BigNum(ctx, hud, 492, 212, 150, { fill: P.teal });
    var l95 = el('g', {}, hud);
    txt(l95, 500, 268, '10 ㎛보다 작음', 36, { fill: P.mute, w: 600 });
    var n40 = BigNum(ctx, hud, 82, 212, 150, { fill: P.green });
    var l40 = el('g', {}, hud);
    txt(l40, 90, 268, '2.5 ㎛보다 작음', 36, { fill: P.mute, w: 600 });

    return function (l, cam) {
      var q, e;
      dB(l);
      for (q = 0; q < streaks.length; q++) {
        var s = streaks[q], x = mod(s.ph + l * s.v, 1500) - 200;
        T(s.n, 'translate(' + f2(x) + ',' + f2(s.y) + ')');
        O(s.n, 0.25 * Math.sin(Math.PI * clamp((x + 200) / 1500, 0, 1)));
      }
      for (q = 0; q < parts.length; q++) {
        var p = parts[q];
        e = eio(seg(l, p.at, p.at + 1.0));
        var jx = Math.sin(l * 2 + p.ph) * 2 * e + Math.sin(l * 0.8 + p.ph) * 14 * (1 - e);
        T(p.n, 'translate(' + f2(lerp(p.sx, p.tx, e) + jx) + ',' + f2(lerp(p.sy, p.ty, e) + Math.cos(l * 1.7 + p.ph) * 2) + ')');
        O(p.n, seg(l, 0.1, 0.5));
      }
      O(axL, eo(seg(l, 0.3, 0.8)));
      var a = eo(seg(l, 2.0, 2.6)), b = eo(seg(l, 2.7, 3.3));
      O(zoneA, a); O(brA, a); O(g10, 0.5 + 0.5 * a);
      O(zoneB, b); O(brB, b); O(g25, 0.5 + 0.5 * b);
      n95.set(seg(l, 2.1, 2.6), Math.round(95 * eo(seg(l, 2.2, 3.1))) + '%');
      fade(l95, l, 2.6, 3.0, 10);
      n40.set(seg(l, 2.8, 3.3), Math.round(40 * eo(seg(l, 2.9, 3.8))) + '%');
      fade(l40, l, 3.3, 3.7, 10);
    };
  }

  /* =========================================================
     논문 0 — VOC 추적 (Atmospheric Environment 369, 121807)
     화면의 지도·막대는 개념도: 단지 모양·경로·농도·막대 높이는 실제 측정값이 아니다.
     강조색은 연두(+하늘색 조금). 주황은 고농도 표현에만. 경보색·사이렌·조준 그림 없음.
     ========================================================= */
  var V = { lime: '#A8D65C', sky: '#7DB8F0', hot: '#F2A33A', road: '#0C1D2F', roof: '#15304A', roofL: '#24435F' };
  var VG = { X0: -190, PX: 150, Y0: -160, PY: 128, RW: 26 };
  /* 추상 블록(위에서 본 지붕) — 세 장면이 같은 배치를 써서 전환이 끊기지 않는다 */
  var VBLK = (function () {
    var out = [], c, r, gap = 7;
    for (c = 0; c < 12; c++) for (r = 0; r < 11; r++) {
      var x = VG.X0 + c * VG.PX + VG.RW / 2, y = VG.Y0 + r * VG.PY + VG.RW / 2, w0 = VG.PX - VG.RW, h0 = VG.PY - VG.RW, s = rnd(c * 37 + r * 11 + 5);
      if (s < 0.28) out.push([x, y, w0, h0]);
      else if (s < 0.62) {
        var sw = Math.round(w0 * (0.38 + rnd(c + r * 3 + 1) * 0.24));
        out.push([x, y, sw - gap / 2, h0], [x + sw + gap / 2, y, w0 - sw - gap / 2, h0]);
      } else {
        var hw = (w0 - gap) / 2, hh = (h0 - gap) / 2;
        out.push([x, y, hw, hh], [x + hw + gap, y, hw, hh], [x, y + hh + gap, hw, hh], [x + hw + gap, y + hh + gap, hw, hh]);
      }
    }
    return out;
  })();
  /* 측정 차량 경로(도로 중심선 위) */
  var VROUTE = [[110, 864], [110, 480], [410, 480], [410, 352], [560, 352], [560, 96], [1010, 96], [1010, 352], [1160, 352], [1160, 736], [710, 736], [710, 608], [260, 608], [260, 864], [110, 864]];
  /* 개념상의 고농도 구간 세 곳(HA1–HA3) + 통계적으로 뭉치지 않는 약한 봉우리 하나 */
  var VHOT = [{ x: 410, y: 420, a: 0.86 }, { x: 790, y: 96, a: 0.86 }, { x: 960, y: 736, a: 0.86 }, { x: 470, y: 608, a: 0.3 }];
  function vConc(x, y) {
    var v = 0.16 + 0.06 * Math.sin(x * 0.021 + 1.3) + 0.05 * Math.cos(y * 0.017 + x * 0.004);
    for (var k = 0; k < VHOT.length; k++) {
      var dx = x - VHOT[k].x, dy = y - VHOT[k].y;
      v += VHOT[k].a * Math.exp(-(dx * dx + dy * dy) / 7200);
    }
    return v;
  }
  function vCol(v) { return v >= 0.6 ? V.hot : v >= 0.36 ? V.lime : V.sky; }
  var VSAMP = K.samplePoly(VROUTE, 600);
  var VDOTS = (function () {
    var s = K.samplePoly(VROUTE, 300), out = [];
    for (var k = 0; k < s.length - 1; k++) out.push({ x: s[k][0], y: s[k][1], v: vConc(s[k][0], s[k][1]), u: k / (s.length - 1) });
    return out;
  })();
  /* 격자 칸(도로 위에 중심) 집계 */
  var VCW = 75, VCH = 64;
  var VCELL = (function () {
    var map = {}, list = [], k;
    for (k = 0; k < VDOTS.length; k++) {
      var d = VDOTS[k], i = Math.floor((d.x - VG.X0 + VCW / 2) / VCW), j = Math.floor((d.y - VG.Y0 + VCH / 2) / VCH), key = i + ':' + j;
      if (!map[key]) { map[key] = { cx: VG.X0 + i * VCW, cy: VG.Y0 + j * VCH, s: 0, n: 0 }; list.push(map[key]); }
      map[key].s += d.v; map[key].n++;
      d.cell = map[key];
    }
    var groups = [[], [], []];
    for (k = 0; k < list.length; k++) {
      var c = list[k];
      c.v = c.s / c.n;
      c.grp = -1;
      if (c.v >= 0.55) {
        var best = 0, bd = 1e9;
        for (var q = 0; q < 3; q++) { var dd = Math.pow(c.cx - VHOT[q].x, 2) + Math.pow(c.cy - VHOT[q].y, 2); if (dd < bd) { bd = dd; best = q; } }
        c.grp = best; groups[best].push(c);
      }
    }
    var boxes = [];
    for (k = 0; k < 3; k++) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (q = 0; q < groups[k].length; q++) {
        var g = groups[k][q];
        x0 = Math.min(x0, g.cx - VCW / 2); x1 = Math.max(x1, g.cx + VCW / 2);
        y0 = Math.min(y0, g.cy - VCH / 2); y1 = Math.max(y1, g.cy + VCH / 2);
      }
      boxes.push({ x0: x0 - 8, y0: y0 - 8, x1: x1 + 8, y1: y1 + 8, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
    }
    return { list: list, boxes: boxes };
  })();

  /* 공용 바닥: 도로 + 지붕 */
  function vBase(L) {
    var g = el('g', {}, L.mid), c, r, d = '';
    el('rect', { x: -500, y: -500, width: W + 1000, height: H + 1000, fill: V.road }, g);
    for (c = 0; c <= 12; c++) d += 'M' + (VG.X0 + c * VG.PX) + ' -400V1400';
    for (r = 0; r <= 11; r++) d += 'M-400 ' + (VG.Y0 + r * VG.PY) + 'H1700';
    el('path', { d: d, fill: 'none', stroke: '#1C3753', 'class': w(1), 'stroke-dasharray': '10 14' }, g);
    for (var k = 0; k < VBLK.length; k++) {
      var b = VBLK[k];
      el('rect', { x: f2(b[0]), y: f2(b[1]), width: f2(b[2]), height: f2(b[3]), rx: 3, fill: V.roof, stroke: V.roofL, 'class': w(1) }, g);
      if (rnd(k * 5 + 2) > 0.7) el('rect', { x: f2(b[0] + b[2] * 0.2), y: f2(b[1] + b[3] * 0.25), width: f2(b[2] * 0.22), height: f2(b[3] * 0.3), fill: '#1B3A58' }, g);
    }
    return g;
  }
  /* 옅은 연기: 여러 지붕에서 피어올라 바람에 섞인다 */
  function vSmoke(parent, ctx, n, seed) {
    var fid = ctx.id('b');
    var fl = el('filter', { id: fid, x: '-80%', y: '-80%', width: '260%', height: '260%' }, ctx.defs);
    el('feGaussianBlur', { stdDeviation: 9 }, fl);
    var g = el('g', { filter: 'url(#' + fid + ')', fill: '#A9BCCF' }, parent), list = [];
    for (var k = 0; k < n; k++) {
      var b = VBLK[Math.floor(rnd(seed + k * 7) * VBLK.length)];
      var sx = 60 + rnd(seed + k * 3) * 1080, sy = 60 + rnd(seed + k * 9) * 780;
      if (b && b[0] > 0 && b[0] < W && b[1] > 0 && b[1] < H) { sx = b[0] + b[2] / 2; sy = b[1] + b[3] / 2; }
      for (var q = 0; q < 3; q++) list.push({ n: el('circle', { r: 10 }, g), x: sx, y: sy, ph: q / 3 + rnd(seed + k) * 0.3, sp: 0.16 + rnd(seed + k * 13) * 0.1 });
    }
    return function (l, amt) {
      O(g, amt);
      if (amt <= 0) return;
      for (var q = 0; q < list.length; q++) {
        var p = list[q], a = mod(l * p.sp + p.ph, 1);
        A(p.n, 'cx', p.x + a * 120); A(p.n, 'cy', p.y - a * 46 + Math.sin(a * 5 + q) * 6);
        A(p.n, 'r', 10 + a * 46);
        O(p.n, 0.26 * Math.sin(Math.PI * a));
      }
    };
  }
  function vDots(parent, r) {
    var g = el('g', {}, parent), list = [];
    for (var k = 0; k < VDOTS.length; k++) list.push(el('circle', { cx: f2(VDOTS[k].x), cy: f2(VDOTS[k].y), r: r, fill: vCol(VDOTS[k].v) }, g));
    return { g: g, list: list };
  }
  function scrimTL(ctx, hud, r) {
    var id = ctx.id('sc'), rg2 = el('radialGradient', { id: id, cx: 0.08, cy: 0.06, r: 0.75 }, ctx.defs);
    el('stop', { offset: 0, 'stop-color': '#0B1A2B', 'stop-opacity': 0.92 }, rg2);
    el('stop', { offset: 0.6, 'stop-color': '#0B1A2B', 'stop-opacity': 0.7 }, rg2);
    el('stop', { offset: 1, 'stop-color': '#0B1A2B', 'stop-opacity': 0 }, rg2);
    return el('rect', { x: 0, y: 0, width: r[0], height: r[1], fill: 'url(#' + id + ')' }, hud);
  }

  /* 1. 넓고 촘촘한 산업단지 */
  function vcPark(L, hud, ctx) {
    vBase(L);
    var smoke = vSmoke(L.front, ctx, 18, 3);
    var sid = ctx.id('s'), lg = el('linearGradient', { id: sid, x1: 0, y1: 0, x2: 0, y2: 1 }, ctx.defs);
    el('stop', { offset: 0, 'stop-color': '#0B1A2B', 'stop-opacity': 0 }, lg);
    el('stop', { offset: 0.5, 'stop-color': '#0B1A2B', 'stop-opacity': 0.84 }, lg);
    el('stop', { offset: 1, 'stop-color': '#0B1A2B', 'stop-opacity': 0.96 }, lg);
    var scrim = el('rect', { x: 0, y: 470, width: W, height: 430, fill: 'url(#' + sid + ')' }, hud);
    var num = BigNum(ctx, hud, 52, 752, 200, { fill: V.lime });
    var lab = el('g', {}, hud);
    txt(lab, 62, 856, '중소 제조시설 (약)', 46, { w: 700 });
    var area = el('g', {}, hud);
    el('rect', { x: 846, y: 784, width: 300, height: 86, rx: 43, fill: 'rgba(8,21,34,.86)', stroke: V.sky, 'stroke-width': 2 }, area);
    txt(area, 996, 844, '15.4 km²', 48, { anchor: 'middle', disp: true, fill: V.sky, w: 600 });
    return function (l) {
      smoke(l, 0.4 + 0.6 * seg(l, 0, 1.2));
      O(scrim, eo(seg(l, 0.6, 1.2)));
      num.set(seg(l, 1.0, 1.5), comma(Math.round(9000 * eo(seg(l, 1.1, 2.5)) / 100) * 100));
      fade(lab, l, 1.6, 2.1, 14);
      fade(area, l, 2.6, 3.1, -12);
    };
  }

  /* 2. 달리며 넓게 잰다 */
  function vcDrive(L, hud, ctx) {
    vBase(L);
    var smoke = vSmoke(L.front, ctx, 18, 3);
    var dd = '';
    for (var k = 0; k < VROUTE.length; k++) dd += (k ? 'L' : 'M') + VROUTE[k][0] + ' ' + VROUTE[k][1];
    el('path', { d: dd, fill: 'none', stroke: V.lime, opacity: 0.16, 'class': w(2), 'stroke-linejoin': 'round' }, L.mid);
    var trail = el('path', { d: dd, fill: 'none', stroke: V.lime, opacity: 0.5, 'class': w(3), 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, L.mid);
    var dots = vDots(L.mid, 5.5);
    /* 측정 차량(위에서 본 모습) */
    var car = el('g', {}, L.mid);
    var ring = el('circle', { r: 20, fill: 'none', stroke: V.lime, 'class': w(2) }, car);
    var body = el('g', {}, car);
    el('rect', { x: -24, y: -13, width: 48, height: 26, rx: 7, fill: '#E6F2D4', stroke: '#0B1A2B', 'class': w(2) }, body);
    el('rect', { x: 6, y: -10, width: 13, height: 20, rx: 3, fill: '#2B4866' }, body);
    el('rect', { x: -16, y: -6, width: 16, height: 12, rx: 2, fill: V.lime }, body);
    el('circle', { cx: -8, cy: 0, r: 3, fill: '#0B1A2B' }, body);

    var scr0 = scrimTL(ctx, hud, [700, 420]);
    var num = BigNum(ctx, hud, 52, 190, 160, { fill: V.lime });
    var sub = el('g', {}, hud);
    txt(sub, 62, 284, '4초 간격', 42, { w: 700, fill: P.ink });
    /* 계기판: 스펙트럼 봉우리 */
    var pan = el('g', {}, hud);
    el('rect', { x: 330, y: 764, width: 360, height: 120, rx: 18, fill: 'rgba(8,21,34,.9)', stroke: '#2B4866', 'stroke-width': 2 }, pan);
    txt(pan, 352, 806, 'SIFT-MS', 34, { disp: true, fill: P.mute, w: 600 });
    var bars = [], NB = 22, pk = [0.18, 0.41, 0.63, 0.86];
    for (k = 0; k < NB; k++) {
      var base = 0.12;
      for (var q = 0; q < pk.length; q++) base += Math.exp(-Math.pow((k / (NB - 1) - pk[q]) / 0.05, 2)) * (0.55 + 0.35 * rnd(q + 3));
      bars.push({ n: el('rect', { x: 352 + k * 14.6, width: 9, rx: 2, fill: V.lime }, pan), b: Math.min(base, 1), ph: rnd(k * 7) * 6.28 });
    }
    return function (l) {
      var q2, p = eio(seg(l, 0.5, 4.8));
      smoke(l, 0.6 - 0.35 * seg(l, 0, 3));
      A(trail, 'stroke-dashoffset', f2(1 - p));
      for (q2 = 0; q2 < dots.list.length; q2++) {
        var dt = VDOTS[q2], on = dt.u <= p;
        O(dots.list[q2], on ? 0.95 : 0);
        if (on) A(dots.list[q2], 'r', 5.5 + 4 * clamp(1 - (p - dt.u) * 30, 0, 1));
      }
      var cp = K.polyAt(VSAMP, p);
      T(car, 'translate(' + f2(cp[0]) + ',' + f2(cp[1]) + ')');
      T(body, 'rotate(' + f2(cp[2] * 180 / Math.PI) + ')');
      O(car, seg(l, 0.1, 0.5));
      var a = mod(l * 1.25, 1);
      A(ring, 'r', 18 + 30 * a); O(ring, (1 - a) * 0.8 * (p < 1 ? 1 : 0));
      var vNow = vConc(cp[0], cp[1]);
      O(scr0, eo(seg(l, 0.3, 0.8)));
      num.set(seg(l, 0.4, 0.9), Math.round(80 * p) + ' km');
      fade(sub, l, 1.0, 1.5, 12);
      O(pan, eo(seg(l, 0.6, 1.1)));
      for (q2 = 0; q2 < bars.length; q2++) {
        var bb = bars[q2], hgt = 4 + 54 * bb.b * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(l * 7 + bb.ph))) * (0.7 + 0.5 * clamp(vNow, 0, 1));
        A(bb.n, 'y', 870 - hgt); A(bb.n, 'height', hgt);
        A(bb.n, 'fill', bb.b > 0.6 && vNow >= 0.6 ? V.hot : V.lime);
      }
    };
  }

  /* 3. 통계로 고농도 지역을 찾는다 */
  function vcHot(L, hud, ctx) {
    vBase(L);
    var k, q;
    var dd = '';
    for (k = 0; k < VROUTE.length; k++) dd += (k ? 'L' : 'M') + VROUTE[k][0] + ' ' + VROUTE[k][1];
    var line = el('path', { d: dd, fill: 'none', stroke: V.lime, opacity: 0.5, 'class': w(3), 'stroke-linejoin': 'round' }, L.mid);
    var cg = el('g', {}, L.mid), cells = [];
    for (k = 0; k < VCELL.list.length; k++) {
      var c = VCELL.list[k];
      cells.push({ c: c, n: el('rect', { x: f2(c.cx - VCW / 2 + 3), y: f2(c.cy - VCH / 2 + 3), width: VCW - 6, height: VCH - 6, rx: 5, fill: c.v >= 0.36 ? 'rgba(168,214,92,.3)' : 'rgba(125,184,240,.18)', stroke: c.v >= 0.36 ? V.lime : V.sky, 'class': w(1) }, cg), at: 1.1 + rnd(k * 3) * 0.5 });
    }
    var dots = vDots(L.mid, 5.5);
    var outs = [];
    for (k = 0; k < 3; k++) {
      var b = VCELL.boxes[k];
      outs.push(el('rect', { x: f2(b.x0), y: f2(b.y0), width: f2(b.x1 - b.x0), height: f2(b.y1 - b.y0), rx: 10, fill: 'none', stroke: '#FFFFFF', 'class': w(3), pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, L.mid));
    }
    var scr0 = scrimTL(ctx, hud, [640, 320]);
    var tag = el('g', {}, hud);
    txt(tag, 62, 108, 'Getis-Ord Gi*', 44, { disp: true, fill: P.ink, w: 600 });
    /* 표지 자리: [정렬, x 보정, y 보정, 기준(가운데 아래 b / 가운데 위 t / 왼쪽 l)] */
    var labs = [], LP = [['end', -18, 18, 'l'], ['middle', 0, 66, 'b'], ['middle', 0, -22, 't']];
    for (k = 0; k < 3; k++) {
      var lg2 = el('g', {}, hud);
      var t2 = txt(lg2, 0, 0, 'HA' + (k + 1), 56, { disp: true, anchor: LP[k][0], fill: '#FFFFFF', w: 700 });
      t2.setAttribute('stroke', '#0B1A2B'); t2.setAttribute('stroke-width', 12); t2.setAttribute('paint-order', 'stroke'); t2.setAttribute('stroke-linejoin', 'round');
      labs.push({ g: lg2, t: t2 });
    }
    var conf = el('g', {}, hud);
    el('rect', { x: 352, y: 786, width: 316, height: 80, rx: 40, fill: 'rgba(8,21,34,.9)', stroke: V.lime, 'stroke-width': 2 }, conf);
    txt(conf, 510, 840, '95% 신뢰수준', 40, { anchor: 'middle', w: 700 });

    return function (l, cam, d) {
      var gather = eio(seg(l, 0.7, 1.6));
      for (q = 0; q < dots.list.length; q++) {
        var dt = VDOTS[q];
        A(dots.list[q], 'cx', f2(lerp(dt.x, dt.cell.cx, gather)));
        A(dots.list[q], 'cy', f2(lerp(dt.y, dt.cell.cy, gather)));
        A(dots.list[q], 'r', lerp(5.5, 2.5, gather));
        O(dots.list[q], 0.95 - 0.8 * seg(l, 1.3, 1.9));
      }
      O(line, 0.5 * (1 - seg(l, 0.6, 1.4)));
      for (q = 0; q < cells.length; q++) {
        var ce = cells[q], g2 = ce.c.grp, lit = g2 >= 0 ? eo(seg(l, 2.1 + g2 * 0.35, 2.4 + g2 * 0.35)) : 0;
        O(ce.n, seg(l, ce.at, ce.at + 0.4) * (g2 >= 0 ? 1 : 1 - 0.45 * seg(l, 2.0, 2.6)));
        if (g2 >= 0) {
          A(ce.n, 'fill', lit > 0 ? 'rgba(242,163,58,' + f2(0.25 + 0.45 * lit) + ')' : 'rgba(168,214,92,.3)');
          A(ce.n, 'stroke', lit > 0.4 ? V.hot : V.lime);
        }
      }
      var hideE = 1 - seg(l, d - 0.9, d - 0.6);
      for (q = 0; q < 3; q++) {
        var st = 2.1 + q * 0.35;
        A(outs[q], 'stroke-dashoffset', f2(1 - eo(seg(l, st, st + 0.45))));
        O(outs[q], seg(l, st, st + 0.1));
        var b2 = VCELL.boxes[q], md = LP[q][3], ax = md === 'l' ? b2.x0 : b2.cx, ay = md === 'b' ? b2.y1 : md === 't' ? b2.y0 : b2.cy;
        var sp = scr(cam, ax, ay);
        A(labs[q].t, 'x', f2(sp[0] + LP[q][1])); A(labs[q].t, 'y', f2(sp[1] + LP[q][2]));
        var e = eo(seg(l, st + 0.15, st + 0.5));
        O(labs[q].g, e * hideE);
      }
      O(scr0, eo(seg(l, 0.2, 0.7)) * hideE);
      fade(tag, l, 0.3, 0.8, 12); O(tag, eo(seg(l, 0.3, 0.8)) * hideE);
      fade(conf, l, 3.3, 3.8, 14); O(conf, eo(seg(l, 3.3, 3.8)) * hideE);
    };
  }

  /* 4. 드론으로 위에서 확인한다 (옆에서 본 모습) */
  var VD = { gy: 740, px: 20, tx: 650, ty: 250, roofY: 520 };
  function vcDrone(L, hud, ctx) {
    var k, GY = VD.gy;
    /* 먼 공장 실루엣 */
    for (k = 0; k < 9; k++) {
      var fg = K.factory(L.back, '#10253B', '#1A3550', 2);
      T(fg, 'translate(' + (-60 + k * 160 + rnd(k) * 40) + ',' + (GY - 30) + ') scale(' + f2(1.3 + rnd(k * 3) * 0.5) + ')');
    }
    el('rect', { x: -400, y: GY, width: W + 800, height: 500, fill: '#0A1726' }, L.mid);
    el('line', { x1: -400, y1: GY, x2: W + 400, y2: GY, stroke: '#2B4866', 'class': w(2) }, L.mid);
    /* 고도 눈금 */
    var rul = el('g', {}, L.mid);
    el('line', { x1: 70, y1: GY, x2: 70, y2: GY - 32 * VD.px, stroke: P.dim, 'class': w(2) }, rul);
    for (k = 0; k <= 30; k += 5) el('line', { x1: 70, y1: GY - k * VD.px, x2: k % 10 ? 82 : 90, y2: GY - k * VD.px, stroke: P.dim, 'class': w(2) }, rul);
    var band = el('rect', { x: 58, y: GY - 30 * VD.px, width: 44, height: 10 * VD.px, rx: 6, fill: 'rgba(168,214,92,.22)', stroke: V.lime, 'class': w(2) }, L.mid);
    /* 건물 */
    var bl = [[-140, 180, 150], [210, 480, 185], [530, 780, 220], [820, 950, 120]];
    for (k = 0; k < bl.length; k++) {
      var bx = bl[k];
      el('rect', { x: bx[0], y: GY - bx[2], width: bx[1] - bx[0], height: bx[2], fill: '#132B43', stroke: '#2B4866', 'class': w(2) }, L.mid);
      for (var q = 0; q < 3; q++) el('rect', { x: f2(bx[0] + 30 + q * (bx[1] - bx[0] - 70) / 2), y: GY - bx[2] - 14, width: 22, height: 14, fill: '#1B3A58', stroke: '#2B4866', 'class': w(1) }, L.mid);
    }
    /* 고농도 지점에서 오르는 옅은 기체(주황), 다른 지붕은 회색 */
    var puffs = [], pg = el('g', {}, L.mid);
    for (k = 0; k < 14; k++) {
      var hotP = k < 8;
      puffs.push({ n: el('circle', { r: 8, fill: hotP ? V.hot : '#8EA2B7' }, pg), x: hotP ? 700 : [300, 120, 880][k % 3], y: hotP ? GY - 234 : [GY - 199, GY - 164, GY - 134][k % 3], ph: rnd(k * 5) , hot: hotP });
    }
    /* 지상 측정 차량(정차) */
    var van = el('g', {}, L.mid);
    el('rect', { x: 1010, y: GY - 64, width: 150, height: 46, rx: 9, fill: '#183650', stroke: V.lime, 'class': w(2) }, van);
    el('rect', { x: 1124, y: GY - 58, width: 28, height: 20, rx: 4, fill: '#2B4866' }, van);
    el('circle', { cx: 1042, cy: GY - 14, r: 13, fill: '#0B1A2B', stroke: '#56718D', 'class': w(2) }, van);
    el('circle', { cx: 1130, cy: GY - 14, r: 13, fill: '#0B1A2B', stroke: '#56718D', 'class': w(2) }, van);
    el('line', { x1: 1048, y1: GY - 64, x2: 1048, y2: GY - 122, stroke: P.line, 'class': w(2) }, van);
    el('circle', { cx: 1048, cy: GY - 126, r: 6, fill: V.lime }, van);
    var vring = el('circle', { cx: 1048, cy: GY - 126, r: 10, fill: 'none', stroke: V.lime, 'class': w(2) }, van);
    /* 훑어보는 빛 */
    var cone = el('path', { fill: V.lime, opacity: 0 }, L.mid);
    /* 드론 */
    var dr = el('g', {}, L.mid), drIn = el('g', {}, dr);
    var rod = el('line', { x1: 0, y1: 14, x2: 0, y2: 14, stroke: P.line, 'class': w(3), 'stroke-linecap': 'round' }, drIn);
    var bag = el('ellipse', { cx: 0, cy: 0, rx: 0, ry: 0, fill: 'rgba(168,214,92,.3)', stroke: V.lime, 'class': w(2) }, drIn);
    el('line', { x1: -44, y1: -8, x2: 44, y2: -8, stroke: P.line, 'class': w(3), 'stroke-linecap': 'round' }, drIn);
    el('line', { x1: -40, y1: -8, x2: -40, y2: -16, stroke: P.line, 'class': w(3) }, drIn);
    el('line', { x1: 40, y1: -8, x2: 40, y2: -16, stroke: P.line, 'class': w(3) }, drIn);
    el('rect', { x: -30, y: -10, width: 60, height: 22, rx: 8, fill: '#DCE7F2' }, drIn);
    el('rect', { x: -9, y: 8, width: 18, height: 9, rx: 3, fill: V.lime }, drIn);
    var rot = [el('ellipse', { cx: -40, cy: -18, rx: 26, ry: 3.2, fill: 'rgba(220,231,242,.75)' }, drIn), el('ellipse', { cx: 40, cy: -18, rx: 26, ry: 3.2, fill: 'rgba(220,231,242,.75)' }, drIn)];

    var alt = el('g', {}, hud);
    var altT = txt(alt, 0, 0, '20–30 m', 48, { disp: true, fill: V.lime, w: 700 });
    var bagL = el('g', {}, hud);
    var lead = el('polyline', { fill: 'none', stroke: V.lime, 'stroke-width': 2 }, bagL);
    var bagT = txt(bagL, 0, 0, '시료 채취 백', 40, { w: 700 });

    function dpos(l) {
      var e1 = eio(seg(l, 0.6, 1.7)), e2 = eio(seg(l, 1.8, 3.0));
      var x = lerp(1100, VD.tx, e2), y = lerp(GY - 80, VD.ty, e1);
      return [x, y, e2 > 0 && e2 < 1 ? (seg(l, 1.8, 2.4) - seg(l, 2.4, 3.0)) : 0];
    }
    return function (l, cam) {
      var q2, a;
      var p = dpos(l), bob = Math.sin(l * 2.3) * 3 * seg(l, 0.6, 1.0);
      var dx = p[0], dy = p[1] + bob;
      T(dr, 'translate(' + f2(dx) + ',' + f2(dy) + ')');
      T(drIn, 'rotate(' + f2(-7 * p[2] + Math.sin(l * 1.7) * 1.2) + ')');
      for (q2 = 0; q2 < 2; q2++) A(rot[q2], 'rx', f2(4 + 24 * Math.abs(Math.cos(l * 38 + q2 * 1.3))));
      var rl = 78 * eo(seg(l, 3.0, 3.4));
      A(rod, 'y2', f2(14 + rl));
      var bi = eo(seg(l, 3.4, 4.6)), bry = lerp(6, 30, bi);
      A(bag, 'cy', f2(14 + rl + bry)); A(bag, 'rx', f2(lerp(4, 22, bi) * (1 + 0.03 * Math.sin(l * 4)))); A(bag, 'ry', f2(bry));
      O(bag, seg(l, 3.35, 3.5));
      /* 훑는 빛: 건물 지붕까지 */
      var over = dx > 560 && dx < 760, sc = seg(l, 1.7, 1.9) * (1 - seg(l, 3.0, 3.3));
      A(cone, 'd', 'M' + f2(dx - 8) + ' ' + f2(dy + 16) + 'L' + f2(dx - 64) + ' ' + VD.roofY + 'L' + f2(dx + 64) + ' ' + VD.roofY + 'L' + f2(dx + 8) + ' ' + f2(dy + 16) + 'Z');
      A(cone, 'fill', over ? V.hot : V.lime);
      O(cone, sc * (over ? 0.2 : 0.12));
      for (q2 = 0; q2 < puffs.length; q2++) {
        var pf = puffs[q2]; a = mod(l * (pf.hot ? 0.32 : 0.22) + pf.ph, 1);
        A(pf.n, 'cx', f2(pf.x + a * 70 + Math.sin(a * 6 + q2) * 6)); A(pf.n, 'cy', f2(pf.y - a * 150));
        A(pf.n, 'r', f2(7 + a * 26)); O(pf.n, (pf.hot ? 0.3 : 0.14) * Math.sin(Math.PI * a));
      }
      a = mod(l * 0.9, 1);
      A(vring, 'r', 8 + 22 * a); O(vring, 1 - a);
      O(band, eo(seg(l, 0.9, 1.4)));
      var sp = scr(cam, 112, VD.gy - 25 * VD.px);
      A(altT, 'x', f2(sp[0])); A(altT, 'y', f2(sp[1] + 17));
      O(alt, eo(seg(l, 1.0, 1.5)));
      var bp = scr(cam, dx + 24, dy + 14 + rl + bry);
      A(bagT, 'x', 852); A(bagT, 'y', 470);
      A(lead, 'points', f2(bp[0]) + ',' + f2(bp[1]) + ' ' + f2(lerp(bp[0], 838, eo(seg(l, 3.9, 4.3)))) + ',' + f2(lerp(bp[1], 456, eo(seg(l, 3.9, 4.3)))));
      O(bagL, eo(seg(l, 3.9, 4.3)));
    };
  }

  /* 5. 서로 다른 화학 조성 — 개념도: 수치·축 눈금 없음 */
  var VPROF = [
    { t: 'HA1', dom: ['톨루엔 · ', '자일렌+에틸벤젠'], near: '화학제품 제조시설 인근', h: [1.0, 0.78, 0.2, 0.14, 0.22, 0.16], hi: [0, 1] },
    { t: 'HA2', dom: ['메틸에틸케톤(MEK) · ', '톨루엔'], near: '페인트 제조시설 인근', h: [0.74, 0.18, 1.0, 0.16, 0.2, 0.24], hi: [2, 0] },
    { t: 'HA3', dom: ['톨루엔 · 아크롤레인'], near: '도장시설 인근', h: [1.0, 0.2, 0.16, 0.7, 0.22, 0.18], hi: [0, 3] }
  ];
  function vcProfile(L, hud, ctx) {
    var k, q, base = 640, MAXH = 262, BW = 34, GAP = 16;
    var dB = dust(L.back, 30, 511, { a: 0.3 });
    var cols = [];
    for (k = 0; k < 3; k++) {
      var pr = VPROF[k], cx = 200 + k * 400, x0 = cx - (6 * BW + 5 * GAP) / 2;
      if (k) el('line', { x1: cx - 200, y1: 120, x2: cx - 200, y2: 740, stroke: '#1E3A57', 'class': w(2) }, L.mid);
      el('line', { x1: x0 - 14, y1: base, x2: x0 + 6 * BW + 5 * GAP + 14, y2: base, stroke: P.dim, 'class': w(2) }, L.mid);
      var gb = [], db = [];
      for (q = 0; q < 6; q++) {
        var isHi = pr.hi.indexOf(q) >= 0, bx = x0 + q * (BW + GAP);
        gb.push(el('rect', { x: bx, width: BW, y: base, height: 0, rx: 3, fill: isHi ? V.lime : '#4A6582' }, L.mid));
        db.push(el('rect', { x: bx + 8, width: BW, y: base, height: 0, rx: 3, fill: 'none', stroke: V.sky, 'class': w(3), 'stroke-dasharray': '7 5' }, L.mid));
      }
      var glow = el('rect', { x: x0 - 18, y: base - MAXH - 24, width: 6 * BW + 5 * GAP + 44, height: MAXH + 40, rx: 14, fill: 'none', stroke: V.lime, 'class': w(2) }, L.mid);
      var head = el('g', {}, hud);
      txt(head, cx, 172, pr.t, 60, { disp: true, anchor: 'middle', fill: '#FFFFFF', w: 700 });
      var dom = el('g', {}, hud);
      var dt = txt(dom, cx, 234, '', 36, { anchor: 'middle', fill: V.lime, w: 700 });
      for (q = 0; q < pr.dom.length; q++) {
        var ts = el('tspan', { x: cx, dy: q ? 44 : 0 }, dt);
        ts.textContent = pr.dom[q];
      }
      var near = el('g', {}, hud);
      txt(near, cx, 704, pr.near, 36, { anchor: 'middle', fill: P.mute, w: 600 });
      cols.push({ gb: gb, db: db, h: pr.h, glow: glow, head: head, dom: dom, near: near, d: k * 0.3 });
    }
    var leg = el('g', {}, hud);
    el('rect', { x: 392, y: 806, width: 34, height: 34, rx: 4, fill: V.lime }, leg);
    txt(leg, 440, 836, '지상', 38, { w: 700 });
    el('rect', { x: 620, y: 806, width: 34, height: 34, rx: 4, fill: 'none', stroke: V.sky, 'stroke-width': 3, 'stroke-dasharray': '7 5' }, leg);
    txt(leg, 668, 836, '드론', 38, { w: 700 });

    return function (l) {
      dB(l);
      for (k = 0; k < cols.length; k++) {
        var c = cols[k], d = c.d;
        fade(c.head, l, 0.3 + d, 0.8 + d, 12);
        for (q = 0; q < 6; q++) {
          var hg = MAXH * c.h[q] * eo(seg(l, 0.6 + d + q * 0.05, 1.4 + d + q * 0.05));
          A(c.gb[q], 'y', base - hg); A(c.gb[q], 'height', hg);
          var hd = MAXH * c.h[q] * eo(seg(l, 1.6 + d + q * 0.05, 2.3 + d + q * 0.05));
          A(c.db[q], 'y', base - hd); A(c.db[q], 'height', hd);
          O(c.db[q], seg(l, 1.6 + d, 1.8 + d));
        }
        fade(c.dom, l, 1.3 + d, 1.8 + d, 10);
        var m = seg(l, 2.3 + d, 2.9 + d);
        O(c.glow, m > 0 ? 0.15 + 0.6 * Math.sin(Math.PI * Math.min(m * 1.4, 1)) * (m < 1 ? 1 : 0) + (m >= 1 ? 0.15 : 0) : 0);
        fade(c.near, l, 2.7 + d, 3.2 + d, 10);
      }
      fade(leg, l, 1.5, 2.0, 10);
    };
  }

  /* ---------- 카메라 ---------- */
  /* 기본: 한 점을 두고 천천히 밀어 들어간다 */
  function push(fx, fy, s0, s1) {
    return function (l, d) {
      var p = eio(seg(l, 0, d));
      return { fx: fx, fy: fy, sx: fx, sy: fy, s: lerp(s0, s1, p) };
    };
  }
  /* 끝에서 한 점으로 확대해 들어감 (다음 장면과 매치컷) */
  function zoomOut(base, px, py, sEnd) {
    return function (l, d) {
      var c = base(l, d), e = eio(seg(l, d - 0.85, d - 0.1));
      if (e <= 0) return c;
      return { fx: lerp(c.fx, px, e), fy: lerp(c.fy, py, e), sx: lerp(c.sx, CX, e), sy: lerp(c.sy, CY, e), s: c.s * Math.pow(sEnd / c.s, e) };
    };
  }
  /* 시작에서 한 점 확대 상태로부터 빠져나옴 */
  function zoomIn(base, px, py, sStart, dur) {
    return function (l, d) {
      var c = base(l, d), e = eio(seg(l, 0.12, dur || 1.4));
      if (e >= 1) return c;
      return { fx: lerp(px, c.fx, e), fy: lerp(py, c.fy, e), sx: lerp(CX, c.sx, e), sy: lerp(CY, c.sy, e), s: sStart * Math.pow(c.s / sStart, e) };
    };
  }

  var bcFocus = { x: BC2.x0 + BC2.fc * BC2.p, y: BC2.y0 + BC2.fr * BC2.p };
  var vHA2 = VCELL.boxes[1];
  /* sfx: [장면 안 시각(초), 효과음, 인자] — 장면 시작 전(음수)은 전환 소리 */
  var PAPERS = [
    {
      key: 'voc', name: 'VOC 추적', accent: V.lime, oa: false,
      journal: 'Atmospheric Environment', year: '2026', cite: 'Atmospheric Environment 369, 121807 (2026)',
      title: 'Advancing VOC management: A mobile and drone-based approach for industrial emission monitoring',
      sum: '측정 차량과 드론을 단계적으로 결합해 산업단지의 VOC 배출원을 구분한 연구',
      authors: '<em>Cheonwoong Kang</em>, Hyunjun Shin, Hyunjeong Seo, <em>Hanjin Yoo</em>, <em>Ki-Joon Jeon</em>',
      auNote: 'Kang, Shin 공동 제1저자 · Jeon 교신저자',
      note: '화면의 지도·막대는 이해를 돕기 위한 개념도이며, 실제 측정값은 논문 원문에 있습니다.',
      doi: 'https://doi.org/10.1016/j.atmosenv.2026.121807',
      scenes: [
        { title: '넓고 촘촘한 산업단지', cap: '안산의 B 국가산업단지. 15.4 km²에 중소 제조시설 약 9,000곳이 모여 있어,\n휘발성유기화합물(VOC)이 어디서 나오는지 가려내기 어렵습니다.', dur: 5.0, inT: 'fade', build: vcPark,
          cam: push(600, 450, 2.3, 1.0), sfx: [[-0.35, 'whoosh'], [1.1, 'count', 1.4], [2.65, 'ping', 5]] },
        { title: '달리며 넓게 잰다', cap: '선택이온유동관 질량분석기(SIFT-MS)를 실은 측정 차량이\n약 80 km 경로를 달리며 4초마다 공기를 분석했습니다.', dur: 5.6, inT: 'fade', build: vcDrive,
          cam: push(600, 450, 1.0, 1.03), sfx: [[-0.35, 'whoosh'], [0.55, 'count', 4.25], [1.05, 'ping', 0]] },
        { title: '통계로 고농도 지역을 찾는다', cap: '공간 통계(Getis-Ord Gi*)로 농도가 높은 구간이 뭉친 곳을 찾아,\n우선 조사 지역 세 곳을 정했습니다.', dur: 5.4, inT: 'fade', build: vcHot,
          cam: zoomOut(push(600, 450, 1.0, 1.03), vHA2.cx, vHA2.cy, 2.4), sfx: [[-0.35, 'whoosh'], [2.15, 'ping', 0], [2.5, 'ping', 3], [2.85, 'ping', 7], [3.35, 'ping', 12]] },
        { title: '드론으로 위에서 확인한다', cap: '드론이 세 지역 상공 20~30 m에서 총휘발성유기화합물(TVOC)이 높은 지점을 찾아\n공기 시료를 채취하고, 같은 SIFT-MS로 분석했습니다.', dur: 5.6, inT: 'match', build: vcDrone,
          cam: zoomIn(push(620, 450, 1.0, 1.04), 655, VD.roofY, 2.2, 1.5), sfx: [[0, 'boom'], [1.05, 'ping', 0], [3.0, 'ping', 5], [3.95, 'ping', 7]] },
        { title: '서로 다른 화학 조성', cap: '지상과 상공에서 같은 화학 조성이 확인됐고,\n인접한 세 지점은 서로 다른 조성으로 구분됐습니다.', dur: 5.2, inT: 'wipe', build: vcProfile,
          cam: push(600, 450, 1.0, 1.03), sfx: [[-0.5, 'whoosh'], [2.35, 'ping', 0], [2.65, 'ping', 3], [2.95, 'ping', 7]] }
      ]
    },
    {
      key: 'bc', name: '블랙카본', accent: P.ember, oa: true,
      journal: 'Nature Communications', year: '2025', cite: 'Nature Communications 16, 10187 (2025)',
      title: 'Locating the missing absorption enhancement due to multi-core black carbon aerosols',
      sum: '블랙카본 입자 속 ‘여러 개의 핵’이 빛을 더 많이 흡수한다는 것을 밝힌 연구',
      authors: 'Xiyao Chen, Joseph Ching, Feng Wu, Hitoshi Matsui, Mark Z. Jacobson, Fan Zhang, Yuanyuan Wang, Zexuan Zhang, Dantong Liu, Shupeng Zhu, Yinon Rudich, Zongbo Shi, <em>Hanjin Yoo</em>, <em>Ki-Joon Jeon</em>, Weijun Li',
      doi: 'https://doi.org/10.1038/s41467-025-65079-2',
      scenes: [
        { title: '모델의 가정', cap: '기후 모델은 블랙카본 입자 하나에\n핵이 하나라고 가정해 왔습니다.', dur: 5.0, inT: 'fade', build: bcModel,
          cam: zoomOut(push(BC1.x, BC1.y, 1.0, 1.05), BC1.x, BC1.y, MATCH_R / BC1.R), sfx: [[-0.35, 'whoosh'], [1.85, 'ping', 0]] },
        { title: '21%', cap: '산불 연기를 들여다보니,\n블랙카본 입자의 21%에는 핵이 여러 개 있었습니다.', dur: 5.2, inT: 'match', build: bcShare,
          cam: zoomIn(push(860, 450, 1.0, 1.04), bcFocus.x, bcFocus.y, MATCH_R / BC2.r, 1.5), sfx: [[0, 'boom'], [1.7, 'count', 1.8], [2.15, 'ping', 5]] },
        { title: '1.81배', cap: '핵이 여러 개인 큰 입자는 핵 하나로 계산했을 때보다\n빛을 1.81배 흡수합니다.', dur: 5.6, inT: 'wipe', build: bcRatio,
          cam: zoomOut(push(600, 420, 1.0, 1.04), BC3.rx, BC3.y, 280 / BC3.R), sfx: [[-0.5, 'whoosh'], [2.2, 'count', 1.2], [2.85, 'ping', 5]] },
        { title: '+19%', cap: '이 효과를 전 지구 모델에 넣으면 에어로졸의 빛 흡수가 19% 늘어납니다.\n산불 영향 지역에서 특히 큽니다.', dur: 5.4, inT: 'match', build: bcGlobe,
          cam: zoomIn(push(BC4.x, BC4.y, 1.0, 1.04), BC4.x, BC4.y, 280 / BC4.R, 1.6), sfx: [[0, 'boom'], [2.0, 'count', 1.4], [2.65, 'ping', 5]] }
      ]
    },
    {
      key: 'amp', name: '미세플라스틱', accent: P.teal, oa: true,
      journal: 'Environment International', year: '2026', cite: 'Environment International 212, 110288 (2026)',
      title: 'Inhalable airborne microplastics in urban air: single-particle evidence of diurnal variability and physicochemical characteristics',
      sum: '도시 공기 속 숨으로 들어오는 미세플라스틱을 입자 하나씩 분석한 연구',
      authors: '<em>Hanjin Yoo</em>, Haeju Lee, <em>Jonghyeon Park</em>, <em>Yen Thi-Hoang Le</em>, <em>Cheonwoong Kang</em>, Young-Chul Song, Chul-Un Ro, Liang Xu, Weijun Li, <em>Ki-Joon Jeon</em>',
      doi: 'https://doi.org/10.1016/j.envint.2026.110288',
      scenes: [
        { title: '숨 쉬는 공기 속', cap: '도시 공기 속 미세먼지(PM10)에는 플라스틱 조각도 섞여 있습니다.\n얼마나, 어떤 모습일까요.', dur: 5.0, inT: 'fade', build: amAir,
          cam: zoomOut(push(600, 420, 1.0, 1.05), AM1.x, AM1.y, MATCH_R / AM1.s), sfx: [[-0.35, 'whoosh'], [0.85, 'ping', 0], [2.45, 'ping', 5]] },
        { title: '입자 하나씩', cap: '형광 현미경, 라만 분광, 전자현미경을 묶어\n입자 하나하나를 확인했습니다.', dur: 5.6, inT: 'match', build: amLens,
          cam: zoomIn(push(AM2.x, AM2.y, 1.0, 1.04), AM2.x, AM2.y, MATCH_R / AM2.s, 1.3), sfx: [[0, 'boom'], [0.95, 'ping', 0], [2.1, 'ping', 3], [3.25, 'ping', 7]] },
        { title: '밤에 60% 더', cap: '공기 1㎥에 평균 약 1,300개.\n밤에는 낮보다 약 60% 더 많았습니다.', dur: 5.6, inT: 'wipe', build: amNight,
          cam: push(700, 560, 1.0, 1.04), sfx: [[-0.5, 'whoosh'], [0.7, 'count', 1.2], [2.9, 'count', 1.0]] },
        { title: '폐 깊숙이', cap: '95%가 10㎛보다 작고, 약 40%는 2.5㎛보다 작았습니다.\n대기 중 농도는 주로 기상 조건이 좌우했습니다.', dur: 5.4, inT: 'wipe', build: amSize,
          cam: push(560, 560, 1.0, 1.04), sfx: [[-0.5, 'whoosh'], [2.2, 'count', 0.9], [2.9, 'count', 0.9]] }
      ]
    }
  ];
  var XT = { fade: 0.5, match: 0.15, wipe: 0.55 };
  var PARA = [['back', 0.55, 0.5], ['mid', 1, 1], ['front', 1.3, 1.8]]; /* 층, 확대 비율, 흐름 비율 */

  var AUD = window.FEETAudio || null;
  for (var pi0 = 0; pi0 < PAPERS.length; pi0++) {
    var pp0 = PAPERS[pi0], acc = 0;
    pp0.starts = [];
    for (var s0 = 0; s0 < pp0.scenes.length; s0++) { pp0.starts.push(acc); acc += pp0.scenes[s0].dur; }
    pp0.total = acc;
    pp0.cues = AUD ? AUD.flatten(pp0.scenes, pp0.starts, acc) : [];
  }

  var ICON_EXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>';

  /* =========================================================
     플레이어
     ========================================================= */
  function Player(root) {
    var self = this;
    this.root = root;
    this.pi = 0; this.t = 0; this.cur = -1;
    this.playing = false; this.userPaused = false; this.inView = false; this.debug = false;
    this.raf = 0; this.last = 0; this.intro = 1;
    this.nid = 0;

    root.className += ' pm-on' + (reduced ? ' pm-still' : '');
    var fb = root.querySelector('.pm-fallback');
    if (fb) fb.hidden = true;

    this.tabs = root.querySelectorAll('[role="tab"]');
    this.panel = root.querySelector('[role="tabpanel"]');
    var screen = this.screen = root.querySelector('.pm-screen');
    var info = this.info = root.querySelector('.pm-info');
    screen.tabIndex = 0;
    screen.setAttribute('role', 'group');
    screen.setAttribute('aria-roledescription', '모션 그래픽');

    /* SVG */
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMid meet' });
    screen.appendChild(svg);
    var defs = this.defs = el('defs', {}, svg);
    var rg = el('radialGradient', { id: 'pmbg', cx: '50%', cy: '42%', r: '75%' }, defs);
    el('stop', { offset: '0', 'stop-color': '#13304B' }, rg);
    el('stop', { offset: '0.6', 'stop-color': P.bg2 }, rg);
    el('stop', { offset: '1', 'stop-color': P.bg }, rg);
    var vg = el('radialGradient', { id: 'pmvig', cx: '50%', cy: '50%', r: '72%' }, defs);
    el('stop', { offset: '0.7', 'stop-color': '#050B12', 'stop-opacity': 0 }, vg);
    el('stop', { offset: '1', 'stop-color': '#050B12', 'stop-opacity': 0.5 }, vg);
    var hz = el('radialGradient', { id: 'pmhaze' }, defs);
    el('stop', { offset: '0', 'stop-color': P.ember, 'stop-opacity': 0.6 }, hz);
    el('stop', { offset: '0.55', 'stop-color': P.ember, 'stop-opacity': 0.22 }, hz);
    el('stop', { offset: '1', 'stop-color': P.ember, 'stop-opacity': 0 }, hz);
    var fl = el('filter', { id: 'pmglow', x: '-60%', y: '-60%', width: '220%', height: '220%' }, defs);
    el('feGaussianBlur', { stdDeviation: 26 }, fl);
    var wl = el('filter', { id: 'pmglow2', x: '-200%', y: '-10%', width: '500%', height: '120%' }, defs);
    el('feGaussianBlur', { stdDeviation: 7 }, wl);
    el('rect', { width: W, height: H, fill: 'url(#pmbg)' }, svg);

    var ctx = { defs: defs, glowId: 'pmglow', id: function (p) { self.nid++; return 'pm' + p + self.nid; } };
    var stageG = this.stageG = el('g', {}, svg);

    /* 장면 짓기 */
    for (var i = 0; i < PAPERS.length; i++) {
      var pp = PAPERS[i], pg = el('g', {}, stageG);
      pp.g = pg; pp.built = [];
      for (var j = 0; j < pp.scenes.length; j++) {
        var sd = pp.scenes[j];
        var cid = ctx.id('w');
        var cp = el('clipPath', { id: cid }, defs);
        var cr = el('rect', { x: 0, y: -10, width: W, height: H + 20 }, cp);
        var sg = el('g', {}, pg);
        el('rect', { x: -10, y: -10, width: W + 20, height: H + 20, fill: 'url(#pmbg)' }, sg);
        var layers = {};
        for (var q = 0; q < PARA.length; q++) layers[PARA[q][0]] = el('g', { 'class': 'pm-cam' }, sg);
        var hud = el('g', {}, sg);
        pp.built.push({ g: sg, layers: layers, hud: hud, clipId: cid, clipR: cr, def: sd, upd: sd.build(layers, hud, ctx) });
      }
    }

    /* 덮개: 와이프 선, 모서리 표시, 비네트 */
    var over = el('g', {}, svg);
    el('rect', { width: W, height: H, fill: 'url(#pmvig)' }, over);
    this.wipeG = el('g', {}, over);
    this.wipeGlow = el('rect', { x: -6, y: 0, width: 12, height: H, filter: 'url(#pmglow2)' }, this.wipeG);
    this.wipeLine = el('rect', { x: -1.5, y: 0, width: 3, height: H }, this.wipeG);
    var cm = el('g', { fill: 'none', stroke: '#3C5E80', 'stroke-width': 2 }, over);
    el('path', { d: 'M28 64V28H64M1136 28H1172V64M1172 836V872H1136M64 872H28V836' }, cm);

    /* 정보 패널 */
    info.innerHTML =
      '<div class="pm-meta"><span class="pm-chip pm-jr"></span><span class="pm-chip pm-yr"></span><span class="pm-chip pm-oa">Open access</span></div>' +
      '<h3 class="pm-ti" lang="en"></h3>' +
      '<p class="pm-sum"></p>' +
      '<div class="pm-aublock"><p class="pm-au" lang="en"></p><p class="pm-aunote"></p></div>' +
      '<div class="pm-now"><p class="pm-scene"><b></b><span></span></p><p class="pm-cap" aria-live="polite"></p></div>' +
      '<div class="pm-ctrl"><button type="button" class="pm-btn pm-play"></button><ol class="pm-chips" aria-label="장면 목록"></ol>' +
      '<button type="button" class="pm-btn pm-restart" aria-label="처음부터 다시 보기">' + K.ICON_RESTART + '</button>' +
      '<a class="pm-doi" target="_blank" rel="noopener"><span>원문 보기</span>' + ICON_EXT + '</a></div>' +
      '<p class="pm-note"></p>';
    this.q = function (s) { return info.querySelector(s); };
    this.nowEl = this.q('.pm-now');
    this.playBtn = this.q('.pm-play');
    this.restartBtn = this.q('.pm-restart');
    if (reduced) { this.playBtn.hidden = true; this.restartBtn.hidden = true; }
    this.chipsOl = this.q('.pm-chips');
    /* 소리(기본 꺼짐) — 스피커 버튼은 '원문 보기' 앞에 */
    this.snd = AUD ? AUD.attach({ theme: PAPERS[0].key, screen: screen, ctrl: this.q('.pm-ctrl'), before: this.q('.pm-doi'), btnClass: 'pm-btn' }) : null;

    this.playBtn.addEventListener('click', function () {
      if (self.userPaused || self.debug) { self.userPaused = false; self.debug = false; }
      else self.userPaused = true;
      self.sync();
    });
    this.restartBtn.addEventListener('click', function () { self.restart(); });

    /* 탭 */
    for (i = 0; i < this.tabs.length; i++) {
      (function (idx) {
        var tb = self.tabs[idx];
        tb.addEventListener('click', function () { self.select(idx, true); });
        tb.addEventListener('keydown', function (e) {
          var k = e.key, n = self.tabs.length, to = -1;
          if (k === 'ArrowRight' || k === 'ArrowDown') to = (idx + 1) % n;
          else if (k === 'ArrowLeft' || k === 'ArrowUp') to = (idx + n - 1) % n;
          else if (k === 'Home') to = 0;
          else if (k === 'End') to = n - 1;
          if (to < 0) return;
          e.preventDefault();
          self.select(to, true);
          self.tabs[to].focus();
        });
      })(i);
    }
    /* 탭 = 재생/일시정지, 좌우 스와이프 = 이전/다음 장면 (motion.js 의 도우미) */
    if (K.gestures) K.gestures(screen,
      function () { if (!reduced) self.playBtn.click(); },
      function (dir) { var n = PAPERS[self.pi].scenes.length; self.go((self.cur + (dir > 0 ? 1 : n - 1)) % n); });
    screen.addEventListener('keydown', function (e) {
      var k = e.key, n = PAPERS[self.pi].scenes.length;
      if (k === 'ArrowRight' || k === 'ArrowLeft') {
        e.preventDefault();
        self.go((self.cur + (k === 'ArrowRight' ? 1 : n - 1)) % n);
      } else if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
        e.preventDefault();
        if (!reduced) self.playBtn.click();
      } else if (k === 'Home') {
        e.preventDefault(); self.restart();
      }
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { self.inView = en[0].isIntersecting; self.sync(); }, { threshold: 0.3 }).observe(screen);
    } else this.inView = true;
    document.addEventListener('visibilitychange', function () { self.sync(); });

    /* 시작 논문: ?paper= 또는 #paper- */
    var start = 0, mp = /[?&]paper=([a-z]+)/.exec(location.search), mh = /^#paper-([a-z]+)$/.exec(location.hash);
    var key = mp ? mp[1] : mh ? mh[1] : null;
    for (i = 0; i < PAPERS.length; i++) if (PAPERS[i].key === key) start = i;
    var mt = /[?&]t=([0-9.]+)/.exec(location.search);
    this.select(start, false);
    if (mt) { this.debug = true; this.intro = 1; this.t = mod(parseFloat(mt[1]) || 0, PAPERS[this.pi].total); this.render(); this.sync(); }

    window.addEventListener('hashchange', function () { self.fromHash(); });
    /* 같은 해시를 다시 눌러도 처음부터 */
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href*="#paper-"]') : null;
      if (!a) return;
      var m = /#paper-([a-z]+)$/.exec(a.getAttribute('href'));
      if (!m || a.pathname.replace(/^.*\//, '') !== location.pathname.replace(/^.*\//, '')) return;
      if (location.hash === '#paper-' + m[1]) {
        e.preventDefault();
        self.fromHash();
        var tb = document.getElementById('paper-' + m[1]);
        if (tb) tb.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      }
    });
  }

  Player.prototype.fromHash = function () {
    var m = /^#paper-([a-z]+)$/.exec(location.hash);
    if (!m) return;
    for (var i = 0; i < PAPERS.length; i++) if (PAPERS[i].key === m[1]) { this.select(i, false); this.restart(); }
  };

  Player.prototype.select = function (i, user) {
    var self = this, pp = PAPERS[i];
    this.pi = i;
    for (var k = 0; k < this.tabs.length; k++) {
      var on = k === i;
      this.tabs[k].setAttribute('aria-selected', on ? 'true' : 'false');
      this.tabs[k].tabIndex = on ? 0 : -1;
    }
    this.panel.setAttribute('aria-labelledby', this.tabs[i].id);
    this.root.style.setProperty('--pm-acc', pp.accent);
    this.root.setAttribute('data-paper', pp.key);
    for (k = 0; k < PAPERS.length; k++) vis(PAPERS[k].g, k === i);
    if (user && history.replaceState) { try { history.replaceState(null, '', '#paper-' + pp.key); } catch (e) { /* 무시 */ } }

    /* 패널 */
    this.q('.pm-jr').textContent = pp.journal;
    this.q('.pm-yr').textContent = pp.year;
    this.q('.pm-oa').hidden = !pp.oa;
    this.q('.pm-ti').textContent = pp.title;
    this.q('.pm-sum').textContent = pp.sum;
    this.q('.pm-au').innerHTML = pp.authors;
    var aun = this.q('.pm-aunote'), note = this.q('.pm-note');
    aun.textContent = pp.auNote || ''; aun.hidden = !pp.auNote;
    note.textContent = pp.note || ''; note.hidden = !pp.note;
    var doi = this.q('.pm-doi');
    doi.href = pp.doi;
    doi.setAttribute('aria-label', '원문 보기: ' + pp.cite + ' (새 창)');
    this.root.style.setProperty('--pm-n', pp.scenes.length);
    if (this.snd) this.snd.theme(pp.key);
    this.screen.setAttribute('aria-label', pp.name + ' 논문 ' + Math.round(pp.total) + '초 모션. ' + (reduced
      ? '장면 버튼이나 좌우 화살표 키로 장면을 넘겨 볼 수 있습니다.'
      : '스페이스 키나 탭으로 재생과 일시정지, 좌우 화살표 키나 옆으로 밀어 장면 이동.'));
    this.chipsOl.innerHTML = '';
    this.chips = []; this.bars = [];
    for (k = 0; k < pp.scenes.length; k++) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'pm-chip-btn';
      b.setAttribute('aria-label', '장면 ' + (k + 1) + ', ' + pp.scenes[k].title + (reduced ? ' 보기' : '부터 보기'));
      b.innerHTML = '<span class="n">0' + (k + 1) + '</span><span class="t">' + pp.scenes[k].title + '</span><span class="bar" aria-hidden="true"><i></i></span>';
      (function (idx) { b.addEventListener('click', function () { self.go(idx); }); })(k);
      li.appendChild(b); this.chipsOl.appendChild(li);
      this.chips.push(b); this.bars.push(b.querySelector('.bar i'));
    }
    this.cur = -1;
    this.debug = false;
    this.t = reduced ? this.stillTime(0) : XT.fade;
    this.intro = reduced ? 1 : 0;
    this.render();
    this.sync();
  };

  Player.prototype.restart = function () {
    this.t = reduced ? this.stillTime(0) : XT.fade;
    this.intro = reduced ? 1 : 0;
    this.userPaused = false; this.debug = false;
    this.render(); this.sync();
  };

  Player.prototype.stillTime = function (i) {
    var pp = PAPERS[this.pi];
    return pp.starts[i] + pp.scenes[i].dur - MIN_STILL;
  };

  Player.prototype.go = function (i) {
    var pp = PAPERS[this.pi];
    this.t = reduced ? this.stillTime(i) : pp.starts[i] + (i === 0 ? XT.fade : 0.1);
    this.render();
    this.sync();
    if (reduced && this.snd) this.snd.sfx('whoosh');
  };

  Player.prototype.sync = function () {
    var want = !reduced && !this.debug && !this.userPaused && this.inView && !document.hidden;
    var self = this;
    if (want && !this.playing) {
      this.playing = true; this.last = 0;
      this.raf = requestAnimationFrame(function (ts) { self.tick(ts); });
    } else if (!want && this.playing) {
      this.playing = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    var showPause = this.playing || (!this.userPaused && !this.debug && !this.inView);
    this.playBtn.innerHTML = showPause ? K.ICON_PAUSE : K.ICON_PLAY;
    this.playBtn.setAttribute('aria-label', showPause ? '일시정지' : '재생');
    this.root.className = this.root.className.replace(' pm-paused', '') + (showPause ? '' : ' pm-paused');
    this.root.classList.toggle('pm-held', this.userPaused && !this.debug);
    if (this.snd) this.snd.active(this.playing);
  };

  Player.prototype.tick = function (ts) {
    if (!this.playing) return;
    var self = this, tot = PAPERS[this.pi].total;
    var dt = this.last ? Math.min(ts - this.last, 60) / 1000 : 0;
    this.last = ts;
    var prev = this.t;
    this.t += dt;
    this.intro = Math.min(1, this.intro + dt / 0.6);
    if (this.t >= tot) this.t -= tot;
    if (this.snd && dt > 0) this.snd.cues(prev, this.t, PAPERS[this.pi].cues, tot);
    this.render();
    this.raf = requestAnimationFrame(function (t2) { self.tick(t2); });
  };

  Player.prototype.render = function () {
    var pp = PAPERS[this.pi], sc = pp.scenes, n = sc.length, tot = pp.total, t = this.t, i, q;
    var wipeX = -1, wipeA = 0;
    O(this.stageG, eio(this.intro));
    for (i = 0; i < n; i++) {
      var b = pp.built[i], d = sc[i].dur;
      var xin = XT[sc[i].inT], nxt = sc[(i + 1) % n].inT, xout = XT[nxt];
      var l = t - pp.starts[i];
      if (l < -xin) l += tot; else if (l > d + xout) l -= tot;
      if (l < -xin || l > d + xout) { vis(b.g, false); continue; }
      /* 들어오기 */
      var o = 1, clip = false;
      if (sc[i].inT === 'fade') o *= eio(seg(l, -xin, xin));
      else if (sc[i].inT === 'match') o *= seg(l, -xin, xin);
      else if (sc[i].inT === 'wipe' && l < xin) {
        var wp = eio(seg(l, -xin, xin));
        clip = true;
        A(b.clipR, 'width', W * wp);
        wipeX = W * wp; wipeA = Math.sin(Math.PI * wp);
      }
      /* 나가기 */
      if (nxt === 'fade') o *= 1 - eio(seg(l, d - xout, d + xout));
      else if (nxt === 'match') o *= 1 - seg(l, d - xout, d + xout);
      else if (nxt === 'wipe' && l > d + xout) o = 0;
      if (o <= 0.001) { vis(b.g, false); continue; }
      vis(b.g, true);
      O(b.g, o);
      if (clip) b.g.setAttribute('clip-path', 'url(#' + b.clipId + ')');
      else b.g.removeAttribute('clip-path');
      /* 카메라 + 패럴랙스 */
      var cam = sc[i].cam(l, d);
      var drift = -14 * seg(l, -xin, d + xout);
      cam.dx = drift;
      for (q = 0; q < PARA.length; q++) {
        var lay = b.layers[PARA[q][0]], k = PARA[q][1];
        var s = 1 + (cam.s - 1) * k;
        lay.setAttribute('transform', 'translate(' + f2(cam.sx + drift * PARA[q][2]) + ' ' + f2(cam.sy) + ') scale(' + s.toFixed(4) + ') translate(' + f2(-cam.fx) + ' ' + f2(-cam.fy) + ')');
        lay.style.setProperty('--zs', s.toFixed(4));
      }
      b.upd(l, cam, d);
    }
    vis(this.wipeG, wipeX >= 0);
    if (wipeX >= 0) {
      T(this.wipeG, 'translate(' + f2(wipeX) + ',0)');
      O(this.wipeG, wipeA);
      A(this.wipeLine, 'fill', pp.accent); A(this.wipeGlow, 'fill', pp.accent);
    }
    var cur = 0;
    for (i = 0; i < n; i++) if (t >= pp.starts[i]) cur = i;
    for (i = 0; i < this.bars.length; i++) {
      var p = i < cur ? 1 : i > cur ? 0 : seg(t, pp.starts[i], pp.starts[i] + sc[i].dur);
      if (reduced) p = i === cur ? 1 : 0;
      this.bars[i].style.transform = 'scaleX(' + f2(p) + ')';
    }
    if (cur !== this.cur) this.setCap(cur);
  };

  Player.prototype.setCap = function (i) {
    var self = this, first = this.cur < 0, sd = PAPERS[this.pi].scenes[i];
    this.cur = i;
    for (var k = 0; k < this.chips.length; k++) {
      if (k === i) this.chips[k].setAttribute('aria-current', 'step');
      else this.chips[k].removeAttribute('aria-current');
    }
    if (K.chipIntoView) K.chipIntoView(this.chipsOl, this.chips[i]);
    function put() {
      self.q('.pm-scene b').textContent = '0' + (i + 1);
      self.q('.pm-scene span').textContent = sd.title;
      var cap = self.q('.pm-cap'), parts = sd.cap.split('\n');
      cap.innerHTML = '';
      for (var j = 0; j < parts.length; j++) {
        if (j) cap.appendChild(document.createElement('br'));
        cap.appendChild(document.createTextNode(parts[j]));
      }
      self.nowEl.className = 'pm-now';
    }
    if (first || reduced) { put(); return; }
    this.nowEl.className = 'pm-now swap';
    clearTimeout(this.capT);
    this.capT = setTimeout(put, 200);
  };

  var player;
  try { player = new Player(root); } catch (err) { if (window.console) console.error(err); }
  window.__pmotion = {
    player: player, papers: PAPERS,
    seek: function (key, t) {
      if (!player) return;
      for (var i = 0; i < PAPERS.length; i++) if (PAPERS[i].key === key && i !== player.pi) player.select(i, false);
      player.debug = true; player.intro = 1; player.t = mod(t, PAPERS[player.pi].total); player.render(); player.sync();
    }
  };
})();
