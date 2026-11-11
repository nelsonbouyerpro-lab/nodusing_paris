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
  var N_DUST = small ? 1900 : 4400;

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
    pushStar(dust.x, dust.y, z, z, 0.9 + Math.pow(rand(), 4) * 3.4, 0, dust.phase);   // beaucoup de faibles, peu de brillantes
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
    /* les constellations s'effacent bien avant d'arriver sur nous : de
       près, une figure deviendrait énorme et volerait la vedette au contenu */
    "float fogFigure(float z, float edge) { return smoothstep(" + FAR.toFixed(1) + ", " + (FAR * 0.45).toFixed(1) + ", z) * smoothstep(edge * 0.2, edge, z); }",
    /* flou de profondeur de champ, en pixels */
    "float blur(float z) { return abs(1.0 / z - 1.0 / uFocus) * uAperture * uH; }",
    /* une clairière là où vit le contenu : le ciel s'y fait plus discret.
       uClear = (force, centre x, centre y, rayon) ; uClearY = 1 : ronde, 0 : une colonne */
    "uniform vec4 uClear; uniform float uClearY;",
    "float clearing(vec2 ndc) {",
    "  float d = length((ndc - uClear.yz) * vec2(uAspect, uClearY)) / uClear.w;",
    "  return 1.0 - uClear.x * (1.0 - smoothstep(0.45, 1.1, d));",
    "}",
    /* les ondes lancées d'un clic : un anneau qui s'élargit, avive ce
       qu'il traverse et le repousse un instant.
       uWave[i] = (centre x, centre y, rayon, force) ; renvoie (déplacement, éclat) */
    "uniform vec4 uWave[3];",
    "vec3 ripple(vec2 ndc) {",
    "  vec2 push = vec2(0.0);",
    "  float glow = 0.0;",
    "  for (int i = 0; i < 3; i++) {",
    "    vec2 d = (ndc - uWave[i].xy) * vec2(uAspect, 1.0);",
    "    float len = length(d), q = (len - uWave[i].z) / 0.09;",
    "    float band = exp(-q * q) * uWave[i].w;",
    "    glow += band;",
    "    push += d / max(len, 1e-3) * band;",
    "  }",
    "  return vec3(push * vec2(1.0 / uAspect, 1.0) * 0.04, glow);",
    "}"
  ].join("\n");

  var STAR_VS = [
    "attribute vec3 aPos; attribute vec4 aInfo;",     // repli, taille, sorte, phase
    VIEW,
    "uniform vec3 uPtr;",                             // pointeur (x, y en coordonnées écran, présence)
    "uniform vec3 uSel;",                             // l'étoile choisie pour tracer un lien (x, y, présence)
    "varying float vAlpha, vSoft, vKind, vCore, vTint;",
    "void main() {",
    "  vec3 p = toView(aPos, aInfo.x, aInfo.w);",
    "  float z = max(p.z, 1.0);",
    "  float kind = aInfo.z;",
    "  vec2 ndc = p.xy * uF / z * vec2(1.0 / uAspect, 1.0);",
    /* les étoiles proches du curseur s'allument */
    "  float near = smoothstep(0.34, 0.0, length((ndc - uPtr.xy) * vec2(uAspect, 1.0))) * uPtr.z * step(0.5, kind);",
    "  float sel = smoothstep(0.02, 0.0, length((ndc - uSel.xy) * vec2(uAspect, 1.0))) * uSel.z * step(0.5, kind);",
    "  vec3 wave = ripple(ndc);",
    "  ndc += wave.xy;",
    "  float rad = aInfo.y * uF / z * uH * 0.5 * (1.0 + near * 0.5 + sel * 1.3 + wave.z * 0.8);",
    "  float dim = 1.0;",
    "  if (rad < 0.8) { dim = rad * rad / 0.64; rad = 0.8; }",       // plus petite qu'un pixel : elle pâlit au lieu de disparaître
    "  float coc = blur(z);",
    "  float core = rad + coc;",
    "  float reach = kind > 1.5 ? 7.0 : (kind > 0.5 ? 4.5 : 1.0);",  // place pour le halo et les aigrettes
    "  gl_PointSize = clamp(2.0 * core * reach + 2.0, 2.0, 250.0);",
    "  gl_Position = vec4(ndc, 0.0, 1.0);",
    "  if (p.z < 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);",      // derrière la caméra : hors champ
    "  float twinkle = 1.0 + 0.3 * sin(uTime * (1.1 + fract(aInfo.w * 7.3) * 2.4) + aInfo.w * 40.0);",
    "  vAlpha = (kind > 0.5 ? fogFigure(p.z, 950.0) : fog(p.z)) * uFade * dim * twinkle * mix(0.1, 1.0, pow(rad / core, 1.4)) * (1.0 + near * 1.3 + sel * 2.0 + wave.z * 2.6) * clearing(ndc);",
    "  vSoft = clamp(coc / core, 0.0, 1.0);",
    "  vCore = core / (gl_PointSize * 0.5);",
    "  vKind = kind;",
    "  vTint = fract(aInfo.w * 3.7);",
    "}"
  ].join("\n");

  var STAR_FS = [
    PRECISION,
    "uniform vec3 uColA, uColB, uColCore;",
    "uniform float uAdd, uGain, uGlow, uRing, uWarm;",
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
    /* la nuit, toutes les étoiles n'ont pas la même température : quelques-unes sont dorées */
    "  col = mix(col, vec3(1.0, 0.82, 0.60), step(0.86, fract(vTint * 7.13)) * uWarm * (1.0 - 0.5 * isStar));",
    "  gl_FragColor = vec4(col * a, a * (1.0 - uAdd));",
    "}"
  ].join("\n");

  var LINE_VS = [
    "attribute vec3 aA, aB;",
    "attribute vec4 aI;",        // repli, phase de A, phase de B, graine
    "attribute vec2 aE;",        // extrémité (0 = A, 1 = B), côté (-1 / +1)
    VIEW,
    "uniform float uLineW, uStretch;",          // uStretch < 1 : le trait est raccourci vers A (traînées)
    "uniform vec3 uPtr;",                        // pointeur (x, y, présence)
    "uniform float uNearEdge;",                  // distance en deçà de laquelle le trait s'efface
    "varying float vAlpha, vT, vSide, vHalf, vCoc, vSeed;",
    "void main() {",
    "  vec3 a = toView(aA, aI.x, aI.y), b = toView(mix(aA, aB, uStretch), aI.x, aI.z);",
    "  float za = max(a.z, 1.0), zb = max(b.z, 1.0);",
    "  vec2 sa = a.xy * uF / za * vec2(1.0 / uAspect, 1.0);",
    "  vec2 sb = b.xy * uF / zb * vec2(1.0 / uAspect, 1.0);",
    "  vec3 wa = ripple(sa), wb = ripple(sb);",          // les liens suivent leurs étoiles dans l'onde
    "  sa += wa.xy; sb += wb.xy;",
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
    "  vAlpha = fogFigure(mix(a.z, b.z, aE.x), uNearEdge) * uFade * (uLineW + 1.0) / halfW",   // … et pâlit d'autant
    "         * step(40.0, min(a.z, b.z)) * clearing(mix(sa, sb, aE.x)) * (1.0 + mix(wa.z, wb.z, aE.x) * 2.0)",
    "         * (1.0 + smoothstep(0.38, 0.0, length((mix(sa, sb, aE.x) - uPtr.xy) * vec2(uAspect, 1.0))) * uPtr.z * 1.7);",
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
    "  if (uMeteor > 1.5) {",                                    // un lien tracé par le visiteur : net et constant
    "    float m = edge * vQ.z;",
    "    gl_FragColor = vec4(uColP * m, m * (1.0 - uAdd));",
    "    return;",
    "  }",
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
    /* la voie lactée : une bande pâle qui traverse le ciel, coupée de poussières sombres */
    "  float al = mod(p.y * 0.86 + p.x * 0.5 - 1.85, 2.4) - 1.2;",
    "  float milky = exp(-al * al / 0.045);",
    "  col += vec3(0.09, 0.11, 0.20) * milky * (0.35 + 0.9 * fbm(p * 5.0 + 11.0));",
    "  col *= 1.0 - 0.55 * milky * smoothstep(0.50, 0.72, fbm(p * 4.2 + 20.0));",
    "  gl_FragColor = vec4(col, cloud);",
    "}"
  ].join("\n");

  var BG_FS = [
    PRECISION,
    "uniform vec2 uRes, uGlowAt; uniform vec3 uBg, uGlow; uniform float uGlowAmt, uDark, uNebOn;",
    "uniform vec4 uWave[3];",
    "uniform sampler2D uNeb;",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / uRes;",
    "  vec2 q = (uv - uGlowAt) * vec2(uRes.x / uRes.y, 1.0);",
    "  float g = exp(-dot(q, q) * 2.6);",                                  // halo au centre
    "  float edge = smoothstep(0.35, 1.25, length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));",
    "  vec3 c = uBg + uGlow * (g * uGlowAmt) - edge * 0.035 * (1.0 - uBg) - edge * 0.025 * uBg;",
    "  vec4 neb = texture2D(uNeb, uv) * uNebOn;",
    "  c += neb.rgb * uDark * 0.72;",                                      // la nuit : de la lumière
    "  c -= neb.a * (1.0 - uDark) * vec3(0.05, 0.036, 0.004);",            // le jour : un lavis bleuté sur le papier
    /* le front de chaque onde : un cercle fin */
    "  for (int i = 0; i < 3; i++) {",
    "    float qw = (length((uv * 2.0 - 1.0 - uWave[i].xy) * vec2(uRes.x / uRes.y, 1.0)) - uWave[i].z) / 0.010;",
    "    c = mix(c, mix(vec3(0.0, 0.184, 0.655), vec3(0.55, 0.68, 1.0), uDark), exp(-qw * qw) * uWave[i].w * 0.4);",
    "  }",
    "  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);",
    "  gl_FragColor = vec4(c + (n - 0.5) / 255.0, 1.0);",                  // grain : pas de bandes dans les dégradés
    "}"
  ].join("\n");

  /* les planètes du voyage : une sphère dessinée dans son carré, avec
     un relief de bruit fractal, un terminateur doux et une atmosphère.
     uKind : 0 océans, terres, nuages (et leur ombre), villes côté nuit ·
     1 géante gazeuse dont les anneaux portent son ombre (et elle la leur) ·
     2 lune de roche criblée de cratères. L'éclairage est calculé en
     lumière réelle, puis passé par une courbe filmique. */
  var PLANET_FS = [
    PRECISION,
    "uniform vec2 uC; uniform float uR, uTime, uKind, uAlpha, uAdd, uOct;",   // uOct : finesse du détail, selon la taille à l'écran
    "const vec3 L = vec3(-0.5496, 0.4996, 0.6695);",       // la lumière vient du logo-étoile, en haut à gauche
    "const vec3 RING_N = vec3(0.2197, 0.8987, 0.3795);",   // l'axe des anneaux de la géante

    /* ── bruit de gradient : plus net et plus naturel qu'un bruit de valeurs ── */
    /* hachage sans trigonométrie : c'est lui qu'on appelle le plus, il doit rester léger */
    "vec3 hash3(vec3 p) {",
    "  p = fract(p * vec3(0.1031, 0.1030, 0.0973));",
    "  p += dot(p, p.yxz + 33.33);",
    "  return -1.0 + 2.0 * fract((p.xxy + p.yxx) * p.zyx);",
    "}",
    "float gnoise(vec3 p) {",
    "  vec3 i = floor(p), f = fract(p);",
    "  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);",
    "  return mix(mix(mix(dot(hash3(i), f), dot(hash3(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),",
    "                 mix(dot(hash3(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)), dot(hash3(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x), u.y),",
    "             mix(mix(dot(hash3(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)), dot(hash3(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),",
    "                 mix(dot(hash3(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)), dot(hash3(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);",
    "}",
    /* bruit fractal, centré sur 0 (≈ −0,6 … 0,6) ; moins d'octaves quand la planète est petite */
    "float fbm(vec3 p) {",
    "  float v = 0.0, a = 0.5;",
    "  for (int i = 0; i < 6; i++) {",
    "    if (float(i) >= uOct) break;",
    "    v += a * gnoise(p);",
    "    p = p * 2.03 + vec3(1.7, 9.2, 4.1);",
    "    a *= 0.5;",
    "  }",
    "  return v;",
    "}",
    "float fbmLow(vec3 p) { return 0.5 * gnoise(p) + 0.25 * gnoise(p * 2.03 + 1.7) + 0.125 * gnoise(p * 4.1 + 9.2); }",
    /* cellules : le vecteur vers le centre de cellule le plus proche (xyz) et sa distance (w) */
    "vec4 cells(vec3 p) {",
    "  vec3 i = floor(p), f = fract(p);",
    "  vec4 r = vec4(0.0, 0.0, 0.0, 8.0);",
    "  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {",
    "    vec3 g = vec3(float(x), float(y), float(z));",
    "    vec3 v = g + hash3(i + g) * 0.4 + 0.5 - f;",
    "    float d = dot(v, v);",
    "    if (d < r.w) r = vec4(v, d);",
    "  }",
    "  return vec4(r.xyz, sqrt(r.w));",
    "}",
    /* un cratère : une cuvette et son rempart. x : hauteur · y : pente (vers l'extérieur) */
    "vec2 crater(float d, float radius) {",
    "  float x = d / radius;",
    "  float bowl = x < 0.8 ? -(1.0 - x * x / 0.64) : 0.0;",
    "  float q = (x - 0.95) / 0.13, rim = 0.45 * exp(-q * q);",
    "  float slope = (x < 0.8 ? 2.0 * x / 0.64 : 0.0) - rim * 2.0 * q / 0.13;",
    "  return vec2(bowl + rim, slope / radius);",
    "}",

    /* du repère de l'écran à celui de la planète (axe incliné, rotation lente), et retour */
    "vec3 spin(vec3 n) {",
    "  vec3 s = vec3(n.x * 0.94 - n.y * 0.34, n.x * 0.34 + n.y * 0.94, n.z);",
    "  float a = uTime * 0.03, c = cos(a), d = sin(a);",
    "  return vec3(s.x * c + s.z * d, s.y, -s.x * d + s.z * c);",
    "}",
    "vec3 unspin(vec3 s) {",
    "  float a = uTime * 0.03, c = cos(a), d = sin(a);",
    "  vec3 n = vec3(s.x * c - s.z * d, s.y, s.x * d + s.z * c);",
    "  return vec3(n.x * 0.94 + n.y * 0.34, -n.x * 0.34 + n.y * 0.94, n.z);",
    "}",
    "vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }",        // couleur d'écran → lumière
    /* la matière des anneaux, selon la distance au centre : des sillons, une division sombre */
    "float ringDensity(float rho) {",
    "  float d = smoothstep(1.28, 1.34, rho) * (1.0 - smoothstep(2.02, 2.10, rho));",
    "  d *= 1.0 - smoothstep(1.62, 1.65, rho) * (1.0 - smoothstep(1.70, 1.73, rho)) * 0.9;",
    "  return d * clamp(0.62 + 0.7 * gnoise(vec3(rho * 38.0, 0.5, 0.5)) + 0.3 * gnoise(vec3(rho * 130.0, 2.5, 0.5)), 0.0, 1.0)",
    "           * (0.55 + 0.45 * smoothstep(1.30, 1.62, rho));",
    "}",
    /* la couverture nuageuse du monde d'océans : des masses tordues par le vent */
    "float clouds(vec3 s) {",
    "  vec3 w = vec3(gnoise(s * 2.1 + 3.0), gnoise(s * 2.1 + 11.0), gnoise(s * 2.1 + 19.0));",
    "  return smoothstep(0.10, 0.42, fbm(s * 2.9 + w * 0.85 + vec3(uTime * 0.008, 0.0, 0.0)) + 0.1);",
    "}",
    "vec3 tone(vec3 x) {",                                   // courbe filmique, puis retour en couleur d'écran
    "  x = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);",
    "  return pow(x, vec3(0.4545));",
    "}",

    "void main() {",
    "  vec2 q = (gl_FragCoord.xy - uC) / uR;",
    "  float r = length(q), aa = 1.5 / uR;",
    "  vec3 atmo = uKind < 0.5 ? vec3(0.30, 0.55, 1.0) : (uKind < 1.5 ? vec3(1.0, 0.80, 0.58) : vec3(0.55, 0.62, 0.78));",
    "  float air = uKind < 0.5 ? 1.0 : (uKind < 1.5 ? 0.45 : 0.0);",   // épaisseur d'atmosphère : la lune n'en a pas
    "  vec4 o = vec4(0.0);",
    "  if (r < 1.0) {",
    "    vec3 n = vec3(q, sqrt(max(1.0 - r * r, 0.0)));",
    "    vec3 s = spin(n), nb = n, col, glowNight = vec3(0.0);",
    "    float gloss = 0.0, shadowed = 1.0;",
    "    if (uKind < 0.5) {",
    /* ── un monde d'océans : côtes nettes, climats, glaces, nuages et leur ombre ── */
    "      float h = fbm(s * 1.9 + 3.0);",
    "      float land = smoothstep(0.035, 0.065, h);",
    "      vec3 sea = mix(lin(vec3(0.02, 0.07, 0.24)), lin(vec3(0.05, 0.22, 0.44)), smoothstep(-0.25, 0.035, h));",
    "      float dry = smoothstep(0.10, 0.34, h) * (1.0 - smoothstep(0.25, 0.6, abs(s.y)));",   // déserts aux latitudes chaudes
    "      vec3 ground = mix(lin(vec3(0.14, 0.25, 0.11)), lin(vec3(0.56, 0.47, 0.31)), dry);",
    "      ground = mix(ground, lin(vec3(0.36, 0.33, 0.30)), smoothstep(0.22, 0.42, h));",        // montagnes
    "      col = mix(sea, ground, land);",
    "      col = mix(col, lin(vec3(0.92, 0.95, 0.98)), smoothstep(0.72, 0.86, abs(s.y) + h * 0.35));",   // glaces
    "      float cloud = clouds(s);",
    "      if (uOct > 4.5) shadowed = 1.0 - 0.55 * clouds(spin(normalize(n + L * 0.035))) * (1.0 - cloud);",   // l'ombre des nuages sur le sol
    "      col = mix(col * shadowed, lin(vec3(0.90, 0.92, 0.95)), cloud * 0.92);",
    "      gloss = (1.0 - land) * (1.0 - cloud);",
    /* côté nuit, les lumières des villes */
    "      glowNight = vec3(1.0, 0.72, 0.38) * land * (1.0 - cloud) * smoothstep(0.26, 0.5, gnoise(s * 58.0))",
    "                * (1.0 - smoothstep(0.55, 0.8, abs(s.y))) * 0.5;",
    "    } else if (uKind < 1.5) {",
    /* ── une géante gazeuse : des bandes que le vent cisaille, une tempête, des pôles sombres ── */
    "      float lat = s.y + 0.05 * fbm(s * vec3(1.6, 4.5, 1.6) + 4.0);",
    "      if (uOct > 2.5) lat += 0.016 * fbm(s * vec3(5.0, 16.0, 5.0));",
    "      float band = 0.5 + 0.5 * sin(lat * 21.0 + 2.2 * sin(lat * 6.5 + 1.0));",
    "      col = mix(lin(vec3(0.50, 0.31, 0.20)), lin(vec3(0.88, 0.76, 0.60)), smoothstep(0.12, 0.88, band));",
    "      col = mix(col, lin(vec3(0.95, 0.90, 0.80)), smoothstep(0.55, 0.95, 0.5 + 0.5 * sin(lat * 47.0 + 1.3)) * 0.4);",
    "      if (uOct > 2.5) col *= 1.0 + 0.22 * fbm(s * vec3(6.0, 34.0, 6.0));",                    // fines stries
    "      vec3 sp = (s - vec3(0.55, -0.30, 0.78)) * vec3(1.0, 2.3, 1.0);",
    "      col = mix(col, lin(vec3(0.72, 0.34, 0.20)), smoothstep(0.21, 0.06, length(sp) + 0.03 * gnoise(s * 14.0)) * 0.8);",
    "      col = mix(col, lin(vec3(0.34, 0.31, 0.33)), smoothstep(0.72, 0.98, abs(s.y)));",
    /* l'ombre des anneaux sur la planète */
    "      float tr = -dot(n, RING_N) / dot(L, RING_N);",
    "      if (tr > 0.0) shadowed = 1.0 - 0.62 * ringDensity(length(n + L * tr));",
    "      col *= shadowed;",
    "    } else {",
    /* ── une lune de roche : des mers sombres, et de vrais cratères qui prennent la lumière ── */
    "      float mare = smoothstep(-0.02, 0.16, fbm(s * 1.7 + 1.7));",
    "      col = mix(lin(vec3(0.30, 0.30, 0.32)), lin(vec3(0.70, 0.69, 0.68)), mare) * (1.0 + 0.5 * fbm(s * 9.0 + 5.0));",
    "      vec4 big = uOct > 2.5 ? cells(s * 3.1 + 0.07 * fbm(s * 5.0)) : vec4(0.0, 1.0, 0.0, 1.0);",   // en plongée, pas de cratères : tout file
    "      vec2 cb = crater(big.w, 0.40);",
    "      vec3 tilt = unspin(big.xyz / max(big.w, 1e-3)) * cb.y * 0.06;",
    "      float relief = cb.x;",
    "      if (uOct > 3.5) {",
    "        vec4 fine = cells(s * 8.3 + 2.0);",
    "        vec2 cf = crater(fine.w, 0.34);",
    "        tilt += unspin(fine.xyz / max(fine.w, 1e-3)) * cf.y * 0.04;",
    "        relief += cf.x * 0.5;",
    "      }",
    "      nb = normalize(n + tilt - n * dot(tilt, n));",
    "      col *= 1.0 + 0.22 * relief;",                                                           // remparts clairs, fonds sombres
    "    }",
    /* l'éclairage, en lumière réelle : un terminateur que l'atmosphère adoucit */
    "    float wrap = 0.22 * air;",
    "    float sun = max((dot(nb, L) + wrap) / (1.0 + wrap), 0.0);",
    "    float day = smoothstep(-0.05, 0.25, dot(n, L));",
    "    vec3 c = col * sun * 2.0;",
    "    c += vec3(1.0, 0.96, 0.88) * pow(max(reflect(-L, nb).z, 0.0), 90.0) * 1.6 * gloss * day;",   // le soleil sur l'océan
    "    c += glowNight * (1.0 - smoothstep(-0.12, 0.08, dot(n, L)));",
    /* l'atmosphère : bleue au limbe, plus chaude le long du terminateur */
    "    float limb = pow(1.0 - n.z, 3.0);",
    "    vec3 sky = mix(vec3(1.0, 0.55, 0.30), lin(atmo), smoothstep(0.0, 0.5, dot(n, L)));",
    "    c = mix(c, sky * 1.5, limb * air * (0.06 + 0.62 * day));",
    "    c += lin(atmo) * pow(1.0 - n.z, 8.0) * air * day * 1.2;",
    "    c = tone(c);",
    "    float cov = 1.0 - smoothstep(1.0 - aa, 1.0, r);",
    "    o = vec4(c * cov, cov);",
    "  }",
    /* le halo d'atmosphère, hors du disque, côté éclairé surtout */
    "  float h = exp(-max(r - 1.0, 0.0) * 17.0) * (0.15 + 0.85 * smoothstep(-0.5, 0.6, dot(normalize(q + 1e-4), L.xy))) * 0.45 * air * step(r, 1.5);",
    "  vec4 g = vec4(atmo * h, h * (1.0 - uAdd) * 0.6);",
    "  o = o + g * (1.0 - o.a);",
    /* les anneaux de la géante : un disque incliné, devant puis derrière
       elle, sur lequel elle projette son ombre */
    "  if (uKind > 0.5 && uKind < 1.5) {",
    "    float z = -(RING_N.x * q.x + RING_N.y * q.y) / RING_N.z;",
    "    vec3 p3 = vec3(q, z);",
    "    float rho = length(p3);",
    "    float ring = ringDensity(rho) * 0.82;",
    "    if (z < 0.0 && r < 1.0) ring = 0.0;",                         // la planète cache l'arrière
    "    float b = dot(p3, L), disc = b * b - (rho * rho - 1.0);",
    "    float shade = (b < 0.0 && disc > 0.0) ? smoothstep(0.0, 0.05, disc) : 0.0;",   // dans l'ombre de la planète
    "    vec3 rc = tone(lin(vec3(0.80, 0.71, 0.58)) * (0.85 + 0.5 * gnoise(vec3(rho * 90.0, 1.5, 0.5))) * (1.0 - 0.9 * shade) * 1.7);",
    "    vec4 rg = vec4(rc * ring, ring);",
    "    o = rg + o * (1.0 - rg.a);",
    "  }",
    /* un grain imperceptible : pas de bandes dans les dégradés */
    "  o.rgb += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0 * o.a;",
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
      var name = gl.getActiveUniform(p, k).name.replace("[0]", "");
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
  /* ── Jouer avec le ciel ──
     Un clic dans le vide lance une onde. Un clic sur une étoile la
     choisit ; le clic suivant sur une autre étoile trace un lien entre
     elles, et ainsi de suite : on dessine sa constellation. Elle est
     faite de vraies étoiles du ciel, donc elle voyage avec lui, et on la
     retrouve de page en page (le ciel est le même partout). */
  var waves = [{ x: 0, y: 0, at: -1e9 }, { x: 0, y: 0, at: -1e9 }, { x: 0, y: 0, at: -1e9 }], waveNext = 0;
  var waveData = new Float32Array(12);
  function addWave(px, py) {
    waves[waveNext] = { x: px / canvas.clientWidth * 2 - 1, y: 1 - py / canvas.clientHeight * 2, at: performance.now() };
    waveNext = (waveNext + 1) % 3;
  }
  var MAX_USER = 40;
  var userLinks = [], pending = -1;       // paires d'indices dans figures · étoile en attente d'un lien
  try {
    userLinks = (JSON.parse(sessionStorage.getItem("constellation") || "[]") || []).filter(function (l) {
      return l && l[0] >= 0 && l[1] >= 0 && l[0] < figures.length && l[1] < figures.length;
    });
  } catch (e) { userLinks = []; }
  function saveLinks() {
    try { sessionStorage.setItem("constellation", JSON.stringify(userLinks)); } catch (e) { /* stockage indisponible */ }
  }
  var userData = new Float32Array((MAX_USER + 1) * 6 * 5);

  var MAX_LINKS = 6;
  var linkData = new Float32Array(MAX_LINKS * 6 * 5);
  var linkBuf = buffer(linkData, gl.DYNAMIC_DRAW);
  var userBuf = buffer(userData, gl.DYNAMIC_DRAW);

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
    nebW = Math.max(32, Math.round(canvas.clientWidth / 3));
    nebH = Math.max(32, Math.round(canvas.clientHeight / 3));
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
    if (takeoff && Date.now() - takeoff.at < 15000) dive = { i: takeoff.i, at: performance.now(), dir: -1 };
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
    api.progress = p;
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
      /* finesse du détail : inutile de calculer ce qu'on ne peut pas voir
         (petite au loin), ni pendant la plongée, où tout file */
      var px = R * dpr;
      gl.uniform1f(planetProg.u.uOct, zoom > 1.15 ? 2 : (px < 90 ? 3 : (px < 260 ? 4 : (px < 620 ? 5 : 6))));
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
  var clear = heroLogo ? { force: 0.82, x: 0, y: 0, r: 1, round: 1 } : { force: 0.72, x: 0, y: 0, r: 0.8, round: 0 };
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
    gl.uniform4fv(u.uWave, waveData);
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
    if (!pointer.on || leaveAt || pending >= 0) return 0;    // pendant qu'on trace, pas de liens automatiques
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

  /* où tombe l'étoile i à l'écran (pixels CSS), et sa netteté ; null si on ne la voit pas */
  function screenOf(i) {
    var p = project(figures[i]);
    if (!p || p.z > FAR * 0.8) return null;
    var far = Math.min(1, Math.max(0, (FAR * 0.8 - p.z) / (FAR * 0.3)));
    var near = Math.min(1, Math.max(0, (p.z - 190) / 760));
    return { x: (p.x * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - p.y * 0.5) * canvas.clientHeight, a: far * near, nx: p.x, ny: p.y };
  }
  /* l'étoile de constellation sous un point de l'écran, ou -1 */
  function starAt(px, py) {
    var best = -1, bestD = 26;
    for (var i = 0; i < figures.length; i++) {
      var sc = screenOf(i);
      if (!sc || sc.a < 0.15) continue;
      var d = Math.hypot(sc.x - px, sc.y - py);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  /* les liens tracés par le visiteur, et celui qu'il est en train de tirer */
  function buildUser() {
    var cw = canvas.clientWidth, ch = canvas.clientHeight, o = 0, n = 0;
    var seg = function (x0, y0, x1, y1, alpha) {
      var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      if (len < 1 || alpha < 0.01 || n > MAX_USER) return;
      var nx = -dy / len * 1.7, ny = dx / len * 1.7;
      [[0, -1], [0, 1], [1, -1], [1, -1], [0, 1], [1, 1]].forEach(function (c) {
        userData[o++] = ((c[0] ? x1 : x0) + nx * c[1]) / cw * 2 - 1;
        userData[o++] = 1 - ((c[0] ? y1 : y0) + ny * c[1]) / ch * 2;
        userData[o++] = c[0];
        userData[o++] = c[1];
        userData[o++] = alpha;
      });
      n++;
    };
    userLinks.forEach(function (l) {
      var a = screenOf(l[0]), b = screenOf(l[1]);
      if (a && b) seg(a.x, a.y, b.x, b.y, Math.min(a.a, b.a) * 0.9);
    });
    if (pending >= 0 && pointer.on) {
      var from = screenOf(pending);
      if (from) seg(from.x, from.y, pointer.px, pointer.py, 0.4 * from.a);
    }
    return n * 6;
  }

  /* un mot d'explication, la première fois qu'on choisit une étoile */
  var hinted = false;
  function hint() {
    if (hinted || userLinks.length) return;
    hinted = true;
    var el = document.createElement("p");
    el.className = "sky-hint";
    el.setAttribute("role", "status");
    el.textContent = root.lang === "en" ? "Click another star to link them" : "Cliquez une autre étoile pour les relier";
    document.body.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("on"); }); });
    setTimeout(function () { el.classList.remove("on"); }, 4500);
    setTimeout(function () { el.remove(); }, 5200);
  }

  /* un clic « dans le ciel » : ni sur un lien, ni sur un panneau, ni sur un champ */
  var SOLID = "a, button, input, textarea, select, label, canvas, form, .stop-panel, .form-success, .win-panel, .lang-toggle";
  function inSky(e) { return !(e.target.closest && e.target.closest(SOLID)); }
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || leaveAt || e.button !== 0 || !inSky(e)) return;
    var hit = starAt(e.clientX, e.clientY);
    if (hit < 0) { pending = -1; addWave(e.clientX, e.clientY); return; }
    if (pending >= 0 && pending !== hit) {
      var known = userLinks.some(function (l) { return (l[0] === pending && l[1] === hit) || (l[0] === hit && l[1] === pending); });
      if (!known) {
        userLinks.push([pending, hit]);
        if (userLinks.length > MAX_USER) userLinks.shift();
        saveLinks();
      }
    } else if (pending < 0) {
      hint();
    }
    pending = hit;
  });
  /* double-clic dans le vide : on efface sa constellation ; Échap : on lâche l'étoile en cours */
  document.addEventListener("dblclick", function (e) {
    if (!inSky(e) || starAt(e.clientX, e.clientY) >= 0) return;
    userLinks = [];
    pending = -1;
    saveLinks();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") pending = -1; });

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

    for (var w = 0; w < 3; w++) {
      var age = (now - waves[w].at) / 1700;
      waveData[w * 4] = waves[w].x;
      waveData[w * 4 + 1] = waves[w].y;
      waveData[w * 4 + 2] = 2.2 * easeOut(age);
      waveData[w * 4 + 3] = age < 1 ? Math.pow(1 - age, 1.5) : 0;
    }
    api.nearStar = pointer.on === 1 && starAt(pointer.px, pointer.py) >= 0;

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
    gl.uniform4fv(bgProg.u.uWave, waveData);
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
    gl.uniform1f(lineProg.u.uNearEdge, 950);
    gl.uniform1f(lineProg.u.uGain, mix(0.26, 0.33, theme) * CALM);
    gl.uniform3f(lineProg.u.uPtr, pointer.x, -pointer.y, ptrGlow);
    gl.uniform1f(lineProg.u.uPulse, mix(0.9, 1.5, theme) * CALM);
    gl.uniform3fv(lineProg.u.uColA, mix3(COL_A[0], COL_A[1], theme));
    gl.uniform3fv(lineProg.u.uColP, mix3(COL_PULSE[0], COL_PULSE[1], theme));
    gl.drawArrays(gl.TRIANGLES, 0, N_LINE_VERTS);

    /* 3 bis · le filé des étoiles : court en croisière (on sent qu'on
       avance), long en plongée entre deux pages */
    attribs(streakBuf, 48, [3, 3, 4, 2]);
    gl.uniform1f(lineProg.u.uLineW, 0.4 * dpr);
    gl.uniform3f(lineProg.u.uPtr, 0, 0, 0);
    gl.uniform1f(lineProg.u.uNearEdge, 320);
    gl.uniform1f(lineProg.u.uStretch, Math.min(1, Math.max(0.05, speed / 2600)));
    gl.uniform1f(lineProg.u.uGain, (0.22 + warp * 0.5) * mix(0.5, 0.8, theme) * mix(0.4, 1, CALM));
    gl.uniform1f(lineProg.u.uPulse, 0);
    gl.drawArrays(gl.TRIANGLES, 0, N_STREAK_VERTS);

    /* 4 · les liens vers le curseur, et l'étoile filante */
    var linkVerts = buildLinks(), meteorVerts = buildMeteor(time), userVerts = buildUser();
    if (linkVerts || meteorVerts || userVerts) {
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
      if (userVerts) {
        gl.bindBuffer(gl.ARRAY_BUFFER, userBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, userData);
        attribs(userBuf, 20, [2, 3]);
        gl.uniform1f(linkProg.u.uMeteor, 2);
        gl.drawArrays(gl.TRIANGLES, 0, userVerts);
      }
    }

    /* 5 · les étoiles */
    gl.useProgram(starProg.p);
    attribs(starBuf, 28, [3, 4]);
    setView(starProg, fade);
    gl.uniform3f(starProg.u.uPtr, pointer.x, -pointer.y, ptrGlow);
    var chosen = pending >= 0 ? screenOf(pending) : null;
    gl.uniform3f(starProg.u.uSel, chosen ? chosen.nx : 0, chosen ? chosen.ny : 0, chosen ? 1 : 0);
    gl.uniform1f(starProg.u.uGain, mix(0.62, 0.95, theme) * mix(0.55, 1, CALM));
    gl.uniform1f(starProg.u.uGlow, mix(0.3, 1, theme));
    gl.uniform1f(starProg.u.uRing, mix(0.55, 0.16, theme));
    gl.uniform1f(starProg.u.uWarm, theme);
    gl.uniform3fv(starProg.u.uColA, mix3(COL_A[0], COL_A[1], theme));
    gl.uniform3fv(starProg.u.uColB, mix3(COL_B[0], COL_B[1], theme));
    gl.uniform3fv(starProg.u.uColCore, mix3(COL_CORE[0], COL_CORE[1], theme));
    gl.drawArrays(gl.POINTS, 0, N_STARS);

    /* 6 · les planètes du voyage, devant les étoiles */
    drawPlanets(now, time);
  }
  requestAnimationFrame(frame);

  /* interface publique, pour les transitions de page */
  var api = window.monde3d = {
    nearStar: false,             // le curseur est-il sur une étoile qu'on peut relier ?
    progress: 0,                 // où en est le voyage (0 : le logo, 1 : la première escale…)
    /* lance une onde depuis un point de l'écran (pixels CSS) */
    wave: function (px, py) { addWave(px, py); },
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
    if (crossing && Date.now() - crossing.at < 15000) {
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
      /* sur une étoile qu'on peut relier, l'anneau le signale */
      ring.classList.toggle("star", !!(window.monde3d && window.monde3d.nearStar) && !ring.classList.contains("over"));
      requestAnimationFrame(follow);
    })();
  }

  /* ── Le repère du voyage (accueil) ──
     Une colonne de points, à droite : une par étape. Celui de l'étape
     en cours est allumé ; chacun y emmène. Le nom de l'étape (lu dans
     son titre, donc dans la langue courante) paraît au survol. */
  var stops = all(".stop");
  if (stops.length && root.classList.contains("gl-world")) {
    var nav = document.createElement("nav");
    nav.className = "voyage-nav";
    nav.setAttribute("aria-label", "Étapes du voyage");
    var dots = [["#depart", null]].concat(stops.map(function (st) { return ["#" + st.id, st.querySelector("h2")]; })).map(function (d, i) {
      var a = document.createElement("a");
      a.href = d[0];
      var name = function () { return d[1] ? d[1].textContent.replace(/\.$/, "") : "nodusing"; };
      a.setAttribute("aria-label", name());
      a.innerHTML = '<span class="voyage-nav-name"></span><span class="voyage-nav-dot"></span>';
      var refresh = function () { a.firstChild.textContent = (i ? "0" + i + " · " : "") + name(); a.setAttribute("aria-label", name()); };
      a.addEventListener("pointerenter", refresh);
      a.addEventListener("focus", refresh);
      nav.appendChild(a);
      return a;
    });
    document.body.appendChild(nav);
    var current = -1;
    (function watch() {
      var at = Math.round(window.monde3d ? window.monde3d.progress : 0);
      if (at !== current) {
        current = at;
        dots.forEach(function (a, i) { a.classList.toggle("on", i === at); });
      }
      requestAnimationFrame(watch);
    })();
  }

  /* ── Le message part en comète ──
     Quand le formulaire de contact est bien parti (script.js émet
     « nodusing:message »), une comète s'élance du bouton vers l'étoile
     du logo ; à l'arrivée, une onde, et une nouvelle étoile s'allume à
     côté du logo. Elle y reste le temps de la visite. */
  function lightStar(ignite) {
    var brand = document.querySelector(".brand");
    if (!brand || brand.querySelector(".new-star")) return;
    var star = document.createElement("span");
    star.className = "new-star" + (ignite ? " ignite" : "");
    star.setAttribute("aria-hidden", "true");
    brand.appendChild(star);
  }
  try { if (sessionStorage.getItem("etoile")) lightStar(false); } catch (e) { /* stockage indisponible */ }

  function comet(from) {
    var node = document.querySelector(".brand .themed-logo circle:last-of-type, .brand .mono-accent");
    var box = node ? node.getBoundingClientRect() : null;
    var x0 = from.x != null ? from.x : window.innerWidth / 2, y0 = from.y != null ? from.y : window.innerHeight * 0.7;
    var x1 = box ? box.left + box.width / 2 : window.innerWidth / 2, y1 = box ? box.top + box.height / 2 : -40;
    /* une trajectoire courbe : elle monte avant de piquer vers le logo */
    var cx = (x0 + x1) / 2 + (y1 - y0) * 0.25, cy = Math.min(y0, y1) - 150;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:350;pointer-events:none";
    cv.width = window.innerWidth * dpr;
    cv.height = window.innerHeight * dpr;
    document.body.appendChild(cv);
    var g = cv.getContext("2d");
    g.scale(dpr, dpr);
    var rgb = root.dataset.theme === "dark" ? "170, 195, 255" : "0, 47, 167";
    var start = performance.now(), FLY = 1500, BURST = 700;
    var at = function (e) {                                  // un point de la trajectoire, e de 0 à 1
      var u = 1 - e;
      return [u * u * x0 + 2 * u * e * cx + e * e * x1, u * u * y0 + 2 * u * e * cy + e * e * y1];
    };
    (function draw(now) {
      var t = (now - start) / FLY;
      g.clearRect(0, 0, window.innerWidth, window.innerHeight);
      /* la tête avance (lent, vif, lent) ; la queue est le morceau de
         trajectoire juste derrière elle, et la rejoint à l'arrivée */
      var tt = Math.min(t, 1);
      var head = tt < 0.5 ? 4 * tt * tt * tt : 1 - Math.pow(-2 * tt + 2, 3) / 2;
      var tail = Math.max(0, head - 0.24 * Math.max(0, 1 - Math.max(0, t - 1) * 5));
      g.lineCap = "round";
      var prev = at(tail), STEPS = 26;
      for (var i = 1; i <= STEPS && head > tail; i++) {
        var k = i / STEPS, pt = at(tail + (head - tail) * k);
        g.strokeStyle = "rgba(" + rgb + ", " + (k * 0.85).toFixed(3) + ")";
        g.lineWidth = 0.5 + k * 4.5;
        g.beginPath();
        g.moveTo(prev[0], prev[1]);
        g.lineTo(pt[0], pt[1]);
        g.stroke();
        prev = pt;
      }
      if (t < 1) {
        var hp = at(head);
        var glow = g.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], 26);
        glow.addColorStop(0, "rgba(255, 255, 255, 0.95)");
        glow.addColorStop(0.25, "rgba(" + rgb + ", 0.7)");
        glow.addColorStop(1, "rgba(" + rgb + ", 0)");
        g.fillStyle = glow;
        g.beginPath();
        g.arc(hp[0], hp[1], 26, 0, Math.PI * 2);
        g.fill();
      }
      if (t >= 1) {
        /* l'arrivée : un éclat qui s'élargit et s'éteint */
        var b = Math.min(1, (now - start - FLY) / BURST), out = 1 - Math.pow(1 - b, 3);
        g.strokeStyle = "rgba(" + rgb + ", " + ((1 - b) * 0.8).toFixed(3) + ")";
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x1, y1, 6 + out * 44, 0, Math.PI * 2);
        g.stroke();
        var flash = g.createRadialGradient(x1, y1, 0, x1, y1, 30);
        flash.addColorStop(0, "rgba(255, 255, 255, " + ((1 - b) * 0.9).toFixed(3) + ")");
        flash.addColorStop(1, "rgba(" + rgb + ", 0)");
        g.fillStyle = flash;
        g.beginPath();
        g.arc(x1, y1, 30, 0, Math.PI * 2);
        g.fill();
        if (!cv.arrived) {
          cv.arrived = true;
          lightStar(true);
          if (window.monde3d) window.monde3d.wave(x1, y1);
          try { sessionStorage.setItem("etoile", "1"); } catch (err) { /* stockage indisponible */ }
        }
        if (b >= 1) { cv.remove(); return; }
      }
      requestAnimationFrame(draw);
    })(start);
  }
  document.addEventListener("nodusing:message", function (e) { comet(e.detail || {}); });

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
