/* ════════════════════════════════════════════
   NODUSING PARIS — le monogramme en constellation (accueil)
   Chargé après script.js.

   Le N est une constellation, au sens propre : quatre étoiles
   principales placées à des profondeurs différentes, qui ne
   s'alignent en N que vues de face. Dès qu'on la fait tourner, la
   figure se déforme et révèle son relief — comme le ferait une vraie
   constellation vue d'ailleurs.

   · Les étoiles : un point, des aigrettes de diffraction, et le
     cercle du nœud d'origine, tracé fin comme sur une carte du ciel.
   · Les traits : des lignes nettes, doublées d'un ruban de poussière
     d'étoiles qui leur donne le poids du tracé du logo.
   · Autour : quelques étoiles secondaires reliées au N, et un champ
     d'étoiles qui donne la parallaxe.
   · La chorégraphie du logo SVG est conservée : la plume trace le N,
     les étoiles s'allument à son passage, l'onde part de l'étoile
     accent, puis une comète reparcourt la figure à chaque cycle.

   Tout est dessiné en points et en traits (WebGL), sans bibliothèque.
   Sans WebGL ou en « mouvement réduit », le SVG d'origine reste en place.
   ════════════════════════════════════════════ */
(function () {
  "use strict";

  var root = document.documentElement;
  var heroLogo = document.getElementById("heroLogo");
  var monogram = heroLogo && heroLogo.querySelector(".monogram");
  if (!monogram || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var canvas = document.createElement("canvas");
  canvas.className = "logo3d";
  canvas.setAttribute("aria-hidden", "true");
  var gl = null;
  try {
    gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
  } catch (e) { /* WebGL indisponible */ }
  if (!gl) return;

  var TAU = Math.PI * 2, RAD = Math.PI / 180;
  var CAM = 3.2, HALF = 0.3984;   // caméra à 3,2 unités ; demi-champ vertical 1,275 / 3,2

  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = seeded(2026);
  function gauss() { return (rand() + rand() + rand() + rand() - 2) * 0.87; }   // ≈ loi normale

  /* ── La figure ──
     Unités : celles du viewBox du logo (140 × 170) divisées par 100,
     centrées, y vers le haut. Chaque étoile a sa profondeur ; ses x, y
     sont corrigés de la perspective pour que, de face, la figure se
     superpose exactement au logo SVG qu'elle remplace. */
  var FRONT = [[-0.44, -0.58], [-0.44, 0.58], [0.44, -0.58], [0.44, 0.58]];   // le tracé passe par 0, 1, 2, 3
  var DEPTH = [0.10, -0.16, -0.05, 0.18];
  var ACCENT = 2;
  var RING = [0.10, 0.10, 0.13, 0.10];                 // rayon des nœuds du logo
  function place(x, y, z) { var k = (CAM + z) / CAM; return [x * k, y * k, z]; }
  var NODES = FRONT.map(function (p, i) { return place(p[0], p[1], DEPTH[i]); });

  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function dist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  var SEG_LEN = [dist3(NODES[0], NODES[1]), dist3(NODES[1], NODES[2]), dist3(NODES[2], NODES[3])];
  var PATH = SEG_LEN[0] + SEG_LEN[1] + SEG_LEN[2];

  /* étoiles secondaires : la figure se prolonge au-delà du N */
  var MINOR = [
    { from: 1,  at: place(-0.84, 0.80, -0.30) },
    { from: -1, at: place(-1.14, 0.56, 0.22) },         // -1 : reliée à la précédente
    { from: 3,  at: place(0.80, 0.88, 0.34) },
    { from: -1, at: place(1.16, 0.70, -0.18) },
    { from: 0,  at: place(-0.82, -0.72, 0.30) },
    { from: 2,  at: place(0.90, -0.40, -0.34) },
    { from: -1, at: place(1.22, -0.62, 0.16) }
  ];

  var small = Math.min(window.innerWidth, window.innerHeight) < 700;
  var pointData = [];           // x, y, z, taille, sorte, position sur le tracé, graine
  var lineData = [];            // voir LINE_VS

  function pushLine(a, b, s0, s1, kind, seed) {
    [[0, -1], [0, 1], [1, -1], [1, -1], [0, 1], [1, 1]].forEach(function (c) {
      lineData.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], s0, s1, kind, seed);
    });
  }

  /* les trois traits du N : ils s'arrêtent au cercle de chaque étoile,
     comme sur une carte du ciel */
  for (var i = 0; i < 3; i++) {
    var g0 = (RING[i] + 0.022) / SEG_LEN[i], g1 = (RING[i + 1] + 0.022) / SEG_LEN[i];
    pushLine(lerp3(NODES[i], NODES[i + 1], g0), lerp3(NODES[i], NODES[i + 1], 1 - g1), i + g0, i + 1 - g1, 0, rand());
  }

  /* le ruban de poussière d'étoiles, le long du tracé */
  var N_DUST = small ? 900 : 1500;
  for (i = 0; i < N_DUST; i++) {
    var along0 = rand() * PATH, sg = 0;
    while (sg < 2 && along0 > SEG_LEN[sg]) { along0 -= SEG_LEN[sg]; sg++; }
    var f = along0 / SEG_LEN[sg];
    var spread = rand() < 0.82 ? 0.017 : 0.05;          // un cœur dense, une frange diffuse
    var p = lerp3(NODES[sg], NODES[sg + 1], f);
    p[0] += gauss() * spread; p[1] += gauss() * spread; p[2] += gauss() * spread;
    /* rien dans le cercle des étoiles : il reste net */
    if (dist3(p, NODES[sg]) < RING[sg] + 0.012 || dist3(p, NODES[sg + 1]) < RING[sg + 1] + 0.012) { i--; continue; }
    pointData.push(p[0], p[1], p[2], 0.0035 + Math.pow(rand(), 2) * 0.008, 0, sg + f, rand());
  }

  /* un champ d'étoiles autour : c'est lui qui donne la parallaxe */
  for (i = 0; i < (small ? 60 : 110); i++) {
    pointData.push((rand() * 2 - 1) * 1.45, (rand() * 2 - 1) * 1.2, (rand() * 2 - 1) * 0.9,
      0.004 + Math.pow(rand(), 3) * 0.011, 1, 0, rand());
  }

  /* les étoiles secondaires et leurs liens */
  var prev = null;
  MINOR.forEach(function (m) {
    var from = m.from < 0 ? prev : NODES[m.from];
    var gap0 = (m.from < 0 ? 0.035 : RING[m.from] + 0.022) / dist3(from, m.at);
    var gap1 = 0.035 / dist3(from, m.at);
    var seed = rand();
    pushLine(lerp3(from, m.at, gap0), lerp3(from, m.at, 1 - gap1), 0, 1, 1, seed);
    pointData.push(m.at[0], m.at[1], m.at[2], 0.013 + rand() * 0.006, 2, 0, seed);
    prev = m.at;
  });

  var points = new Float32Array(pointData), lines = new Float32Array(lineData);
  var N_POINTS = points.length / 7, N_LINE_VERTS = lines.length / 12;

  /* ── Shaders ── */
  var PRECISION = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif"
  ].join("\n");

  /* passage commun : rotation de la figure, puis perspective */
  var VIEW = [
    "uniform mat3 uRot;",          // figure → vue
    "uniform float uBob, uAspect, uH;",
    "vec3 view(vec3 p) { vec3 v = uRot * p; v.y += uBob; return v; }",
    "vec2 ndc(vec3 v) { return v.xy / ((" + CAM.toFixed(1) + " + v.z) * " + HALF + ") * vec2(1.0 / uAspect, 1.0); }",
    "float pxPer(vec3 v) { return uH * 0.5 / ((" + CAM.toFixed(1) + " + v.z) * " + HALF + "); }"   // pixels par unité, à cette profondeur
  ].join("\n");

  /* poussière, champ d'étoiles, étoiles secondaires */
  var POINT_VS = [
    "attribute vec3 aPos; attribute vec4 aInfo;",       // taille, sorte, position sur le tracé, graine
    VIEW,
    "uniform float uProg, uTipS, uTipA, uTime, uMinor;",
    "varying float vAlpha, vCore, vTint, vKind;",
    "void main() {",
    "  float kind = aInfo.y, seed = aInfo.w;",
    "  vec3 p = aPos;",
    "  if (kind < 0.5) p += vec3(sin(uTime * 0.7 + seed * 40.0), cos(uTime * 0.9 + seed * 23.0), sin(uTime * 0.5 + seed * 61.0)) * 0.004;",
    "  vec3 v = view(p);",
    /* la poussière apparaît au passage de la plume ; le reste, ensuite */
    "  float vis = kind < 0.5 ? clamp((uProg - aInfo.z) / 0.05, 0.0, 1.0) : clamp(uMinor * 1.5 - seed * 0.5, 0.0, 1.0);",
    "  float twinkle = 1.0 + 0.4 * sin(uTime * (1.2 + fract(seed * 7.3) * 2.6) + seed * 50.0);",
    /* la comète fait étinceler la poussière qu'elle traverse */
    "  float u = (aInfo.z - uTipS) / 0.14;",
    "  float boost = kind < 0.5 ? 1.0 + 2.4 * exp(-u * u) * uTipA : 1.0;",
    "  float rad = aInfo.x * pxPer(v) * (1.0 + (boost - 1.0) * 0.22);",
    "  float dim = 1.0;",
    "  if (rad < 0.7) { dim = rad * rad / 0.49; rad = 0.7; }",
    "  float reach = kind > 1.5 ? 4.0 : 2.4;",
    "  gl_PointSize = 2.0 * rad * reach + 2.0;",
    "  gl_Position = vec4(ndc(v), 0.0, 1.0);",
    "  vAlpha = vis * dim * twinkle * boost * (1.0 - 0.3 * clamp(v.z, -1.0, 1.0));",   // plus proche, plus vive
    "  vCore = rad / (gl_PointSize * 0.5);",
    "  vTint = fract(seed * 3.7);",
    "  vKind = kind;",
    "}"
  ].join("\n");

  var POINT_FS = [
    PRECISION,
    "uniform vec3 uColA, uColB;",
    "uniform float uAdd, uGain, uGlow;",
    "varying float vAlpha, vCore, vTint, vKind;",
    "void main() {",
    "  float d = length(gl_PointCoord - 0.5) * 2.0;",
    "  float disc = smoothstep(1.0, 0.5, d / vCore);",
    "  float halo = pow(max(1.0 - d, 0.0), 2.5) * 0.5 * uGlow;",
    "  float a = min((disc + halo) * vAlpha * uGain, 1.0);",
    "  vec3 c = mix(uColA, uColB, smoothstep(0.55, 0.75, vTint));",
    "  gl_FragColor = vec4(c * a, a * (1.0 - uAdd));",
    "}"
  ].join("\n");

  /* les traits : des quadrilatères étirés entre deux points de la figure */
  var LINE_VS = [
    "attribute vec3 aA, aB;",
    "attribute vec2 aE;",        // extrémité (0 = A, 1 = B), côté (-1 / +1)
    "attribute vec4 aI;",        // position sur le tracé en A et en B, sorte (0 = le N, 1 = secondaire), graine
    VIEW,
    "uniform float uProg, uMinor, uLineW;",
    "varying float vS, vSide, vHalf, vKind, vOn;",
    "void main() {",
    "  float kind = aI.z;",
    /* le trait s'allonge avec la plume (le N) ou pousse depuis l'étoile (secondaires) */
    "  float grow = kind < 0.5 ? clamp((uProg - aI.x) / (aI.y - aI.x), 0.0, 1.0) : clamp(uMinor * 1.6 - aI.w * 0.6, 0.0, 1.0);",
    "  vec3 va = view(aA), vb = view(mix(aA, aB, grow));",
    "  vec2 sa = ndc(va), sb = ndc(vb);",
    "  vec2 dir = (sb - sa) * vec2(uAspect, 1.0);",
    "  float len = length(dir);",
    "  dir = len > 1e-5 ? dir / len : vec2(1.0, 0.0);",
    "  float halfW = kind < 0.5 ? uLineW * 9.0 : uLineW * 2.0;",       // le N porte un halo : il lui faut de la place
    "  vec2 off = vec2(-dir.y, dir.x) * aE.y * halfW * 2.0 / uH;",
    "  off.x /= uAspect;",
    "  gl_Position = vec4(mix(sa, sb, aE.x) + off, 0.0, 1.0);",
    "  vS = mix(aI.x, mix(aI.x, aI.y, grow), aE.x);",
    "  vSide = aE.y; vHalf = halfW; vKind = kind; vOn = step(0.001, grow);",
    "}"
  ].join("\n");

  var LINE_FS = [
    PRECISION,
    "uniform vec3 uCol, uColP;",
    "uniform float uAdd, uLineW, uGlow, uTipS, uTipA, uMinorA;",
    "varying float vS, vSide, vHalf, vKind, vOn;",
    "void main() {",
    "  float d = abs(vSide) * vHalf;",                                  // distance à l'axe, en pixels
    "  float isN = step(vKind, 0.5);",
    "  float w = uLineW * mix(0.34, 0.6, isN);",
    "  float core = 1.0 - smoothstep(w, w + 1.1, d);",                  // un trait net
    "  float glow = exp(-d / (uLineW * 2.4)) * 0.3 * uGlow * isN;",
    "  float u = (vS - uTipS) / 0.12;",
    "  float pulse = exp(-u * u) * uTipA * isN;",                       // la comète l'illumine au passage
    "  float a = min((core * mix(uMinorA, 1.0, isN) + glow) * (1.0 + pulse * 1.3) * vOn, 1.0);",
    "  gl_FragColor = vec4(mix(uCol, uColP, clamp(pulse, 0.0, 1.0)) * a, a * (1.0 - uAdd));",
    "}"
  ].join("\n");

  /* les grandes étoiles, les ondes et la comète : des vignettes carrées */
  var SPRITE_VS = [
    "attribute vec3 aPos; attribute vec2 aC; attribute vec4 aInfo;",   // demi-taille, sorte, opacité, graine
    VIEW,
    "varying vec2 vUv; varying float vKind, vAlpha, vAA, vSeed;",
    "void main() {",
    "  vec3 v = view(aPos);",
    "  float pp = aInfo.x * pxPer(v);",                                 // demi-taille en pixels
    "  vec2 off = aC * pp * 2.0 / uH;",
    "  off.x /= uAspect;",
    "  gl_Position = vec4(ndc(v) + off, 0.0, 1.0);",
    "  vUv = aC; vKind = aInfo.y; vAlpha = aInfo.z; vSeed = aInfo.w;",
    "  vAA = 1.0 / max(pp, 1.0);",                                      // un pixel, en unités de vignette
    "}"
  ].join("\n");

  var SPRITE_FS = [
    PRECISION,
    "uniform vec3 uInk, uAccent, uCore, uComet;",
    "uniform float uAdd, uHalo, uSpike, uRing, uCoreMix, uTime;",
    "varying vec2 vUv; varying float vKind, vAlpha, vAA, vSeed;",
    /* aigrettes : quatre branches longues, quatre courtes en diagonale */
    "float spikes(vec2 p, float thin, float reach) {",
    "  vec2 q = abs(p);",
    "  float s = exp(-q.y / thin) * exp(-q.x / reach) + exp(-q.x / thin) * exp(-q.y / reach);",
    "  vec2 dq = abs(vec2(p.x + p.y, p.x - p.y)) * 0.7071;",
    "  return s + (exp(-dq.y / (thin * 0.8)) * exp(-dq.x / (reach * 0.42)) + exp(-dq.x / (thin * 0.8)) * exp(-dq.y / (reach * 0.42))) * 0.45;",
    "}",
    "void main() {",
    "  float r = length(vUv);",
    "  float edge = 1.0 - smoothstep(0.78, 1.0, r);",                  // la vignette s'éteint avant son bord
    "  float a; vec3 c;",
    "  if (vKind < 1.5) {",                                             // une étoile (0 : principale · 1 : accent)
    "    float acc = step(0.5, vKind);",
    "    float rc = mix(0.085, 0.150, acc);",                          // le point
    "    float rr = mix(0.278, 0.283, acc);",                          // le cercle du nœud d'origine
    "    float disc = 1.0 - smoothstep(rc - vAA, rc + vAA, r);",
    "    float ring = (1.0 - smoothstep(vAA * 0.55, vAA * 1.7, abs(r - rr))) * uRing;",
    "    float tw = 0.85 + 0.15 * sin(uTime * 2.1 + vSeed * 30.0);",
    "    float halo = (exp(-r / (rc * 1.5)) * 0.8 + exp(-r * r / 0.07) * 0.2) * uHalo * tw * mix(1.0, 0.75, acc);",
    "    float sp = spikes(vUv, rc * 0.15, 0.26) * uSpike * tw;",
    "    a = disc + ring + (halo + sp) * edge;",
    "    c = mix(mix(uInk, uAccent, acc), uCore, disc * uCoreMix * mix(1.0, 0.5 * (1.0 - smoothstep(0.0, rc, r)), acc));",   // l'accent reste bleu : seul son cœur blanchit
    "  } else if (vKind < 2.5) {",                                      // une onde
    "    float q = (r - 0.9) / 0.03;",
    "    a = exp(-q * q);",
    "    c = uAccent;",
    "  } else {",                                                       // la comète
    "    float disc = 1.0 - smoothstep(0.10 - vAA, 0.10 + vAA, r);",
    "    a = disc + (exp(-r / 0.13) * 0.9 + spikes(vUv, 0.016, 0.3) * 0.9) * edge;",
    "    c = mix(uComet, uCore, disc * uCoreMix);",
    "  }",
    "  a = min(a * vAlpha, 1.0);",
    "  gl_FragColor = vec4(c * a, a * (1.0 - uAdd));",
    "}"
  ].join("\n");

  /* un voile de lumière qui épouse le tracé : la figure rayonne */
  var AURA_VS = "attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }";
  var AURA_FS = [
    PRECISION,
    "uniform vec2 uN[4];",         // les quatre étoiles, en pixels
    "uniform vec3 uCol; uniform float uProg, uSig, uAmt, uAdd, uPopA;",
    "float seg(vec2 p, vec2 a, vec2 b) {",
    "  vec2 pa = p - a, ba = b - a;",
    "  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-3), 0.0, 1.0));",
    "}",
    "void main() {",
    "  vec2 p = gl_FragCoord.xy;",
    "  float d = 1e5;",
    "  float s0 = clamp(uProg, 0.0, 1.0), s1 = clamp(uProg - 1.0, 0.0, 1.0), s2 = clamp(uProg - 2.0, 0.0, 1.0);",
    "  if (s0 > 0.0) d = min(d, seg(p, uN[0], mix(uN[0], uN[1], s0)));",
    "  if (s1 > 0.0) d = min(d, seg(p, uN[1], mix(uN[1], uN[2], s1)));",
    "  if (s2 > 0.0) d = min(d, seg(p, uN[2], mix(uN[2], uN[3], s2)));",
    "  vec2 da = p - uN[2];",
    "  float a = exp(-d * d / (uSig * uSig)) * uAmt + exp(-dot(da, da) / (uSig * uSig * 7.0)) * uAmt * 1.5 * uPopA;",
    "  gl_FragColor = vec4(uCol * a, a * (1.0 - uAdd));",
    "}"
  ].join("\n");

  function program(vs, fs, attribs) {
    var p = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(function (s) {
      var sh = gl.createShader(s[0]);
      gl.shaderSource(sh, s[1]);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    });
    attribs.forEach(function (name, i) { gl.bindAttribLocation(p, i, name); });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var k = 0; k < n; k++) {
      var name = gl.getActiveUniform(p, k).name.replace("[0]", "");
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u };
  }

  var pointProg, lineProg, spriteProg, auraProg;
  try {
    pointProg = program(POINT_VS, POINT_FS, ["aPos", "aInfo"]);
    lineProg = program(LINE_VS, LINE_FS, ["aA", "aB", "aE", "aI"]);
    spriteProg = program(SPRITE_VS, SPRITE_FS, ["aPos", "aC", "aInfo"]);
    auraProg = program(AURA_VS, AURA_FS, ["aPos"]);
  } catch (e) {
    if (window.console) console.warn("logo3d : shaders refusés, le logo SVG reste en place.", e);
    return;
  }

  function buffer(data, usage) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
    return b;
  }
  var pointBuf = buffer(points), lineBuf = buffer(lines);
  var quadBuf = buffer(new Float32Array([-1, -1, 3, -1, -1, 3]));
  var MAX_SPRITES = 8;          // 4 étoiles, 2 ondes, la comète (et une de marge)
  var spriteData = new Float32Array(MAX_SPRITES * 6 * 9);
  var spriteBuf = buffer(spriteData, gl.DYNAMIC_DRAW);

  function attribs(buf, stride, sizes) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    var offset = 0;
    for (var k = 0; k < 4; k++) {
      if (k < sizes.length) {
        gl.enableVertexAttribArray(k);
        gl.vertexAttribPointer(k, sizes[k], gl.FLOAT, false, stride, offset);
        offset += sizes[k] * 4;
      } else {
        gl.disableVertexAttribArray(k);
      }
    }
  }

  /* le canvas se pose sur le SVG, dans une enveloppe à ses dimensions */
  var wrap = document.createElement("div");
  wrap.className = "mono3d";
  monogram.parentNode.insertBefore(wrap, monogram);
  wrap.appendChild(monogram);
  wrap.appendChild(canvas);
  root.classList.add("gl-logo");

  var W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
  }

  /* ── Rotation : glissé + inertie, survol, balancement au repos ── */
  var pointer = { x: 0, y: 0, px: -1e4, py: -1e4, last: -1e9 };
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    pointer.px = e.clientX;
    pointer.py = e.clientY;
    pointer.last = performance.now();
  }, { passive: true });

  var dragging = false, lastX = 0, yawDrag = 0, yawVel = 0;
  canvas.addEventListener("pointerdown", function (e) {
    dragging = true;
    lastX = e.clientX;
    yawVel = 0;
    canvas.classList.add("dragging");
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture indisponible */ }
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    yawVel = (e.clientX - lastX) * 0.011;
    yawDrag += yawVel;
    lastX = e.clientX;
  });
  function release() { dragging = false; canvas.classList.remove("dragging"); }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  /* ── Chorégraphie (mêmes temps que l'animation SVG d'origine) ── */
  var POP_AT = [0.12, 0.89, 1.51, 2.0], POP_DUR = [0.55, 0.55, 0.65, 0.55];
  var CYCLE = 6.5;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  /* allumage avec léger dépassement, comme --ease-pop */
  function pop(t) {
    t = clamp01(t);
    var c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }
  /* position sur le tracé, pour un avancement u de 0 à 1 */
  function along(u) {
    var d = clamp01(u) * PATH, s = 0;
    while (s < 2 && d > SEG_LEN[s]) { d -= SEG_LEN[s]; s++; }
    var f = d / SEG_LEN[s];
    return { at: lerp3(NODES[s], NODES[s + 1], f), s: s + f };
  }

  var visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }).observe(canvas);
  }

  var start = performance.now();
  var hx = 0, hy = 0;            // inclinaison de survol, en degrés (sens CSS)
  var rot = new Float32Array(9), bob = 0;
  var flare = [0, 0, 0, 0];      // une étoile s'avive quand le curseur s'en approche
  var screenN = new Float32Array(8);

  /* le même calcul que view() + ndc() dans les shaders : où tombe un point, en pixels du canvas */
  function project(p) {
    var x = rot[0] * p[0] + rot[3] * p[1] + rot[6] * p[2];
    var y = rot[1] * p[0] + rot[4] * p[1] + rot[7] * p[2] + bob;
    var z = rot[2] * p[0] + rot[5] * p[1] + rot[8] * p[2];
    var k = 1 / ((CAM + z) * HALF);
    return [(x * k / (W / H) * 0.5 + 0.5) * W, (y * k * 0.5 + 0.5) * H];
  }

  var spriteCount = 0;
  function sprite(at, size, kind, alpha, seed) {
    if (spriteCount >= MAX_SPRITES || alpha <= 0.003 || size <= 0) return;
    var o = spriteCount * 54;
    [[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]].forEach(function (c) {
      spriteData[o++] = at[0]; spriteData[o++] = at[1]; spriteData[o++] = at[2];
      spriteData[o++] = c[0]; spriteData[o++] = c[1];
      spriteData[o++] = size; spriteData[o++] = kind; spriteData[o++] = alpha; spriteData[o++] = seed;
    });
    spriteCount++;
  }

  function setView(prog) {
    gl.uniformMatrix3fv(prog.u.uRot, false, rot);
    gl.uniform1f(prog.u.uBob, bob);
    gl.uniform1f(prog.u.uAspect, W / H);
    gl.uniform1f(prog.u.uH, H);
  }

  /* [jour, nuit] : encre sur papier le jour, lumière la nuit */
  function pick(day, night, dark) { return dark ? night : day; }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    resize();

    var T = (now - start) / 1000;
    var dark = root.dataset.theme === "dark";

    /* rotation */
    if (!dragging) {
      yawDrag += yawVel;
      yawVel *= 0.94;
      if (Math.abs(yawVel) < 0.004) yawDrag += (Math.round(yawDrag / TAU) * TAU - yawDrag) * 0.04;
    }
    var live = now - pointer.last < 3000 && !dragging;
    var tx = live ? pointer.x * 22 : Math.sin(T * 0.5) * 18;
    var ty = live ? -pointer.y * 13 : Math.cos(T * 0.37) * 6;
    hx += (tx - hx) * 0.06;
    hy += (ty - hy) * 0.06;
    /* le nom et PARIS suivent la même inclinaison (voir monde3d.css) */
    heroLogo.style.setProperty("--ry", hx.toFixed(2) + "deg");
    heroLogo.style.setProperty("--rx", hy.toFixed(2) + "deg");
    heroLogo.style.setProperty("--ex", (-Math.sin(hx * RAD) * 1.5).toFixed(3) + "px");
    heroLogo.style.setProperty("--ey", (Math.sin(hy * RAD) * 1.5 + 0.35).toFixed(3) + "px");

    var yaw = -hx * RAD + yawDrag;                // rotateY CSS et lacet du shader sont de sens opposés
    var pitch = hy * RAD;
    var c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    rot[0] = c; rot[1] = s * sp; rot[2] = -s * cp;
    rot[3] = 0; rot[4] = cp; rot[5] = sp;
    rot[6] = s; rot[7] = -c * sp; rot[8] = c * cp;
    bob = Math.sin(T * 0.8) * 0.012;

    /* tracé, allumages, comète, ondes */
    var first = T < CYCLE;
    var tc = T % CYCLE;
    var u = (tc - 0.4) / 1.6;
    var tip = along(u);
    var prog = first ? (u <= 0 ? 0 : tip.s) : 3;
    var tipA = u > 0 && u < 1 ? Math.min(1, u / 0.06, (1 - u) / 0.1) : 0;
    var minor = clamp01((T - 2.3) / 1.8);

    /* les grandes étoiles, les ondes, la comète */
    var rect = canvas.getBoundingClientRect();
    spriteCount = 0;
    for (var i = 0; i < 4; i++) {
      var sc = project(NODES[i]);
      screenN[i * 2] = sc[0];
      screenN[i * 2 + 1] = sc[1];
      var dx = rect.left + sc[0] / dpr - pointer.px, dy = rect.top + (H - sc[1]) / dpr - pointer.py;
      flare[i] += ((live && dx * dx + dy * dy < 80 * 80 ? 1 : 0) - flare[i]) * 0.12;
      var born = first ? pop((T - POP_AT[i]) / POP_DUR[i]) : 1;
      /* la comète avive l'étoile qu'elle atteint */
      var hit = tipA * Math.exp(-Math.pow((tip.s - i) / 0.16, 2));
      sprite(NODES[i], (i === ACCENT ? 0.46 : 0.36) * born * (1 + flare[i] * 0.22 + hit * 0.25), i === ACCENT ? 1 : 0, 1 + flare[i] * 0.35 + hit * 0.5, i * 0.31);
    }
    [(tc - 1.51) / 1.1, (tc - 1.72) / 1.3].forEach(function (v) {
      if (v <= 0 || v >= 1) return;
      var e = 1 - Math.pow(1 - v, 3);
      sprite(NODES[ACCENT], 0.13 * (1 + 2.1 * e) / 0.9, 2, (1 - e) * 0.8, 0);
    });
    sprite(tip.at, 0.2, 3, tipA, 0.5);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    /* couleurs prémultipliées : alpha 0 = additif (nuit), alpha a = encre sur papier (jour) */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    var add = dark ? 1 : 0;
    var fade = clamp01(T / 0.5);

    /* 1 · le voile */
    gl.useProgram(auraProg.p);
    attribs(quadBuf, 0, [2]);
    gl.uniform2fv(auraProg.u.uN, screenN);
    gl.uniform3fv(auraProg.u.uCol, pick([0, 0.184, 0.655], [0.16, 0.32, 1], dark));
    gl.uniform1f(auraProg.u.uProg, prog);
    gl.uniform1f(auraProg.u.uSig, H * 0.05);
    gl.uniform1f(auraProg.u.uAmt, pick(0.045, 0.2, dark) * fade);
    gl.uniform1f(auraProg.u.uAdd, add);
    gl.uniform1f(auraProg.u.uPopA, first ? clamp01((T - POP_AT[ACCENT]) / POP_DUR[ACCENT]) : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* 2 · les traits */
    gl.useProgram(lineProg.p);
    attribs(lineBuf, 48, [3, 3, 2, 4]);
    setView(lineProg);
    gl.uniform1f(lineProg.u.uProg, prog);
    gl.uniform1f(lineProg.u.uMinor, minor);
    gl.uniform1f(lineProg.u.uLineW, 1.25 * dpr);
    gl.uniform1f(lineProg.u.uGlow, pick(0.25, 1, dark));
    gl.uniform1f(lineProg.u.uTipS, tip.s);
    gl.uniform1f(lineProg.u.uTipA, tipA);
    gl.uniform1f(lineProg.u.uMinorA, pick(0.5, 0.55, dark));
    gl.uniform1f(lineProg.u.uAdd, add);
    gl.uniform3fv(lineProg.u.uCol, pick([0.07, 0.086, 0.114], [0.8, 0.87, 1], dark));
    gl.uniform3fv(lineProg.u.uColP, pick([0, 0.184, 0.655], [1, 1, 1], dark));
    gl.drawArrays(gl.TRIANGLES, 0, N_LINE_VERTS);

    /* 3 · la poussière et les petites étoiles */
    gl.useProgram(pointProg.p);
    attribs(pointBuf, 28, [3, 4]);
    setView(pointProg);
    gl.uniform1f(pointProg.u.uProg, prog);
    gl.uniform1f(pointProg.u.uTipS, tip.s);
    gl.uniform1f(pointProg.u.uTipA, tipA);
    gl.uniform1f(pointProg.u.uTime, T);
    gl.uniform1f(pointProg.u.uMinor, minor);
    gl.uniform1f(pointProg.u.uAdd, add);
    gl.uniform1f(pointProg.u.uGain, pick(0.5, 0.7, dark) * fade);
    gl.uniform1f(pointProg.u.uGlow, pick(0, 1, dark));
    gl.uniform3fv(pointProg.u.uColA, pick([0.07, 0.086, 0.114], [0.56, 0.68, 1], dark));
    gl.uniform3fv(pointProg.u.uColB, pick([0, 0.184, 0.655], [1, 1, 1], dark));
    gl.drawArrays(gl.POINTS, 0, N_POINTS);

    /* 4 · les grandes étoiles, les ondes, la comète */
    if (spriteCount) {
      gl.useProgram(spriteProg.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, spriteData);
      attribs(spriteBuf, 36, [3, 2, 4]);
      setView(spriteProg);
      gl.uniform1f(spriteProg.u.uTime, T);
      gl.uniform1f(spriteProg.u.uAdd, add);
      gl.uniform1f(spriteProg.u.uHalo, pick(0, 1, dark));
      gl.uniform1f(spriteProg.u.uSpike, pick(0.2, 1, dark));
      gl.uniform1f(spriteProg.u.uRing, pick(0.7, 0.55, dark));
      gl.uniform1f(spriteProg.u.uCoreMix, pick(0, 1, dark));
      gl.uniform3fv(spriteProg.u.uInk, pick([0.07, 0.086, 0.114], [0.78, 0.86, 1], dark));
      gl.uniform3fv(spriteProg.u.uAccent, pick([0, 0.184, 0.655], [0.36, 0.49, 1], dark));
      gl.uniform3fv(spriteProg.u.uCore, [1, 1, 1]);
      gl.uniform3fv(spriteProg.u.uComet, pick([0, 0.184, 0.655], [0.7, 0.82, 1], dark));
      gl.drawArrays(gl.TRIANGLES, 0, spriteCount * 6);
    }
  }
  requestAnimationFrame(frame);
})();
