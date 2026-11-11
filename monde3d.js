/* ════════════════════════════════════════════
   NODUSING PARIS — le monde 3D
   Chargé sur toutes les pages, avant script.js.

   1. LE MONDE : un ciel de constellations en WebGL derrière chaque
      page. C'est le même univers partout (graine fixe) : on y avance
      en faisant défiler la page, et un clic sur un lien y fait plonger
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

  var TAU = Math.PI * 2;

  /* ── L'univers : un tunnel creux, peuplé de constellations ──
     La caméra file le long de l'axe z. Le creux central garde le
     milieu de l'écran (là où vit le contenu) aux seules étoiles
     lointaines. Trois populations :
       · des constellations : des figures de 5 à 9 étoiles reliées
         en arbre, comme sur une carte du ciel ;
       · dans chacune, une ou deux étoiles maîtresses, plus grosses ;
       · une poussière de petites étoiles, sans liens. */
  var L = 7000;                 // longueur du tunnel, qui boucle sur lui-même
  var FAR = 4300;               // au-delà, la brume a tout effacé
  var R_IN = 430, R_OUT = 1900;
  var small = Math.min(window.innerWidth, window.innerHeight) < 700;
  var N_CONST = small ? 46 : 84;
  var N_DUST = small ? 1400 : 3200;

  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = seeded(1789);

  var starData = [];            // x, y, z, repli, taille, sorte, phase
  var lineData = [];            // voir LINE_VS
  var streakData = [];          // traînées des étoiles pendant la plongée (même format)
  var figures = [];             // étoiles des constellations, pour les liens vers le curseur

  function pushStar(x, y, z, mid, size, kind, phase) {
    starData.push(x, y, z, mid, size, kind, phase);
  }
  /* un lien = un quadrilatère (6 sommets) étiré entre deux étoiles */
  function pushLine(a, b, mid, seed, into) {
    [[0, -1], [0, 1], [1, -1], [1, -1], [0, 1], [1, 1]].forEach(function (c) {
      (into || lineData).push(a.x, a.y, a.z, b.x, b.y, b.z, mid, a.phase, b.phase, seed, c[0], c[1]);
    });
  }

  for (var c = 0; c < N_CONST; c++) {
    var ang = rand() * TAU;
    var rad = Math.sqrt(Math.pow(R_IN + 200, 2) + rand() * (R_OUT * R_OUT - Math.pow(R_IN + 200, 2)));
    var cx = Math.cos(ang) * rad, cy = Math.sin(ang) * rad;
    var cz = (c + rand() * 0.8) / N_CONST * L;        // réparties le long du tunnel
    var spread = 210 + rand() * 240;
    var want = 5 + Math.floor(rand() * 5);
    var fig = [];
    for (var tries = 0; fig.length < want && tries < 60; tries++) {
      var sx = cx + (rand() * 2 - 1) * spread;
      var sy = cy + (rand() * 2 - 1) * spread * 0.8;
      if (Math.hypot(sx, sy) < R_IN) continue;
      var ok = true;
      for (var q = 0; q < fig.length; q++) {
        if (Math.hypot(fig[q].x - sx, fig[q].y - sy) < 85) { ok = false; break; }
      }
      if (!ok) continue;
      fig.push({ x: sx, y: sy, z: cz + (rand() * 2 - 1) * 110, phase: rand() * TAU, mid: cz, deg: 0 });
    }
    if (fig.length < 3) continue;

    /* arbre couvrant minimal : le tracé le plus court qui relie toutes
       les étoiles — c'est ce qui donne l'allure d'une vraie constellation */
    var inTree = [0], edges = [];
    while (inTree.length < fig.length) {
      var best = null, bestD = 1e9;
      inTree.forEach(function (i) {
        for (var j = 0; j < fig.length; j++) {
          if (inTree.indexOf(j) >= 0) continue;
          var d = Math.hypot(fig[i].x - fig[j].x, fig[i].y - fig[j].y, fig[i].z - fig[j].z);
          if (d < bestD) { bestD = d; best = [i, j]; }
        }
      });
      inTree.push(best[1]);
      edges.push(best);
    }
    edges.forEach(function (e) { fig[e[0]].deg++; fig[e[1]].deg++; });
    /* parfois, une boucle : deux extrémités de l'arbre se rejoignent */
    if (rand() < 0.45) {
      var leaves = [];
      fig.forEach(function (s, i) { if (s.deg === 1) leaves.push(i); });
      if (leaves.length >= 2 &&
          Math.hypot(fig[leaves[0]].x - fig[leaves[1]].x, fig[leaves[0]].y - fig[leaves[1]].y) < spread * 1.5) {
        edges.push([leaves[0], leaves[1]]);
      }
    }

    /* les étoiles maîtresses : la plus reliée, et parfois une seconde */
    var alpha = 0;
    fig.forEach(function (s, i) { if (s.deg > fig[alpha].deg) alpha = i; });
    var beta = rand() < 0.4 ? Math.floor(rand() * fig.length) : -1;
    fig.forEach(function (s, i) {
      var master = i === alpha || i === beta;
      s.size = master ? 8 + rand() * 3.5 : 3.4 + rand() * 2.4;
      pushStar(s.x, s.y, s.z, s.mid, s.size, master ? 2 : 1, s.phase);
      figures.push(s);
    });
    edges.forEach(function (e) { pushLine(fig[e[0]], fig[e[1]], cz, rand()); });
  }

  for (var i = 0; i < N_DUST; i++) {
    var a = rand() * TAU;
    var lo = R_IN * 0.55, hi = R_OUT * 1.5;
    var r = Math.sqrt(lo * lo + rand() * (hi * hi - lo * lo));
    var z = rand() * L;
    var dust = { x: Math.cos(a) * r, y: Math.sin(a) * r, z: z, phase: rand() * TAU };
    pushStar(dust.x, dust.y, z, z, 1.1 + Math.pow(rand(), 3) * 3, 0, dust.phase);
    /* une étoile sur deux laisse une traînée quand la caméra plonge */
    if (i % 2 === 0) pushLine(dust, { x: dust.x, y: dust.y, z: z + 360, phase: dust.phase }, z, rand(), streakData);
  }

  var stars = new Float32Array(starData), lines = new Float32Array(lineData), streaks = new Float32Array(streakData);
  var N_STARS = stars.length / 7, N_LINE_VERTS = lines.length / 12, N_STREAK_VERTS = streaks.length / 12;

  /* ── Shaders ── */
  var PRECISION = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif"
  ].join("\n");

  /* passage commun : repli dans le tunnel, puis vue caméra.
     (project(), plus bas, refait exactement ce calcul en JS.) */
  var VIEW = [
    "uniform float uCamZ, uL, uF, uAspect, uTime, uH, uFocus, uAperture, uFade;",
    "uniform vec3 uCam;",        // décalage x, y et roulis
    "uniform vec2 uLook;",       // lacet, tangage
    "vec3 toView(vec3 pos, float mid, float phase) {",
    "  float k = floor((mid - uCamZ + 400.0) / uL);",
    "  vec3 p = vec3(pos.xy, pos.z - uCamZ - k * uL);",
    "  p.xy += vec2(sin(uTime * 0.31 + phase), cos(uTime * 0.23 + phase * 1.7)) * 14.0;",
    "  p.xy -= uCam.xy;",
    "  float cr = cos(uCam.z), sr = sin(uCam.z);",
    "  p.xy = vec2(p.x * cr - p.y * sr, p.x * sr + p.y * cr);",
    "  float cy = cos(uLook.x), sy = sin(uLook.x);",
    "  p.xz = vec2(p.x * cy - p.z * sy, p.x * sy + p.z * cy);",
    "  float cp = cos(uLook.y), sp = sin(uLook.y);",
    "  p.yz = vec2(p.y * cp - p.z * sp, p.y * sp + p.z * cp);",
    "  return p;",
    "}",
    "float fog(float z) { return smoothstep(" + FAR.toFixed(1) + ", " + (FAR * 0.45).toFixed(1) + ", z) * smoothstep(60.0, 320.0, z); }",
    /* flou de profondeur de champ, en pixels */
    "float blur(float z) { return abs(1.0 / z - 1.0 / uFocus) * uAperture * uH; }",
    /* une clairière là où vit le contenu : le ciel s'y fait plus discret.
       uClear = (force, centre x, centre y, rayon) ; uClearY = 1 : ronde, 0 : une colonne */
    "uniform vec4 uClear; uniform float uClearY;",
    "float clearing(vec2 ndc) {",
    "  float d = length((ndc - uClear.yz) * vec2(uAspect, uClearY)) / uClear.w;",
    "  return 1.0 - uClear.x * (1.0 - smoothstep(0.45, 1.1, d));",
    "}"
  ].join("\n");

  var STAR_VS = [
    "attribute vec3 aPos; attribute vec4 aInfo;",     // repli, taille, sorte, phase
    VIEW,
    "uniform vec3 uPtr;",                             // pointeur (x, y en coordonnées écran, présence)
    "varying float vAlpha, vSoft, vKind, vCore, vTint;",
    "void main() {",
    "  vec3 p = toView(aPos, aInfo.x, aInfo.w);",
    "  float z = max(p.z, 1.0);",
    "  float kind = aInfo.z;",
    "  vec2 ndc = p.xy * uF / z * vec2(1.0 / uAspect, 1.0);",
    /* les étoiles proches du curseur s'allument */
    "  float near = smoothstep(0.34, 0.0, length((ndc - uPtr.xy) * vec2(uAspect, 1.0))) * uPtr.z * step(0.5, kind);",
    "  float rad = aInfo.y * uF / z * uH * 0.5 * (1.0 + near * 0.5);",
    "  float dim = 1.0;",
    "  if (rad < 0.8) { dim = rad * rad / 0.64; rad = 0.8; }",       // plus petite qu'un pixel : elle pâlit au lieu de disparaître
    "  float coc = blur(z);",
    "  float core = rad + coc;",
    "  float reach = kind > 1.5 ? 7.0 : (kind > 0.5 ? 4.5 : 1.0);",  // place pour le halo et les aigrettes
    "  gl_PointSize = clamp(2.0 * core * reach + 2.0, 2.0, 250.0);",
    "  gl_Position = vec4(ndc, 0.0, 1.0);",
    "  if (p.z < 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);",      // derrière la caméra : hors champ
    "  float twinkle = 1.0 + 0.3 * sin(uTime * (1.1 + fract(aInfo.w * 7.3) * 2.4) + aInfo.w * 40.0);",
    "  vAlpha = fog(p.z) * uFade * dim * twinkle * mix(0.1, 1.0, pow(rad / core, 1.4)) * (1.0 + near * 1.3) * clearing(ndc);",
    "  vSoft = clamp(coc / core, 0.0, 1.0);",
    "  vCore = core / (gl_PointSize * 0.5);",
    "  vKind = kind;",
    "  vTint = fract(aInfo.w * 3.7);",
    "}"
  ].join("\n");

  var STAR_FS = [
    PRECISION,
    "uniform vec3 uColA, uColB, uColCore;",
    "uniform float uAdd, uGain, uGlow, uRing;",
    "varying float vAlpha, vSoft, vKind, vCore, vTint;",
    "void main() {",
    "  vec2 q = (gl_PointCoord - 0.5) * 2.0;",
    "  float d = length(q), k = d / vCore;",                         // k = 1 au bord de l'étoile
    "  float disc = smoothstep(1.0, 1.0 - max(vSoft, 0.25), k);",
    "  disc *= mix(1.0, 0.7 + 0.3 * smoothstep(0.35, 0.95, k), vSoft);",   // liseré de bokeh quand elle est floue
    "  float isStar = step(0.5, vKind), isMaster = step(1.5, vKind), sharp = 1.0 - vSoft;",
    "  float halo = pow(max(1.0 - d, 0.0), 2.5) * 0.42 * isStar * sharp;",
    /* aigrettes de diffraction des étoiles maîtresses */
    "  float spikes = exp(-abs(q.y) / (vCore * 0.2)) * pow(max(1.0 - abs(q.x), 0.0), 3.0)",
    "               + exp(-abs(q.x) / (vCore * 0.2)) * pow(max(1.0 - abs(q.y), 0.0), 3.0);",
    "  spikes *= 0.55 * isMaster * sharp;",
    /* et leur cercle, comme sur une carte du ciel */
    "  float ring = smoothstep(0.24, 0.0, abs(k - 2.3)) * isMaster * sharp;",
    "  float a = (disc + (halo + spikes) * uGlow + ring * uRing) * vAlpha * uGain;",
    "  vec3 col = mix(mix(uColA, uColB, vTint), uColCore, disc * isStar * 0.85);",
    "  gl_FragColor = vec4(col * a, a * (1.0 - uAdd));",
    "}"
  ].join("\n");

  var LINE_VS = [
    "attribute vec3 aA, aB;",
    "attribute vec4 aI;",        // repli, phase de A, phase de B, graine
    "attribute vec2 aE;",        // extrémité (0 = A, 1 = B), côté (-1 / +1)
    VIEW,
    "uniform float uLineW, uStretch;",          // uStretch < 1 : le trait est raccourci vers A (traînées)
    "varying float vAlpha, vT, vSide, vHalf, vCoc, vSeed;",
    "void main() {",
    "  vec3 a = toView(aA, aI.x, aI.y), b = toView(mix(aA, aB, uStretch), aI.x, aI.z);",
    "  float za = max(a.z, 1.0), zb = max(b.z, 1.0);",
    "  vec2 sa = a.xy * uF / za * vec2(1.0 / uAspect, 1.0);",
    "  vec2 sb = b.xy * uF / zb * vec2(1.0 / uAspect, 1.0);",
    "  vec2 dir = (sb - sa) * vec2(uAspect, 1.0);",
    "  float len = length(dir);",
    "  dir = len > 1e-5 ? dir / len : vec2(1.0, 0.0);",
    "  vec2 nrm = vec2(-dir.y, dir.x);",
    "  float z = mix(za, zb, aE.x);",
    "  float coc = blur(z);",
    "  float halfW = uLineW + coc * 0.55 + 1.0;",                    // un lien flou s'élargit…
    "  vec2 off = nrm * aE.y * halfW * 2.0 / uH;",
    "  off.x /= uAspect;",
    "  gl_Position = vec4(mix(sa, sb, aE.x) + off, 0.0, 1.0);",
    "  vAlpha = fog(mix(a.z, b.z, aE.x)) * uFade * (uLineW + 1.0) / halfW",   // … et pâlit d'autant
    "         * step(40.0, min(a.z, b.z)) * clearing(mix(sa, sb, aE.x));",
    "  vT = aE.x; vSide = aE.y; vHalf = halfW; vCoc = coc; vSeed = aI.w;",
    "}"
  ].join("\n");

  var LINE_FS = [
    PRECISION,
    "uniform vec3 uColA, uColP;",
    "uniform float uAdd, uGain, uPulse, uTime;",
    "varying float vAlpha, vT, vSide, vHalf, vCoc, vSeed;",
    "void main() {",
    "  float d = abs(vSide) * vHalf;",
    "  float edge = smoothstep(vHalf, max(vHalf - 1.3 - vCoc * 0.5, 0.0), d);",
    /* une impulsion parcourt le lien de temps en temps, dans un sens ou dans l'autre */
    "  float t = vSeed > 0.5 ? vT : 1.0 - vT;",
    "  float pos = fract(uTime * 0.085 + vSeed * 9.0) * 5.0 - 0.1;",
    "  float u = (t - pos) / 0.075;",
    "  float pulse = exp(-u * u);",
    "  float a = edge * vAlpha * (uGain + pulse * uPulse);",
    "  gl_FragColor = vec4(mix(uColA, uColP, pulse) * a, a * (1.0 - uAdd));",
    "}"
  ].join("\n");

  /* liens tirés entre le curseur et les étoiles voisines (coordonnées écran) */
  var LINK_VS = [
    "attribute vec2 aP; attribute vec3 aQ;",          // position · (avancement, côté, opacité)
    "varying vec3 vQ;",
    "void main() { vQ = aQ; gl_Position = vec4(aP, 0.0, 1.0); }"
  ].join("\n");
  var LINK_FS = [
    PRECISION,
    "uniform vec3 uColA, uColP; uniform float uAdd, uTime, uMeteor;",
    "varying vec3 vQ;",
    "void main() {",
    "  float edge = smoothstep(1.0, 0.3, abs(vQ.y));",
    /* une étoile filante : une tête vive, une queue qui s'éteint */
    "  if (uMeteor > 0.5) {",
    "    float m = edge * vQ.z * vQ.x * vQ.x;",
    "    gl_FragColor = vec4(mix(uColA, uColP, vQ.x) * m, m * (1.0 - uAdd));",
    "    return;",
    "  }",
    "  float u = (vQ.x - fract(uTime * 0.8)) / 0.14;",
    "  float pulse = exp(-u * u);",                                        // du curseur vers l'étoile
    "  float a = edge * vQ.z * (0.5 + 0.5 * vQ.x + pulse * 0.9);",
    "  gl_FragColor = vec4(mix(uColA, uColP, pulse) * a, a * (1.0 - uAdd));",
    "}"
  ].join("\n");

  var QUAD_VS = "attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }";

  /* nébuleuse : du bruit fractal replié sur lui-même, calculé en
     basse définition (elle est floue par nature) puis étirée */
  var NEBULA_FS = [
    PRECISION,
    "uniform vec2 uRes, uShift; uniform float uTime;",
    "float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }",
    "float noise(vec2 p) {",
    "  vec2 i = floor(p), f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);",
    "}",
    "float fbm(vec2 p) {",
    "  float v = 0.0, a = 0.5;",
    "  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }",
    "  return v;",
    "}",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / uRes;",
    "  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 1.35 + uShift;",
    "  float a = fbm(p + vec2(uTime * 0.006, 0.0));",
    "  float b = fbm(p * 1.8 + vec2(a * 1.7, -a * 1.3) + 4.7 + uTime * 0.004);",
    "  float cloud = smoothstep(0.36, 0.8, b);",
    "  float wisps = smoothstep(0.45, 0.9, fbm(p * 3.1 + b * 2.2));",
    "  vec3 col = vec3(0.02, 0.085, 0.36) * cloud",
    "           + vec3(0.13, 0.05, 0.30) * cloud * smoothstep(0.42, 0.75, a) * 0.7",    // une pointe de violet
    "           + vec3(0.03, 0.22, 0.38) * wisps * cloud * 0.4;",                        // filaments plus clairs
    "  gl_FragColor = vec4(col, cloud);",
    "}"
  ].join("\n");

  var BG_FS = [
    PRECISION,
    "uniform vec2 uRes, uGlowAt; uniform vec3 uBg, uGlow; uniform float uGlowAmt, uDark, uNebOn;",
    "uniform sampler2D uNeb;",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / uRes;",
    "  vec2 q = (uv - uGlowAt) * vec2(uRes.x / uRes.y, 1.0);",
    "  float g = exp(-dot(q, q) * 2.6);",                                  // halo au centre
    "  float edge = smoothstep(0.35, 1.25, length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));",
    "  vec3 c = uBg + uGlow * (g * uGlowAmt) - edge * 0.035 * (1.0 - uBg) - edge * 0.025 * uBg;",
    "  vec4 neb = texture2D(uNeb, uv) * uNebOn;",
    "  c += neb.rgb * uDark * 0.8;",                                      // la nuit : de la lumière
    "  c -= neb.a * (1.0 - uDark) * vec3(0.05, 0.036, 0.004);",            // le jour : un lavis bleuté sur le papier
    "  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);",
    "  gl_FragColor = vec4(c + (n - 0.5) / 255.0, 1.0);",                  // grain : pas de bandes dans les dégradés
    "}"
  ].join("\n");

  /* les planètes du voyage : une sphère dessinée dans son carré, avec
     un relief de bruit fractal, un terminateur doux et une atmosphère.
     uKind : 0 océans et nuages · 1 géante gazeuse à anneaux · 2 lune de roche */
  var PLANET_FS = [
    PRECISION,
    "uniform vec2 uC; uniform float uR, uTime, uKind, uAlpha, uAdd;",
    "float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }",
    "float noise(vec3 x) {",
    "  vec3 i = floor(x), f = fract(x);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),",
    "             mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);",
    "}",
    "float fbm(vec3 p) {",
    "  float v = 0.0, a = 0.5;",
    "  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }",
    "  return v;",
    "}",
    "void main() {",
    "  vec2 q = (gl_FragCoord.xy - uC) / uR;",
    "  float r = length(q), aa = 1.5 / uR;",
    "  vec3 L = normalize(vec3(-0.55, 0.5, 0.67));",                        // la lumière vient du logo-étoile, en haut à gauche
    "  vec3 atmo = uKind < 0.5 ? vec3(0.25, 0.5, 1.0) : (uKind < 1.5 ? vec3(1.0, 0.72, 0.45) : vec3(0.6, 0.72, 1.0));",
    "  vec4 o = vec4(0.0);",
    "  if (r < 1.0) {",
    "    vec3 n = vec3(q, sqrt(max(1.0 - r * r, 0.0)));",
    /* repère de la planète : un axe incliné, une rotation lente */
    "    vec3 s = vec3(n.x * 0.94 - n.y * 0.34, n.x * 0.34 + n.y * 0.94, n.z);",
    "    float a = uTime * 0.03;",
    "    s = vec3(s.x * cos(a) + s.z * sin(a), s.y, -s.x * sin(a) + s.z * cos(a));",
    "    vec3 col;",
    "    if (uKind < 0.5) {",
    "      float land = fbm(s * 2.4 + 3.0);",
    "      col = mix(vec3(0.01, 0.05, 0.28), vec3(0.03, 0.20, 0.62), smoothstep(0.30, 0.60, land));",
    "      col = mix(col, vec3(0.08, 0.35, 0.45), smoothstep(0.60, 0.72, land) * 0.6);",
    "      float cloud = smoothstep(0.50, 0.75, fbm(s * 3.6 + vec3(uTime * 0.012, 0.0, 0.0) + 9.0));",
    "      col = mix(col, vec3(0.90, 0.94, 1.0), cloud * 0.85);",
    "      col = mix(col, vec3(0.92, 0.95, 1.0), smoothstep(0.80, 0.92, abs(s.y)));",          // calottes
    "    } else if (uKind < 1.5) {",
    "      float w = fbm(s * vec3(1.5, 5.0, 1.5) + 4.0);",
    "      col = mix(vec3(0.42, 0.16, 0.06), vec3(0.93, 0.74, 0.50), sin(s.y * 16.0 + w * 5.0) * 0.5 + 0.5);",   // bandes
    "      col = mix(col, vec3(0.98, 0.90, 0.75), smoothstep(0.55, 0.9, fbm(s * vec3(2.0, 9.0, 2.0))) * 0.5);",
    "    } else {",
    "      col = mix(vec3(0.22, 0.25, 0.32), vec3(0.74, 0.78, 0.86), smoothstep(0.25, 0.75, fbm(s * 3.2 + 1.7)));",
    "      col *= 1.0 - smoothstep(0.62, 0.70, fbm(s * 6.5 + 12.0)) * 0.35;",                   // mers sombres
    "    }",
    "    float lit = smoothstep(-0.12, 0.55, dot(n, L));",
    "    vec3 c = col * (lit * 1.15 + 0.035) + atmo * pow(1.0 - n.z, 3.0) * (0.15 + 0.75 * lit);",
    "    c += vec3(1.0) * pow(max(reflect(-L, n).z, 0.0), 40.0) * 0.25 * step(uKind, 0.5) * lit;",   // l'océan brille
    "    float cov = 1.0 - smoothstep(1.0 - aa, 1.0, r);",
    "    o = vec4(c * cov, cov);",
    "  }",
    /* l'atmosphère déborde, du côté éclairé surtout */
    "  float h = exp(-max(r - 1.0, 0.0) * 11.0) * (0.25 + 0.75 * smoothstep(-0.6, 0.6, dot(normalize(q + 1e-4), L.xy))) * 0.5 * step(r, 1.6);",
    "  vec4 g = vec4(atmo * h, h * (1.0 - uAdd) * 0.6);",
    "  o = o + g * (1.0 - o.a);",
    /* les anneaux de la géante : un disque incliné, devant puis derrière elle */
    "  if (uKind > 0.5 && uKind < 1.5) {",
    "    vec3 nr = normalize(vec3(0.22, 0.90, 0.38));",
    "    float z = -(nr.x * q.x + nr.y * q.y) / nr.z;",
    "    float rho = length(vec3(q, z));",
    "    float ring = smoothstep(1.32, 1.40, rho) * (1.0 - smoothstep(2.0, 2.08, rho)) * (0.5 + 0.5 * sin(rho * 40.0)) * 0.6;",
    "    ring *= 1.0 - smoothstep(1.66, 1.70, rho) * (1.0 - smoothstep(1.74, 1.78, rho));",    // une division sombre
    "    if (z < 0.0 && r < 1.0) ring = 0.0;",                                                  // la planète cache l'arrière
    "    vec4 rg = vec4(vec3(0.95, 0.80, 0.60) * ring, ring * mix(1.0, 0.25, uAdd));",
    "    o = rg + o * (1.0 - rg.a);",
    "  }",
    "  gl_FragColor = o * uAlpha;",
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
      var name = gl.getActiveUniform(p, k).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u };
  }

  var starProg, lineProg, linkProg, bgProg, nebProg, planetProg;
  try {
    starProg = program(STAR_VS, STAR_FS, ["aPos", "aInfo"]);
    lineProg = program(LINE_VS, LINE_FS, ["aA", "aB", "aI", "aE"]);
    linkProg = program(LINK_VS, LINK_FS, ["aP", "aQ"]);
    planetProg = program(QUAD_VS, PLANET_FS, ["aPos"]);
    bgProg = program(QUAD_VS, BG_FS, ["aPos"]);
    nebProg = program(QUAD_VS, NEBULA_FS, ["aPos"]);
  } catch (e) {
    if (window.console) console.warn("monde3d : shaders refusés, repli sur le site 2D.", e);
    return;
  }

  function buffer(data, usage) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
    return b;
  }
  var starBuf = buffer(stars), lineBuf = buffer(lines), streakBuf = buffer(streaks);
  var meteorData = new Float32Array(6 * 5);
  var meteorBuf = buffer(meteorData, gl.DYNAMIC_DRAW);
  var quadBuf = buffer(new Float32Array([-1, -1, 3, -1, -1, 3]));
  var MAX_LINKS = 6;
  var linkData = new Float32Array(MAX_LINKS * 6 * 5);
  var linkBuf = buffer(linkData, gl.DYNAMIC_DRAW);

  /* quatre attributs au plus : on les active une fois pour toutes */
  for (var at = 0; at < 4; at++) gl.enableVertexAttribArray(at);
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

  /* le canvas EST le fond de page : opaque, il peint lui-même la couleur du thème */
  canvas.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;height:100lvh;z-index:-1;pointer-events:none;display:block";
  document.body.insertBefore(canvas, document.body.firstChild);
  root.classList.add("gl-world");

  /* ── Taille ; la nébuleuse a sa propre petite texture ── */
  var W = 0, H = 0, dpr = 1;
  var nebTex = gl.createTexture(), nebFbo = gl.createFramebuffer(), nebW = 0, nebH = 0, nebOk = false;
  gl.bindTexture(gl.TEXTURE_2D, nebTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W;
    canvas.height = H;
    nebW = Math.max(32, Math.round(canvas.clientWidth / 5));
    nebH = Math.max(32, Math.round(canvas.clientHeight / 5));
    gl.bindTexture(gl.TEXTURE_2D, nebTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nebW, nebH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, nebFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, nebTex, 0);
    nebOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  window.addEventListener("resize", resize);
  resize();

  /* ── Caméra ── */
  var pointer = { x: 0, y: 0, px: -1e4, py: -1e4, on: 0 }, look = { x: 0, y: 0 }, ptrGlow = 0;
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    pointer.px = e.clientX;
    pointer.py = e.clientY;
    pointer.on = 1;
  }, { passive: true });
  document.documentElement.addEventListener("mouseleave", function () { pointer.on = 0; });

  var F_REST = 1.732;            // 1 / tan(30°) : champ de 60°
  var F_WARP = 1.05;             // grand angle pendant la plongée
  var CRUISE = 58;               // vitesse de croisière : on avance à travers le ciel, en unités par seconde
  var FOCUS = 1500, APERTURE = 3.2;

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
  /* ── Le voyage : les escales de l'accueil et leurs planètes ──
     Chaque planète attend sur la route, un peu en avant de son escale :
     elle grossit à mesure qu'on approche, se range sur le côté quand on
     y fait halte, puis on la frôle et on la dépasse. */
  var heroEl = document.querySelector(".hero");
  var stopEls = Array.prototype.slice.call(document.querySelectorAll(".stop"));
  var centers = [];              // milieu de chaque étape, en pixels de défilement (0 : le logo)
  function measureStops() {
    centers = [];
    if (!heroEl || !stopEls.length) return;
    [heroEl].concat(stopEls).forEach(function (el) {
      var b = el.getBoundingClientRect();
      centers.push(b.top + window.scrollY + b.height / 2);
    });
  }
  /* où en est-on ? 0 = le logo, 1 = la première planète, etc. */
  function progress() {
    var y = window.scrollY + window.innerHeight / 2;
    if (centers.length < 2 || y <= centers[0]) return 0;
    for (var i = 1; i < centers.length; i++) {
      if (y < centers[i]) return i - 1 + (y - centers[i - 1]) / (centers[i] - centers[i - 1]);
    }
    return centers.length - 1;
  }
  measureStops();
  window.addEventListener("resize", measureStops);
  window.addEventListener("load", measureStops);

  /* plonger dans une planète (dir 1), ou en redécoller (dir -1) */
  var dive = { i: -1, at: 0, dir: 1 };
  try {
    var takeoff = JSON.parse(sessionStorage.getItem("decollage") || "null");
    if (takeoff && Date.now() - takeoff.at < 8000) dive = { i: takeoff.i, at: performance.now(), dir: -1 };
  } catch (e) { /* stockage indisponible */ }
  function diveZoom(i, now) {
    if (dive.i !== i) return 1;
    var t = (now - dive.at) / 1000, k;
    if (dive.dir > 0) { k = Math.min(1, t / 0.85); return 1 + 16 * k * k * k; }
    k = Math.min(1, t / 1.5);
    if (k >= 1) { dive.i = -1; return 1; }
    return 1 + 16 * Math.pow(1 - k, 3);
  }

  var AHEAD = 0.34;              // avance de la planète sur son escale, en étapes
  function drawPlanets(now, time) {
    if (!stopEls.length) return;
    var p = progress();
    var cw = canvas.clientWidth, ch = canvas.clientHeight, narrow = cw < 820;
    var appear = Math.min(1, Math.max(0, (p - 0.12) / 0.4));       // près du logo, elles n'ont pas encore paru
    gl.useProgram(planetProg.p);
    attribs(quadBuf, 0, [2]);
    gl.uniform1f(planetProg.u.uTime, time);
    gl.uniform1f(planetProg.u.uAdd, theme);
    gl.enable(gl.SCISSOR_TEST);
    for (var i = 2; i >= 0; i--) {                                  // la plus lointaine d'abord
      var zoom = diveZoom(i, now);
      var d = i + 1 - p + AHEAD;
      if (zoom === 1 && (d <= 0.03 || d > 2.7)) continue;
      d = Math.max(d, 0.03);
      var s = AHEAD / d;
      var alpha = zoom > 1 ? 1 : appear * Math.min(1, (2.7 - d) / 0.5) * Math.min(1, (d - 0.03) / 0.05);
      if (alpha <= 0.003) continue;
      /* à l'escale, la planète se tient du côté opposé au panneau ; en
         plongée, on fonce droit dessus : elle revient au centre */
      var side = i % 2 === 0 ? 1 : -1;
      var drift = s / Math.pow(zoom, 1.4);
      var x = cw / 2 + (narrow ? 0 : side * cw * 0.2) * drift;
      var y = ch / 2 + (narrow ? ch * 0.2 : ch * 0.01) * drift;
      var R = (narrow ? cw * 0.27 : Math.min(cw * 0.15, ch * 0.24)) * s * zoom;
      var ext = R * (i === 1 ? 2.2 : 1.7);
      gl.scissor(Math.max(0, Math.floor((x - ext) * dpr)), Math.max(0, Math.floor((y - ext) * dpr)),
                 Math.ceil(ext * 2 * dpr), Math.ceil(ext * 2 * dpr));
      gl.uniform2f(planetProg.u.uC, x * dpr, y * dpr);
      gl.uniform1f(planetProg.u.uR, R * dpr);
      gl.uniform1f(planetProg.u.uKind, i);
      gl.uniform1f(planetProg.u.uAlpha, alpha);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  /* sur l'accueil, le défilement est le moteur du voyage : on avance franchement */
  var SCROLL_K = stopEls.length ? 2.4 : 0.9;
  var scrollZ = window.scrollY * SCROLL_K;
  var leaveAt = 0;               // début de la plongée de sortie
  var theme = root.dataset.theme === "dark" ? 1 : 0;
  var camZ = z0;
  /* page de lecture (texte long) : le ciel se fait discret derrière */
  var CALM = document.querySelector("main > .container") ? 0.4 : 1;
  /* la clairière : ronde autour du logo sur l'accueil (elle le suit
     quand la page défile), une colonne centrale ailleurs */
  var heroLogo = document.getElementById("heroLogo");
  var clear = heroLogo ? { force: 0.82, x: 0, y: 0, r: 1, round: 1 } : { force: 0.5, x: 0, y: 0, r: 0.8, round: 0 };
  function placeClearing() {
    if (!heroLogo) return;
    var box = heroLogo.getBoundingClientRect(), cw = canvas.clientWidth, ch = canvas.clientHeight;
    clear.x = (box.left + box.width / 2) / cw * 2 - 1;
    clear.y = 1 - (box.top + box.height / 2) / ch * 2;
    clear.r = Math.max(box.width, box.height) / ch * 1.55;      // en demi-hauteurs d'écran
  }

  function mix(a, b, t) { return a + (b - a) * t; }
  function mix3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  function easeOut(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - Math.pow(1 - t, 3); }

  /* [jour, nuit] */
  var BG = [[250 / 255, 250 / 255, 248 / 255], [9 / 255, 15 / 255, 30 / 255]];
  var COL_A = [[0, 47 / 255, 167 / 255], [91 / 255, 124 / 255, 1]];
  var COL_B = [[70 / 255, 104 / 255, 236 / 255], [0.74, 0.82, 1]];
  var COL_CORE = [[0, 36 / 255, 140 / 255], [1, 1, 1]];
  var COL_PULSE = [[0.2, 0.42, 1], [0.92, 0.96, 1]];
  var GLOW = [[0.1, 0.2, 0.55], [0.16, 0.26, 0.75]];

  var cam = { x: 0, y: 0, roll: 0, yaw: 0, pitch: 0, F: F_REST, time: 0 };

  function setView(prog, fade) {
    var u = prog.u;
    gl.uniform1f(u.uCamZ, camZ);
    gl.uniform1f(u.uL, L);
    gl.uniform1f(u.uF, cam.F);
    gl.uniform1f(u.uAspect, W / H);
    gl.uniform1f(u.uTime, cam.time);
    gl.uniform3f(u.uCam, cam.x, cam.y, cam.roll);
    gl.uniform2f(u.uLook, cam.yaw, cam.pitch);
    gl.uniform1f(u.uH, H);
    gl.uniform1f(u.uFocus, FOCUS);
    gl.uniform1f(u.uAperture, APERTURE);
    gl.uniform1f(u.uFade, fade);
    gl.uniform1f(u.uAdd, theme);
    gl.uniform4f(u.uClear, clear.force, clear.x, clear.y, clear.r);
    gl.uniform1f(u.uClearY, clear.round);
  }

  /* le même calcul que toView() dans les shaders, pour savoir où une
     étoile tombe à l'écran. Renvoie null si elle est derrière la caméra. */
  function project(s) {
    var k = Math.floor((s.mid - camZ + 400) / L);
    var x = s.x + Math.sin(cam.time * 0.31 + s.phase) * 14 - cam.x;
    var y = s.y + Math.cos(cam.time * 0.23 + s.phase * 1.7) * 14 - cam.y;
    var z = s.z - camZ - k * L;
    var cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
    var x1 = x * cr - y * sr, y1 = x * sr + y * cr;
    var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    var x2 = x1 * cy - z * sy, z2 = x1 * sy + z * cy;
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var y3 = y1 * cp - z2 * sp, z3 = y1 * sp + z2 * cp;
    if (z3 < 60) return null;
    return { x: x2 * cam.F / z3 / (W / H), y: y3 * cam.F / z3, z: z3 };
  }

  /* ── Le curseur est un nœud : il se relie aux étoiles voisines ── */
  var LINK_R = 190;              // portée, en pixels CSS
  function buildLinks() {
    if (!pointer.on || leaveAt) return 0;
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    var found = [];
    for (var i = 0; i < figures.length; i++) {
      var p = project(figures[i]);
      if (!p || p.z > FAR * 0.8) continue;
      var sx = (p.x * 0.5 + 0.5) * cw, sy = (0.5 - p.y * 0.5) * ch;
      var d = Math.hypot(sx - pointer.px, sy - pointer.py);
      if (d > LINK_R || d < 4) continue;
      /* une étoile floue (trop proche ou trop loin du plan net) ne se relie pas */
      var sharp = 1 - Math.min(1, Math.abs(1 / p.z - 1 / FOCUS) * APERTURE * H / 7);
      var a = Math.pow(1 - d / LINK_R, 1.3) * sharp;
      if (a > 0.02) found.push({ x: sx, y: sy, a: a });
    }
    found.sort(function (m, n) { return n.a - m.a; });
    var n = Math.min(found.length, MAX_LINKS), o = 0;
    var half = 1.6;              // demi-largeur du trait, en pixels CSS
    for (i = 0; i < n; i++) {
      var f = found[i];
      var dx = f.x - pointer.px, dy = f.y - pointer.py, len = Math.hypot(dx, dy);
      var nx = -dy / len * half, ny = dx / len * half;
      [[0, -1], [0, 1], [1, -1], [1, -1], [0, 1], [1, 1]].forEach(function (c) {
        var x = (c[0] ? f.x : pointer.px) + nx * c[1], y = (c[0] ? f.y : pointer.py) + ny * c[1];
        linkData[o++] = x / cw * 2 - 1;
        linkData[o++] = 1 - y / ch * 2;
        linkData[o++] = c[0];
        linkData[o++] = c[1];
        linkData[o++] = f.a;
      });
    }
    return n * 6;
  }

  /* ── Étoiles filantes : une de temps en temps, jamais sur une page de lecture ── */
  var meteor = null, nextMeteor = 4 + Math.random() * 5;
  function buildMeteor(time) {
    if (CALM < 1 || leaveAt) return 0;
    if (!meteor) {
      if (time < nextMeteor) return 0;
      var dir = (Math.random() < 0.5 ? 1 : -1) * (0.25 + Math.random() * 0.5);     // pente
      meteor = {
        at: time, dur: 0.75 + Math.random() * 0.5,
        x: 0.1 + Math.random() * 0.8, y: 0.05 + Math.random() * 0.45,
        dx: Math.cos(dir) * (Math.random() < 0.5 ? 1 : -1), dy: Math.abs(Math.sin(dir)) + 0.15,
        len: 0.22 + Math.random() * 0.2
      };
    }
    var p = (time - meteor.at) / meteor.dur;
    if (p >= 1) { meteor = null; nextMeteor = time + 6 + Math.random() * 10; return 0; }
    var cw = canvas.clientWidth, ch = canvas.clientHeight, unit = Math.max(cw, ch);
    var n = Math.hypot(meteor.dx, meteor.dy), ux = meteor.dx / n, uy = meteor.dy / n;
    var hx = meteor.x * cw + ux * unit * meteor.len * p, hy = meteor.y * ch + uy * unit * meteor.len * p;
    var tail = Math.min(150, unit * meteor.len * p);
    var alpha = Math.sin(Math.PI * p) * 0.9;
    var o = 0;
    [[0, -1], [0, 1], [1, -1], [1, -1], [0, 1], [1, 1]].forEach(function (c) {
      var x = hx - ux * tail * (1 - c[0]) - uy * 1.5 * c[1], y = hy - uy * tail * (1 - c[0]) + ux * 1.5 * c[1];
      meteorData[o++] = x / cw * 2 - 1;
      meteorData[o++] = 1 - y / ch * 2;
      meteorData[o++] = c[0];
      meteorData[o++] = c[1];
      meteorData[o++] = alpha;
    });
    return 6;
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
    ptrGlow += (pointer.on - ptrGlow) * Math.min(1, dt * 5);
    scrollZ += (window.scrollY * SCROLL_K - scrollZ) * Math.min(1, dt * 6);

    var speed = CRUISE * (CALM < 1 ? 0.4 : 1), F = F_REST, fade = 1;
    var intro = easeOut(time / 1.6);
    if (arriving) {
      /* on sort de la plongée : très vite, puis de moins en moins */
      var k = Math.exp(-time * 3.2);
      speed += 2600 * k;
      F = mix(F_REST, F_WARP, k);
      fade = mix(1, 0.75, k);
    } else {
      /* première arrivée : on sort de vitesse-lumière, et on ralentit */
      var k0 = Math.exp(-time * 2.4);
      speed += 1700 * k0;
      F = mix(F_REST, F_WARP, k0 * 0.6);
      fade = intro;
    }
    if (leaveAt) {
      var lv = Math.min(1, (now - leaveAt) / 450);
      speed += 5200 * lv * lv;
      F = mix(F, F_WARP, lv * lv);
    }
    travel += speed * dt;
    camZ = (z0 + travel + scrollZ) % L;
    var warp = Math.min(1, Math.max(0, (speed - 300) / 2400));   // 0 au repos, 1 en pleine plongée

    placeClearing();
    cam.x = look.x * 80;
    cam.y = -look.y * 50;
    cam.roll = Math.sin(time * 0.05) * 0.05 - look.x * 0.07;   // on s'incline dans les virages
    cam.yaw = look.x * 0.08;
    cam.pitch = look.y * 0.05;
    cam.F = F;
    cam.time = time;

    gl.disable(gl.BLEND);
    attribs(quadBuf, 0, [2]);

    /* 1 · la nébuleuse, dans sa petite texture */
    if (nebOk) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, nebFbo);
      gl.viewport(0, 0, nebW, nebH);
      gl.useProgram(nebProg.p);
      gl.uniform2f(nebProg.u.uRes, nebW, nebH);
      /* très lointaine : elle glisse à peine quand on avance ou qu'on défile */
      gl.uniform2f(nebProg.u.uShift, 3.1 + look.x * 0.035 + travel * 0.000012, 1.7 - look.y * 0.03 - scrollZ * 0.00022);
      gl.uniform1f(nebProg.u.uTime, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /* 2 · le fond */
    gl.viewport(0, 0, W, H);
    gl.useProgram(bgProg.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, nebTex);
    gl.uniform1i(bgProg.u.uNeb, 0);
    gl.uniform1f(bgProg.u.uNebOn, nebOk ? mix(0.55, 1, CALM) : 0);
    gl.uniform1f(bgProg.u.uDark, theme);
    gl.uniform2f(bgProg.u.uRes, W, H);
    gl.uniform2f(bgProg.u.uGlowAt, 0.5 - look.x * 0.04, 0.56 + look.y * 0.04);
    gl.uniform3fv(bgProg.u.uBg, mix3(BG[0], BG[1], theme));
    gl.uniform3fv(bgProg.u.uGlow, mix3(GLOW[0], GLOW[1], theme));
    gl.uniform1f(bgProg.u.uGlowAmt, mix(-0.04, 0.16, theme));   // en clair : une ombre bleutée très légère
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    /* couleurs prémultipliées : alpha 0 = additif (nuit), alpha a = encre sur papier (jour) */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    /* 3 · les liens des constellations */
    gl.useProgram(lineProg.p);
    attribs(lineBuf, 48, [3, 3, 4, 2]);
    setView(lineProg, fade);
    gl.uniform1f(lineProg.u.uLineW, 0.55 * dpr);
    gl.uniform1f(lineProg.u.uStretch, 1);
    gl.uniform1f(lineProg.u.uGain, mix(0.34, 0.6, theme) * CALM);
    gl.uniform1f(lineProg.u.uPulse, mix(0.9, 1.5, theme) * CALM);
    gl.uniform3fv(lineProg.u.uColA, mix3(COL_A[0], COL_A[1], theme));
    gl.uniform3fv(lineProg.u.uColP, mix3(COL_PULSE[0], COL_PULSE[1], theme));
    gl.drawArrays(gl.TRIANGLES, 0, N_LINE_VERTS);

    /* 3 bis · le filé des étoiles : court en croisière (on sent qu'on
       avance), long en plongée entre deux pages */
    attribs(streakBuf, 48, [3, 3, 4, 2]);
    gl.uniform1f(lineProg.u.uLineW, 0.4 * dpr);
    gl.uniform1f(lineProg.u.uStretch, Math.min(1, Math.max(0.05, speed / 2600)));
    gl.uniform1f(lineProg.u.uGain, (0.22 + warp * 0.5) * mix(0.5, 0.8, theme) * mix(0.4, 1, CALM));
    gl.uniform1f(lineProg.u.uPulse, 0);
    gl.drawArrays(gl.TRIANGLES, 0, N_STREAK_VERTS);

    /* 4 · les liens vers le curseur, et l'étoile filante */
    var linkVerts = buildLinks(), meteorVerts = buildMeteor(time);
    if (linkVerts || meteorVerts) {
      gl.useProgram(linkProg.p);
      gl.uniform1f(linkProg.u.uAdd, theme);
      gl.uniform1f(linkProg.u.uTime, time);
      gl.uniform3fv(linkProg.u.uColA, mix3(COL_A[0], COL_A[1], theme));
      gl.uniform3fv(linkProg.u.uColP, mix3(COL_PULSE[0], COL_PULSE[1], theme));
      if (linkVerts) {
        gl.bindBuffer(gl.ARRAY_BUFFER, linkBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, linkData);
        attribs(linkBuf, 20, [2, 3]);
        gl.uniform1f(linkProg.u.uMeteor, 0);
        gl.drawArrays(gl.TRIANGLES, 0, linkVerts);
      }
      if (meteorVerts) {
        gl.bindBuffer(gl.ARRAY_BUFFER, meteorBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, meteorData);
        attribs(meteorBuf, 20, [2, 3]);
        gl.uniform1f(linkProg.u.uMeteor, 1);
        gl.drawArrays(gl.TRIANGLES, 0, meteorVerts);
      }
    }

    /* 5 · les étoiles */
    gl.useProgram(starProg.p);
    attribs(starBuf, 28, [3, 4]);
    setView(starProg, fade);
    gl.uniform3f(starProg.u.uPtr, pointer.x, -pointer.y, ptrGlow);
    gl.uniform1f(starProg.u.uGain, mix(0.62, 0.95, theme) * mix(0.55, 1, CALM));
    gl.uniform1f(starProg.u.uGlow, mix(0.3, 1, theme));
    gl.uniform1f(starProg.u.uRing, mix(0.55, 0.16, theme));
    gl.uniform3fv(starProg.u.uColA, mix3(COL_A[0], COL_A[1], theme));
    gl.uniform3fv(starProg.u.uColB, mix3(COL_B[0], COL_B[1], theme));
    gl.uniform3fv(starProg.u.uColCore, mix3(COL_CORE[0], COL_CORE[1], theme));
    gl.drawArrays(gl.POINTS, 0, N_STARS);

    /* 6 · les planètes du voyage, devant les étoiles */
    drawPlanets(now, time);
  }
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
    back: function () { leaveAt = 0; dive.i = -1; },
    /* plonge dans la planète i (0, 1, 2) : elle grossit jusqu'à emplir l'écran */
    dive: function (i) { dive = { i: i, at: performance.now(), dir: 1 }; },
    /* hook de test (console uniquement) : où tombent les étoiles des constellations, en pixels CSS */
    etoiles: function () {
      var out = [];
      figures.forEach(function (s) {
        var p = project(s);
        if (p && Math.abs(p.x) < 1 && Math.abs(p.y) < 1) {
          out.push({ x: (p.x * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - p.y * 0.5) * canvas.clientHeight, z: p.z });
        }
      });
      return out;
    }
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
     L'élément pivote vers le pointeur ; --gx/--gy placent le reflet,
     --shx/--shy l'ombre portée.
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
      /* l'ombre portée part à l'opposé du côté qui se soulève */
      el.style.setProperty("--shx", ((0.5 - px) * 26).toFixed(1) + "px");
      el.style.setProperty("--shy", ((0.5 - py) * 26 + 16).toFixed(1) + "px");
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
  /* ── Entrer dans une planète, en redécoller ──
     Un voile à la couleur de l'atmosphère couvre l'écran au moment du
     passage, puis se lève : à l'arrivée sur la page d'une réalisation
     (on a plongé), ou au retour sur l'accueil (on a redécollé). */
  function veil(planet, shown) {
    var v = document.createElement("div");
    v.className = "veil" + (shown ? " on" : "");
    v.setAttribute("data-planet", planet);
    v.setAttribute("aria-hidden", "true");
    document.body.appendChild(v);
    return v;
  }
  var STOP_IDS = ["logik", "brickrogue", "noeud"];
  /* la planète d'où l'on vient quand on quitte cette page pour l'accueil */
  var homePlanet = /brickrogue/.test(location.pathname) ? 1 : (/jeu\.html$/.test(location.pathname) ? 2 : -1);
  try {
    var crossing = JSON.parse(sessionStorage.getItem("planete") || sessionStorage.getItem("decollage") || "null");
    sessionStorage.removeItem("planete");
    sessionStorage.removeItem("decollage");
    if (crossing && Date.now() - crossing.at < 8000) {
      var arrival = veil(crossing.i, true);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { arrival.classList.add("lift"); });
      });
      setTimeout(function () { arrival.remove(); }, 1400);
    }
  } catch (e) { /* stockage indisponible */ }

  var rising = all([
    ".stop-panel",
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

  /* ── Le curseur est un nœud ──
     Un anneau le suit avec un léger retard (c'est vers lui que
     convergent les liens des constellations) et s'élargit sur ce
     qui se clique. Souris seulement ; le curseur natif reste. */
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var ring = document.createElement("div");
    ring.className = "cursor-node";
    ring.setAttribute("aria-hidden", "true");
    document.body.appendChild(ring);
    var rx = -100, ry = -100, gx = -100, gy = -100, seen = false;
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      gx = e.clientX;
      gy = e.clientY;
      if (!seen) { seen = true; rx = gx; ry = gy; }
      ring.classList.add("on");
      var t = e.target;
      ring.classList.toggle("over", !!(t && t.closest && t.closest("a, button, .logo3d, #gameCanvas, .shot img")));
      ring.classList.toggle("typing", !!(t && t.closest && t.closest("input, textarea")));
    }, { passive: true });
    document.documentElement.addEventListener("mouseleave", function () { ring.classList.remove("on"); });
    (function follow() {
      rx += (gx - rx) * 0.22;
      ry += (gy - ry) * 0.22;
      ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0)";
      requestAnimationFrame(follow);
    })();
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
    var go = function (url, delay) { setTimeout(function () { location.href = url; }, delay); };
    var remember = function (key, planet) {
      try { sessionStorage.setItem(key, JSON.stringify({ i: planet, at: Date.now() })); } catch (err) { /* stockage indisponible */ }
    };
    /* entrer dans une planète : on fonce dessus, son atmosphère emplit l'écran */
    var planet = link.getAttribute("data-planet");
    if (planet !== null && window.monde3d) {
      root.classList.add("leaving");
      window.monde3d.dive(+planet);
      window.monde3d.leave();
      var entering = veil(planet, false);
      setTimeout(function () { entering.classList.add("on"); }, 470);
      remember("planete", +planet);
      go(link.href, 860);
      return;
    }
    /* quitter la page d'une réalisation pour l'accueil : on redécolle de sa planète */
    if (homePlanet >= 0 && link.origin === location.origin && /(^|\/)(index\.html)?$/.test(link.pathname)) {
      root.classList.add("leaving");
      veil(homePlanet, false).offsetWidth;
      document.querySelector(".veil").classList.add("on");
      if (window.monde3d) window.monde3d.leave();
      remember("decollage", homePlanet);
      go(link.origin + link.pathname + "#" + STOP_IDS[homePlanet], 380);
      return;
    }
    root.classList.add("leaving");
    if (window.monde3d) window.monde3d.leave();
    setTimeout(function () { location.href = link.href; }, 430);
  });
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    root.classList.remove("leaving");
    all(".veil").forEach(function (v) { v.remove(); });
    if (window.monde3d) window.monde3d.back();
  });
})();
