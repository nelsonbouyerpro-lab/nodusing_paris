/* ════════════════════════════════════════════
   NODUSING PARIS — le monogramme en volume (accueil)
   Chargé après script.js.

   C'est le logo lui-même, auquel on a donné une épaisseur : le tracé
   du N et ses quatre nœuds sont extrudés en un emblème à arêtes
   vives, chanfreinées. De face, il se superpose exactement au logo
   SVG ; dès qu'il s'incline, on voit ses tranches et le relief des
   nœuds, qui dépassent du tracé.

   · Matière en rendu physique (microfacettes) : encre anodisée le
     jour, céramique la nuit ; les tranches tirent vers le bleu de la
     marque. Les arêtes sont très légèrement adoucies, comme sur un
     objet réel : c'est là que la lumière s'accroche.
   · Éclairage de studio : trois sources, leurs boîtes à lumière en
     reflet, occlusion ambiante, ombres à pénombre.
   · Le nœud accent est une pastille d'émail lumineuse : elle éclaire
     le tracé voisin et le sol.
   · Au sol, une ombre de contact calculée, plus dense sous les nœuds.
   · La chorégraphie du logo SVG est conservée : la plume trace le N,
     les nœuds apparaissent à son passage, l'onde part du nœud
     accent ; ensuite, une lumière le reparcourt à chaque cycle.
   · On peut le faire tourner au glissé : il revient toujours de face.

   Rendu par lancer de rayons sur une fonction de distance, dans un
   fragment shader : aucun modèle, aucune bibliothèque.
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
    "uniform float uDark, uProg, uTipA, uFade, uBob;",
    "uniform vec4 uPop;",          // apparition des 4 nœuds
    "uniform vec3 uTip;",          // la plume, puis la lumière qui reparcourt le tracé
    "uniform vec2 uRing;",         // avancement des deux ondes (hors 0–1 : éteintes)
    "uniform vec3 uOrbitN[2];",    // normales des deux anneaux d'orbite
    "uniform vec4 uPlanet[3];",    // planètes : centre + rayon
    "uniform vec3 uHi;",           // mise en avant de chaque planète (survol de sa carte)
    "uniform vec2 uStar;",         // où tombe l'étoile accent à l'écran
    "uniform float uFlare, uSys;", // éclat de l'étoile · apparition du système

    "const vec2 Q0 = vec2(-0.44, -0.58);",
    "const vec2 Q1 = vec2(-0.44,  0.58);",
    "const vec2 Q2 = vec2( 0.44, -0.58);",        // le nœud accent
    "const vec2 Q3 = vec2( 0.44,  0.58);",
    "const float PI = 3.14159265;",
    "const float HALF = 0.3984;",                  // demi-champ vertical : 1,275 / 3,2
    "const float FLOOR = -0.88;",                  // le sol, sous le nœud le plus bas
    "const float STROKE = 0.030;",                 // demi-largeur du tracé (6 unités du logo)
    "const float T_STROKE = 0.034;",               // demi-épaisseurs : le tracé…
    "const float T_NODE = 0.052;",                 // … les nœuds, qui en dépassent…
    "const float T_ACCENT = 0.064;",               // … et le nœud accent, un peu plus encore
    "const float FILLET = 0.0045;",                // aucune arête réelle n'est parfaitement vive
    /* trois sources, en repère vue : principale (haut gauche, devant),
       d'appoint (droite), de contour (derrière, en haut) */
    "const vec3 KEY = vec3(-0.3497, 0.5495, -0.7588);",
    "const vec3 FILL = vec3(0.7526, -0.1613, -0.6384);",
    "const vec3 RIM = vec3(0.3162, 0.5270, 0.7889);",

    /* ── la forme : le dessin du logo, extrudé ── */
    "float seg(vec2 p, vec2 a, vec2 b) {",
    "  vec2 pa = p - a, ba = b - a;",
    "  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0));",
    "}",
    /* d2 : distance au contour dans le plan · h : demi-épaisseur · c : chanfrein.
       On taille la pièce un peu plus petite, puis on l'épaissit du congé :
       toutes ses arêtes en sortent adoucies, et accrochent la lumière. */
    "float slab(float d2, float z, float h, float c) {",
    "  vec2 w = vec2(d2 + FILLET, abs(z) - h + FILLET);",
    "  float box = min(max(w.x, w.y), 0.0) + length(max(w, 0.0));",
    "  return max(box, (w.x + w.y + c) * 0.70710678) - FILLET;",
    "}",
    /* x : distance à la surface · y : pièce (0 tracé, 1 nœud, 2 nœud accent) */
    "vec2 map(vec3 p) {",
    "  float d2 = 1e3;",
    "  float s0 = clamp(uProg, 0.0, 1.0), s1 = clamp(uProg - 1.0, 0.0, 1.0), s2 = clamp(uProg - 2.0, 0.0, 1.0);",
    "  if (s0 > 0.0) d2 = min(d2, seg(p.xy, Q0, mix(Q0, Q1, s0)));",
    "  if (s1 > 0.0) d2 = min(d2, seg(p.xy, Q1, mix(Q1, Q2, s1)));",
    "  if (s2 > 0.0) d2 = min(d2, seg(p.xy, Q2, mix(Q2, Q3, s2)));",
    "  vec2 r = vec2(slab(d2 - STROKE, p.z, T_STROKE, 0.008), 0.0);",
    "  float n = min(min(slab(length(p.xy - Q0) - 0.10 * uPop.x, p.z, T_NODE * min(uPop.x, 1.0), 0.011),",
    "                    slab(length(p.xy - Q1) - 0.10 * uPop.y, p.z, T_NODE * min(uPop.y, 1.0), 0.011)),",
    "                slab(length(p.xy - Q3) - 0.10 * uPop.w, p.z, T_NODE * min(uPop.w, 1.0), 0.011));",
    "  if (n < r.x) r = vec2(n, 1.0);",
    "  float a = slab(length(p.xy - Q2) - 0.13 * uPop.z, p.z, T_ACCENT * min(uPop.z, 1.0), 0.013);",
    "  if (a < r.x) r = vec2(a, 2.0);",
    "  return r;",
    "}",
    "vec3 normalAt(vec3 p) {",
    "  const vec2 e = vec2(0.0007, -0.0007);",
    "  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +",
    "                   e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);",
    "}",
    /* occlusion ambiante : la matière voisine cache un peu du décor */
    "float occlusion(vec3 p, vec3 n) {",
    "  float o = 0.0, w = 1.0;",
    "  for (int i = 1; i <= 5; i++) {",
    "    float h = 0.022 * float(i);",
    "    o += (h - map(p + n * h).x) * w;",
    "    w *= 0.62;",
    "  }",
    "  return clamp(1.0 - 2.6 * o, 0.0, 1.0);",
    "}",
    /* ombre portée à pénombre : k règle la taille apparente de la source */
    "float shadow(vec3 p, vec3 l, float k, float far) {",
    "  float res = 1.0, t = 0.012;",
    "  for (int i = 0; i < 22; i++) {",
    "    float d = map(p + l * t).x;",
    "    res = min(res, k * d / t);",
    "    t += clamp(d, 0.01, 0.14);",
    "    if (res < 0.01 || t > far) break;",
    "  }",
    "  res = clamp(res, 0.0, 1.0);",
    "  return res * res * (3.0 - 2.0 * res);",
    "}",

    /* ── le décor : un studio. Un dégradé sol / plafond et trois boîtes
          à lumière. Plus la matière est rugueuse, plus leurs bords
          s'étalent et leur reflet s'affaiblit. (direction en repère vue) ── */
    "float softbox(vec3 r, vec3 c, vec2 size, float soft) {",
    "  float k = dot(r, c);",
    "  if (k <= 0.0) return 0.0;",
    "  vec3 u = normalize(cross(vec3(0.0, 1.0, 0.0), c)), v = cross(c, u);",
    "  vec2 q = abs(vec2(dot(r, u), dot(r, v)) / k);",
    "  vec2 e = smoothstep(size + soft, size - soft, q);",
    "  return e.x * e.y;",
    "}",
    "vec3 skyColor(float up) {",                               // éclairage diffus du studio
    "  vec3 day = mix(vec3(0.30, 0.31, 0.34), vec3(0.92, 0.95, 1.0), up);",
    "  vec3 night = mix(vec3(0.012, 0.018, 0.045), vec3(0.06, 0.10, 0.24), up);",
    "  return mix(day, night, uDark);",
    "}",
    "vec3 env(vec3 r, float rough) {",
    "  vec3 c = skyColor(smoothstep(-0.6, 0.9, r.y)) * mix(0.3, 1.0, uDark);",
    "  float soft = mix(0.03, 0.45, rough);",
    "  float gain = 1.0 - 0.55 * rough;",
    "  c += mix(vec3(1.5), vec3(3.2, 3.4, 4.0), uDark) * softbox(r, KEY, vec2(0.50, 0.34), soft) * gain;",
    "  c += mix(vec3(1.3, 1.4, 1.6), vec3(0.5, 0.75, 2.0), uDark) * softbox(r, FILL, vec2(0.16, 0.9), soft) * gain;",
    "  c += mix(vec3(1.6, 1.7, 2.0), vec3(0.5, 0.8, 2.6), uDark) * softbox(r, RIM, vec2(0.7, 0.3), soft) * gain;",
    "  return c;",
    "}",

    /* ── matière : microfacettes (GGX), comme en rendu physique ── */
    "float ggx(float ndh, float a) {",
    "  float a2 = a * a, d = ndh * ndh * (a2 - 1.0) + 1.0;",
    "  return a2 / (PI * d * d);",
    "}",
    "float visibility(float ndv, float ndl, float a) {",
    "  float k = a * 0.5;",
    "  return 0.25 / ((ndv * (1.0 - k) + k) * (ndl * (1.0 - k) + k));",
    "}",
    /* une source directionnelle : part diffuse + reflet */
    "vec3 lit(vec3 n, vec3 v, vec3 l, vec3 albedo, float f0, float rough) {",
    "  float ndl = dot(n, l);",
    "  if (ndl <= 0.0) return vec3(0.0);",
    "  vec3 h = normalize(l + v);",
    "  float ndv = max(dot(n, v), 1e-3), a = rough * rough;",
    "  float f = f0 + (1.0 - f0) * pow(1.0 - max(dot(v, h), 0.0), 5.0);",
    "  float spec = f * ggx(max(dot(n, h), 0.0), a) * visibility(ndv, ndl, a);",
    "  return (albedo * (1.0 - f) / PI + min(spec, 6.0)) * ndl;",
    "}",

    "vec3 accentColor() { return mix(vec3(0.0, 0.028, 0.385), vec3(0.107, 0.205, 1.0), uDark); }",   // Klein / Lumière, en linéaire

    "vec3 shade(vec3 p, vec3 rdV, float piece) {",
    "  vec3 nO = normalAt(p);",
    "  vec3 n = uRot * nO;",                                   // l'éclairage reste fixe quand l'objet tourne
    "  vec3 v = -rdV;",
    "  float ndv = max(dot(n, v), 1e-3);",
    "  float edge = smoothstep(0.55, 1.0, 1.0 - abs(nO.z));",  // 0 sur les faces, 1 sur les tranches
    "  float isAcc = step(1.5, piece);",
    "  vec3 acc = accentColor();",

    /* la pastille du nœud accent : un émail brillant, lumineux au centre */
    "  float ra = length(p.xy - Q2) / max(0.13 * uPop.z, 1e-3);",
    "  float lens = isAcc * smoothstep(0.75, 0.95, abs(nO.z)) * smoothstep(0.86, 0.80, ra);",

    /* matière : encre anodisée le jour, céramique la nuit ; les tranches tirent vers le bleu */
    "  vec3 ink = mix(vec3(0.008, 0.009, 0.013), vec3(0.78, 0.81, 0.88), uDark);",
    "  vec3 albedo = mix(ink, mix(ink, acc, mix(0.8, 0.6, uDark)) * mix(1.0, 0.8, uDark), edge);",
    "  albedo = mix(albedo, acc * mix(0.9, 0.5, uDark), isAcc);",
    "  float rough = mix(mix(0.56, 0.42, uDark), mix(0.6, 0.52, uDark), edge);",
    "  rough = mix(rough, 0.22, lens);",
    "  float f0 = mix(0.024, 0.04, uDark) + 0.016 * isAcc;",                // l'encre anodisée renvoie peu ; l'émail, davantage

    "  float ao = occlusion(p, nO);",
    "  float sh = shadow(p + nO * 0.003, KEY * uRot, 9.0, 1.8);",

    /* éclairage direct : trois sources */
    "  vec3 c = lit(n, v, KEY, albedo, f0, rough) * mix(vec3(3.0), vec3(3.0, 3.1, 3.4), uDark) * sh;",
    "  c += lit(n, v, FILL, albedo, f0, rough) * mix(vec3(0.9, 1.0, 1.25), vec3(0.3, 0.5, 1.5), uDark) * ao;",
    "  c += lit(n, v, RIM, albedo, f0, rough) * mix(vec3(1.2, 1.3, 1.6), vec3(0.5, 0.8, 2.4), uDark) * ao;",

    /* éclairage du studio : diffus selon l'orientation, et reflet du décor */
    "  c += albedo * skyColor(n.y * 0.5 + 0.5) * ao * mix(0.4, 0.8, uDark);",
    "  float fr = f0 + (max(1.0 - rough, f0) - f0) * pow(1.0 - ndv, 5.0);",
    "  float specAo = clamp(pow(ndv + ao, 2.0) - 1.0 + ao, 0.0, 1.0);",
    "  c += env(reflect(-v, n), rough) * fr * specAo;",

    /* la pastille émet ; elle éclaire ce qui l'entoure, et la plume aussi, à son passage */
    "  c += acc * lens * (1.25 - 0.45 * ra * ra) * mix(0.5, 1.05, uDark);",
    "  vec3 la = vec3(Q2, -0.16 * sign(dot(nO, vec3(0.0, 0.0, -1.0)) + 1e-4)) - p;",
    "  float da = dot(la, la);",
    "  c += (albedo * mix(5.0, 1.0, uDark) + 0.02) * mix(vec3(0.05, 0.2, 1.0), vec3(0.25, 0.42, 1.0), uDark)",
    "     * max(dot(nO, la * inversesqrt(da)), 0.0) * 0.045 * uPop.z / (da + 0.03) * (1.0 - isAcc) * ao;",
    "  vec3 lt = uTip + vec3(0.0, 0.0, -0.2) - p;",
    "  float dt = dot(lt, lt);",
    "  c += (albedo * mix(4.0, 1.0, uDark) + 0.03) * mix(vec3(0.5, 0.65, 1.3), vec3(0.8, 0.9, 1.5), uDark)",
    "     * max(dot(nO, lt * inversesqrt(dt)), 0.0) * 0.07 * uTipA / (dt + 0.02);",
    "  return c;",
    "}",

    "vec3 tone(vec3 x) {",                                     // courbe filmique, puis gamma
    "  x = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);",
    "  return pow(x, vec3(0.4545));",
    "}",

    /* un anneau d'orbite : un trait fin de lumière, à la distance R du
       centre, dans le plan de normale n. Il passe devant le N, puis derrière. */
    "float orbit(vec3 ro, vec3 rd, vec3 n, float R, float tHit, float px) {",
    "  float dn = dot(rd, n);",
    "  if (abs(dn) < 0.012) return 0.0;",
    "  float t = -dot(ro, n) / dn;",
    "  if (t < 0.0) return 0.0;",
    "  vec3 c = normalize(ro + rd * t) * R;",                   // le point de l'anneau le plus proche du rayon
    "  vec3 oc = c - ro;",
    "  float tc = dot(oc, rd);",
    "  if (tc > tHit) return 0.0;",                              // caché par le N
    "  float d = length(oc - rd * tc), w = px * tc * 1.15;",
    "  return (exp(-d * d / (w * w)) + exp(-d / (w * 8.0)) * 0.2) * mix(1.0, 0.38, smoothstep(-R, R, (uRot * c).z));",
    "}",

    /* une planète : une sphère exacte, éclairée par l'étoile accent et par la source principale */
    "vec4 planet(vec3 ro, vec3 rd, vec3 rdV, vec4 P, vec3 colA, vec3 colB, float px, out float depth) {",
    "  vec3 oc = P.xyz - ro;",
    "  float tc = dot(oc, rd), d2 = dot(oc, oc) - tc * tc, r = P.w;",
    "  depth = tc - r;",
    "  float w = px * tc * 1.2, dist = sqrt(max(d2, 0.0));",
    "  if (r < 1e-4 || dist > r + w) return vec4(0.0);",
    "  float cov = 1.0 - smoothstep(r - w, r + w, dist);",
    "  vec3 nO = normalize(ro + rd * (tc - sqrt(max(r * r - d2, 0.0))) - P.xyz);",
    "  vec3 n = uRot * nO;",
    "  float light = max(dot(nO, normalize(vec3(Q2, 0.0) - P.xyz)), 0.0) * mix(0.5, 1.0, uDark) * min(uPop.z, 1.0)",
    "              + max(dot(n, KEY), 0.0) * 0.9;",
    "  float band = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(n.y * 7.0 + sin(n.x * 3.0 + P.x * 9.0) * 0.7)) * 0.75;",   // des bandes douces, comme une géante gazeuse
    "  vec3 c = mix(colA, colB, band) * (light + mix(0.25, 0.05, uDark));",
    "  c += mix(colB, vec3(0.5, 0.7, 1.0), 0.5) * pow(1.0 - max(dot(n, -rdV), 0.0), 3.0) * mix(0.15, 0.55, uDark);",   // atmosphère
    "  return vec4(tone(c), cov);",
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
    "    float best = 1e3, tBest = t, piece = 0.0;",
    "    bool hit = false;",
    "    for (int i = 0; i < 90; i++) {",
    "      vec2 m = map(ro + rd * t);",
    "      if (m.x / t < best) { best = m.x / t; tBest = t; piece = m.y; }",
    "      if (m.x < 0.0005 * t) { hit = true; piece = m.y; break; }",
    "      t += m.x;",
    "      if (t > tEnd) break;",
    "    }",
    /* anti-crénelage des contours : un rayon qui frôle la surface la couvre en partie */
    "    float cov = hit ? 1.0 : 1.0 - smoothstep(0.0, px * 1.4, best);",
    "    if (cov > 0.003) {",
    "      float ts = hit ? t : tBest;",
    "      obj = vec4(tone(shade(ro + rd * ts, rdV, piece)), cov);",
    "      tHit = ts;",
    "    }",
    "  }",
    "  vec4 o = vec4(obj.rgb * obj.a, obj.a);",                 // alpha prémultiplié à partir d'ici

    /* lueurs : un halo serré autour de la pastille, la plume, les ondes */
    "  float glow = 0.0;",
    "  vec3 oc = vec3(Q2, 0.0) - ro; float tc = dot(oc, rd); float d2 = dot(oc, oc) - tc * tc;",
    "  glow += (exp(-d2 / 0.03) * 0.20 + exp(-d2 / 0.16) * 0.07) * mix(0.35, 1.0, uDark) * min(uPop.z, 1.0) * (tc < tHit ? 1.0 : 0.05);",
    "  oc = uTip - ro; tc = dot(oc, rd); d2 = dot(oc, oc) - tc * tc;",
    "  glow += (exp(-d2 / 0.004) * 0.4 + exp(-d2 / 0.0005) * 0.8) * uTipA * mix(0.3, 1.0, uDark) * (tc < tHit + 0.09 ? 1.0 : 0.1);",

    /* le système : trois planètes sur deux anneaux d'orbite */
    "  for (int i = 0; i < 3; i++) {",
    "    vec3 ca = i == 0 ? vec3(0.02, 0.07, 0.45) : (i == 1 ? vec3(0.55, 0.22, 0.09) : vec3(0.30, 0.33, 0.40));",
    "    vec3 cb = i == 0 ? vec3(0.45, 0.60, 1.00) : (i == 1 ? vec3(0.95, 0.72, 0.42) : vec3(0.85, 0.88, 0.95));",
    "    float hi = i == 0 ? uHi.x : (i == 1 ? uHi.y : uHi.z);",
    "    float pd;",
    "    vec4 pl = planet(ro, rd, rdV, uPlanet[i], ca, cb, px, pd);",
    "    vec4 pp = vec4(pl.rgb * pl.a, pl.a);",
    "    if (pd < tHit) o = pp + o * (1.0 - pp.a); else o = o + pp * (1.0 - o.a);",
    "    oc = uPlanet[i].xyz - ro; tc = dot(oc, rd); d2 = dot(oc, oc) - tc * tc;",
    "    glow += exp(-d2 / (uPlanet[i].w * uPlanet[i].w * 7.0 + 1e-6)) * (0.07 + 0.55 * hi) * (tc < tHit ? 1.0 : 0.0) * uSys;",
    "  }",
    "  float rings = (orbit(ro, rd, uOrbitN[0], 0.98, tHit, px) + orbit(ro, rd, uOrbitN[1], 1.20, tHit, px) * 0.75) * uSys;",

    /* l'étoile accent rayonne : un halo, et un éclat horizontal comme dans un objectif */
    "  vec2 dS = uv - uStar;",
    "  glow += (exp(-abs(dS.y) / 0.010) * exp(-dS.x * dS.x / 0.14) * 0.45",   // un éclat court, qui s'éteint de lui-même
    "         + exp(-abs(dS.x) / 0.006) * exp(-dS.y * dS.y / 0.012) * 0.16",
    "         + exp(-dot(dS, dS) / 0.012) * 0.28) * uFlare * uDark;",
    /* les ondes vivent dans le plan du N */
    "  if (abs(rd.z) > 1e-4) {",
    "    float tp = -ro.z / rd.z;",
    "    if (tp > 0.0 && tp < tHit) {",
    "      float r = length((ro + rd * tp).xy - Q2);",
    "      for (int i = 0; i < 2; i++) {",
    "        float v = i == 0 ? uRing.x : uRing.y;",
    "        if (v > 0.0 && v < 1.0) {",
    "          float e = 1.0 - pow(1.0 - v, 3.0);",
    "          float q = (r - 0.13 * (1.0 + 2.1 * e)) / 0.009;",
    "          glow += exp(-q * q) * (1.0 - e) * 0.7;",
    "        }",
    "      }",
    "    }",
    "  }",

    /* le sol : une ombre de contact calculée (ce que la pièce cache du
       plafond, vu de chaque point du sol — plus dense sous les nœuds du
       bas), et la lumière que la pastille y dépose */
    "  float shd = 0.0, pool = 0.0;",
    "  if (uDark < 0.5 && rdV.y < -0.02) {",                    // dans l'espace, pas de sol
    "    vec3 pf = vec3(0.0, 0.0, -3.2) + rdV * (FLOOR / rdV.y);",
    "    float reach = dot(pf.xz, pf.xz);",
    "    if (reach < 1.7) {",
    "      vec3 fo = vec3(pf.x, pf.y - uBob, pf.z) * uRot;",
    "      float occ = shadow(fo, vec3(0.0, 1.0, 0.0) * uRot, 1.7, 1.7);",
    "      shd = (1.0 - occ) * (1.0 - smoothstep(0.4, 1.5, reach)) * mix(0.14, 0.5, uDark);",
    "      vec3 a = uRot * vec3(Q2, 0.0);",
    "      vec3 l = vec3(a.x, a.y + uBob, a.z) - pf;",
    "      float ll = dot(l, l);",
    "      pool = l.y * inversesqrt(ll) / (ll + 0.02) * 0.022 * min(uPop.z, 1.0) * mix(0.45, 1.0, uDark);",
    "    }",
    "  }",

    /* composition : sol, objet, puis lueurs.
       Sur papier une lueur est une encre bleue ; la nuit, de la lumière. */
    "  vec3 gcDay = vec3(0.0, 0.184, 0.655), gcNight = vec3(0.45, 0.58, 1.0);",
    "  pool = clamp(pool, 0.0, 0.6);",
    "  vec4 ground = vec4(mix(gcDay, vec3(0.25, 0.4, 1.0), uDark) * pool, shd + pool * (1.0 - uDark));",
    "  o = o + ground * (1.0 - o.a);",
    /* tout ce qui est lumière s'éteint avant le bord du canvas : on ne
       doit jamais deviner son rectangle sur le ciel */
    "  float win = 1.0 - smoothstep(0.70, 0.97, max(abs(uv.x) * uRes.y / uRes.x, abs(uv.y)));",
    "  glow = clamp(glow, 0.0, 1.0) * win;",
    "  vec4 g = vec4(mix(gcDay, gcNight, uDark) * glow, glow * (1.0 - uDark));",
    "  o = g + o * (1.0 - g.a);",
    "  rings = clamp(rings, 0.0, 1.0) * mix(0.55, 0.9, uDark) * win;",
    "  vec4 rg = vec4(mix(vec3(0.07, 0.086, 0.114), vec3(0.62, 0.74, 1.0), uDark) * rings, rings * (1.0 - uDark));",
    "  o = rg + o * (1.0 - rg.a);",
    /* la nuit, une lueur derrière le logo le détache du ciel */
    "  o.rgb += vec3(0.16, 0.30, 1.0) * exp(-dot(uv, uv) / 0.6) * 0.075 * uDark * (1.0 - o.a) * win;",
    /* un grain imperceptible : les dégradés des lueurs ne font pas de bandes */
    "  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;",
    "  o.rgb += grain / 255.0 * step(0.004, max(o.a, glow));",
    /* la lumière ajoutée la nuit a une couleur sans opacité : on lui en
       donne une (celle de sa composante la plus forte), sans quoi
       certains navigateurs l'affichent mal sur fond sombre */
    "  o = max(o, 0.0);",
    "  o.a = clamp(max(o.a, max(o.r, max(o.g, o.b))), 0.0, 1.0);",
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
  ["uRes", "uRot", "uDark", "uProg", "uTipA", "uFade", "uBob", "uPop", "uTip", "uRing",
   "uOrbitN", "uPlanet", "uHi", "uStar", "uFlare", "uSys"].forEach(function (n) {
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
     réduit la définition du rendu plutôt que la fluidité. On rend
     toujours deux fois plus fin que la taille affichée : sur un écran
     ordinaire, chaque pixel est la moyenne de quatre rayons, et les
     arêtes en sortent nettes et sans escalier. */
  var quality = 1, W = 0, H = 0, slow = 0;
  function resize() {
    var scale = 2 * quality;
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

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  /* apparition avec léger dépassement, comme --ease-pop */
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

  /* ── Le système : deux anneaux d'orbite et trois planètes ──
     Les anneaux sont fixes par rapport à l'écran : le N tourne à
     l'intérieur, comme dans un astrolabe. tilt les penche vers nous
     (leur moitié proche passe devant le bas du N), slant les incline. */
  var HALF = 0.3984;
  var ORBITS = [{ r: 0.98, tilt: 24, slant: -14 }, { r: 1.20, tilt: 33, slant: 17 }].map(function (o) {
    var ct = Math.cos(o.tilt * RAD), st = Math.sin(o.tilt * RAD), cs = Math.cos(o.slant * RAD), ss = Math.sin(o.slant * RAD);
    var n = [-ss * ct, cs * ct, -st];
    var ul = Math.hypot(n[0], n[1]);
    var u = [n[1] / ul, -n[0] / ul, 0];
    var v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    return { r: o.r, n: n, u: u, v: v };
  });
  /* une planète par réalisation, dans l'ordre des cartes : Logik, Brick Rogue, Le Nœud */
  var PLANETS = [
    { orbit: 0, speed: 0.115, at: 0.6, size: 0.056 },
    { orbit: 1, speed: 0.078, at: 2.4, size: 0.066 },
    { orbit: 1, speed: 0.078, at: 2.4 + Math.PI, size: 0.048 }
  ];
  var hi = [0, 0, 0], hiTarget = [0, 0, 0];
  Array.prototype.forEach.call(document.querySelectorAll(".work-card"), function (card, i) {
    if (i > 2) return;
    ["pointerenter", "focus"].forEach(function (ev) { card.addEventListener(ev, function () { hiTarget[i] = 1; }); });
    ["pointerleave", "blur"].forEach(function (ev) { card.addEventListener(ev, function () { hiTarget[i] = 0; }); });
  });
  var orbitN = new Float32Array(6), planets = new Float32Array(12);

  var visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }).observe(canvas);
  }

  var start = performance.now(), prev = start;
  var hx = 0, hy = 0;            // inclinaison de survol, en degrés (sens CSS)

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
    var tx = live ? pointer.x * 26 : Math.sin(T * 0.5) * 22;
    var ty = live ? -pointer.y * 14 : Math.cos(T * 0.37) * 7;
    hx += (tx - hx) * 0.06;
    hy += (ty - hy) * 0.06;
    /* le nom et PARIS suivent la même inclinaison (voir monde3d.css) */
    heroLogo.style.setProperty("--ry", hx.toFixed(2) + "deg");
    heroLogo.style.setProperty("--rx", hy.toFixed(2) + "deg");
    heroLogo.style.setProperty("--ex", (-Math.sin(hx * RAD) * 1.25).toFixed(3) + "px");
    heroLogo.style.setProperty("--ey", (Math.sin(hy * RAD) * 1.25 + 0.3).toFixed(3) + "px");

    var yaw = -hx * RAD + yawDrag;                // rotateY CSS et lacet du shader sont de sens opposés
    var pitch = hy * RAD;
    var c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    gl.uniformMatrix3fv(U.uRot, false, [c, s * sp, -s * cp, 0, cp, sp, s, -c * sp, c * cp]);

    /* tracé, apparitions, lumière, ondes */
    var first = T < CYCLE;
    var tc = T % CYCLE;
    var u = (tc - 0.4) / 1.6;
    var tip = along(u);
    gl.uniform1f(U.uProg, first ? (u <= 0 ? 0 : tip.prog) : 3);
    gl.uniform4f(U.uPop,
      first ? pop((T - POP_AT[0]) / POP_DUR[0]) : 1, first ? pop((T - POP_AT[1]) / POP_DUR[1]) : 1,
      first ? pop((T - POP_AT[2]) / POP_DUR[2]) : 1, first ? pop((T - POP_AT[3]) / POP_DUR[3]) : 1);
    gl.uniform3f(U.uTip, tip.x, tip.y, 0);
    gl.uniform1f(U.uTipA, u > 0 && u < 1 ? Math.min(1, u / 0.06, (1 - u) / 0.1) : 0);
    gl.uniform2f(U.uRing, (tc - 1.51) / 1.1, (tc - 1.72) / 1.3);

    /* le système : on ramène anneaux et planètes (fixes à l'écran) dans le repère du N */
    var m = [c, s * sp, -s * cp, 0, cp, sp, s, -c * sp, c * cp];
    var back = function (p) {                     // vue → objet : la transposée de la rotation
      return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
    };
    var sys = clamp01((T - 2.5) / 1.8);
    sys = sys * sys * (3 - 2 * sys);
    ORBITS.forEach(function (o, i) { orbitN.set(back(o.n), i * 3); });
    PLANETS.forEach(function (pl, i) {
      var o = ORBITS[pl.orbit], a = T * pl.speed + pl.at;
      var ca = Math.cos(a) * o.r, sa = Math.sin(a) * o.r;
      hi[i] += (hiTarget[i] - hi[i]) * 0.1;
      planets.set(back([ca * o.u[0] + sa * o.v[0], ca * o.u[1] + sa * o.v[1], ca * o.u[2] + sa * o.v[2]]), i * 4);
      planets[i * 4 + 3] = pl.size * sys * (1 + hi[i] * 0.3);
    });
    gl.uniform3fv(U.uOrbitN, orbitN);
    gl.uniform4fv(U.uPlanet, planets);
    gl.uniform3f(U.uHi, hi[0], hi[1], hi[2]);
    gl.uniform1f(U.uSys, sys);
    /* l'étoile accent : sa place à l'écran, et son éclat (plein de face, nul de dos) */
    var bob = Math.sin(T * 0.8) * 0.012 + 0.012;
    var sx = m[0] * 0.44 + m[3] * -0.58, sy = m[1] * 0.44 + m[4] * -0.58 + bob, sz = m[2] * 0.44 + m[5] * -0.58;
    gl.uniform2f(U.uStar, sx / ((3.2 + sz) * HALF), sy / ((3.2 + sz) * HALF));
    var popA = first ? clamp01((T - POP_AT[2]) / POP_DUR[2]) : 1;
    gl.uniform1f(U.uFlare, popA * Math.pow(Math.max(0, c), 2) * Math.max(0, cp) * (0.86 + 0.14 * Math.sin(T * 1.7)));

    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uDark, dark);
    gl.uniform1f(U.uBob, bob);
    gl.uniform1f(U.uFade, clamp01(T / 0.5));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);
})();
