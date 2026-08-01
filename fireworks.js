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
  let fadeAlpha = 0.18;
  let glowMode = "lighter";
  let maxAlpha = 1;

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
    particleScale = isMobile ? 0.42 : 1;
    fadeAlpha = isMobile ? 0.32 : 0.16;
    glowMode = isMobile ? "source-over" : "lighter";
    maxAlpha = isMobile ? 0.72 : 1;
    dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 2);
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

  // Real firework samples (Mixkit — free license)
  const SAMPLE_URLS = {
    whistle: ["sounds/whistle.mp3"],
    boom: [
      "sounds/bang.mp3",
      "sounds/clear.mp3",
      "sounds/small.mp3",
      "sounds/rockets.mp3",
      "sounds/whoosh-boom.mp3",
      "sounds/whoosh-bangs.mp3",
    ],
    multi: ["sounds/multi.mp3", "sounds/several.mp3"],
  };

  const sampleBuffers = { whistle: [], boom: [], multi: [] };
  let samplesReady = false;
  let samplesLoading = null;
  let lastBoomAt = 0;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  async function loadSamples() {
    const ac = ensureAudio();
    if (!ac) return false;
    if (samplesReady) return true;
    if (samplesLoading) return samplesLoading;

    samplesLoading = (async () => {
      const entries = Object.entries(SAMPLE_URLS);
      await Promise.all(
        entries.map(async ([key, urls]) => {
          const buffers = [];
          for (const url of urls) {
            try {
              const res = await fetch(url);
              if (!res.ok) continue;
              const arr = await res.arrayBuffer();
              const buf = await ac.decodeAudioData(arr.slice(0));
              buffers.push(buf);
            } catch (err) {
              console.warn("Sound load failed:", url, err);
            }
          }
          sampleBuffers[key] = buffers;
        })
      );
      samplesReady =
        sampleBuffers.boom.length > 0 ||
        sampleBuffers.whistle.length > 0 ||
        sampleBuffers.multi.length > 0;
      return samplesReady;
    })();

    return samplesLoading;
  }

  function playBuffer(buffer, opts = {}) {
    if (!soundOn || !buffer) return;
    const ac = ensureAudio();
    if (!ac) return;

    const {
      pan = 0,
      volume = 0.7,
      rate = 1,
      when = 0,
    } = opts;

    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const gain = ac.createGain();
    gain.gain.value = Math.max(0.0001, volume);

    if (ac.createStereoPanner) {
      const panner = ac.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      src.connect(gain);
      gain.connect(panner);
      panner.connect(ac.destination);
    } else {
      src.connect(gain);
      gain.connect(ac.destination);
    }

    const t = ac.currentTime + when;
    src.start(t);
    src.stop(t + buffer.duration / rate + 0.05);
  }

  function whoosh(x) {
    if (!soundOn || !samplesReady) return;
    const buf = pick(sampleBuffers.whistle);
    if (!buf) return;
    const pan = ((x / width) * 2 - 1) * 0.75;
    playBuffer(buf, {
      pan,
      volume: isMobile ? 0.35 : 0.45,
      rate: rand(0.92, 1.12),
    });
  }

  function boom(x, y, power = 1, kind = "peony") {
    if (!soundOn || !samplesReady) return;

    const now = performance.now();
    // Avoid overlapping into a wall of noise
    if (now - lastBoomAt < (isMobile ? 90 : 55)) return;
    lastBoomAt = now;

    const pan = ((x / width) * 2 - 1) * 0.85;
    const heightFactor = 0.65 + (1 - Math.min(1, y / height)) * 0.45;
    const pool =
      (kind === "double" || kind === "chrys") && sampleBuffers.multi.length
        ? sampleBuffers.multi
        : sampleBuffers.boom;
    const buf = pick(pool.length ? pool : sampleBuffers.boom);
    if (!buf) return;

    const baseVol = kind === "spark" ? 0.45 : 0.72;
    playBuffer(buf, {
      pan,
      volume: Math.min(1, baseVol * power * heightFactor * (isMobile ? 0.8 : 1)),
      rate: rand(0.88, 1.15),
    });

    // Occasional layered second crack for denser shells
    if (!isMobile && power > 1.1 && Math.random() > 0.55 && sampleBuffers.boom.length) {
      playBuffer(pick(sampleBuffers.boom), {
        pan: pan + rand(-0.2, 0.2),
        volume: 0.28 * power,
        rate: rand(1.05, 1.25),
        when: 0.04,
      });
    }
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

    boom(x, y, kind === "chrys" || kind === "double" ? 1.3 : kind === "spark" ? 0.75 : 1, kind);

    const sizeMul = isMobile ? 0.7 : 1;
    const glitterChance = isMobile ? 0.85 : 0.45;

    for (let i = 0; i < count; i++) {
      const angle =
        kind === "ring"
          ? (i / count) * Math.PI * 2 + rand(-0.04, 0.04)
          : rand(0, Math.PI * 2);
      const speed =
        kind === "ring"
          ? rand(4.2, 5.4)
          : kind === "willow"
            ? rand(2.2, 6.2)
            : kind === "spark"
              ? rand(1.4, 3.6)
              : rand(2.0, 7.5);

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay:
          kind === "willow"
            ? rand(0.008, 0.014)
            : kind === "spark"
              ? rand(0.016, 0.028)
              : rand(isMobile ? 0.012 : 0.008, isMobile ? 0.022 : 0.016),
        gravity: kind === "willow" ? 0.042 : 0.026,
        friction: kind === "willow" ? 0.987 : 0.975,
        size: (kind === "spark" ? rand(1.2, 2.1) : rand(1.3, 2.6)) * sizeMul,
        color: pick(base),
        glitter: Math.random() > glitterChance,
        willow: kind === "willow" && !isMobile,
      });
    }

    const coreCount = isMobile ? 6 : 28;
    for (let i = 0; i < coreCount; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.4, isMobile ? 1.8 : 3.2);
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: isMobile ? 0.65 : 1,
        decay: rand(0.04, 0.07),
        gravity: 0.01,
        friction: 0.96,
        size: rand(1.2, isMobile ? 2.2 : 5.5) * sizeMul,
        color: isMobile ? pick(base) : "#fff8e8",
        glitter: !isMobile,
        willow: false,
      });
    }

    if (!isMobile && (kind === "double" || Math.random() > 0.55)) {
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

    // Trail fade — stronger on mobile to avoid white washout
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(5, 8, 20, ${fadeAlpha})`;
    ctx.fillRect(0, 0, width, height);

    drawStars(ts);

    ctx.globalCompositeOperation = glowMode;

    // Rockets
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      if (r.delay > 0) {
        r.delay -= dt;
        continue;
      }

      if (!r.whistled) {
        r.whistled = true;
        if (soundOn && Math.random() > (isMobile ? 0.4 : 0.15)) whoosh(r.x);
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
        explode(r.x, r.y, r.palette, !isMobile && r.multi ? "double" : undefined);
        // Twin burst — desktop only (too bright on phones)
        if (!isMobile && (r.multi || Math.random() > 0.7)) {
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

      const alpha = Math.max(0, p.life) * maxAlpha;
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(p.color, alpha);
      ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * Math.min(1, p.life)), 0, Math.PI * 2);
      ctx.fill();

      if (p.glitter && !isMobile && Math.random() > 0.7) {
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

  soundBtn.addEventListener("click", async () => {
    if (!soundOn) {
      soundBtn.textContent = "Đang tải âm thanh…";
      soundBtn.disabled = true;
      const ok = await loadSamples();
      soundBtn.disabled = false;
      if (!ok) {
        soundBtn.textContent = "Không tải được âm thanh";
        return;
      }
      soundOn = true;
      soundBtn.setAttribute("aria-pressed", "true");
      soundBtn.textContent = "Tắt âm thanh";
      // Warm-up click so mobile browsers unlock audio
      ensureAudio();
    } else {
      soundOn = false;
      soundBtn.setAttribute("aria-pressed", "false");
      soundBtn.textContent = "Bật âm thanh";
    }
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
