// Slowly swirling white-dot galaxies in the black margins beside the main column.
// Zero dependencies. Galaxies sit in the margins beside the column on wide screens,
// and a big one (plus a small one) sits behind the text on every screen size.
// Respects prefers-reduced-motion (draws one still frame instead of animating).
(() => {
  const canvas = document.createElement("canvas");
  canvas.className = "galaxies";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const MIN_MARGIN = 90; // px; below this a margin is too narrow for a galaxy

  // Small seeded PRNG so every visit gets the same sky.
  const rng = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

  function makeGalaxy({ seed, count, arms, twist, tilt, incl, speed }) {
    const r = rng(seed);
    const stars = [];
    for (let i = 0; i < count; i++) {
      let rad, theta;
      if (r() < 0.12) {
        // dense bulge around the core
        rad = Math.pow(r(), 1.6) * 0.16;
        theta = r() * Math.PI * 2;
      } else {
        // spiral arms: angle grows with radius, scattered more near the core
        rad = 0.08 + Math.pow(r(), 0.85) * 0.92;
        const arm = Math.floor(r() * arms);
        const scatter = (r() + r() + r() - 1.5) * (0.55 - 0.3 * rad);
        theta = arm * ((Math.PI * 2) / arms) + twist * rad + scatter;
      }
      stars.push({
        rad,
        theta,
        size: 0.5 + r() * 1.1 + (rad < 0.2 ? 0.2 : 0),
        alpha: (0.35 + r() * 0.65) * (1 - 0.4 * rad),
        tw: 0.6 + r() * 1.8, // twinkle speed
        ph: r() * Math.PI * 2, // twinkle phase
      });
    }
    return { stars, tilt, incl, speed, cx: 0, cy: 0, R: 0, side: "" };
  }

  const galaxies = [
    { side: "left",  y: 0.27, scale: 1.0,  cfg: { seed: 11, count: 1800, arms: 2, twist: 5.5, tilt: -0.5, incl: 0.62, speed: -0.07 } },
    { side: "right", y: 0.66, scale: 1.0,  cfg: { seed: 23, count: 1800, arms: 3, twist: 4.5, tilt: 0.4,  incl: 0.55, speed: -0.06 } },
    { side: "left",  y: 0.8,  scale: 0.55, cfg: { seed: 37, count: 800, arms: 2, twist: 6.0, tilt: 0.9,  incl: 0.7,  speed: -0.09 } },
    { side: "right", y: 0.14, scale: 0.5,  cfg: { seed: 41, count: 700, arms: 2, twist: 5.0, tilt: -0.9, incl: 0.5,  speed: -0.08 } },
  ].map((g) => Object.assign(makeGalaxy(g.cfg), { side: g.side, y: g.y, scale: g.scale }));

  // Two galaxies that sit behind the text column (phone and desktop alike).
  // Same sky as before on phones; on wide screens they are mirrored so they don't echo the margin galaxies.
  const under = [
    makeGalaxy({ seed: 11, count: 1800, arms: 2, twist: 5.5, tilt: -0.5, incl: 0.62, speed: -0.07 }),
    makeGalaxy({ seed: 41, count: 700, arms: 2, twist: 5.0, tilt: -0.9, incl: 0.5, speed: -0.08 }),
  ];
  const everyGalaxy = galaxies.concat(under);
  const underBase = under.map((g) => ({ tilt: g.tilt, speed: g.speed }));

  // A sprinkle of lone background stars.
  const sky = (() => {
    const r = rng(99);
    return Array.from({ length: 140 }, () => ({
      x: r(), y: r(), size: 0.4 + r() * 0.9, alpha: 0.15 + r() * 0.5, tw: 0.5 + r() * 1.5, ph: r() * 6.28,
    }));
  })();

  const darkScheme = matchMedia("(prefers-color-scheme: dark)");
  // Galaxies behind the text column are dimmed so reading stays easy. Dots are white on black;
  // on a light page they switch to black so they show on the white column.
  // Spin: arms trail when speed is negative (angle grows with radius), so keep all speeds negative.
  let W = 0, H = 0, dpr = 1, marginL = 0, marginR = 0, behind = false, running = false, raf = 0;
  let colX = 0, colW = 0;
  const UNDER_DIM = 0.55;

  function layout() {
    W = innerWidth;
    H = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const wrap = document.querySelector(".wrap");
    const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, right: W };
    marginL = rect.left;
    marginR = W - rect.right;
    colX = rect.left;
    colW = rect.right - rect.left;
    behind = marginL < MIN_MARGIN && marginR < MIN_MARGIN; // phone-width: no usable margins

    // Margin galaxies (only where there is room).
    for (const g of galaxies) {
      const m = g.side === "left" ? marginL : marginR;
      g.cx = g.side === "left" ? m / 2 : W - m / 2;
      g.cy = H * g.y;
      g.R = Math.min(m * 0.47, H * 0.23) * g.scale;
      g.visible = m >= MIN_MARGIN;
    }

    // Galaxies behind the column: a big one mid-screen, a small one low on the right.
    under.forEach((g, i) => {
      g.visible = true;
      g.cx = i === 0 ? colX + colW / 2 : colX + colW * 0.82;
      g.cy = i === 0 ? H * 0.4 : H * 0.86;
      g.R = i === 0 ? Math.min(colW * 0.62, H * 0.3) : colW * 0.28;
      g.tilt = behind ? underBase[i].tilt : -underBase[i].tilt;
      g.speed = underBase[i].speed;
    });

    draw(0); // paint before the column goes transparent, so there is no flash
    const root = document.documentElement;
    root.classList.add("galaxy-bg");
    root.classList.toggle("galaxy-behind", behind);
    start();
  }

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const light = !darkScheme.matches;
    const underInk = light ? "0,0,0" : "255,255,255";

    // In light mode the column is white; the column background is transparent so the canvas paints it.
    if (light) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.fillRect(colX, 0, colW, H);
    }

    for (const s of sky) {
      const x = s.x * W;
      const inCol = x >= colX && x <= colX + colW;
      ctx.fillStyle = `rgb(${inCol ? underInk : "255,255,255"})`;
      ctx.globalAlpha = s.alpha * (inCol ? UNDER_DIM : 1) * (0.7 + 0.3 * Math.sin(t * s.tw + s.ph));
      ctx.fillRect(x, s.y * H, s.size, s.size);
    }

    for (const g of everyGalaxy) {
      if (!g.visible) continue;
      const isUnder = under.includes(g);
      const ink = isUnder ? underInk : "255,255,255";
      const dim = isUnder ? UNDER_DIM : 1;

      // soft glow at the core
      const glow = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.R * 0.3);
      glow.addColorStop(0, `rgba(${ink},${0.12 * dim})`);
      glow.addColorStop(1, `rgba(${ink},0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.fillRect(g.cx - g.R, g.cy - g.R, g.R * 2, g.R * 2);
      ctx.fillStyle = `rgb(${ink})`;

      const spin = t * g.speed;
      const cosT = Math.cos(g.tilt), sinT = Math.sin(g.tilt);
      for (const s of g.stars) {
        const a = s.theta + spin;
        const x = Math.cos(a) * s.rad * g.R;
        const y = Math.sin(a) * s.rad * g.R * g.incl;
        ctx.globalAlpha = s.alpha * dim * (0.75 + 0.25 * Math.sin(t * s.tw + s.ph));
        ctx.fillRect(g.cx + x * cosT - y * sinT, g.cy + x * sinT + y * cosT, s.size, s.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(ms) {
    draw(ms / 1000);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduceMotion.matches) {
      cancelAnimationFrame(raf);
      running = false;
      draw(0);
    } else if (!running) {
      running = true;
      raf = requestAnimationFrame(frame);
    }
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 100);
  });
  reduceMotion.addEventListener("change", () => { running = false; layout(); });
  darkScheme.addEventListener("change", () => { if (reduceMotion.matches) draw(0); });
  layout();
})();
