/* FEET Lab — 공통 스크립트 v4 (ES5, 성능 최적화) */
(function () {
  'use strict';

  var reduced = false;
  try {
    reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { reduced = false; }

  var i, j;

  /* ---------- 모바일 메뉴 ---------- */
  var top = document.querySelector('.top');
  var burger = document.querySelector('.burger');
  if (top && burger) {
    burger.addEventListener('click', function () {
      var open = top.className.indexOf('open') > -1;
      top.className = open ? top.className.replace(' open', '') : top.className + ' open';
      burger.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  }

  /* ---------- 스크롤 진행바 + 헤더 상태 ---------- */
  var bar = document.getElementById('bar');
  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    if (bar) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    }
    if (top) {
      var stuck = top.className.indexOf('stuck') > -1;
      if (y > 12 && !stuck) top.className += ' stuck';
      else if (y <= 12 && stuck) top.className = top.className.replace(' stuck', '');
    }
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { onScroll(); ticking = false; });
  }, { passive: true });
  onScroll();

  /* ---------- 스크롤 리빌 (형제 요소는 시차를 두고) ---------- */
  var items = document.querySelectorAll('.rv');
  if (!reduced && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        if (!entries[k].isIntersecting) continue;
        var el = entries[k].target;
        var idx = 0, sib = el.previousElementSibling;
        while (sib) {
          if (sib.className && sib.className.indexOf('rv') > -1) idx++;
          sib = sib.previousElementSibling;
        }
        el.style.transitionDelay = Math.min(idx, 5) * 70 + 'ms';
        el.className += ' on';
        io.unobserve(el);
      }
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    for (i = 0; i < items.length; i++) io.observe(items[i]);
  } else {
    for (i = 0; i < items.length; i++) items[i].className += ' on';
  }

  /* ---------- 카드 스포트라이트 (마우스 기기 전용) ---------- */
  var finePointer = true;
  try { finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) {}
  if (!reduced && finePointer) {
    var cards = document.querySelectorAll('.pillar, .proj, .pub-card, .pub-mini, .topic, .join-card, .life-card, .person, .prof-card, .mailbox');
    for (i = 0; i < cards.length; i++) {
      if (cards[i].className.indexOf('sl') < 0) cards[i].className += ' sl';
      cards[i].addEventListener('mousemove', function (e) {
        var el = this;
        if (el._slq) return;
        el._slq = true;
        var cx = e.clientX, cy = e.clientY;
        requestAnimationFrame(function () {
          var r = el.getBoundingClientRect();
          el.style.setProperty('--mx', (cx - r.left) + 'px');
          el.style.setProperty('--my', (cy - r.top) + 'px');
          el._slq = false;
        });
      }, { passive: true });
    }
  }

  /* ---------- 숫자 카운트업 ---------- */
  var nums = document.querySelectorAll('[data-count]');
  if (nums.length && !reduced && 'IntersectionObserver' in window) {
    var nio = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        if (!entries[k].isIntersecting) continue;
        (function (el) {
          var target = parseInt(el.getAttribute('data-count'), 10);
          var suffix = el.getAttribute('data-suffix') || '';
          var t0 = null, dur = 1100;
          function step(ts) {
            if (t0 === null) t0 = ts;
            var p = Math.min((ts - t0) / dur, 1);
            var e = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * e) + suffix;
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        })(entries[k].target);
        nio.unobserve(entries[k].target);
      }
    }, { threshold: 0.4 });
    for (i = 0; i < nums.length; i++) nio.observe(nums[i]);
  }

  /* ---------- 히어로 입자 (대기 미세입자 + 측정 스캔) ---------- */
  var cv = document.getElementById('fx');
  var narrow = false, weak = false;
  try { narrow = window.matchMedia('(max-width: 767px)').matches; } catch (e) {}
  try { weak = (navigator.hardwareConcurrency || 8) <= 2; } catch (e) {}
  if (cv && cv.getContext && !reduced && !narrow && !weak) {
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var ps = [];
    var COLORS = ['rgba(29,79,134,', 'rgba(107,160,58,', 'rgba(19,33,51,'];
    var mouse = { x: -9999, y: -9999 };
    var scan = { t: 0, idx: 0 };

    function resize() {
      var host = cv.parentNode;
      W = host.offsetWidth; H = host.offsetHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function seed() {
      ps = [];
      var n = Math.max(26, Math.min(58, Math.round(W * H / 30000)));
      for (var k = 0; k < n; k++) {
        ps.push({
          x: Math.random() * W, y: Math.random() * H,
          r: 0.9 + Math.random() * 2.4,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.16 - 0.03,
          c: COLORS[k % 3],
          a: 0.10 + Math.random() * 0.24,
          w: Math.random() * Math.PI * 2
        });
      }
    }
    function tick() {
      ctx.clearRect(0, 0, W, H);
      var p, k, dx, dy, d;
      /* 가까운 입자끼리 실선 연결 — 격자로 나눠 이웃만 비교 */
      var CELL = 110, grid = {}, key, gx, gy, m, q, cell, ox, oy;
      for (k = 0; k < ps.length; k++) {
        gx = (ps[k].x / CELL) | 0; gy = (ps[k].y / CELL) | 0;
        key = gx + ':' + gy;
        (grid[key] || (grid[key] = [])).push(k);
      }
      ctx.lineWidth = 1;
      for (k = 0; k < ps.length; k++) {
        gx = (ps[k].x / CELL) | 0; gy = (ps[k].y / CELL) | 0;
        for (ox = 0; ox <= 1; ox++) {
          for (oy = (ox === 0 ? 0 : -1); oy <= 1; oy++) {
            cell = grid[(gx + ox) + ':' + (gy + oy)];
            if (!cell) continue;
            for (q = 0; q < cell.length; q++) {
              m = cell[q];
              if (m <= k) continue;
              dx = ps[k].x - ps[m].x; dy = ps[k].y - ps[m].y;
              d = dx * dx + dy * dy;
              if (d < 12000) {
                ctx.beginPath();
                ctx.moveTo(ps[k].x, ps[k].y); ctx.lineTo(ps[m].x, ps[m].y);
                ctx.strokeStyle = 'rgba(29,79,134,' + (0.075 * (1 - d / 12000)) + ')';
                ctx.stroke();
              }
            }
          }
        }
      }
      for (k = 0; k < ps.length; k++) {
        p = ps[k];
        p.w += 0.008;
        p.x += p.vx + Math.sin(p.w) * 0.11;
        p.y += p.vy;
        dx = p.x - mouse.x; dy = p.y - mouse.y;
        d = dx * dx + dy * dy;
        if (d < 10000) { p.x += dx / 1000 * 4; p.y += dy / 1000 * 4; }
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fillStyle = p.c + p.a + ')';
        ctx.fill();
      }
      /* 가끔 입자 하나를 '측정'하듯 링이 퍼진다 */
      scan.t += 1;
      if (scan.t > 240) { scan.t = 0; scan.idx = Math.floor(Math.random() * ps.length); }
      if (scan.t < 88 && ps[scan.idx]) {
        p = ps[scan.idx];
        var pr = scan.t / 88;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 + pr * 30, 0, 6.2832);
        ctx.strokeStyle = 'rgba(79,130,38,' + (0.6 * (1 - pr)) + ')';
        ctx.lineWidth = 1.3; ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, 6.2832);
        ctx.fillStyle = 'rgba(79,130,38,0.9)'; ctx.fill();
      }
      if (running) requestAnimationFrame(tick);
    }

    /* 히어로가 화면 밖이거나 탭이 숨겨지면 정지 */
    var running = true;
    function start() { if (!running) { running = true; requestAnimationFrame(tick); } }
    function stop() { running = false; }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) start(); else stop();
      }, { threshold: 0 }).observe(cv.parentNode);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { resize(); seed(); }, 150);
    }, { passive: true });
    document.addEventListener('mousemove', function (e) {
      var rect = cv.getBoundingClientRect();
      mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
    }, { passive: true });
    resize(); seed(); tick();
  }

  /* ---------- 메일 템플릿 복사 ---------- */
  var copyBtn = document.getElementById('copy-mail');
  var tpl = document.getElementById('mail-tpl');
  if (copyBtn && tpl) {
    copyBtn.addEventListener('click', function () {
      var txt = tpl.textContent || tpl.innerText;
      function done() {
        copyBtn.textContent = '복사했어요!';
        setTimeout(function () { copyBtn.textContent = '템플릿 복사'; }, 1800);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, done);
      } else {
        var ta = document.createElement('textarea');
        ta.value = txt; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
        document.body.removeChild(ta); done();
      }
    });
  }
})();
