// Âm thanh của Nhà Mình — tự tổng hợp bằng Web Audio, không cần file âm thanh (nhẹ, chạy cả khi mất mạng).
// - Hiệu ứng: tiếng chạm, lời chào khi mở app, chuông khi người thân về nhà, lấp lánh khi lưu…
// - Nhạc nền: hộp nhạc + đệm hợp âm êm, tự sáng tác ngẫu nhiên nên không lặp lại nhàm chán.
// Trình duyệt chặn phát âm thanh trước lần chạm đầu tiên → lời chào được hẹn lại tới lúc đó.

const AC = window.AudioContext || window.webkitAudioContext;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const MUSIC_VOL = 0.4;
const SFX_VOL = 0.8;
const HELLO_WAIT = 15e3;     // chạm lần đầu trong 15 giây sau khi mở app thì vẫn chào
const AWAY_HELLO = 60e3;     // rời app hơn 1 phút rồi quay lại thì chào lại (nhẹ hơn)

let ctx = null, out, sfxBus, musicBus, padBus;
let sfxOn = true, musicOn = true;
let helloAt = 0, helloKind = "hello";
let hiddenAt = 0;
let tapTimer = 0;
let music = null; // { next, step, bar, prog, chord, idx, rest, timer }

/* ---------------- Dựng hệ thống âm thanh ---------------- */

function ensure() {
  if (ctx || !AC) return ctx;
  // iOS: hoà cùng nhạc đang mở (không cắt Spotify/YouTube) và im khi gạt nút im lặng.
  try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch { /* bỏ qua */ }
  try { ctx = new AC(); } catch { return null; }

  const comp = ctx.createDynamicsCompressor(); // chống rè khi nhiều âm chồng nhau
  comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
  comp.attack.value = 0.005; comp.release.value = 0.2;
  out = gain(1);
  out.connect(comp).connect(ctx.destination);

  const verb = ctx.createConvolver(); // vang nhẹ như trong phòng
  verb.buffer = impulse(2.4);
  verb.connect(gain(0.32, out));

  sfxBus = gain(SFX_VOL, out);
  sfxBus.connect(gain(0.22, verb));

  const soften = ctx.createBiquadFilter(); // nhạc nền mềm, không chói
  soften.type = "lowpass"; soften.frequency.value = 3800;
  soften.connect(out);
  soften.connect(gain(0.55, verb));
  musicBus = gain(0, soften);

  padBus = ctx.createBiquadFilter();
  padBus.type = "lowpass"; padBus.frequency.value = 1100; padBus.Q.value = 0.4;
  padBus.connect(musicBus);

  ctx.onstatechange = onState;
  return ctx;
}

function gain(v, to) {
  const g = ctx.createGain();
  g.gain.value = v;
  if (to) g.connect(to);
  return g;
}

function impulse(sec) {
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

const running = () => ctx?.state === "running";

function onState() {
  if (!running()) return;
  if (helloAt && Date.now() - helloAt < HELLO_WAIT) (helloKind === "back" ? playBack : playHello)();
  helloAt = 0;
  if (musicOn && document.visibilityState === "visible") startMusic();
}

// Mở khoá âm thanh ở lần chạm/nhấn phím (chỉ những sự kiện này mới được trình duyệt cho phép).
function unlock() {
  if (!ensure()) return;
  if (ctx.state !== "running" && document.visibilityState === "visible") ctx.resume().catch(() => {});
}
for (const ev of ["pointerdown", "pointerup", "touchend", "mousedown", "keydown"]) {
  document.addEventListener(ev, unlock, { capture: true, passive: true });
}

document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.visibilityState === "hidden") {
    hiddenAt = Date.now();
    stopMusic(0.3);
    setTimeout(() => { if (document.visibilityState === "hidden") ctx.suspend().catch(() => {}); }, 400);
  } else {
    const away = hiddenAt && Date.now() - hiddenAt > AWAY_HELLO;
    hiddenAt = 0;
    if (away && sfxOn) { helloAt = Date.now(); helloKind = "back"; }
    if (running()) onState(); else ctx.resume().catch(() => {}); // iOS có thể cần chạm lại → onState lo
  }
});

/* ---------------- Nhạc cụ ---------------- */

function tone(bus, f, t, dur, vol, { type = "sine", attack = 0.004, to = 0, detune = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + Math.min(dur, 0.12));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// Chuông / hộp nhạc: âm gốc + vài bồi âm tắt nhanh hơn.
function bell(bus, m, t, vol = 0.2, dur = 1.6) {
  const f = hz(m);
  tone(bus, f, t, dur, vol);
  tone(bus, f * 2, t, dur * 0.5, vol * 0.3);
  tone(bus, f * 3.01, t, dur * 0.25, vol * 0.12);
  tone(bus, f * 4.17, t, dur * 0.12, vol * 0.06);
}

// Tiếng "pụp" mềm khi chạm.
function pop(f, t, vol = 0.16, dur = 0.09) {
  tone(sfxBus, f, t, dur, vol, { to: f * 0.55, attack: 0.002 });
  tone(sfxBus, f * 2.4, t, dur * 0.4, vol * 0.18, { attack: 0.002 });
}

// Tiếng "vút" bằng nhiễu trắng lọc quét tần số.
function swish(t, up = false, vol = 0.12, dur = 0.28) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass"; f.Q.value = 1.2;
  f.frequency.setValueAtTime(up ? 500 : 2400, t);
  f.frequency.exponentialRampToValueAtTime(up ? 2400 : 450, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
}

const sparkleNotes = [84, 86, 89, 91, 93, 96, 98]; // C6 D6 F6 G6 A6 C7 D7
function sparkle(t, n = 6, vol = 0.07, spread = 0.07) {
  for (let i = 0; i < n; i++) bell(sfxBus, pick(sparkleNotes), t + i * spread + rand(0, 0.03), vol * rand(0.6, 1), 0.7);
}

/* ---------------- Hiệu ứng ---------------- */

// Mọi hiệu ứng đi qua đây: tắt âm / chưa mở khoá thì im lặng, và huỷ tiếng chạm đang chờ
// (bấm nút có âm riêng thì chỉ nghe âm riêng, không nghe thêm tiếng chạm).
function play(fn) {
  clearTimeout(tapTimer);
  if (!sfxOn || !running()) return;
  fn(ctx.currentTime + 0.01);
}

function playHello() {
  play((t) => {
    [77, 81, 84, 89].forEach((m, i) => bell(sfxBus, m, t + i * 0.09, 0.2, 1.4)); // F A C F — "xin chào!"
    sparkle(t + 0.4, 4, 0.05);
  });
}
function playBack() {
  play((t) => { bell(sfxBus, 84, t, 0.14, 1); bell(sfxBus, 89, t + 0.1, 0.16, 1.3); });
}

export const sound = {
  // Gọi khi hiện màn hình đầu tiên. Chưa được phép phát thì hẹn tới lần chạm đầu.
  hello() {
    if (!ensure()) return;
    if (running()) playHello();
    else { helloAt = Date.now(); helloKind = "hello"; }
  },
  // Chạm nút bình thường. Hoãn một nhịp để nếu nút đó có âm riêng thì âm riêng thắng.
  tap() {
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      if (sfxOn && running()) pop(rand(820, 900), ctx.currentTime + 0.005, 0.12);
    }, 0);
  },
  // Nảy bảng danh sách sang nấc khác.
  snap(up = true) { play((t) => pop(up ? 620 : 480, t, 0.12, 0.08)); },
  select() { play((t) => { pop(700, t, 0.12); bell(sfxBus, 81, t + 0.04, 0.1, 0.6); }); },
  back() { play((t) => pop(600, t, 0.12)); },
  open() { play((t) => swish(t, true, 0.2, 0.22)); },
  close() { play((t) => swish(t, false, 0.2, 0.25)); },
  // Vừa vào nhóm lần đầu: kèn chào mừng + pháo hoa.
  welcome() {
    play((t) => {
      [72, 77, 81, 84].forEach((m, i) => bell(sfxBus, m, t + i * 0.11, 0.18, 1.2));
      [77, 81, 84, 89].forEach((m) => bell(sfxBus, m, t + 0.5, 0.11, 2.2));
      sparkle(t + 0.55, 10, 0.06, 0.06);
    });
  },
  // Người thân đến một địa điểm. Về nhà thì "kính coong" như chuông cửa.
  arrive(home = false) {
    play((t) => {
      if (home) { bell(sfxBus, 88, t, 0.24, 1.6); bell(sfxBus, 84, t + 0.42, 0.24, 2.2); }
      else [81, 84, 89].forEach((m, i) => bell(sfxBus, m, t + i * 0.1, 0.18, 1.3));
      sparkle(t + 0.5, 5, 0.05);
    });
  },
  // Người thân rời đi: hai nốt đi xuống, "tạm biệt".
  leave() { play((t) => { bell(sfxBus, 84, t, 0.15, 1); bell(sfxBus, 79, t + 0.16, 0.15, 1.4); }); },
  // Lưu xong (địa điểm, cài đặt, ảnh…).
  success(big = false) {
    play((t) => {
      [84, 88, 91].forEach((m, i) => bell(sfxBus, m, t + i * 0.06, 0.14, 0.9));
      if (big) sparkle(t + 0.2, 7, 0.06);
    });
  },
  // Bấm lần 1 nút xoá (cảnh báo), và khi đã xoá.
  warn() { play((t) => { pop(380, t, 0.16, 0.12); pop(380, t + 0.13, 0.12, 0.12); }); },
  remove() { play((t) => { swish(t, false, 0.08, 0.3); bell(sfxBus, 72, t + 0.05, 0.12, 0.8); bell(sfxBus, 67, t + 0.17, 0.12, 1); }); },
  error() { play((t) => { tone(sfxBus, 220, t, 0.18, 0.12, { type: "triangle" }); tone(sfxBus, 185, t + 0.14, 0.24, 0.12, { type: "triangle" }); }); },

  get sfx() { return sfxOn; },
  get music() { return musicOn; },
  setSfx(on) { sfxOn = !!on; },
  setMusic(on) {
    musicOn = !!on;
    if (musicOn) { unlock(); if (running()) startMusic(); } else stopMusic(0.8);
  },
};

/* ---------------- Nhạc nền ---------------- */
// Fa trưởng, 72 nhịp/phút. Mỗi ô nhịp một hợp âm; hộp nhạc đi nốt ngũ cung ngẫu nhiên
// (ưu tiên nốt trong hợp âm ở phách mạnh), thỉnh thoảng nghỉ một ô cho thoáng.

const BEAT = 60 / 72;
const CHORDS = {
  F: { bass: 53, pad: [57, 60, 64, 65] },
  Dm: { bass: 50, pad: [57, 60, 62, 65] },
  Bb: { bass: 46, pad: [58, 62, 65, 69] },
  C: { bass: 48, pad: [55, 60, 64, 67] },
  Am: { bass: 45, pad: [57, 60, 64, 69] },
};
const PROGS = [["F", "Dm", "Bb", "C"], ["Bb", "C", "Am", "Dm"], ["F", "C", "Dm", "Bb"], ["Dm", "Bb", "F", "C"]];
const MELODY = [72, 74, 77, 79, 81, 84, 86]; // C5 D5 F5 G5 A5 C6 D6 — ngũ cung Fa

function padChord(notes, t, dur) {
  for (const m of notes) {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = hz(m);
      o.detune.value = det;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.022, t + 1.2);
      g.gain.setValueAtTime(0.022, t + dur - 0.3);
      g.gain.linearRampToValueAtTime(0, t + dur + 1.4);
      o.connect(g).connect(padBus);
      o.start(t);
      o.stop(t + dur + 1.5);
    }
  }
}

function bass(m, t) {
  tone(musicBus, hz(m), t, BEAT * 3.6, 0.09, { attack: 0.03 });
  tone(musicBus, hz(m) * 2, t, BEAT * 1.5, 0.025, { type: "triangle", attack: 0.03 });
}

function scheduleMusic() {
  if (!music) return;
  while (music.next < ctx.currentTime + 0.6) {
    const t = music.next, s = music.step;
    if (s === 0) {
      if (music.bar % 4 === 0) music.prog = pick(PROGS);
      const ch = CHORDS[music.prog[music.bar % 4]];
      music.chord = ch;
      music.rest = music.bar > 0 && Math.random() < 0.18;
      padChord(ch.pad, t, BEAT * 4);
      bass(ch.bass, t);
    }
    if (!music.rest) {
      const p = s === 0 ? 0.75 : s % 2 === 0 ? 0.45 : 0.2;
      if (Math.random() < p) {
        music.idx = Math.max(0, Math.min(MELODY.length - 1, music.idx + pick([-2, -1, -1, 0, 1, 1, 2])));
        if (s % 4 === 0) { // phách mạnh: kéo về nốt gần nhất trong hợp âm
          const pcs = music.chord.pad.map((m) => m % 12);
          let best = music.idx;
          for (let d = 0; d < MELODY.length; d++) {
            const c = [music.idx - d, music.idx + d].find((i) => i >= 0 && i < MELODY.length && pcs.includes(MELODY[i] % 12));
            if (c !== undefined) { best = c; break; }
          }
          music.idx = best;
        }
        const swing = s % 2 ? BEAT * 0.06 : 0;
        bell(musicBus, MELODY[music.idx], t + swing, rand(0.05, 0.085), rand(1.4, 2.2));
      }
    }
    music.next += BEAT / 2;
    music.step = (s + 1) % 8;
    if (music.step === 0) music.bar++;
  }
}

function startMusic() {
  if (music || !musicOn || !running()) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(musicBus.gain.value, t);
  musicBus.gain.linearRampToValueAtTime(MUSIC_VOL, t + 3);
  music = { next: t + 0.15, step: 0, bar: 0, prog: PROGS[0], chord: CHORDS.F, idx: 2, rest: false };
  scheduleMusic();
  music.timer = setInterval(scheduleMusic, 150);
}

function stopMusic(fade = 0.6) {
  if (!music) return;
  clearInterval(music.timer);
  music = null;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(musicBus.gain.value, t);
  musicBus.gain.linearRampToValueAtTime(0, t + fade);
}
