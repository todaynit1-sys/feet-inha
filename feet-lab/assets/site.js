/* FEET Lab — 공통 스크립트 (ES5) */
(function () {
  'use strict';

  var reduced = false;
  try {
    reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { reduced = false; }

  /* 모바일 메뉴 */
  var top = document.querySelector('.top');
  var burger = document.querySelector('.burger');
  if (top && burger) {
    burger.addEventListener('click', function () {
      var open = top.className.indexOf('open') > -1;
      if (open) { top.className = top.className.replace(' open', ''); }
      else { top.className += ' open'; }
      burger.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  }

  /* 스크롤 리빌 */
  var items = document.querySelectorAll('.rv');
  var i;
  if (!reduced && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var j = 0; j < entries.length; j++) {
        if (entries[j].isIntersecting) {
          entries[j].target.className += ' on';
          io.unobserve(entries[j].target);
        }
      }
    }, { threshold: 0.12 });
    for (i = 0; i < items.length; i++) { io.observe(items[i]); }
  } else {
    for (i = 0; i < items.length; i++) { items[i].className += ' on'; }
  }

  /* 히어로 입자 애니메이션 — 대기 중 미세입자 모티프 */
  var cv = document.getElementById('fx');
  if (cv && cv.getContext && !reduced) {
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var ps = [];
    var COLORS = ['rgba(22,104,199,', 'rgba(30,158,99,', 'rgba(11,34,55,'];
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
      var n = Math.max(28, Math.min(70, Math.round(W * H / 26000)));
      for (var k = 0; k < n; k++) {
        ps.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 1 + Math.random() * 2.6,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.18 - 0.04,
          c: COLORS[k % 3],
          a: 0.12 + Math.random() * 0.3,
          w: Math.random() * Math.PI * 2
        });
      }
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);
      var p, k, dx, dy, d;
      for (k = 0; k < ps.length; k++) {
        p = ps[k];
        p.w += 0.008;
        p.x += p.vx + Math.sin(p.w) * 0.12;
        p.y += p.vy;
        dx = p.x - mouse.x; dy = p.y - mouse.y;
        d = dx * dx + dy * dy;
        if (d < 8100) { p.x += dx / 900 * 4; p.y += dy / 900 * 4; }
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fillStyle = p.c + p.a + ')';
        ctx.fill();
      }
      /* 스캔 링 — 가끔 입자 하나를 '측정'하듯 링이 퍼진다 */
      scan.t += 1;
      if (scan.t > 260) { scan.t = 0; scan.idx = Math.floor(Math.random() * ps.length); }
      if (scan.t < 90 && ps[scan.idx]) {
        p = ps[scan.idx];
        var pr = scan.t / 90;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 + pr * 26, 0, 6.2832);
        ctx.strokeStyle = 'rgba(30,158,99,' + (0.45 * (1 - pr)) + ')';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, 6.2832);
        ctx.fillStyle = 'rgba(30,158,99,0.8)';
        ctx.fill();
      }
      requestAnimationFrame(tick);
    }

    window.addEventListener('resize', function () { resize(); seed(); });
    document.addEventListener('mousemove', function (e) {
      var rect = cv.getBoundingClientRect();
      mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
    });
    resize(); seed(); tick();
  }

  /* 메일 템플릿 복사 */
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
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta); done();
      }
    });
  }
})();
