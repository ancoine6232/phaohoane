(() => {
  const canvas = document.getElementById("sky");
  const ctx = canvas.getContext("2d", { alpha: false });
  const yearLabel = document.getElementById("yearLabel");
  const soundBtn = document.getElementById("soundBtn");
  const countdownEls = {
    days: document.querySelector('[data-unit="days"]'),
    hours: document.querySelector('[data-unit="hours"]'),
    mins: document.querySelector('[data-unit="mins"]'),
    secs: document.querySelector('[data-unit="secs"]'),
  };

  const PALETTES = [
    ["#ff6b4a", "#ffd166", "#fff1c1"],
    ["#5eead4", "#67e8f9", "#e0f2fe"],
    ["#f472b6", "#fb7185", "#fecdd3"],
    ["#facc15", "#fb923c", "#fff7ed"],
    ["#a78bfa", "#c4b5fd", "#ede9fe"],
    ["#34d399", "#6ee7b7", "#ecfdf5"],
    ["#38bdf8", "#818cf8", "#e0e7ff"],
    ["#f87171", "#fda4af", "#ffe4e6"],
  ];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let rockets = [];
  let particles = [];
  let stars = [];
  let lastTs = 0;
  let autoTimer = 0;
  let soundOn = false;
  let audioCtx = null;
  let isMobile = false;
  let particleScale = 1;

  const nextNewYear = (() => {
    const now = new Date();
    let y = now.getFullYear() + 1;
    // If still before Jan 1 this calendar year, count to this year's New Year
    const thisNy = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    if (now < thisNy) y = now.getFullYear();
    return new Date(y, 0, 1, 0, 0, 0);
  })();

  yearLabel.textContent = String(nextNewYear.getFullYear());

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    isMobile = width <= 640 || ("ontouchstart" in window && width <= 900);
    particleScale = isMobile ? 0.55 : 1;
    dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedStars();
  }

  function seedStars() {
    const density = isMobile ? 14000 : 9000;
    const count = Math.floor((width * height) / density);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height * 0.72,
      r: Math.random() * 1.3 + 0.2,
      a: Math.random() * 0.55 + 0.15,
      tw: Math.random() * Math.PI * 2,
      sp: 0.4 + Math.random() * 1.2,
    }));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function makeNoiseBuffer(ac, duration, decayPow = 2) {
    const len = Math.floor(ac.sampleRate * duration);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decayPow);
    }
    return buf;
  }

  function routeStereo(ac, source, pan) {
    const gain = ac.createGain();
    if (ac.createStereoPanner) {
      const panner = ac.createStereoPanner();
      panner.pan.value = pan;
      source.connect(panner);
      panner.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(ac.destination);
    return gain;
  }

  function whoosh(x) {
    if (!soundOn) return;
    const ac = ensureAudio();
    if (!ac) return;

    const t = ac.currentTime;
    const pan = ((x / width) * 2 - 1) * 0.65;
    const src = ac.createBufferSource();
    src.buffer = makeNoiseBuffer(ac, 0.55, 1.4);

    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(1800, t + 0.35);
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.55);

    src.connect(filter);
    const gain = routeStereo(ac, filter, pan);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.035, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.start(t);
    src.stop(t + 0.55);
  }

  function cracklePop(ac, t, pan, power) {
    const pops = 6 + ((Math.random() * 8 * power) | 0);
    for (let i = 0; i < pops; i++) {
      const when = t + 0.04 + i * rand(0.025, 0.07) + Math.random() * 0.08;
      const src = ac.createBufferSource();
      src.buffer = makeNoiseBuffer(ac, 0.06, 4);

      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1800 + Math.random() * 3500;

      src.connect(hp);
      const gain = routeStereo(ac, hp, pan + rand(-0.25, 0.25));
      const vol = (0.025 + Math.random() * 0.04) * power;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(vol, when + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      src.start(when);
      src.stop(when + 0.06);
    }
  }

  function boom(x, y, power = 1) {
    if (!soundOn) return;
    const ac = ensureAudio();
    if (!ac) return;

    const t = ac.currentTime;
    const pan = ((x / width) * 2 - 1) * 0.75;
    const dist = 0.7 + (1 - y / height) * 0.45;
    const p = power * dist;

    // 1) Deep thump — like the pressure hit of a firework
    const thump = ac.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(95 + p * 30, t);
    thump.frequency.exponentialRampToValueAtTime(28, t + 0.28);
    const thumpGain = routeStereo(ac, thump, pan);
    thumpGain.gain.setValueAtTime(0.0001, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.55 * p, t + 0.008);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    thump.start(t);
    thump.stop(t + 0.35);

    // 2) Mid body bang — snappy explosion noise
    const bang = ac.createBufferSource();
    bang.buffer = makeNoiseBuffer(ac, 0.45, 1.8);
    const bangFilter = ac.createBiquadFilter();
    bangFilter.type = "lowpass";
    bangFilter.frequency.setValueAtTime(900 + p * 500, t);
    bangFilter.frequency.exponentialRampToValueAtTime(180, t + 0.35);
    bang.connect(bangFilter);
    const bangGain = routeStereo(ac, bangFilter, pan);
    bangGain.gain.setValueAtTime(0.0001, t);
    bangGain.gain.exponentialRampToValueAtTime(0.38 * p, t + 0.006);
    bangGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    bang.start(t);
    bang.stop(t + 0.45);

    // 3) Sharp attack transient
    const snap = ac.createBufferSource();
    snap.buffer = makeNoiseBuffer(ac, 0.08, 6);
    const snapHp = ac.createBiquadFilter();
    snapHp.type = "highpass";
    snapHp.frequency.value = 1200;
    snap.connect(snapHp);
    const snapGain = routeStereo(ac, snapHp, pan);
    snapGain.gain.setValueAtTime(0.0001, t);
    snapGain.gain.exponentialRampToValueAtTime(0.22 * p, t + 0.002);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    snap.start(t);
    snap.stop(t + 0.08);

    // 4) Spark crackles after the boom
    cracklePop(ac, t, pan, p);
  }

  function launch(x, targetY, palette, delay = 0, multi = false) {
    rockets.push({
      x,
      y: height + 10,
      vx: rand(-0.55, 0.55),
      vy: -rand(10.5, 14.5),
      targetY: targetY ?? rand(height * 0.12, height * 0.4),
      life: 0,
      delay,
      trail: [],
      palette: palette || pick(PALETTES),
      hueSpark: Math.random() > 0.3,
      multi,
      whistled: false,
    });
  }

  function explode(x, y, palette, style) {
    const kind = style || pick(["peony", "chrys", "ring", "willow", "spark", "double"]);
    const base = palette || pick(PALETTES);
    let count = Math.floor(140 * particleScale);

    if (kind === "peony") count = Math.floor((160 + ((Math.random() * 60) | 0)) * particleScale);
    if (kind === "chrys") count = Math.floor((200 + ((Math.random() * 80) | 0)) * particleScale);
    if (kind === "ring") count = Math.floor(110 * particleScale);
    if (kind === "willow") count = Math.floor(150 * particleScale);
    if (kind === "spark") count = Math.floor(90 * particleScale);
    if (kind === "double") count = Math.floor(130 * particleScale);

    boom(x, y, kind === "chrys" || kind === "double" ? 1.25 : 1);

    for (let i = 0; i < count; i++) {
      const angle =
        kind === "ring"
          ? (i / count) * Math.PI * 2 + rand(-0.04, 0.04)
          : rand(0, Math.PI * 2);
      const speed =
        kind === "ring"
          ? rand(5.2, 6.4)
          : kind === "willow"
            ? rand(2.8, 7.2)
            : kind === "spark"
              ? rand(1.6, 4.2)
              : rand(2.4, 9.2);

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay:
          kind === "willow"
            ? rand(0.006, 0.012)
            : kind === "spark"
              ? rand(0.014, 0.024)
              : rand(0.008, 0.016),
        gravity: kind === "willow" ? 0.042 : 0.026,
        friction: kind === "willow" ? 0.987 : 0.975,
        size: kind === "spark" ? rand(1.6, 2.8) : rand(1.8, 3.6),
        color: pick(base),
        glitter: Math.random() > 0.45,
        willow: kind === "willow",
      });
    }

    // Bright core flash
    for (let i = 0; i < 28; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.5, 3.2);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 1,
        decay: rand(0.03, 0.055),
        gravity: 0.01,
        friction: 0.96,
        size: rand(2.5, 5.5),
        color: "#fff8e8",
        glitter: true,
        willow: false,
      });
    }

    // Nested second bloom for denser sky
    if (kind === "double" || Math.random() > 0.55) {
      const inner = pick(PALETTES);
      for (let i = 0; i < 70; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(1.2, 4.2);
        particles.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 1,
          decay: rand(0.012, 0.02),
          gravity: 0.03,
          friction: 0.97,
          size: rand(1.4, 2.6),
          color: pick(inner),
          glitter: true,
          willow: false,
        });
      }
    }
  }

  function finaleBurst() {
    const cx = width * 0.5;
    const cy = height * 0.3;
    const bursts = isMobile ? 8 : 16;
    for (let i = 0; i < bursts; i++) {
      setTimeout(() => {
        explode(
          cx + rand(-width * 0.38, width * 0.38),
          cy + rand(-height * 0.12, height * 0.16),
          pick(PALETTES),
          pick(["peony", "chrys", "ring", "willow", "double"])
        );
      }, i * (isMobile ? 120 : 90));
    }
    const extra = isMobile ? 5 : 10;
    for (let i = 0; i < extra; i++) {
      launch(
        rand(width * 0.08, width * 0.92),
        rand(height * 0.12, height * 0.36),
        pick(PALETTES),
        80 + i * 110,
        true
      );
    }
  }

  function updateCountdown() {
    const now = Date.now();
    let diff = nextNewYear.getTime() - now;
    if (diff <= 0) {
      countdownEls.days.textContent = "00";
      countdownEls.hours.textContent = "00";
      countdownEls.mins.textContent = "00";
      countdownEls.secs.textContent = "00";
      return;
    }
    const days = Math.floor(diff / 86400000);
    diff %= 86400000;
    const hours = Math.floor(diff / 3600000);
    diff %= 3600000;
    const mins = Math.floor(diff / 60000);
    diff %= 60000;
    const secs = Math.floor(diff / 1000);

    countdownEls.days.textContent = String(days).padStart(2, "0");
    countdownEls.hours.textContent = String(hours).padStart(2, "0");
    countdownEls.mins.textContent = String(mins).padStart(2, "0");
    countdownEls.secs.textContent = String(secs).padStart(2, "0");
  }

  function drawStars(t) {
    for (const s of stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(t * 0.001 * s.sp + s.tw);
      ctx.beginPath();
      ctx.fillStyle = `rgba(230, 238, 255, ${s.a * twinkle})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(32, ts - lastTs);
    lastTs = ts;

    // Trail fade — slower so the sky stays glowing
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(5, 8, 20, 0.14)";
    ctx.fillRect(0, 0, width, height);

    drawStars(ts);

    ctx.globalCompositeOperation = "lighter";

    // Rockets
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      if (r.delay > 0) {
        r.delay -= dt;
        continue;
      }

      if (!r.whistled) {
        r.whistled = true;
        if (Math.random() > 0.45) whoosh(r.x);
      }

      r.x += r.vx;
      r.y += r.vy;
      r.vy += 0.035;
      r.life += dt;
      r.trail.push({ x: r.x, y: r.y, a: 1 });
      if (r.trail.length > 12) r.trail.shift();

      for (let t = 0; t < r.trail.length; t++) {
        const p = r.trail[t];
        const alpha = (t / r.trail.length) * 0.55;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 230, 180, ${alpha})`;
        ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = "#fff6d5";
      ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2);
      ctx.fill();

      if (r.hueSpark && Math.random() > 0.6) {
        particles.push({
          x: r.x,
          y: r.y,
          vx: rand(-0.4, 0.4),
          vy: rand(0.2, 1.2),
          life: 1,
          decay: 0.05,
          gravity: 0.02,
          friction: 0.96,
          size: 1.2,
          color: pick(r.palette),
          glitter: false,
          willow: false,
        });
      }

      if (r.vy >= -1.2 || r.y <= r.targetY) {
        explode(r.x, r.y, r.palette, r.multi ? "double" : undefined);
        // Occasional twin burst nearby
        if (r.multi || Math.random() > 0.7) {
          explode(
            r.x + rand(-50, 50),
            r.y + rand(-30, 30),
            pick(PALETTES),
            pick(["peony", "spark", "ring"])
          );
        }
        rockets.splice(i, 1);
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(p.color, alpha);
      ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * alpha), 0, Math.PI * 2);
      ctx.fill();

      if (p.glitter && Math.random() > 0.7) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
        ctx.arc(p.x, p.y, p.size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      if (p.willow && p.life < 0.55 && Math.random() > 0.82 && particles.length < 4500) {
        particles.push({
          x: p.x,
          y: p.y,
          vx: rand(-0.3, 0.3),
          vy: rand(0.4, 1.5),
          life: p.life * 0.7,
          decay: 0.03,
          gravity: 0.05,
          friction: 0.98,
          size: 1,
          color: p.color,
          glitter: true,
          willow: false,
        });
      }
    }

    ctx.globalCompositeOperation = "source-over";

    // Auto show — dense continuous barrage
    autoTimer -= dt;
    if (autoTimer <= 0) {
      const wave = Math.random();
      if (wave > 0.82) {
        finaleBurst();
        autoTimer = rand(isMobile ? 2200 : 1600, isMobile ? 3400 : 2600);
      } else if (wave > 0.35) {
        const n = isMobile ? 2 + ((Math.random() * 3) | 0) : 4 + ((Math.random() * 5) | 0);
        for (let i = 0; i < n; i++) {
          launch(
            rand(width * 0.06, width * 0.94),
            rand(height * 0.1, height * 0.42),
            pick(PALETTES),
            i * rand(40, 140),
            Math.random() > 0.5
          );
        }
        autoTimer = rand(isMobile ? 500 : 280, isMobile ? 1000 : 650);
      } else {
        const n = isMobile ? 1 + ((Math.random() * 2) | 0) : 2 + ((Math.random() * 2) | 0);
        for (let i = 0; i < n; i++) {
          launch(
            rand(width * 0.1, width * 0.9),
            undefined,
            pick(PALETTES),
            i * 60,
            true
          );
        }
        autoTimer = rand(isMobile ? 320 : 180, isMobile ? 700 : 420);
      }
    }

    requestAnimationFrame(step);
  }

  function hexToRgba(hex, a) {
    const h = hex.replace("#", "");
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function pointerLaunch(clientX, clientY) {
    const x = clientX;
    const y = Math.min(clientY, height * 0.55);
    const target = Math.max(height * 0.1, y);
    const n = isMobile ? 3 : 5;
    for (let i = 0; i < n; i++) {
      launch(
        x + rand(-70, 70),
        target + rand(-40, 40),
        pick(PALETTES),
        i * 70,
        true
      );
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    pointerLaunch(e.clientX, e.clientY);
  });

  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.setAttribute("aria-pressed", String(soundOn));
    soundBtn.textContent = soundOn ? "Tắt âm thanh" : "Bật âm thanh";
    if (soundOn) ensureAudio();
  });

  window.addEventListener("resize", resize);

  // Opening salvo
  resize();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  const opening = isMobile ? 7 : 14;
  for (let i = 0; i < opening; i++) {
    launch(
      rand(width * 0.08, width * 0.92),
      rand(height * 0.12, height * 0.4),
      pick(PALETTES),
      120 + i * 110,
      true
    );
  }
  autoTimer = 900;

  // First paint
  ctx.fillStyle = "#050814";
  ctx.fillRect(0, 0, width, height);
  requestAnimationFrame(step);
})();
