/* ════════════════════════════════════════════
   NODUSING PARIS — le monogramme en 3D (accueil)
   Chargé après script.js.

   Le N n'est pas un maillage : c'est une surface définie par une
   fonction de distance (4 sphères, 3 tubes soudés entre eux), rendue
   par lancer de rayons dans un fragment shader — ombres douces,
   occlusion, reflets d'un studio imaginaire. Aucun modèle, aucune
   bibliothèque.

   Il reprend la chorégraphie du logo SVG : la plume trace le N, les
   nœuds éclosent à son passage, l'onde part du nœud accent ; puis une
   comète le reparcourt à chaque cycle. On peut le faire tourner au
   glissé : il revient toujours de face.

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
    gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
  } catch (e) { /* WebGL indisponible */ }
  if (!gl) return;

  /* Unités : celles du viewBox du logo (140 × 170) divisées par 100,
     centrées, y vers le haut. Le canvas déborde le SVG (210 % × 150 %)
     et le cadrage est réglé pour que le N de face se superpose
     exactement au SVG qu'il remplace. */
  var FS = [
    "precision highp float;",
    "uniform vec2 uRes;",
    "uniform mat3 uRot;",          // objet → vue
    "uniform float uDark, uProg, uTipA, uFade, uShadowW;",
    "uniform vec4 uPop;",          // éclosion des 4 nœuds
    "uniform vec3 uTip;",          // la plume / la comète
    "uniform vec3 uOrb[3];",       // satellites
    "uniform vec2 uRing;",         // avancement des deux ondes (hors 0–1 : éteintes)

    "const vec3 P0 = vec3(-0.44, -0.58, 0.0);",
    "const vec3 P1 = vec3(-0.44,  0.58, 0.0);",
    "const vec3 P2 = vec3( 0.44, -0.58, 0.0);",   // le nœud accent
    "const vec3 P3 = vec3( 0.44,  0.58, 0.0);",
    "const float TUBE = 0.033;",
    "const float HALF = 0.3984;",                  // demi-champ vertical : 1,275 / 3,2

    "float cap(vec3 p, vec3 a, vec3 b, float r) {",
    "  vec3 pa = p - a, ba = b - a;",
    "  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);",
    "  return length(pa - ba * h) - r;",
    "}",
    /* union lissée : les tubes se soudent aux sphères au lieu de s'y planter */
    "float smin(float a, float b, float k) {",
    "  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);",
    "  return mix(b, a, h) - k * h * (1.0 - h);",
    "}",

    /* x : distance à la surface · y : matière (0 encre, 1 accent, 2 satellite) */
    "vec2 map(vec3 p) {",
    "  float d = 1e3;",
    "  float s0 = clamp(uProg, 0.0, 1.0), s1 = clamp(uProg - 1.0, 0.0, 1.0), s2 = clamp(uProg - 2.0, 0.0, 1.0);",
    "  if (s0 > 0.0) d = min(d, cap(p, P0, mix(P0, P1, s0), TUBE));",
    "  if (s1 > 0.0) d = min(d, cap(p, P1, mix(P1, P2, s1), TUBE));",
    "  if (s2 > 0.0) d = min(d, cap(p, P2, mix(P2, P3, s2), TUBE));",
    "  const float K = 0.035;",
    "  if (uPop.x > 0.01) d = smin(d, length(p - P0) - 0.10 * uPop.x, K);",
    "  if (uPop.y > 0.01) d = smin(d, length(p - P1) - 0.10 * uPop.y, K);",
    "  if (uPop.w > 0.01) d = smin(d, length(p - P3) - 0.10 * uPop.w, K);",
    "  float m = 0.0;",
    "  if (uPop.z > 0.01) {",
    "    float da = length(p - P2) - 0.13 * uPop.z;",
    "    m = clamp(0.5 + 0.5 * (d - da) / 0.03, 0.0, 1.0);",
    "    d = smin(d, da, K);",
    "  }",
    "  float orb = min(min(length(p - uOrb[0]), length(p - uOrb[1])), length(p - uOrb[2])) - 0.03;",
    "  if (orb < d) return vec2(orb, 2.0);",
    "  return vec2(d, m);",
    "}",

    "vec3 normalAt(vec3 p) {",
    "  const vec2 e = vec2(0.0012, -0.0012);",
    "  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +",
    "                   e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);",
    "}",

    "float occlusion(vec3 p, vec3 n) {",
    "  float o = 0.0, w = 1.0;",
    "  for (int i = 1; i <= 4; i++) {",
    "    float h = 0.035 * float(i);",
    "    o += (h - map(p + n * h).x) * w;",
    "    w *= 0.6;",
    "  }",
    "  return clamp(1.0 - 2.4 * o, 0.0, 1.0);",
    "}",

    "float shadow(vec3 p, vec3 l) {",
    "  float res = 1.0, t = 0.02;",
    "  for (int i = 0; i < 18; i++) {",
    "    float d = map(p + l * t).x;",
    "    res = min(res, 9.0 * d / t);",
    "    t += clamp(d, 0.02, 0.2);",
    "    if (res < 0.02 || t > 2.2) break;",
    "  }",
    "  return clamp(res, 0.0, 1.0);",
    "}",

    /* le studio que l'objet reflète : un dégradé et trois sources */
    "vec3 env(vec3 r) {",
    "  float up = r.y * 0.5 + 0.5;",
    "  vec3 day = mix(vec3(0.16, 0.18, 0.22), vec3(0.6, 0.63, 0.7), smoothstep(0.0, 1.0, up));",
    "  vec3 night = mix(vec3(0.008, 0.012, 0.03), vec3(0.04, 0.07, 0.16), up);",
    "  vec3 c = mix(day, night, uDark);",
    "  float key = smoothstep(0.80, 0.96, dot(r, normalize(vec3(-0.5, 0.7, -0.5))));",
    "  float strip = smoothstep(0.90, 0.985, dot(r, normalize(vec3(0.85, 0.1, -0.5))));",
    "  float rim = smoothstep(0.55, 0.95, dot(r, normalize(vec3(0.3, 0.35, 0.88))));",
    "  c += mix(vec3(2.4), vec3(2.2, 2.3, 2.6), uDark) * key;",
    "  c += mix(vec3(1.2, 1.3, 1.6), vec3(0.5, 0.7, 2.2), uDark) * strip;",
    "  c += mix(vec3(0.5, 0.6, 0.9), vec3(0.3, 0.45, 1.5), uDark) * rim;",
    "  return c;",
    "}",

    "vec3 shade(vec3 p, vec3 rdV, float mat) {",
    "  vec3 nO = normalAt(p);",
    "  vec3 n = uRot * nO;",                                   // l'éclairage reste fixe quand l'objet tourne
    "  vec3 v = -rdV;",
    "  vec3 l = normalize(vec3(-0.45, 0.75, -0.5));",
    "  float ndl = max(dot(n, l), 0.0);",
    "  float ndv = max(dot(n, v), 0.0);",
    "  float sh = shadow(p + nO * 0.004, l * uRot);",
    "  float ao = occlusion(p, nO);",
    "  vec3 inkDay = vec3(0.012, 0.015, 0.022), inkNight = vec3(0.86, 0.88, 0.93);",
    "  vec3 accDay = vec3(0.0, 0.03, 0.40), accNight = vec3(0.10, 0.20, 1.0);",
    "  vec3 ink = mix(inkDay, inkNight, uDark), acc = mix(accDay, accNight, uDark);",
    "  float isAcc = clamp(mat, 0.0, 1.0), isOrb = step(1.5, mat);",
    "  vec3 albedo = mix(mix(ink, acc, isAcc), acc, isOrb);",
    "  vec3 amb = mix(vec3(0.3, 0.33, 0.4), vec3(0.16, 0.2, 0.36), uDark);",
    "  vec3 c = albedo * (ndl * sh * 1.05 + amb * ao);",
    "  c += acc * (mix(0.55, 0.4, uDark) * isAcc + 1.6 * isOrb);",        // l'accent luit de lui-même
    "  float f0 = mix(0.022, 0.045, uDark);",
    "  float fres = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0);",
    "  c += env(reflect(-v, n)) * fres * mix(0.55, 1.0, ao);",
    "  vec3 h = normalize(l + v);",
    "  c += vec3(1.0) * pow(max(dot(n, h), 0.0), 110.0) * sh * mix(0.9, 0.6, uDark);",
    "  return c;",
    "}",

    "void main() {",
    "  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;",
    "  vec3 roV = vec3(0.0, 0.0, -3.2);",
    "  vec3 rdV = normalize(vec3(uv * HALF, 1.0));",
    "  vec3 ro = roV * uRot, rd = rdV * uRot;",                 // vue → objet (transposée)

    "  vec4 obj = vec4(0.0);",
    "  float tHit = 1e3;",
    /* sphère englobante : hors d'elle, inutile de marcher */
    "  float b = dot(ro, rd), c0 = dot(ro, ro) - 1.69, disc = b * b - c0;",
    "  if (disc > 0.0) {",
    "    float sq = sqrt(disc), t = max(-b - sq, 0.0), tEnd = -b + sq;",
    "    float best = 1e3, tBest = t, mat = 0.0;",
    "    bool hit = false;",
    "    for (int i = 0; i < 72; i++) {",
    "      vec2 m = map(ro + rd * t);",
    "      if (m.x / t < best) { best = m.x / t; tBest = t; mat = m.y; }",
    "      if (m.x < 0.0007 * t) { hit = true; mat = m.y; break; }",
    "      t += m.x;",
    "      if (t > tEnd) break;",
    "    }",
    /* anti-crénelage des contours : un rayon qui frôle la surface la couvre en partie */
    "    float px = 2.0 * HALF / uRes.y;",
    "    float cov = hit ? 1.0 : 1.0 - smoothstep(0.0, px * 1.6, best);",
    "    if (cov > 0.003) {",
    "      float ts = hit ? t : tBest;",
    "      vec3 col = shade(ro + rd * ts, rdV, mat);",
    "      col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));",
    "      obj = vec4(col, cov);",
    "      tHit = ts;",
    "    }",
    "  }",

    /* ombre au sol : elle s'affine quand le N se présente de profil */
    "  float sh = 0.0;",
    "  if (rdV.y < 0.0) {",
    "    float tf = -0.9 / rdV.y;",
    "    vec3 pf = roV + rdV * tf;",
    "    vec2 e = vec2(pf.x / uShadowW, pf.z / 0.62);",
    "    sh = exp(-dot(e, e) * 2.4) * mix(0.2, 0.6, uDark);",
    "  }",

    /* lueurs : calculées par la distance du rayon à un point, sans marcher */
    "  float glow = 0.0;",
    "  vec3 oc = uTip - ro; float tc = dot(oc, rd); float d2 = dot(oc, oc) - tc * tc;",
    "  glow += exp(-d2 / 0.006) * uTipA * (tc < tHit + 0.06 ? 1.0 : 0.15);",
    "  glow += exp(-d2 / 0.0006) * uTipA * (tc < tHit + 0.06 ? 1.0 : 0.0);",
    "  for (int i = 0; i < 3; i++) {",
    "    oc = uOrb[i] - ro; tc = dot(oc, rd); d2 = dot(oc, oc) - tc * tc;",
    "    glow += exp(-d2 / 0.004) * mix(0.3, 0.55, uDark) * (tc < tHit + 0.04 ? 1.0 : 0.0);",
    "  }",
    "  oc = P2 - ro; tc = dot(oc, rd); d2 = dot(oc, oc) - tc * tc;",
    "  glow += exp(-d2 / 0.09) * 0.32 * uPop.z * uDark * (tc < tHit ? 1.0 : 0.25);",   // halo du nœud accent, la nuit
    /* les ondes vivent dans le plan du N */
    "  if (abs(rd.z) > 1e-4) {",
    "    float tp = -ro.z / rd.z;",
    "    if (tp > 0.0 && tp < tHit) {",
    "      float r = length((ro + rd * tp).xy - P2.xy);",
    "      for (int i = 0; i < 2; i++) {",
    "        float v = i == 0 ? uRing.x : uRing.y;",
    "        if (v > 0.0 && v < 1.0) {",
    "          float e = 1.0 - pow(1.0 - v, 3.0);",
    "          float q = (r - 0.13 * (1.0 + 2.1 * e)) / 0.011;",
    "          glow += exp(-q * q) * (1.0 - e) * 0.85;",
    "        }",
    "      }",
    "    }",
    "  }",
    "  glow = clamp(glow, 0.0, 1.0);",

    /* composition en alpha prémultiplié : ombre, objet, puis lueurs.
       Sur papier la lueur est une encre bleue ; la nuit, de la lumière. */
    "  vec4 o = vec4(0.0, 0.0, 0.0, sh);",
    "  o = vec4(obj.rgb * obj.a, obj.a) + o * (1.0 - obj.a);",
    "  vec3 gc = mix(vec3(0.0, 0.184, 0.655), vec3(0.56, 0.65, 1.0), uDark);",
    "  vec4 g = vec4(gc * glow, glow * (1.0 - uDark));",
    "  o = g + o * (1.0 - g.a);",
    "  gl_FragColor = o * uFade;",
    "}"
  ].join("\n");

  var VS = "attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }";

  var prog = gl.createProgram();
  try {
    [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]].forEach(function (s) {
      var sh = gl.createShader(s[0]);
      gl.shaderSource(sh, s[1]);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    });
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    if (window.console) console.warn("logo3d : shader refusé, le logo SVG reste en place.", e);
    return;
  }
  gl.useProgram(prog);
  var U = {};
  ["uRes", "uRot", "uDark", "uProg", "uTipA", "uFade", "uShadowW", "uPop", "uTip", "uOrb", "uRing"].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  /* le canvas se pose sur le SVG, dans une enveloppe à ses dimensions */
  var wrap = document.createElement("div");
  wrap.className = "mono3d";
  monogram.parentNode.insertBefore(wrap, monogram);
  wrap.appendChild(monogram);
  wrap.appendChild(canvas);
  root.classList.add("gl-logo");

  /* ── Taille et qualité ──
     Le lancer de rayons coûte par pixel : si la machine peine, on
     réduit la définition du rendu plutôt que la fluidité. */
  var quality = 1, W = 0, H = 0, slow = 0;
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    var w = Math.max(2, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
  }

  /* ── Rotation : glissé + inertie, survol, balancement au repos ── */
  var TAU = Math.PI * 2;
  var pointer = { x: 0, y: 0, last: -1e9 };
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
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
  var SEG = [1.16, 1.456, 1.16], PATH = 3.776;
  var NODES = [[-0.44, -0.58], [-0.44, 0.58], [0.44, -0.58], [0.44, 0.58]];
  var POP_AT = [0.12, 0.89, 1.51, 2.0];
  var CYCLE = 6.5;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  /* éclosion avec léger dépassement, comme --ease-pop */
  function pop(t) {
    t = clamp01(t);
    var c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }
  /* position sur le tracé, pour un avancement u de 0 à 1 */
  function along(u) {
    var dist = clamp01(u) * PATH, s = 0;
    while (s < 2 && dist > SEG[s]) { dist -= SEG[s]; s++; }
    var f = dist / SEG[s], A = NODES[s], B = NODES[s + 1];
    return { x: A[0] + (B[0] - A[0]) * f, y: A[1] + (B[1] - A[1]) * f, prog: s + f };
  }

  var visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }).observe(canvas);
  }

  var start = performance.now(), prev = start;
  var hx = 0, hy = 0;            // inclinaison de survol, en degrés (sens CSS)
  var orb = new Float32Array(9);

  function frame(now) {
    requestAnimationFrame(frame);
    var dtMs = now - prev;
    prev = now;
    if (!visible || document.hidden) return;

    /* qualité adaptative : trop d'images lentes d'affilée, on baisse d'un cran */
    slow = dtMs > 34 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 40 && quality > 0.45) { quality *= 0.8; slow = 0; }
    resize();

    var T = (now - start) / 1000;
    var dark = root.dataset.theme === "dark" ? 1 : 0;

    /* rotation */
    if (!dragging) {
      yawDrag += yawVel;
      yawVel *= 0.94;
      if (Math.abs(yawVel) < 0.004) yawDrag += (Math.round(yawDrag / TAU) * TAU - yawDrag) * 0.04;
    }
    var live = now - pointer.last < 3000 && !dragging;
    var tx = live ? pointer.x * 20 : Math.sin(T * 0.5) * 16;
    var ty = live ? -pointer.y * 12 : Math.cos(T * 0.37) * 5;
    hx += (tx - hx) * 0.06;
    hy += (ty - hy) * 0.06;
    /* le nom et PARIS suivent la même inclinaison (voir monde3d.css) */
    heroLogo.style.setProperty("--ry", hx.toFixed(2) + "deg");
    heroLogo.style.setProperty("--rx", hy.toFixed(2) + "deg");
    heroLogo.style.setProperty("--ex", (-Math.sin(hx * Math.PI / 180) * 1.5).toFixed(3) + "px");
    heroLogo.style.setProperty("--ey", (Math.sin(hy * Math.PI / 180) * 1.5 + 0.35).toFixed(3) + "px");

    var yaw = -hx * Math.PI / 180 + yawDrag;      // rotateY CSS et lacet du shader sont de sens opposés
    var pitch = hy * Math.PI / 180;
    var c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    gl.uniformMatrix3fv(U.uRot, false, [c, s * sp, -s * cp, 0, cp, sp, s, -c * sp, c * cp]);

    /* tracé, éclosions, comète, ondes */
    var first = T < CYCLE;
    var tc = T % CYCLE;
    var u = (tc - 0.4) / 1.6;
    var tip = along(u);
    gl.uniform1f(U.uProg, first ? (u <= 0 ? 0 : tip.prog) : 3);
    gl.uniform4f(U.uPop,
      first ? pop((T - POP_AT[0]) / 0.55) : 1, first ? pop((T - POP_AT[1]) / 0.55) : 1,
      first ? pop((T - POP_AT[2]) / 0.65) : 1, first ? pop((T - POP_AT[3]) / 0.55) : 1);
    gl.uniform3f(U.uTip, tip.x, tip.y, 0);
    gl.uniform1f(U.uTipA, u > 0 && u < 1 ? Math.min(1, u / 0.06, (1 - u) / 0.1) : 0);
    gl.uniform2f(U.uRing, (tc - 1.51) / 1.1, (tc - 1.72) / 1.3);

    /* trois satellites sur des orbites inclinées : ils passent devant, puis derrière */
    for (var i = 0; i < 3; i++) {
      var a = T * (0.55 + i * 0.17) + i * 2.1;
      var rad = 0.88 + i * 0.07;
      orb[i * 3]     = Math.cos(a) * rad;
      orb[i * 3 + 1] = Math.sin(a + i * 1.3) * (0.28 + i * 0.12);
      orb[i * 3 + 2] = Math.sin(a) * rad;
    }
    gl.uniform3fv(U.uOrb, orb);

    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uDark, dark);
    gl.uniform1f(U.uFade, clamp01(T / 0.5));
    gl.uniform1f(U.uShadowW, 0.3 + 0.5 * Math.abs(c));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
})();
