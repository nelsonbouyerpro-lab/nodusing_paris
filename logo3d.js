/* ════════════════════════════════════════════
   NODUSING PARIS — le monogramme en 3D (accueil)
   Chargé après script.js.

   Le N n'est pas un maillage : c'est une surface définie par une
   fonction de distance (4 sphères, 3 tubes soudés entre eux), rendue
   par lancer de rayons dans un fragment shader. Aucun modèle, aucune
   bibliothèque.

   · Matière : laque noire le jour, porcelaine la nuit. Elle reflète
     un studio imaginaire (deux boîtes à lumière), le ciel étoilé la
     nuit, et le N lui-même (un rebond de réflexion).
   · Le nœud accent est un orbe de verre où tourne un plasma ; il
     éclaire réellement les tubes et les nœuds voisins, et le sol.
   · Cinq lunes tournent autour des nœuds, chacune tenue par un fil
     de lumière : le N est le centre d'une petite constellation.
   · Il reprend la chorégraphie du logo SVG (la plume trace le N, les
     nœuds éclosent, l'onde part du nœud accent), puis une comète le
     reparcourt à chaque cycle en éclairant son passage.
   · On peut le faire tourner au glissé : il revient toujours de face.

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
    "uniform float uDark, uProg, uTipA, uFade, uTime, uBob, uShadowW;",
    "uniform vec4 uPop;",          // éclosion des 4 nœuds
    "uniform vec3 uTip;",          // la plume / la comète
    "uniform vec4 uOrb[5];",       // lunes : centre + rayon
    "uniform vec3 uLink[5];",      // le nœud auquel chaque lune est attachée
    "uniform vec2 uRing;",         // avancement des deux ondes (hors 0–1 : éteintes)

    "const vec3 P0 = vec3(-0.44, -0.58, 0.0);",
    "const vec3 P1 = vec3(-0.44,  0.58, 0.0);",
    "const vec3 P2 = vec3( 0.44, -0.58, 0.0);",   // le nœud accent
    "const vec3 P3 = vec3( 0.44,  0.58, 0.0);",
    "const float TUBE = 0.036;",
    "const float HALF = 0.3984;",                  // demi-champ vertical : 1,275 / 3,2
    "const vec3 KEY = vec3(-0.5629, 0.7676, -0.3070);",   // lumière principale (vue), normalisée

    /* ── bruit ── */
    "float hash(vec3 p) {",
    "  p = fract(p * 0.3183099 + 0.1);",
    "  p *= 17.0;",
    "  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));",
    "}",
    "float noise(vec3 x) {",
    "  vec3 i = floor(x), f = fract(x);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),",
    "                 mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),",
    "             mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),",
    "                 mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);",
    "}",
    "float fbm(vec3 p) { return 0.55 * noise(p) + 0.3 * noise(p * 2.03 + 3.1) + 0.15 * noise(p * 4.1 + 7.7); }",

    /* ── la forme ── */
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
    /* x : distance à la surface · y : part de matière « accent » (0 à 1) */
    "vec2 map(vec3 p) {",
    "  float d = 1e3;",
    "  float s0 = clamp(uProg, 0.0, 1.0), s1 = clamp(uProg - 1.0, 0.0, 1.0), s2 = clamp(uProg - 2.0, 0.0, 1.0);",
    "  if (s0 > 0.0) d = min(d, cap(p, P0, mix(P0, P1, s0), TUBE));",
    "  if (s1 > 0.0) d = min(d, cap(p, P1, mix(P1, P2, s1), TUBE));",
    "  if (s2 > 0.0) d = min(d, cap(p, P2, mix(P2, P3, s2), TUBE));",
    "  const float K = 0.04;",
    "  if (uPop.x > 0.01) d = smin(d, length(p - P0) - 0.10 * uPop.x, K);",
    "  if (uPop.y > 0.01) d = smin(d, length(p - P1) - 0.10 * uPop.y, K);",
    "  if (uPop.w > 0.01) d = smin(d, length(p - P3) - 0.10 * uPop.w, K);",
    "  float m = 0.0;",
    "  if (uPop.z > 0.01) {",
    "    float da = length(p - P2) - 0.13 * uPop.z;",
    "    m = clamp(0.5 + 0.5 * (d - da) / 0.02, 0.0, 1.0);",
    "    d = smin(d, da, K);",
    "  }",
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

    /* ── le décor que l'objet reflète (direction en repère vue) ── */
    /* une boîte à lumière rectangulaire, aux bords doux */
    "float box(vec3 r, vec3 c, vec3 u, vec3 v, vec2 size, float soft) {",
    "  float k = dot(r, c);",
    "  if (k <= 0.0) return 0.0;",
    "  vec2 q = abs(vec2(dot(r, u), dot(r, v)) / k);",
    "  vec2 e = smoothstep(size + soft, size - soft, q);",
    "  return e.x * e.y;",
    "}",
    "vec3 env(vec3 r) {",
    "  float up = r.y * 0.5 + 0.5;",
    "  vec3 day = mix(vec3(0.10, 0.11, 0.14), vec3(0.50, 0.53, 0.60), smoothstep(0.1, 1.0, up));",
    "  vec3 night = mix(vec3(0.004, 0.007, 0.02), vec3(0.02, 0.04, 0.11), up);",
    /* la nuit, l'objet reflète le ciel : une nébuleuse et des étoiles */
    "  night += vec3(0.03, 0.07, 0.24) * smoothstep(0.35, 0.9, noise(r * 2.4 + uTime * 0.02));",
    "  vec3 g = r * 34.0;",
    "  float star = step(0.955, hash(floor(g))) * smoothstep(0.26, 0.0, length(fract(g) - 0.5));",
    "  night += vec3(0.9, 1.0, 1.3) * star * 2.4;",
    "  vec3 c = mix(day, night, uDark);",
    "  vec3 kc = normalize(vec3(-0.55, 0.62, -0.56));",
    "  vec3 ku = normalize(cross(vec3(0.0, 1.0, 0.0), kc)), kv = cross(kc, ku);",
    "  float key = box(r, kc, ku, kv, vec2(0.46, 0.32), 0.05);",
    "  vec3 sc = normalize(vec3(0.9, 0.05, -0.42));",
    "  vec3 su = normalize(cross(vec3(0.0, 1.0, 0.0), sc)), sv = cross(sc, su);",
    "  float strip = box(r, sc, su, sv, vec2(0.10, 0.85), 0.04);",
    "  float rim = smoothstep(0.5, 0.95, dot(r, normalize(vec3(0.25, 0.3, 0.92))));",
    "  c += mix(vec3(3.4), vec3(2.0, 2.15, 2.7), uDark) * key;",
    "  c += mix(vec3(1.5, 1.65, 2.0), vec3(0.4, 0.65, 2.6), uDark) * strip;",
    "  c += mix(vec3(0.45, 0.55, 0.9), vec3(0.22, 0.38, 1.5), uDark) * rim;",
    "  c += mix(vec3(0.5), vec3(0.12, 0.17, 0.42), uDark) * smoothstep(0.78, 0.99, r.y);",
    "  return c;",
    "}",

    "vec3 inkColor() { return mix(vec3(0.010, 0.012, 0.018), vec3(0.66, 0.69, 0.76), uDark); }",
    "vec3 accentGlow() { return mix(vec3(0.02, 0.10, 0.85), vec3(0.20, 0.36, 1.3), uDark); }",

    /* ce que voit un rayon réfléchi : le N lui-même, ou le décor */
    "vec3 reflection(vec3 ro, vec3 rd) {",
    "  float t = 0.02, m = -1.0;",
    "  for (int i = 0; i < 24; i++) {",
    "    vec2 h = map(ro + rd * t);",
    "    if (h.x < 0.003) { m = h.y; break; }",
    "    t += h.x;",
    "    if (t > 2.4) break;",
    "  }",
    "  if (m < 0.0) return env(uRot * rd);",
    "  vec3 n = uRot * normalAt(ro + rd * t);",
    "  vec3 base = inkColor() * (max(dot(n, KEY), 0.0) + 0.3);",
    "  return mix(base, accentGlow(), clamp(m, 0.0, 1.0));",
    "}",

    /* l'orbe accent : on entre dans la sphère par réfraction et on
       additionne le plasma le long de la corde traversée */
    "vec3 plasma(vec3 p, vec3 rd, vec3 n) {",
    "  float R = max(0.13 * uPop.z, 1e-3);",
    "  vec3 rin = refract(rd, n, 0.74);",
    "  vec3 oc = p - P2;",
    "  float b = dot(oc, rin), h = b * b - (dot(oc, oc) - R * R);",
    "  float len = h > 0.0 ? max(-b + sqrt(h), 0.0) : 0.0;",
    "  vec3 deep = mix(vec3(0.0, 0.02, 0.32), vec3(0.02, 0.08, 0.60), uDark);",
    "  vec3 mid = mix(vec3(0.01, 0.09, 0.80), vec3(0.10, 0.24, 1.0), uDark);",
    "  vec3 hot = mix(vec3(0.45, 0.60, 1.0), vec3(0.85, 0.92, 1.0), uDark);",
    "  vec3 acc = vec3(0.0);",
    "  for (int i = 0; i < 6; i++) {",
    "    vec3 loc = (p + rin * (len * (float(i) + 0.5) / 6.0) - P2) / R;",
    "    float rr = dot(loc, loc);",
    "    float f = fbm(loc * 2.6 + vec3(0.0, uTime * 0.22, uTime * 0.13) + 1.7 * noise(loc * 1.4 - uTime * 0.1));",
    "    float fil = smoothstep(0.42, 0.75, f);",                  // filaments
    "    acc += mix(deep, mid, fil) * (0.5 + 0.5 * fil) + hot * (exp(-rr * 7.0) * 0.55 + fil * fil * 0.22 * (1.0 - rr));",
    "  }",
    "  return acc / 6.0 * (len / R) * mix(0.62, 0.72, uDark) + deep * 0.35;",
    "}",

    /* une source ponctuelle (l'orbe, la comète) : diffus + reflet */
    "vec3 pointLight(vec3 p, vec3 n, vec3 v, vec3 at, vec3 col, float power, float albedoBoost) {",
    "  vec3 d = at - p;",
    "  float d2 = dot(d, d);",
    "  vec3 l = d * inversesqrt(max(d2, 1e-5));",
    "  float att = power / (d2 + 0.03);",
    "  vec3 c = (inkColor() * albedoBoost + 0.02) * col * max(dot(n, l), 0.0) * att;",
    "  return c + col * pow(max(dot(n, normalize(l + v)), 0.0), 40.0) * att * 1.5;",
    "}",

    "vec3 shade(vec3 p, vec3 rd, vec3 rdV, float m) {",
    "  vec3 nO = normalAt(p);",
    "  vec3 n = uRot * nO;",                                   // l'éclairage reste fixe quand l'objet tourne
    "  vec3 v = -rdV;",
    "  float ndv = max(dot(n, v), 0.0);",
    "  float sh = shadow(p + nO * 0.004, KEY * uRot);",
    "  float ao = occlusion(p, nO);",
    "  vec3 ink = inkColor();",
    "  vec3 amb = mix(vec3(0.25, 0.28, 0.36), vec3(0.07, 0.10, 0.24), uDark);",
    "  vec3 fill = mix(vec3(0.25, 0.30, 0.45), vec3(0.06, 0.12, 0.42), uDark);",
    "  vec3 c = ink * (max(dot(n, KEY), 0.0) * sh * mix(1.1, 1.35, uDark) + amb * ao",
    "                + fill * max(dot(n, normalize(vec3(0.7, -0.15, -0.55))), 0.0) * ao);",
    /* l'orbe et la comète éclairent ce qui les entoure. Le jour, la
       laque est presque noire : on force un peu pour que le bleu se lise. */
    "  c += pointLight(p, nO, -rd, P2, accentGlow(), 0.06 * uPop.z, mix(7.0, 1.0, uDark)) * (1.0 - m);",
    "  c += pointLight(p, nO, -rd, uTip, mix(vec3(0.3, 0.5, 1.4), vec3(0.7, 0.85, 1.6), uDark), 0.03 * uTipA, mix(7.0, 1.0, uDark));",
    "  float f0 = mix(0.03, 0.05, uDark);",
    "  float fres = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0);",
    "  vec3 refl = reflection(p + nO * 0.006, reflect(rd, nO)) * fres * mix(0.6, 1.0, ao);",
    "  float spec = pow(max(dot(n, normalize(KEY + v)), 0.0), 140.0) * sh;",
    "  c += refl + spec * mix(1.2, 0.7, uDark);",
    "  c += vec3(0.15, 0.30, 0.90) * pow(1.0 - ndv, 3.0) * 0.16 * uDark;",   // nacre : un voile bleu à contre-jour
    "  if (m > 0.01) {",
    "    vec3 orb = plasma(p, rd, nO) + refl * mix(0.7, 1.2, uDark) + spec * 1.3 + vec3(0.25, 0.4, 1.0) * pow(1.0 - ndv, 3.0) * 0.22;",
    "    c = mix(c, orb, m);",
    "  }",
    "  return c;",
    "}",

    "vec3 tone(vec3 x) {",                                     // courbe filmique, puis gamma
    "  x = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);",
    "  return pow(x, vec3(0.4545));",
    "}",

    /* lueur d'un segment : plus courte distance entre le rayon et lui */
    "vec3 segment(vec3 ro, vec3 rd, vec3 a, vec3 b) {",        // x : distance² · y : profondeur · z : position sur le segment
    "  vec3 ab = b - a, ao = a - ro;",
    "  float abab = dot(ab, ab), abrd = dot(ab, rd), aoab = dot(ao, ab), aord = dot(ao, rd);",
    "  float s = clamp((abrd * aord - aoab) / max(abab - abrd * abrd, 1e-5), 0.0, 1.0);",
    "  vec3 q = a + ab * s;",
    "  float t = dot(q - ro, rd);",
    "  vec3 d = q - (ro + rd * t);",
    "  return vec3(dot(d, d), t, s);",
    "}",

    "void main() {",
    "  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;",
    "  vec3 rdV = normalize(vec3(uv * HALF, 1.0));",
    "  vec3 roV = vec3(0.0, -uBob, -3.2);",                     // le N flotte : il monte et descend à peine
    "  vec3 ro = roV * uRot, rd = rdV * uRot;",                 // vue → objet (transposée)
    "  float px = 2.0 * HALF / uRes.y;",                        // taille angulaire d'un pixel

    "  vec4 obj = vec4(0.0);",
    "  float tHit = 1e3;",
    /* sphère englobante : hors d'elle, inutile de marcher */
    "  float b = dot(ro, rd), disc = b * b - (dot(ro, ro) - 0.81);",
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
    "    float cov = hit ? 1.0 : 1.0 - smoothstep(0.0, px * 1.6, best);",
    "    if (cov > 0.003) {",
    "      float ts = hit ? t : tBest;",
    "      obj = vec4(tone(shade(ro + rd * ts, rd, rdV, mat)), cov);",
    "      tHit = ts;",
    "    }",
    "  }",
    "  vec4 o = vec4(obj.rgb * obj.a, obj.a);",                 // alpha prémultiplié à partir d'ici

    /* les lunes : des sphères exactes, pas besoin de marcher */
    "  vec3 gcDay = vec3(0.0, 0.184, 0.655), gcNight = vec3(0.56, 0.65, 1.0);",
    "  float glow = 0.0;",
    "  for (int i = 0; i < 5; i++) {",
    "    vec3 c = uOrb[i].xyz; float r = uOrb[i].w;",
    "    if (r < 1e-4) continue;",
    "    vec3 oc = c - ro; float tc = dot(oc, rd); float d2 = dot(oc, oc) - tc * tc;",
    "    float w = px * tc * 1.2, dist = sqrt(d2);",
    "    bool front = tc - r < tHit;",
    "    if (front && dist < r + w) {",
    "      float cov = 1.0 - smoothstep(r - w, r + w, dist);",
    "      vec3 n = uRot * normalize(ro + rd * (tc - sqrt(max(r * r - d2, 0.0))) - c);",
    "      float ndv = max(dot(n, -rdV), 0.0);",
    "      vec3 col = mix(vec3(0.05, 0.22, 0.95), vec3(0.45, 0.60, 1.0), uDark) * (0.55 + 0.6 * ndv)",
    "               + vec3(1.0) * (pow(1.0 - ndv, 3.0) * 0.5 + pow(max(dot(n, normalize(KEY - rdV)), 0.0), 60.0));",
    "      o = vec4(clamp(col, 0.0, 1.0) * cov, cov) + o * (1.0 - cov);",
    "    }",
    "    if (front) glow += exp(-d2 / (r * r * 7.0)) * mix(0.22, 0.5, uDark);",
    /* le fil qui la relie à son nœud, et l'impulsion qui le parcourt */
    "    vec3 sg = segment(ro, rd, uLink[i], c);",
    "    if (sg.y < tHit) {",
    "      float u = (sg.z - fract(uTime * 0.33 + float(i) * 0.37) * 1.4 + 0.2) / 0.09;",
    "      glow += exp(-sg.x / 2.2e-5) * (0.32 + 0.6 * exp(-u * u)) * smoothstep(0.0, 0.25, sg.z);",
    "    }",
    "  }",

    /* lueurs ponctuelles : la comète, le halo de l'orbe */
    "  vec3 oc = uTip - ro; float tc = dot(oc, rd); float d2 = dot(oc, oc) - tc * tc;",
    "  glow += (exp(-d2 / 0.006) * 0.5 + exp(-d2 / 0.0007)) * uTipA * (tc < tHit + 0.07 ? 1.0 : 0.12);",
    "  oc = P2 - ro; tc = dot(oc, rd); d2 = dot(oc, oc) - tc * tc;",
    "  glow += exp(-d2 / 0.085) * mix(0.10, 0.26, uDark) * uPop.z * (tc < tHit ? 1.0 : 0.25);",
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

    /* le sol : une ombre qui s'affine quand le N se présente de profil,
       et la flaque de lumière bleue que l'orbe y dépose */
    "  float shd = 0.0, pool = 0.0;",
    "  if (rdV.y < 0.0) {",
    "    vec3 pf = vec3(0.0, 0.0, -3.2) + rdV * (-0.9 / rdV.y);",
    "    vec2 e = vec2(pf.x / uShadowW, pf.z / 0.62);",
    "    shd = exp(-dot(e, e) * 2.4) * mix(0.22, 0.6, uDark) * (1.0 - uBob * 6.0);",
    "    vec3 a = uRot * P2;",
    "    e = vec2((pf.x - a.x) / 0.30, (pf.z - a.z) / 0.5);",
    "    pool = exp(-dot(e, e) * 2.2) * uPop.z * mix(0.16, 0.5, uDark);",
    "  }",

    /* composition : sol, objet et lunes, puis lueurs.
       Sur papier une lueur est une encre bleue ; la nuit, de la lumière. */
    "  vec3 gc = mix(gcDay, gcNight, uDark);",
    "  vec4 ground = vec4(mix(gcDay, vec3(0.25, 0.4, 1.0), uDark) * pool, shd + pool * (1.0 - uDark));",
    "  o = o + ground * (1.0 - o.a);",
    "  glow = clamp(glow, 0.0, 1.0);",
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
  ["uRes", "uRot", "uDark", "uProg", "uTipA", "uFade", "uTime", "uBob", "uShadowW",
   "uPop", "uTip", "uOrb", "uLink", "uRing"].forEach(function (n) {
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
     réduit la définition du rendu plutôt que la fluidité. Sur un
     écran ordinaire on rend 1,5 fois plus fin que l'affichage : les
     arêtes y gagnent. */
  var quality = 1, W = 0, H = 0, slow = 0;
  function resize() {
    var scale = Math.max(1.5, Math.min(window.devicePixelRatio || 1, 2)) * quality;
    var w = Math.max(2, Math.round(canvas.clientWidth * scale));
    var h = Math.max(2, Math.round(canvas.clientHeight * scale));
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
  }

  /* ── Rotation : glissé + inertie, survol, balancement au repos ── */
  var TAU = Math.PI * 2, RAD = Math.PI / 180;
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
  var POP_AT = [0.12, 0.89, 1.51, 2.0], POP_DUR = [0.55, 0.55, 0.65, 0.55];
  var CYCLE = 6.5;

  /* Les lunes. Chacune tourne autour d'un nœud, sur un cercle incliné
     hors du plan du N : elle passe devant, puis derrière. phi oriente
     l'orbite dans le plan du N — choisi loin de la direction des tubes
     pour qu'aucune lune ne les traverse. */
  var MOONS = [
    { node: 1, r: 0.30, phi: 10,  tilt: 72, speed: 0.9,  size: 0.022, at: 0.0 },
    { node: 3, r: 0.34, phi: -20, tilt: 65, speed: -0.7, size: 0.026, at: 2.0 },
    { node: 2, r: 0.37, phi: 25,  tilt: 78, speed: 0.6,  size: 0.030, at: 4.0 },
    { node: 0, r: 0.31, phi: 160, tilt: 70, speed: -0.8, size: 0.020, at: 1.0 },
    { node: 2, r: 0.27, phi: 165, tilt: 60, speed: -1.1, size: 0.017, at: 3.0 }
  ];

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
  var orb = new Float32Array(20), link = new Float32Array(15), pops = [0, 0, 0, 0];

  function frame(now) {
    requestAnimationFrame(frame);
    var dtMs = now - prev;
    prev = now;
    if (!visible || document.hidden) return;

    /* qualité adaptative : trop d'images lentes d'affilée, on baisse d'un cran */
    slow = dtMs > 34 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 40 && quality > 0.4) { quality *= 0.8; slow = 0; }
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
    gl.uniformMatrix3fv(U.uRot, false, [c, s * sp, -s * cp, 0, cp, sp, s, -c * sp, c * cp]);

    /* tracé, éclosions, comète, ondes */
    var first = T < CYCLE;
    var tc = T % CYCLE;
    var u = (tc - 0.4) / 1.6;
    var tip = along(u);
    for (var i = 0; i < 4; i++) pops[i] = first ? pop((T - POP_AT[i]) / POP_DUR[i]) : 1;
    gl.uniform1f(U.uProg, first ? (u <= 0 ? 0 : tip.prog) : 3);
    gl.uniform4f(U.uPop, pops[0], pops[1], pops[2], pops[3]);
    gl.uniform3f(U.uTip, tip.x, tip.y, 0);
    gl.uniform1f(U.uTipA, u > 0 && u < 1 ? Math.min(1, u / 0.06, (1 - u) / 0.1) : 0);
    gl.uniform2f(U.uRing, (tc - 1.51) / 1.1, (tc - 1.72) / 1.3);

    /* les lunes : elles naissent avec leur nœud */
    for (i = 0; i < 5; i++) {
      var m = MOONS[i], node = NODES[m.node];
      var a = T * m.speed + m.at;
      var cphi = Math.cos(m.phi * RAD), sphi = Math.sin(m.phi * RAD);
      var ct = Math.cos(m.tilt * RAD), st = Math.sin(m.tilt * RAD);
      var born = clamp01(pops[m.node]);
      var ca = Math.cos(a) * m.r * born, sa = Math.sin(a) * m.r * born;
      orb[i * 4]     = node[0] + ca * cphi - sa * sphi * ct;
      orb[i * 4 + 1] = node[1] + ca * sphi + sa * cphi * ct;
      orb[i * 4 + 2] = sa * st;
      orb[i * 4 + 3] = m.size * born;
      link[i * 3] = node[0];
      link[i * 3 + 1] = node[1];
      link[i * 3 + 2] = 0;
    }
    gl.uniform4fv(U.uOrb, orb);
    gl.uniform3fv(U.uLink, link);

    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uDark, dark);
    gl.uniform1f(U.uTime, T);
    gl.uniform1f(U.uBob, Math.sin(T * 0.8) * 0.014 + 0.014);
    gl.uniform1f(U.uFade, clamp01(T / 0.5));
    gl.uniform1f(U.uShadowW, 0.3 + 0.5 * Math.abs(c));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
})();
