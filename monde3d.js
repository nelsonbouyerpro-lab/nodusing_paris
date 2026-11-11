/* ════════════════════════════════════════════
   NODUSING PARIS — le monde 3D
   Chargé sur toutes les pages, avant script.js.

   1. LE MONDE : un réseau de nœuds en WebGL derrière chaque page.
      C'est le même univers partout (graine fixe) : on y avance en
      faisant défiler la page, et un clic sur un lien y fait plonger
      la caméra, qui ressort au même endroit sur la page suivante.
   2. L'INTERFACE : cartes qui basculent sous le curseur, contenus
      qui sortent de la profondeur au défilement, transitions.

   Code maison, zéro bibliothèque. Amélioration progressive : sans
   WebGL ou en « mouvement réduit », rien de tout cela ne s'active
   et le site reste celui d'avant.
   ════════════════════════════════════════════ */

/* ───────────── 1 · LE MONDE (WebGL) ───────────── */
(function () {
  "use strict";

  var root = document.documentElement;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var canvas = document.createElement("canvas");
  canvas.id = "monde";
  canvas.setAttribute("aria-hidden", "true");
  var gl = null;
  try {
    gl = canvas.getContext("webgl", { alpha: false, antialias: true, powerPreference: "high-performance" });
  } catch (e) { /* WebGL indisponible */ }
  if (!gl) return;

  /* ── L'univers : un tunnel de nœuds, creux en son centre ──
     La caméra file le long de l'axe z ; le creux garde le milieu
     de l'écran (là où vit le contenu) aux seuls nœuds lointains. */
  var L = 6000;                 // longueur du tunnel, qui boucle sur lui-même
  var FAR = 3600;               // au-delà, la brume a tout effacé
  var R_IN = 420, R_OUT = 1800;
  var small = Math.min(window.innerWidth, window.innerHeight) < 700;
  var COUNT = small ? 800 : 1500;
  var LINK = small ? 400 : 330; // portée des liens

  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = seeded(1789);

  var pts = new Float32Array(COUNT * 6);   // x, y, z, taille, sorte, phase
  for (var i = 0; i < COUNT; i++) {
    var a = rand() * 6.2832;
    var r = Math.sqrt(R_IN * R_IN + rand() * (R_OUT * R_OUT - R_IN * R_IN));
    var big = rand() < 0.07;
    pts[i * 6]     = Math.cos(a) * r;
    pts[i * 6 + 1] = Math.sin(a) * r;
    pts[i * 6 + 2] = rand() * L;
    pts[i * 6 + 3] = big ? 7 + rand() * 5 : 2.2 + rand() * 3;
    pts[i * 6 + 4] = rand() < 0.22 ? 1 : 0;      // 0 = bleu, 1 = bleu clair / blanc
    pts[i * 6 + 5] = rand() * 6.2832;
  }

  /* liens : chaque nœud rejoint ses deux plus proches voisins.
     La distance tient compte de la boucle du tunnel, et chaque lien
     garde le z de son milieu pour être replié d'un seul tenant. */
  var seg = [], seen = {};
  for (i = 0; i < COUNT; i++) {
    var b1 = -1, b2 = -1, d1 = LINK * LINK, d2 = d1;
    var xi = pts[i * 6], yi = pts[i * 6 + 1], zi = pts[i * 6 + 2];
    for (var j = 0; j < COUNT; j++) {
      if (j === i) continue;
      var dz = Math.abs(pts[j * 6 + 2] - zi);
      if (dz > L / 2) dz = L - dz;
      if (dz > LINK) continue;
      var dx = pts[j * 6] - xi, dy = pts[j * 6 + 1] - yi;
      var dd = dx * dx + dy * dy + dz * dz;
      if (dd < d1) { b2 = b1; d2 = d1; b1 = j; d1 = dd; }
      else if (dd < d2) { b2 = j; d2 = dd; }
    }
    [b1, b2].forEach(function (j) {
      if (j < 0) return;
      var key = i < j ? i + "_" + j : j + "_" + i;
      if (seen[key]) return;
      seen[key] = true;
      var zj = pts[j * 6 + 2];
      if (zj - zi > L / 2) zj -= L; else if (zi - zj > L / 2) zj += L;
      var mid = (zi + zj) / 2;
      seg.push(xi, yi, zi, mid, pts[i * 6 + 5], pts[j * 6], pts[j * 6 + 1], zj, mid, pts[j * 6 + 5]);
    });
  }
  var lines = new Float32Array(seg);

  /* ── Shaders ── */
  /* passage commun : repli dans le tunnel, puis vue caméra */
  var VIEW = [
    "uniform float uCamZ, uL, uF, uAspect, uTime;",
    "uniform vec3 uCam;",        // décalage x, y et roulis
    "uniform vec2 uLook;",       // lacet, tangage
    "vec3 toView(vec3 pos, float mid, float phase) {",
    "  float k = floor((mid - uCamZ + 200.0) / uL);",
    "  vec3 p = vec3(pos.xy, pos.z - uCamZ - k * uL);",
    "  p.xy += vec2(sin(uTime * 0.31 + phase), cos(uTime * 0.23 + phase * 1.7)) * 16.0;",
    "  p.xy -= uCam.xy;",
    "  float cr = cos(uCam.z), sr = sin(uCam.z);",
    "  p.xy = vec2(p.x * cr - p.y * sr, p.x * sr + p.y * cr);",
    "  float cy = cos(uLook.x), sy = sin(uLook.x);",
    "  p.xz = vec2(p.x * cy - p.z * sy, p.x * sy + p.z * cy);",
    "  float cp = cos(uLook.y), sp = sin(uLook.y);",
    "  p.yz = vec2(p.y * cp - p.z * sp, p.y * sp + p.z * cp);",
    "  return p;",
    "}",
    "float fog(float z) { return smoothstep(" + FAR.toFixed(1) + ", " + (FAR * 0.5).toFixed(1) + ", z) * smoothstep(50.0, 300.0, z); }"
  ].join("\n");

  var POINT_VS = [
    "attribute vec3 aPos; attribute vec3 aInfo;",
    VIEW,
    "uniform float uH, uFocus, uAperture, uFade;",
    "varying float vAlpha, vSoft, vKind;",
    "void main() {",
    "  vec3 p = toView(aPos, aPos.z, aInfo.z);",
    "  float z = max(p.z, 1.0);",
    "  float rad = aInfo.x * uF / z * uH * 0.5;",                 // rayon net, en pixels
    "  float coc = abs(1.0 / z - 1.0 / uFocus) * uAperture * uH;", // flou de profondeur de champ
    "  gl_PointSize = min(2.0 * (rad + coc) + 1.5, 240.0);",
    "  gl_Position = vec4(p.x * uF / uAspect, p.y * uF, 0.0, p.z);",
    "  float spread = rad / (rad + coc);",                         // un nœud flou s'étale : il pâlit d'autant
    "  vAlpha = fog(p.z) * uFade * mix(0.1, 1.0, pow(spread, 1.4));",
    "  vSoft = clamp(coc / (rad + coc), 0.0, 1.0);",
    "  vKind = aInfo.y;",
    "}"
  ].join("\n");

  var POINT_FS = [
    "precision mediump float;",
    "uniform vec3 uColA, uColB; uniform float uAdd, uGain;",
    "varying float vAlpha, vSoft, vKind;",
    "void main() {",
    "  float d = length(gl_PointCoord - 0.5) * 2.0;",
    "  float a = smoothstep(1.0, 1.0 - max(vSoft, 0.14), d) * vAlpha * uGain;",
    "  a *= mix(1.0, 0.72 + 0.28 * smoothstep(0.35, 0.95, d), vSoft);",   // liseré de bokeh
    "  vec3 c = mix(uColA, uColB, vKind);",
    "  gl_FragColor = vec4(c * a, a * (1.0 - uAdd));",
    "}"
  ].join("\n");

  var LINE_VS = [
    "attribute vec3 aPos; attribute vec2 aMid;",
    VIEW,
    "uniform float uH, uFocus, uAperture, uFade;",
    "varying float vAlpha;",
    "void main() {",
    "  vec3 p = toView(aPos, aMid.x, aMid.y);",
    "  float z = max(p.z, 1.0);",
    "  float coc = abs(1.0 / z - 1.0 / uFocus) * uAperture * uH;",
    "  gl_Position = vec4(p.x * uF / uAspect, p.y * uF, 0.0, p.z);",
    "  vAlpha = fog(p.z) * uFade * clamp(1.0 - coc / 7.0, 0.0, 1.0);",   // un trait ne se floute pas : il s'efface
    "}"
  ].join("\n");

  var LINE_FS = [
    "precision mediump float;",
    "uniform vec3 uColA; uniform float uAdd, uGain;",
    "varying float vAlpha;",
    "void main() { float a = vAlpha * uGain; gl_FragColor = vec4(uColA * a, a * (1.0 - uAdd)); }"
  ].join("\n");

  var BG_VS = "attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }";
  var BG_FS = [
    "precision mediump float;",
    "uniform vec2 uRes, uGlowAt; uniform vec3 uBg, uGlow; uniform float uGlowAmt;",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / uRes;",
    "  vec2 q = (uv - uGlowAt) * vec2(uRes.x / uRes.y, 1.0);",
    "  float g = exp(-dot(q, q) * 2.6);",                                  // halo au centre
    "  float edge = smoothstep(0.35, 1.25, length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));",
    "  vec3 c = uBg + uGlow * (g * uGlowAmt) - edge * 0.035 * (1.0 - uBg) - edge * 0.02 * uBg;",
    "  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);",
    "  gl_FragColor = vec4(c + (n - 0.5) / 255.0, 1.0);",                  // grain : pas de bandes dans le dégradé
    "}"
  ].join("\n");

  function program(vs, fs) {
    var p = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(function (s) {
      var sh = gl.createShader(s[0]);
      gl.shaderSource(sh, s[1]);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var k = 0; k < n; k++) {
      var name = gl.getActiveUniform(p, k).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u };
  }

  var pointProg, lineProg, bgProg;
  try {
    pointProg = program(POINT_VS, POINT_FS);
    lineProg = program(LINE_VS, LINE_FS);
    bgProg = program(BG_VS, BG_FS);
  } catch (e) {
    if (window.console) console.warn("monde3d : shaders refusés, repli sur le site 2D.", e);
    return;
  }

  function buffer(data) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }
  var pointBuf = buffer(pts), lineBuf = buffer(lines);
  var bgBuf = buffer(new Float32Array([-1, -1, 3, -1, -1, 3]));

  /* le canvas EST le fond de page : opaque, il peint lui-même la couleur du thème */
  canvas.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;height:100lvh;z-index:-1;pointer-events:none;display:block";
  document.body.insertBefore(canvas, document.body.firstChild);
  root.classList.add("gl-world");

  var W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
  }
  window.addEventListener("resize", resize);
  resize();

  /* ── Caméra ── */
  var pointer = { x: 0, y: 0 }, look = { x: 0, y: 0 };
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  var F_REST = 1.732;            // 1 / tan(30°) : champ de 60°
  var F_WARP = 1.05;             // grand angle pendant la plongée
  var DRIFT = 15;                // dérive lente vers l'avant, en unités par seconde

  /* arrivée : si l'on vient d'une autre page du site, on reprend le
     voyage là où il s'est arrêté, en décélérant */
  var z0 = rand() * L, arriving = false;
  try {
    var saved = JSON.parse(sessionStorage.getItem("monde") || "null");
    sessionStorage.removeItem("monde");
    if (saved && Date.now() - saved.at < 6000) { z0 = saved.z; arriving = true; }
  } catch (e) { /* stockage indisponible */ }

  var t0 = performance.now(), last = t0;
  var travel = 0;                // distance parcourue hors défilement
  var scrollZ = window.scrollY * 0.9;
  var leaveAt = 0;               // début de la plongée de sortie
  var theme = root.dataset.theme === "dark" ? 1 : 0;
  var camZ = z0;
  /* page de lecture (texte long) : le réseau se fait discret derrière */
  var CALM = document.querySelector("main > .container") ? 0.4 : 1;

  function mix(a, b, t) { return a + (b - a) * t; }
  function mix3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  function easeOut(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - Math.pow(1 - t, 3); }

  var BG = [[250 / 255, 250 / 255, 248 / 255], [11 / 255, 18 / 255, 32 / 255]];
  var COL_A = [[0, 47 / 255, 167 / 255], [91 / 255, 124 / 255, 1]];
  var COL_B = [[91 / 255, 124 / 255, 1], [0.86, 0.9, 1]];
  var GLOW = [[0.1, 0.2, 0.55], [0.16, 0.26, 0.75]];

  function setCommon(prog, time, F, fade, gain) {
    var u = prog.u;
    gl.uniform1f(u.uCamZ, camZ);
    gl.uniform1f(u.uL, L);
    gl.uniform1f(u.uF, F);
    gl.uniform1f(u.uAspect, W / H);
    gl.uniform1f(u.uTime, time);
    gl.uniform3f(u.uCam, look.x * 70, -look.y * 45, Math.sin(time * 0.05) * 0.06);
    gl.uniform2f(u.uLook, look.x * 0.07, look.y * 0.045);
    gl.uniform1f(u.uH, H);
    gl.uniform1f(u.uFocus, 1250);
    gl.uniform1f(u.uAperture, 5.5);
    gl.uniform1f(u.uFade, fade);
    gl.uniform1f(u.uAdd, theme);
    gl.uniform1f(u.uGain, gain);
    gl.uniform3fv(u.uColA, mix3(COL_A[0], COL_A[1], theme));
    if (u.uColB) gl.uniform3fv(u.uColB, mix3(COL_B[0], COL_B[1], theme));
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var time = (now - t0) / 1000;
    resize();

    theme += ((root.dataset.theme === "dark" ? 1 : 0) - theme) * Math.min(1, dt * 7);
    look.x += (pointer.x - look.x) * Math.min(1, dt * 2.5);
    look.y += (pointer.y - look.y) * Math.min(1, dt * 2.5);
    scrollZ += (window.scrollY * 0.9 - scrollZ) * Math.min(1, dt * 6);

    var speed = DRIFT, F = F_REST, fade = 1;
    var intro = easeOut(time / 1.6);
    if (arriving) {
      /* on sort de la plongée : très vite, puis de moins en moins */
      var k = Math.exp(-time * 3.2);
      speed += 2600 * k;
      F = mix(F_REST, F_WARP, k);
      fade = mix(1, 0.75, k);
    } else {
      speed += 420 * (1 - intro);
      fade = intro;
    }
    if (leaveAt) {
      var lv = Math.min(1, (now - leaveAt) / 450);
      speed += 5200 * lv * lv;
      F = mix(F, F_WARP, lv * lv);
    }
    travel += speed * dt;
    camZ = (z0 + travel + scrollZ) % L;

    gl.disable(gl.BLEND);
    gl.useProgram(bgProg.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, bgBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(bgProg.u.uRes, W, H);
    gl.uniform2f(bgProg.u.uGlowAt, 0.5 - look.x * 0.04, 0.56 + look.y * 0.04);
    gl.uniform3fv(bgProg.u.uBg, mix3(BG[0], BG[1], theme));
    gl.uniform3fv(bgProg.u.uGlow, mix3(GLOW[0], GLOW[1], theme));
    gl.uniform1f(bgProg.u.uGlowAmt, mix(-0.05, 0.2, theme));   // en clair : une ombre bleutée très légère
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* couleurs prémultipliées : alpha 0 = additif (sombre), alpha a = encre sur papier (clair) */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(lineProg.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    setCommon(lineProg, time, F, fade, mix(0.13, 0.3, theme) * CALM);
    gl.drawArrays(gl.LINES, 0, lines.length / 5);

    gl.useProgram(pointProg.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    setCommon(pointProg, time, F, fade, mix(0.42, 0.8, theme) * CALM);
    gl.drawArrays(gl.POINTS, 0, COUNT);
  }

  gl.bindAttribLocation(pointProg.p, 0, "aPos");
  gl.bindAttribLocation(pointProg.p, 1, "aInfo");
  gl.linkProgram(pointProg.p);
  gl.bindAttribLocation(lineProg.p, 0, "aPos");
  gl.bindAttribLocation(lineProg.p, 1, "aMid");
  gl.linkProgram(lineProg.p);
  gl.bindAttribLocation(bgProg.p, 0, "aPos");
  gl.linkProgram(bgProg.p);
  /* une nouvelle édition des liens invalide les emplacements d'uniformes : on les relit */
  [pointProg, lineProg, bgProg].forEach(function (prog) {
    var n = gl.getProgramParameter(prog.p, gl.ACTIVE_UNIFORMS);
    for (var k = 0; k < n; k++) {
      var name = gl.getActiveUniform(prog.p, k).name;
      prog.u[name] = gl.getUniformLocation(prog.p, name);
    }
  });

  requestAnimationFrame(frame);

  /* interface publique, pour les transitions de page */
  window.monde3d = {
    /* lance la plongée et retient où l'on est, pour la page suivante */
    leave: function () {
      leaveAt = performance.now();
      setTimeout(function () {
        try { sessionStorage.setItem("monde", JSON.stringify({ z: camZ, at: Date.now() })); } catch (e) { /* stockage indisponible */ }
      }, 380);
    },
    /* retour par l'historique (bfcache) : la page revient telle quelle */
    back: function () { leaveAt = 0; }
  };
})();

/* ───────────── 2 · L'INTERFACE EN 3D ───────────── */
(function () {
  "use strict";

  var root = document.documentElement;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.add("ui-3d");

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ── Bascule sous le curseur ──
     L'élément pivote vers le pointeur ; --gx/--gy placent le reflet.
     Souris et stylet seulement : au doigt il n'y a pas de survol. */
  function tilt(el, max) {
    el.classList.add("t3d");
    el.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var box = el.getBoundingClientRect();
      var px = clamp((e.clientX - box.left) / box.width, 0, 1);
      var py = clamp((e.clientY - box.top) / box.height, 0, 1);
      el.classList.add("tilting");
      el.style.setProperty("--cry", ((px - 0.5) * 2 * max).toFixed(2) + "deg");
      el.style.setProperty("--crx", ((0.5 - py) * 2 * max).toFixed(2) + "deg");
      el.style.setProperty("--gx", (px * 100).toFixed(1) + "%");
      el.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
    });
    el.addEventListener("pointerleave", function () {
      el.classList.remove("tilting");
      el.style.removeProperty("--crx");
      el.style.removeProperty("--cry");
    });
  }
  all(".work-card").forEach(function (el) { tilt(el, 11); });
  all(".brick-points li").forEach(function (el) { tilt(el, 7); });
  all(".shot img").forEach(function (el) { tilt(el, 9); });
  all(".app-icon").forEach(function (el) { tilt(el, 18); });

  /* ── Captures Brick Rogue : un mur courbe ──
     Chaque capture se tourne vers le centre de l'écran, d'autant
     plus qu'elle en est loin — y compris quand on fait défiler le rail. */
  var shots = all(".shot img"), rail = document.querySelector(".shots");
  function curveShots() {
    var mid = window.innerWidth / 2;
    shots.forEach(function (img) {
      var box = img.parentNode.getBoundingClientRect();
      var off = clamp((box.left + box.width / 2 - mid) / mid, -1.2, 1.2);
      img.style.setProperty("--bry", (-off * 24).toFixed(2) + "deg");
      img.style.setProperty("--bz", (-Math.abs(off) * 40).toFixed(1) + "px");
    });
  }
  if (shots.length) {
    curveShots();
    window.addEventListener("resize", curveShots);
    if (rail) rail.addEventListener("scroll", curveShots, { passive: true });
  }

  /* ── Panneau flottant (formulaire de contact) ──
     Il suit le pointeur de très peu, et se remet droit dès qu'on écrit. */
  var slab = document.getElementById("contactForm");
  if (slab) {
    var sx = 0, sy = 0, tx = 0, ty = 0;
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      tx = (e.clientX / window.innerWidth - 0.5) * 9;
      ty = (0.5 - e.clientY / window.innerHeight) * 6;
    }, { passive: true });
    (function sway() {
      var writing = slab.contains(document.activeElement);
      sx += ((writing ? 0 : tx) - sx) * 0.06;
      sy += ((writing ? 0 : ty) - sy) * 0.06;
      slab.style.setProperty("--sry", sx.toFixed(2) + "deg");
      slab.style.setProperty("--srx", sy.toFixed(2) + "deg");
      requestAnimationFrame(sway);
    })();
  }

  /* ── Les contenus sortent de la profondeur ──
     Tout ce qui est listé ici attend en retrait, puis vient se
     poser quand il entre dans l'écran. L'accueil a sa propre mise
     en scène (script.js) et n'est pas concerné. */
  var rising = all([
    ".site-header",
    ".game > *:not(.shots):not(.brick-points):not(.game-stage)",   // le plateau a sa propre mise en scène
    ".shot", ".brick-points li",
    ".contact > *",
    "main > .container > .lang-toggle",
    "main > .container > [lang] > *"
  ].join(","));

  if (rising.length && "IntersectionObserver" in window) {
    rising.forEach(function (el) { el.classList.add("rise"); });
    var wave = 0, waveTimer = 0;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);
        /* ceux qui entrent ensemble arrivent en cascade */
        var delay = Math.min(wave++, 12) * 70;
        clearTimeout(waveTimer);
        waveTimer = setTimeout(function () { wave = 0; }, 120);
        el.style.transitionDelay = delay + "ms";
        el.classList.add("in");
        /* une fois posé, l'élément rend la main (aux bascules notamment) */
        setTimeout(function () {
          el.classList.remove("rise", "in");
          el.style.transitionDelay = "";
        }, delay + 1000);
      });
    }, { rootMargin: "0px 0px -6% 0px" });
    rising.forEach(function (el) { io.observe(el); });
  }

  /* ── Transitions entre les pages ──
     Au clic sur un lien, la page part vers l'avant pendant que la
     caméra plonge dans le réseau ; la page suivante en ressort. */
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest && e.target.closest("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    if (!/^https?:$/.test(link.protocol)) return;                       // mailto:, tel:…
    if (link.origin === location.origin && link.pathname === location.pathname && link.hash) return;   // ancre
    e.preventDefault();
    root.classList.add("leaving");
    if (window.monde3d) window.monde3d.leave();
    setTimeout(function () { location.href = link.href; }, 430);
  });
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    root.classList.remove("leaving");
    if (window.monde3d) window.monde3d.back();
  });
})();
