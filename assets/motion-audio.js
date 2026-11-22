/* FEET Lab — 모션 소리 v1 (배경음 + 효과음, 모두 Web Audio 로 합성. 음원 파일·음성 없음)
   네 가지 무대(과제 무대 .mstage, 논문 플레이어, 홈 첫 화면 모션, 연구 흐름도 .fstage)가 같이 쓴다. motion.js 보다 먼저 불러올 것.
   - 기본은 꺼짐. 각 조작부의 스피커 버튼으로 켜고 끈다. 선택은 localStorage('feet-sound') 에 기억.
   - AudioContext 는 사용자가 누른(클릭·키·터치) 뒤에만 만들거나 resume 한다.
   - 한 번에 한 플레이어만 배경음을 낸다(가장 최근에 재생을 시작한 무대).
   - 일시정지·화면 밖·탭 숨김이면 배경음은 0.3초에 걸쳐 줄이고 멈춘다.
   쓰는 법:
     var snd = FEETAudio.attach({ theme: 'voc', screen: 화면요소, ctrl: 버튼을 넣을 요소, btnClass: 'pm-btn' });
     snd.active(true/false)   — 재생 중이고 보일 때 true
     snd.theme('bc')          — 배경음 테마 바꾸기
     snd.cues(prevT, t, list, total) — 타임라인이 prevT → t 로 흐를 때 그 사이 큐만 울림
     snd.sfx('whoosh')        — 바로 울림(사용자 조작)
   검증: FEETAudio.render('voc', 10) → OfflineAudioContext 로 렌더해 {peak, rms, ...} 를 돌려줌 */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var KEY = 'feet-sound';

  /* ---------- 테마: 근음(Hz)과 음색만 다르다. 화음은 3도가 없는 열린 화음(sus2·4도 쌓기) ---------- */
  var THEMES = {
    /* 과제 무대: D, 따뜻한 톱니 + 삼각 */
    stage: { root: 73.42, a: [0, 7, 14, 19], b: [-2, 5, 12, 17], wave: ['sawtooth', 'triangle'], cut: [520, 1300], q: 0.7, pulse: 2.2, air: 0.5, lvl: 1 },
    /* VOC: E, 맑은 삼각 위주 */
    voc: { root: 82.41, a: [0, 7, 14, 19], b: [5, 12, 14, 21], wave: ['triangle', 'sawtooth'], cut: [700, 1700], q: 0.6, pulse: 2.0, air: 0.6, lvl: 1 },
    /* 블랙카본: C, 어둡고 낮은 필터 */
    bc: { root: 65.41, a: [0, 7, 14, 17], b: [-3, 4, 11, 14], wave: ['sawtooth', 'sawtooth'], cut: [380, 950], q: 0.9, pulse: 2.4, air: 0.35, lvl: 1.4 },
    /* 미세플라스틱: A, 밝은 사인·삼각 */
    amp: { root: 55, a: [12, 19, 26, 31], b: [17, 24, 26, 33], wave: ['triangle', 'sine'], cut: [1100, 2400], q: 0.5, pulse: 1.8, air: 0.7, lvl: 1.1 },
    /* 첫 화면: F, 부드러운 사인 + 삼각, 가장 가볍게 */
    hero: { root: 87.31, a: [0, 7, 14, 19], b: [5, 12, 19, 26], wave: ['sine', 'triangle'], cut: [900, 2200], q: 0.5, pulse: 2.6, air: 0.45, lvl: 1.1 },
    /* 연구 흐름도: E♭, 사인 + 삼각, 느린 맥박(흐름도 카메라 투어용) */
    flow: { root: 77.78, a: [0, 7, 14, 19], b: [-2, 5, 12, 14], wave: ['sine', 'triangle'], cut: [750, 1800], q: 0.55, pulse: 2.9, air: 0.5, lvl: 1.15 }
  };
  var CHORD_SEC = 9;      /* 두 화음을 오가는 주기의 절반 */
  var BG_LEVEL = 0.16;    /* 배경음 버스 */
  var SFX_LEVEL = 0.42;   /* 효과음 버스 */
  var OUT = 0.5;          /* 리미터 뒤 출력(-6 dBFS 근처에서 머물게) */

  /* ---------- 공용 그래프 ---------- */
  function noiseBuf(ctx, sec) {
    var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    var seed = 12345;
    for (var i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
    return b;
  }
  function impulse(ctx, sec, decay) {
    var n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate), seed = 777;
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c);
      for (var i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        var r = seed / 0x3fffffff - 1;
        d[i] = r * Math.pow(1 - i / n, decay) * (i < 40 ? i / 40 : 1);
      }
    }
    return b;
  }
  function chain(ctx) {
    var out = ctx.createGain(); out.gain.value = OUT;
    var lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -12; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.25;
    var master = ctx.createGain(); master.gain.value = 0;
    var bg = ctx.createGain(); bg.gain.value = 0;
    var fx = ctx.createGain(); fx.gain.value = SFX_LEVEL;
    var verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 3.2, 3.2);
    var verbIn = ctx.createGain(); verbIn.gain.value = 1;
    var verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
    bg.connect(master); fx.connect(master);
    verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(master);
    master.connect(lim); lim.connect(out); out.connect(ctx.destination);
    return { ctx: ctx, master: master, bg: bg, fx: fx, verb: verbIn, noise: noiseBuf(ctx, 2) };
  }
  function ramp(param, to, sec, ctx) {
    var t = ctx.currentTime;
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); }
    param.linearRampToValueAtTime(to, t + sec);
  }

  /* ---------- 배경음 한 벌(테마 하나) ---------- */
  function Bed(G, name) {
    var ctx = G.ctx, th = THEMES[name] || THEMES.stage;
    this.G = G; this.th = th; this.name = name;
    var self = this;
    var gain = this.gain = ctx.createGain(); gain.gain.value = 0;
    gain.connect(G.bg);
    var send = ctx.createGain(); send.gain.value = 0.7; gain.connect(send); send.connect(G.verb);
    /* 패드: 화음 두 벌을 천천히 교차 */
    var filt = this.filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = th.cut[0]; filt.Q.value = th.q;
    filt.connect(gain);
    var lfo = ctx.createOscillator(); lfo.frequency.value = 1 / 23;
    var lfoG = ctx.createGain(); lfoG.gain.value = (th.cut[1] - th.cut[0]) / 2;
    filt.frequency.value = (th.cut[0] + th.cut[1]) / 2;
    lfo.connect(lfoG); lfoG.connect(filt.frequency);
    this.oscs = [lfo];
    this.groups = [];
    var sets = [th.a, th.b];
    for (var s = 0; s < 2; s++) {
      var grp = ctx.createGain(); grp.gain.value = s === 0 ? 1 : 0; grp.connect(filt);
      this.groups.push(grp);
      for (var v = 0; v < sets[s].length; v++) {
        var f = th.root * 2 * Math.pow(2, sets[s][v] / 12);
        var vg = ctx.createGain(); vg.gain.value = 0.055 / (1 + v * 0.25);
        /* 목소리마다 아주 느린 숨(진폭 흔들림) */
        var br = ctx.createOscillator(); br.frequency.value = 0.05 + v * 0.021 + s * 0.013;
        var brG = ctx.createGain(); brG.gain.value = vg.gain.value * 0.45;
        br.connect(brG); brG.connect(vg.gain);
        this.oscs.push(br);
        vg.connect(grp);
        for (var d = 0; d < 2; d++) {
          var o = ctx.createOscillator();
          o.type = th.wave[d];
          o.frequency.value = f;
          o.detune.value = (d ? 7 : -7) + v * 1.3;
          var og = ctx.createGain(); og.gain.value = d ? 0.6 : 1;
          o.connect(og); og.connect(vg);
          this.oscs.push(o);
        }
      }
    }
    /* 저음 맥박 */
    var sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = th.root;
    var subG = this.subG = ctx.createGain(); subG.gain.value = 0;
    sub.connect(subG); subG.connect(gain);
    this.oscs.push(sub);
    /* 공기(아주 옅은 걸러진 잡음) */
    var air = ctx.createBufferSource(); air.buffer = G.noise; air.loop = true;
    var af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 900 + th.cut[0]; af.Q.value = 0.7;
    var ag = ctx.createGain(); ag.gain.value = 0.012 * th.air;
    air.connect(af); af.connect(ag); ag.connect(gain);
    this.oscs.push(air);
    this.next = 0;      /* 다음에 예약할 시각(ctx 시간) */
    this.chordAt = 0; this.chordIdx = 0;
    this.started = false;
    void self;
  }
  Bed.prototype.start = function (t) {
    if (this.started) return;
    this.started = true;
    for (var i = 0; i < this.oscs.length; i++) this.oscs[i].start(t);
    this.next = t + 0.4; this.chordAt = t + CHORD_SEC;
  };
  /* until 까지 맥박·화음 교차를 미리 예약 */
  Bed.prototype.schedule = function (until) {
    var th = this.th, g = this.subG.gain;
    while (this.next < until) {
      var t = this.next;
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(0.07, t + 0.09);
      g.setTargetAtTime(0, t + 0.12, 0.28);
      this.next += th.pulse;
    }
    while (this.chordAt < until) {
      this.chordIdx = 1 - this.chordIdx;
      var a = this.groups[this.chordIdx].gain, b = this.groups[1 - this.chordIdx].gain;
      a.setTargetAtTime(1, this.chordAt, 1.6);
      b.setTargetAtTime(0, this.chordAt, 1.6);
      this.chordAt += CHORD_SEC;
    }
  };
  Bed.prototype.fade = function (to, sec) { ramp(this.gain.gain, to * this.th.lvl, sec, this.G.ctx); };
  Bed.prototype.stop = function (t) {
    for (var i = 0; i < this.oscs.length; i++) { try { this.oscs[i].stop(t); } catch (e) { /* 이미 멈춤 */ } }
    var gn = this.gain;
    setTimeout(function () { try { gn.disconnect(); } catch (e) { /* 무시 */ } }, Math.max(0, (t - this.G.ctx.currentTime) * 1000 + 100));
  };

  /* ---------- 효과음 ---------- */
  var SFX = {
    /* 장면 전환: 걸러진 잡음이 부드럽게 쓸고 지나감 */
    whoosh: function (G, t) {
      var ctx = G.ctx, s = ctx.createBufferSource(); s.buffer = G.noise;
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
      f.frequency.setValueAtTime(260, t);
      f.frequency.exponentialRampToValueAtTime(1800, t + 0.42);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.9);
      var g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.36);
      g.gain.linearRampToValueAtTime(0, t + 0.95);
      var out = g;
      if (ctx.createStereoPanner) {
        var p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.5, t); p.pan.linearRampToValueAtTime(0.5, t + 0.9);
        g.connect(p); out = p;
      }
      s.connect(f); f.connect(g);
      out.connect(G.fx);
      var sd = ctx.createGain(); sd.gain.value = 0.4; out.connect(sd); sd.connect(G.verb);
      s.start(t, Math.random() * 0.8); s.stop(t + 1.0);
    },
    /* 숫자 올라갈 때 미세한 틱, 끝에서 맑은 종 한 번 */
    count: function (G, t, dur) {
      dur = dur || 1.2;
      var n = Math.max(4, Math.round(dur * 9));
      for (var i = 0; i < n; i++) {
        var p = i / n, at = t + dur * (1 - Math.pow(1 - p, 1.6));
        tick(G, at, 0.03 * (0.6 + 0.4 * p));
      }
      SFX.chime(G, t + dur);
    },
    chime: function (G, t) {
      var ctx = G.ctx, base = 1318.5, parts = [[1, 0.06], [2.756, 0.022], [5.404, 0.01]];
      var g = ctx.createGain(); g.gain.value = 1; g.connect(G.fx);
      var sd = ctx.createGain(); sd.gain.value = 0.8; g.connect(sd); sd.connect(G.verb);
      for (var i = 0; i < parts.length; i++) {
        var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * parts[i][0];
        var og = ctx.createGain(); og.gain.setValueAtTime(0, t);
        og.gain.linearRampToValueAtTime(parts[i][1], t + 0.006);
        og.gain.setTargetAtTime(0, t + 0.01, 0.45 / (1 + i));
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 2.6);
      }
    },
    /* 요소가 켜질 때: 부드러운 핑 */
    ping: function (G, t, pitch) {
      var ctx = G.ctx, f = 880 * Math.pow(2, (pitch || 0) / 12);
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01;
      var g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.012);
      g.gain.setTargetAtTime(0, t + 0.02, 0.16);
      var g2 = ctx.createGain(); g2.gain.value = 0.18;
      o.connect(g); o2.connect(g2); g2.connect(g);
      g.connect(G.fx);
      var sd = ctx.createGain(); sd.gain.value = 0.7; g.connect(sd); sd.connect(G.verb);
      o.start(t); o2.start(t); o.stop(t + 1.2); o2.stop(t + 1.2);
    },
    /* 매치컷: 낮은 '둥' 한 번 */
    boom: function (G, t) {
      var ctx = G.ctx, o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(78, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.7);
      var g = ctx.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.42, t + 0.02);
      g.gain.setTargetAtTime(0, t + 0.05, 0.38);
      o.connect(g); g.connect(G.fx);
      var s = ctx.createBufferSource(); s.buffer = G.noise;
      var lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 220;
      var ng = ctx.createGain(); ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.16, t + 0.01);
      ng.gain.setTargetAtTime(0, t + 0.03, 0.12);
      s.connect(lf); lf.connect(ng); ng.connect(G.fx);
      var sd = ctx.createGain(); sd.gain.value = 0.35; g.connect(sd); sd.connect(G.verb);
      o.start(t); o.stop(t + 2.2); s.start(t); s.stop(t + 0.8);
    },
    /* 흐름도: 카메라가 노드에 내려앉을 때 짧고 낮은 '둥'(boom 보다 가볍게, 잡음 없음) */
    land: function (G, t) {
      var ctx = G.ctx, g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.015);
      g.gain.setTargetAtTime(0, t + 0.04, 0.2);
      g.connect(G.fx);
      var sd = ctx.createGain(); sd.gain.value = 0.3; g.connect(sd); sd.connect(G.verb);
      var fr = [[96, 54, 1], [192, 110, 0.22]];
      for (var i = 0; i < fr.length; i++) {
        var o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(fr[i][0], t);
        o.frequency.exponentialRampToValueAtTime(fr[i][1], t + 0.5);
        var og = ctx.createGain(); og.gain.value = fr[i][2];
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 1.4);
      }
    }
  };
  function tick(G, t, amp) {
    var ctx = G.ctx, o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2100;
    var g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g); g.connect(G.fx);
    o.start(t); o.stop(t + 0.06);
  }

  /* =========================================================
     실제 재생 관리
     ========================================================= */
  var G = null;                 /* 실시간 그래프 */
  var enabled = false, unlocked = false, choiceMade = false;
  try { var sv = window.localStorage.getItem(KEY); enabled = sv === '1'; choiceMade = sv === '1' || sv === '0'; } catch (e) { enabled = false; }
  var handles = [], owner = null;
  var bed = null, bedName = '', schedT = 0, sleepT = 0;

  function ensure() {
    if (!AC) return null;
    if (!G) {
      try { G = chain(new AC()); } catch (e) { G = null; return null; }
    }
    if (G.ctx.state === 'suspended' && G.ctx.resume) { try { G.ctx.resume(); } catch (e) { /* 무시 */ } }
    return G;
  }
  function soundOn() { return enabled && unlocked && !document.hidden; }

  /* 지금 상태에 맞춰 배경음을 켜고/끄고/바꾼다 */
  function update() {
    var want = soundOn() && owner && owner.isActive;
    clearTimeout(sleepT);
    if (!G) {
      if (!want) return;
      if (!ensure()) return;
    }
    var ctx = G.ctx;
    if (want) {
      ensure();
      ramp(G.master.gain, 1, 0.8, ctx);
      ramp(G.bg.gain, BG_LEVEL, 0.8, ctx);
      var nm = owner.themeName;
      if (!bed || bedName !== nm) {
        var old = bed;
        bed = new Bed(G, nm); bedName = nm;
        bed.start(ctx.currentTime + 0.02);
        bed.schedule(ctx.currentTime + 6);
        bed.fade(1, old ? 1.4 : 0.8);
        if (old) { old.fade(0, 1.2); old.stop(ctx.currentTime + 1.4); }
      } else {
        bed.fade(1, 0.8);
      }
      if (!schedT) schedT = setInterval(function () { if (bed && G) bed.schedule(G.ctx.currentTime + 6); }, 2000);
    } else {
      /* 배경음만 0.3초에 줄인다(효과음 버스는 살려 둠). 잠시 뒤 완전히 멈춤 */
      ramp(G.bg.gain, 0, 0.3, ctx);
      if (!soundOn()) ramp(G.master.gain, 0, 0.3, ctx);
      sleepT = setTimeout(function () {
        if (owner && owner.isActive && soundOn()) return;
        if (bed) { bed.stop(ctx.currentTime + 0.05); bed = null; bedName = ''; }
        if (schedT) { clearInterval(schedT); schedT = 0; }
        if (ctx.state === 'running' && ctx.suspend) { try { ctx.suspend(); } catch (e) { /* 무시 */ } }
      }, 600);
    }
  }

  function playSfx(name, arg) {
    if (!soundOn() || !SFX[name]) return;
    var g = ensure();
    if (!g) return;
    clearTimeout(sleepT);
    ramp(g.master.gain, 1, 0.05, g.ctx);
    SFX[name](g, g.ctx.currentTime + 0.02, arg);
    if (!(owner && owner.isActive)) {
      /* 배경음 없이 효과음만 울린 경우: 끝나면 다시 잠재움 */
      sleepT = setTimeout(update, 3200);
    }
  }

  /* ---------- 버튼과 알약 ---------- */
  var ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.4a8 8 0 0 1 0 11.2"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" stroke="none"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>';
  var btns = [], pills = [];
  function paint() {
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      b.innerHTML = enabled ? ICON_ON : ICON_OFF;
      b.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      b.setAttribute('aria-label', enabled ? '소리 끄기' : '소리 켜기');
      b.classList.toggle('snd-on', enabled);
    }
    for (i = 0; i < pills.length; i++) pills[i].hidden = choiceMade;
  }
  function setEnabled(on) {
    enabled = !!on; choiceMade = true;
    try { window.localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) { /* 무시 */ }
    if (enabled) { unlocked = true; ensure(); }
    paint();
    update();
  }
  /* 첫 사용자 제스처: 저장된 '켜짐' 이 있으면 그때 소리를 연다 */
  function onGesture() {
    if (unlocked) return;
    unlocked = true;
    if (enabled) { ensure(); update(); }
    for (var i = 0; i < GEST.length; i++) document.removeEventListener(GEST[i], onGesture, true);
  }
  var GEST = ['click', 'keydown', 'touchend', 'pointerup'];
  for (var gi = 0; gi < GEST.length; gi++) document.addEventListener(GEST[gi], onGesture, true);
  document.addEventListener('visibilitychange', function () { update(); });

  function stopBubble(e) { e.stopPropagation(); }

  function Handle(o) {
    var self = this;
    this.themeName = o.theme || 'stage';
    this.isActive = false;
    if (!AC) return;
    if (o.ctrl) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = (o.btnClass || '') + ' snd-btn';
      b.addEventListener('click', function () { setEnabled(!enabled); if (enabled) self.claim(); });
      if (o.before) o.ctrl.insertBefore(b, o.before); else o.ctrl.appendChild(b);
      btns.push(b);
      this.btn = b;
    }
    if (o.screen && o.pill !== false) {
      var p = document.createElement('button');
      p.type = 'button';
      p.className = 'snd-pill' + (o.pillClass ? ' ' + o.pillClass : '');
      p.innerHTML = ICON_ON + '<span>소리 켜기</span>';
      /* 무대의 탭(재생/일시정지)·키보드 조작으로 번지지 않게 */
      p.addEventListener('pointerdown', stopBubble);
      p.addEventListener('pointerup', stopBubble);
      p.addEventListener('keydown', stopBubble);
      p.addEventListener('click', function (e) { e.stopPropagation(); setEnabled(true); self.claim(); });
      o.screen.appendChild(p);
      pills.push(p);
    }
    paint();
  }
  Handle.prototype.claim = function () { if (this.isActive) { owner = this; update(); } };
  Handle.prototype.active = function (on) {
    on = !!on;
    if (on === this.isActive) return;
    this.isActive = on;
    if (on) owner = this;
    else if (owner === this) {
      owner = null;
      for (var i = handles.length - 1; i >= 0; i--) if (handles[i].isActive) { owner = handles[i]; break; }
    }
    update();
  };
  Handle.prototype.theme = function (name) {
    if (name === this.themeName) return;
    this.themeName = name;
    if (owner === this) update();
  };
  Handle.prototype.sfx = function (name, arg) {
    if (owner && owner !== this && owner.isActive) return; /* 다른 무대가 소리를 내는 중 */
    playSfx(name, arg);
  };
  /* 타임라인 큐: list = [[전역 시각, 이름, 인자], …]. prevT→t 사이(한 프레임 분량)만 울린다.
     탐색·반복·긴 멈춤 뒤에는 밀린 큐를 버린다(한꺼번에 터지지 않게). */
  Handle.prototype.cues = function (prevT, t, list, total) {
    if (!list || !list.length || owner !== this || !soundOn()) return;
    var dt = t - prevT;
    if (dt < 0) dt += total;
    if (dt <= 0 || dt > 0.25) return;
    for (var i = 0; i < list.length; i++) {
      var c = list[i][0], hit;
      if (prevT <= t) hit = c > prevT && c <= t;
      else hit = c > prevT || c <= t; /* 끝에서 처음으로 넘어감 */
      if (hit) playSfx(list[i][1], list[i][2]);
    }
  };

  function attach(o) {
    var h = new Handle(o || {});
    handles.push(h);
    return h;
  }

  /* 장면 정의의 sfx(장면 안 시각) → 전역 큐 목록 */
  function flatten(scenes, starts, total) {
    var out = [];
    for (var i = 0; i < scenes.length; i++) {
      var s = scenes[i].sfx || [];
      for (var k = 0; k < s.length; k++) {
        var g = starts[i] + s[k][0];
        g = ((g % total) + total) % total;
        out.push([g, s[k][1], s[k][2]]);
      }
    }
    return out;
  }

  /* ---------- 검증: OfflineAudioContext 렌더 ---------- */
  function render(name, sec, withSfx) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error('no OfflineAudioContext'));
    sec = sec || 10;
    var sr = 44100, ctx = new OAC(2, Math.floor(sr * sec), sr);
    var g = chain(ctx);
    /* 실시간과 같은 값: 마스터 0→1 (0.8초), 배경 버스 0→BG_LEVEL */
    g.master.gain.setValueAtTime(0, 0); g.master.gain.linearRampToValueAtTime(1, 0.8);
    g.bg.gain.setValueAtTime(0, 0); g.bg.gain.linearRampToValueAtTime(BG_LEVEL, 0.8);
    var b = new Bed(g, name);
    b.gain.gain.setValueAtTime(0, 0); b.gain.gain.linearRampToValueAtTime(b.th.lvl, 0.8);
    b.start(0); b.schedule(sec + 1);
    if (withSfx && withSfx.length) {
      /* 큐 목록 [[시각, 이름, 인자], …] 을 그대로 렌더(흐름도 검증용) */
      for (var q = 0; q < withSfx.length; q++) if (SFX[withSfx[q][1]] && withSfx[q][0] < sec) SFX[withSfx[q][1]](g, withSfx[q][0], withSfx[q][2]);
    } else if (withSfx) {
      SFX.whoosh(g, 1.0); SFX.count(g, 2.0, 1.4); SFX.ping(g, 4.2, 0); SFX.ping(g, 4.5, 5);
      SFX.boom(g, 6.0); SFX.whoosh(g, 7.4); SFX.ping(g, 8.6, 7);
    }
    return ctx.startRendering().then(function (buf) {
      var peak = 0, sum = 0, n = 0, silentRun = 0, maxSilent = 0, lastSecPeak = 0;
      var winRms = [], wsum = 0, wn = 0, W = sr * 0.5;
      for (var c = 0; c < buf.numberOfChannels; c++) {
        var d = buf.getChannelData(c);
        for (var i = 0; i < d.length; i++) {
          var a = Math.abs(d[i]);
          if (a > peak) peak = a;
          sum += d[i] * d[i]; n++;
          if (c === 0) {
            if (i > sr) { if (a < 1e-4) { silentRun++; if (silentRun > maxSilent) maxSilent = silentRun; } else silentRun = 0; }
            wsum += d[i] * d[i]; wn++;
            if (wn >= W) { winRms.push(Math.sqrt(wsum / wn)); wsum = 0; wn = 0; }
            if (i > d.length - sr && a > lastSecPeak) lastSecPeak = a;
          }
        }
      }
      var rms = Math.sqrt(sum / n);
      var db = function (v) { return v > 0 ? Math.round(20 * Math.log(v) / Math.LN10 * 10) / 10 : -Infinity; };
      return {
        theme: name, sfx: !!withSfx, seconds: sec,
        peak: Math.round(peak * 10000) / 10000, peakDb: db(peak),
        rms: Math.round(rms * 10000) / 10000, rmsDb: db(rms),
        maxWindowRmsDb: db(Math.max.apply(null, winRms)), minWindowRmsDbAfter1s: db(Math.min.apply(null, winRms.slice(2))),
        longestSilenceAfter1s: Math.round(maxSilent / sr * 1000) / 1000, lastSecondPeakDb: db(lastSecPeak)
      };
    });
  }

  window.FEETAudio = {
    supported: !!AC, attach: attach, flatten: flatten, render: render, themes: THEMES,
    isEnabled: function () { return enabled; },
    _state: function () {
      return { enabled: enabled, unlocked: unlocked, choiceMade: choiceMade, ctx: G ? G.ctx.state : 'none', bed: bedName, owner: owner ? owner.themeName : null, handles: handles.length };
    }
  };
})();
