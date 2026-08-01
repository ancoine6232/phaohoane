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

  // Real firework shell types
  const SHELLS = [
    { name: "peony", colors: ["#ff2d2d", "#ff6a4d", "#ffc9a8"], glitter: false },
    { name: "peony", colors: ["#2f8cff", "#78c0ff", "#d9eeff"], glitter: false },
    { name: "peony", colors: ["#18c97a", "#6dffb0", "#d6ffea"], glitter: false },
    { name: "chrys", colors: ["#ffd33d", "#ffe89a", "#fff6d8"], glitter: true },
    { name: "kamuro", colors: ["#f0c040", "#ffdb70", "#fff0b8"], glitter: true },
    { name: "willow", colors: ["#e8a820", "#f0c45a", "#ffe6a0"], glitter: true },
    { name: "palm", colors: ["#ff7a18", "#ffb040", "#ffe0a8"], glitter: true },
    { name: "ring", colors: ["#5ad0ff", "#9ae6ff", "#e8f9ff"], glitter: false },
    { name: "diadem", colors: ["#ff4d6d", "#ff8fa3", "#ffe0e6"], glitter: true },
    { name: "crossette", colors: ["#ffb703", "#ffd56a", "#fff2c2"], glitter: true },
    { name: "strobe", colors: ["#ffffff", "#e8f0ff", "#c7d7ff"], glitter: true },
    { name: "brocade", colors: ["#ffe566", "#fff1a8", "#ffffff"], glitter: true },
    { name: "violet", colors: ["#a855f7", "#c4b5fd", "#ede9fe"], glitter: false },
    { name: "fish", colors: ["#38bdf8", "#7dd3fc", "#e0f2fe"], glitter: true },
  ];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let rockets = [];
  let particles = [];
  let sparks = []; // tiny glitter trails
  let flashes = [];
  let stars = [];
  let lastTs = 0;
  let autoTimer = 0;
  let soundOn = false;
  let audioCtx = null;
  let isMobile = false;
  let quality = 1; // 0.65 mobile .. 1 desktop

  const nextNewYear = (() => {
    const now = new Date();
    let y = now.getFullYear() + 1;
    const thisNy = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    if (now < thisNy) y = now.getFullYear();
    return new Date(y, 0, 1, 0, 0, 0);
  })();

  yearLabel.textContent = String(nextNewYear.getFullYear());

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }
  function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    isMobile = width <= 640 || ("ontouchstart" in window && width <= 900);
    quality = isMobile ? 0.7 : 1;
    dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedStars();
  }

  function seedStars() {
    const n = Math.floor((width * height) / (isMobile ? 12000 : 8000));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * width,
      y: Math.random() * height * 0.7,
      r: rand(0.3, 1.4),
      a: rand(0.15, 0.6),
      tw: Math.random() * Math.PI * 2,
      sp: rand(0.4, 1.4),
    }));
  }

  // ——— AUDIO: chỉ tiếng nổ pháo thật (file sạch, không rít/crackle) ———
  const SAMPLE_FILES = {
    boom: ["bang.mp3", "clear.mp3"],
  };
  const sampleBuffers = { boom: [] };
  let samplesReady = false;
  let samplesLoading = null;
  let activeBooms = 0;

  function soundBases() {
    const bases = [];
    try {
      bases.push(new URL("sounds/", window.location.href).href);
    } catch (_) {}
    bases.push("./sounds/");
    bases.push("sounds/");
    return [...new Set(bases)];
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

  async function fetchSoundArrayBuffer(file) {
    let lastErr = null;
    for (const base of soundBases()) {
      const url = base.endsWith("/") ? base + file : base + "/" + file;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status}`);
          continue;
        }
        return await res.arrayBuffer();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("load fail");
  }

  async function decodeSound(ac, arrayBuffer) {
    const copy = arrayBuffer.slice(0);
    try {
      return await ac.decodeAudioData(copy);
    } catch (_) {
      return await new Promise((resolve, reject) => {
        ac.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      });
    }
  }

  function findPeakOffset(buffer) {
    const data = buffer.getChannelData(0);
    const step = Math.max(1, (data.length / 5000) | 0);
    let peak = 0;
    let idx = 0;
    for (let i = 0; i < data.length; i += step) {
      const v = Math.abs(data[i]);
      if (v > peak) {
        peak = v;
        idx = i;
      }
    }
    // Start slightly before the loudest bang in the recording
    return Math.max(0, (idx - Math.floor(buffer.sampleRate * 0.02)) / buffer.sampleRate);
  }

  async function loadSamples() {
    const ac = ensureAudio();
    if (!ac) return false;
    if (samplesReady) return true;
    if (samplesLoading) return samplesLoading;

    samplesLoading = (async () => {
      sampleBuffers.boom = [];
      for (const file of SAMPLE_FILES.boom) {
        try {
          const arr = await fetchSoundArrayBuffer(file);
          const buf = await decodeSound(ac, arr);
          sampleBuffers.boom.push({ buffer: buf, offset: findPeakOffset(buf) });
        } catch (err) {
          console.warn("sound fail", file, err);
        }
      }
      samplesReady = sampleBuffers.boom.length > 0;
      if (!samplesReady) samplesLoading = null;
      return samplesReady;
    })();
    return samplesLoading;
  }

  // Play one clean firework bang only — no whistle / crackle / synth
  function boomAt(x, y, power = 1) {
    if (!soundOn || !samplesReady || !sampleBuffers.boom.length) return;
    if (activeBooms >= 3) return;

    const ac = ensureAudio();
    if (!ac) return;

    const pan = ((x / width) * 2 - 1) * 0.8;
    const dist = 0.8 + (1 - clamp(y / height, 0, 1)) * 0.3;
    const sample = pick(sampleBuffers.boom);
    const src = ac.createBufferSource();
    src.buffer = sample.buffer;
    src.playbackRate.value = rand(0.97, 1.03);

    const g = ac.createGain();
    const t = ac.currentTime;
    const vol = clamp(0.75 * power * dist * (1 / (1 + activeBooms * 0.35)), 0.25, 0.92);
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol * 0.55, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);

    if (ac.createStereoPanner) {
      const panner = ac.createStereoPanner();
      panner.pan.value = pan;
      src.connect(g);
      g.connect(panner);
      panner.connect(ac.destination);
    } else {
      src.connect(g);
      g.connect(ac.destination);
    }

    const offset = Math.min(sample.buffer.duration - 0.1, sample.offset);
    const playLen = Math.min(0.95, sample.buffer.duration - offset);
    src.start(t, offset, playLen);

    activeBooms += 1;
    setTimeout(() => {
      activeBooms = Math.max(0, activeBooms - 1);
    }, 650);
  }

  // ——— VISUALS ———
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
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  function launch(x, targetY, shell, delay = 0) {
    const s = shell || pick(SHELLS);
    rockets.push({
      x,
      y: height + 8,
      vx: rand(-0.4, 0.4),
      vy: -rand(11.5, 15.5),
      targetY: targetY ?? rand(height * 0.12, height * 0.38),
      delay,
      trail: [],
      shell: s,
      lit: false,
    });
  }

  function spawnStar(x, y, angle, speed, color, opts = {}) {
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: opts.life ?? 1,
      decay: opts.decay ?? rand(0.008, 0.016),
      gravity: opts.gravity ?? 0.035,
      drag: opts.drag ?? 0.985,
      size: opts.size ?? rand(1.6, 2.8),
      color,
      sparkle: opts.sparkle ?? Math.random() > 0.55,
      willow: opts.willow ?? false,
      strobe: opts.strobe ?? false,
      fish: opts.fish ?? false,
      crossette: opts.crossette ?? false,
      splitAt: opts.splitAt ?? 0,
      flicker: Math.random() * Math.PI * 2,
    });
  }

  function explode(x, y, shell) {
    const s = shell || pick(SHELLS);
    const kind = s.name;
    // Exactly one real bang per shell break
    boomAt(x, y, kind === "kamuro" || kind === "chrys" ? 1.1 : 1);

    flashes.push({ x, y, life: 1, r: rand(20, 38) });

    const colors = s.colors;
    const n = (base) => Math.floor(base * quality);

    if (kind === "ring") {
      const count = n(100);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand(-0.02, 0.02);
        spawnStar(x, y, a, rand(5.8, 6.6), pick(colors), {
          decay: rand(0.012, 0.018),
          gravity: 0.028,
          size: rand(1.8, 2.7),
        });
      }
    } else if (kind === "willow" || kind === "kamuro") {
      const count = n(kind === "kamuro" ? 200 : 140);
      for (let i = 0; i < count; i++) {
        spawnStar(x, y, rand(0, Math.PI * 2), rand(2.2, 7.8), pick(colors), {
          decay: rand(0.004, 0.009),
          gravity: 0.05,
          drag: 0.992,
          size: rand(1.2, 2.3),
          willow: true,
          sparkle: true,
        });
      }
    } else if (kind === "palm") {
      const arms = 8 + ((Math.random() * 4) | 0);
      for (let a = 0; a < arms; a++) {
        const baseAng = -Math.PI / 2 + rand(-1.1, 1.1);
        for (let j = 0; j < n(14); j++) {
          spawnStar(x, y, baseAng + rand(-0.15, 0.15), rand(4, 8.5), pick(colors), {
            decay: rand(0.006, 0.012),
            gravity: 0.06,
            drag: 0.988,
            size: rand(1.5, 2.6),
            willow: true,
            sparkle: true,
          });
        }
      }
    } else if (kind === "chrys" || kind === "brocade") {
      for (let i = 0; i < n(170); i++) {
        spawnStar(x, y, rand(0, Math.PI * 2), rand(2.6, 8.5), pick(colors), {
          decay: rand(0.006, 0.013),
          gravity: 0.03,
          drag: 0.986,
          size: rand(1.5, 2.9),
          sparkle: true,
          willow: Math.random() > 0.6,
        });
      }
    } else if (kind === "diadem") {
      for (let i = 0; i < n(110); i++) {
        spawnStar(x, y, rand(0, Math.PI * 2), rand(3.5, 7.2), pick(colors), {
          decay: rand(0.01, 0.016),
          size: rand(1.7, 2.8),
        });
      }
      for (let i = 0; i < n(40); i++) {
        spawnStar(x, y, rand(0, Math.PI * 2), rand(0.8, 2.8), "#fff6d0", {
          decay: rand(0.02, 0.035),
          size: rand(2, 3.4),
          sparkle: true,
        });
      }
    } else if (kind === "crossette") {
      for (let i = 0; i < n(70); i++) {
        spawnStar(x, y, rand(0, Math.PI * 2), rand(3.2, 6.8), pick(colors), {
          decay: rand(0.008, 0.014),
          size: rand(1.8, 2.8),
          sparkle: true,
          crossette: true,
          splitAt: rand(0.45, 0.7),
        });
      }
    } else if (kind === "strobe") {
      for (let i = 0; i < n(100); i++) {
        spawnStar(x, y, rand(0, Math.PI * 2), rand(2.4, 6.5), pick(colors), {
          decay: rand(0.008, 0.015),
          gravity: 0.04,
          size: rand(1.8, 3.2),
          sparkle: true,
          strobe: true,
        });
      }
    } else if (kind === "fish") {
      for (let i = 0; i < n(90); i++) {
        const a = rand(-0.6, 0.6) + (Math.random() > 0.5 ? 0 : Math.PI);
        spawnStar(x, y, a + rand(-0.3, 0.3), rand(3, 7), pick(colors), {
          decay: rand(0.01, 0.018),
          gravity: 0.02,
          drag: 0.99,
          size: rand(1.4, 2.4),
          fish: true,
          sparkle: true,
        });
      }
    } else {
      for (let i = 0; i < n(130); i++) {
        spawnStar(x, y, rand(0, Math.PI * 2), rand(2.4, 7.4), pick(colors), {
          decay: rand(0.01, 0.017),
          gravity: 0.034,
          size: rand(1.7, 3.1),
          sparkle: s.glitter,
        });
      }
    }

    for (let i = 0; i < n(14); i++) {
      spawnStar(x, y, rand(0, Math.PI * 2), rand(0.4, 2.2), "#fff8e8", {
        decay: rand(0.045, 0.07),
        gravity: 0.01,
        size: rand(2, 4),
        sparkle: true,
      });
    }
  }

  function finale() {
    for (let i = 0; i < (isMobile ? 7 : 12); i++) {
      setTimeout(() => {
        launch(
          rand(width * 0.1, width * 0.9),
          rand(height * 0.14, height * 0.36),
          pick(SHELLS),
          0
        );
      }, i * 140);
    }
  }

  function updateCountdown() {
    let diff = nextNewYear.getTime() - Date.now();
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

  function step(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(32, ts - lastTs);
    lastTs = ts;

    // Night sky persistence — soft trails without white washout
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(4, 7, 18, ${isMobile ? 0.18 : 0.14})`;
    ctx.fillRect(0, 0, width, height);

    // Stars
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(ts * 0.001 * s.sp + s.tw);
      ctx.beginPath();
      ctx.fillStyle = `rgba(220, 230, 255, ${s.a * tw})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "lighter";

    // Rockets
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      if (r.delay > 0) {
        r.delay -= dt;
        continue;
      }
      if (!r.lit) {
        r.lit = true;
      }

      r.x += r.vx;
      r.y += r.vy;
      r.vy += 0.042; // gravity slows climb like a real shell
      r.trail.push({ x: r.x, y: r.y });
      if (r.trail.length > 22) r.trail.shift();

      // Continuous ember trail
      if (r.trail.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 200, 120, 0.55)";
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.moveTo(r.trail[0].x, r.trail[0].y);
        for (let t = 1; t < r.trail.length; t++) ctx.lineTo(r.trail[t].x, r.trail[t].y);
        ctx.stroke();
      }

      // Bright head
      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 245, 210, 0.95)";
      ctx.arc(r.x, r.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 160, 60, 0.35)";
      ctx.arc(r.x, r.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Ember sparks while rising
      if (Math.random() > 0.5) {
        sparks.push({
          x: r.x + rand(-1, 1),
          y: r.y + rand(0, 3),
          vx: rand(-0.3, 0.3),
          vy: rand(0.5, 1.5),
          life: 1,
          decay: 0.06,
          color: pick(r.shell.colors),
          size: rand(0.8, 1.5),
        });
      }

      if (r.vy >= -0.8 || r.y <= r.targetY) {
        explode(r.x, r.y, r.shell);
        rockets.splice(i, 1);
      }
    }

    // Main stars
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      if (p.fish) {
        p.vx += Math.sin(p.flicker * 2.2) * 0.08;
        p.vy += Math.cos(p.flicker * 1.6) * 0.04;
      }

      p.vx *= p.drag;
      p.vy *= p.drag;
      p.vy += p.gravity * (dt / 16);
      p.x += p.vx * (dt / 16) * 0.95;
      p.y += p.vy * (dt / 16) * 0.95;
      p.life -= p.decay * (dt / 16);
      p.flicker += p.strobe ? 0.9 : 0.35;

      // Crossette: star breaks into 4 (visual only, no sound)
      if (p.crossette && p.life < p.splitAt) {
        p.crossette = false;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + rand(-0.2, 0.2);
          spawnStar(p.x, p.y, a, rand(1.8, 3.4), p.color, {
            decay: 0.025,
            size: p.size * 0.7,
            sparkle: true,
            life: p.life * 0.9,
          });
        }
        particles.splice(i, 1);
        continue;
      }

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const flicker = p.strobe
        ? Math.sin(p.flicker * 3) > 0
          ? 1
          : 0.15
        : p.sparkle
          ? 0.65 + 0.35 * Math.abs(Math.sin(p.flicker))
          : 1;
      const a = clamp(p.life * flicker, 0, 1) * (isMobile ? 0.75 : 0.95);
      const rad = p.size * (0.5 + 0.5 * p.life);

      // Soft bloom
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(p.color, a * 0.22);
      ctx.arc(p.x, p.y, rad * 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = hexToRgba(p.color, a);
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();

      // Hot tip
      if (p.sparkle && Math.random() > 0.7) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 250, 230, ${a * 0.55})`;
        ctx.arc(p.x, p.y, rad * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // Willow gold dust
      if (p.willow && p.life < 0.7 && Math.random() > 0.78 && sparks.length < 2500) {
        sparks.push({
          x: p.x,
          y: p.y,
          vx: rand(-0.4, 0.4),
          vy: rand(0.3, 1.4),
          life: p.life * 0.8,
          decay: 0.025,
          color: p.color,
          size: rand(0.7, 1.3),
        });
      }
    }

    // Sparks / glitter
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.04;
      s.life -= s.decay;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(s.color, s.life * 0.7);
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Burst flashes
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.life -= 0.08;
      if (f.life <= 0) {
        flashes.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 245, 220, ${f.life * 0.35})`;
      ctx.arc(f.x, f.y, f.r * (1.2 - f.life * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";

    // Auto show pacing — like a real display, not machine-gun
    autoTimer -= dt;
    if (autoTimer <= 0) {
      const roll = Math.random();
      if (roll > 0.88) {
        finale();
        autoTimer = rand(3200, 4800);
      } else if (roll > 0.4) {
        const n = isMobile ? 2 + ((Math.random() * 2) | 0) : 3 + ((Math.random() * 3) | 0);
        for (let i = 0; i < n; i++) {
          launch(
            rand(width * 0.12, width * 0.88),
            rand(height * 0.14, height * 0.38),
            pick(SHELLS),
            i * rand(180, 320)
          );
        }
        autoTimer = rand(900, 1600);
      } else {
        launch(rand(width * 0.15, width * 0.85), undefined, pick(SHELLS), 0);
        autoTimer = rand(500, 1000);
      }
    }

    requestAnimationFrame(step);
  }

  function pointerLaunch(x, y) {
    const target = Math.max(height * 0.12, Math.min(y, height * 0.5));
    const n = isMobile ? 2 : 3;
    for (let i = 0; i < n; i++) {
      launch(x + rand(-40, 40), target + rand(-30, 30), pick(SHELLS), i * 90);
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    pointerLaunch(e.clientX, e.clientY);
  });

  soundBtn.addEventListener("click", async () => {
    if (!soundOn) {
      soundBtn.textContent = "Đang tải âm thanh…";
      soundBtn.disabled = true;
      try {
        ensureAudio();
        const ok = await loadSamples();
        if (!ok) {
          soundBtn.textContent = "Thử lại âm thanh";
          soundBtn.disabled = false;
          return;
        }
        soundOn = true;
        soundBtn.setAttribute("aria-pressed", "true");
        soundBtn.textContent = "Tắt âm thanh";
      } catch (err) {
        console.warn(err);
        soundBtn.textContent = "Thử lại âm thanh";
      }
      soundBtn.disabled = false;
    } else {
      soundOn = false;
      soundBtn.setAttribute("aria-pressed", "false");
      soundBtn.textContent = "Bật âm thanh";
    }
  });

  window.addEventListener("resize", resize);

  resize();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // Opening: spaced shells like a real show start
  for (let i = 0; i < (isMobile ? 5 : 8); i++) {
    launch(
      rand(width * 0.15, width * 0.85),
      rand(height * 0.16, height * 0.36),
      pick(SHELLS),
      300 + i * 280
    );
  }
  autoTimer = 1600;

  ctx.fillStyle = "#040712";
  ctx.fillRect(0, 0, width, height);
  requestAnimationFrame(step);
})();
