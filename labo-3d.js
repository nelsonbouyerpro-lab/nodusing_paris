/* ════════════════════════════════════════════
   NODUSING PARIS — Labo 3D
   Quatre propositions d'effets 3D pour l'accueil, activables
   une par une. Comme le reste du site : code maison, zéro
   bibliothèque (canvas 2D + transformations CSS 3D).

   Chaque effet = un objet { start, stop, frame } et une classe
   .fx-<nom> sur <html> (les styles sont dans labo-3d.css).
   ════════════════════════════════════════════ */
(function () {
  "use strict";

  var root = document.documentElement;
  var heroLogo = document.getElementById("heroLogo");
  var monogram = heroLogo && heroLogo.querySelector(".monogram");
  if (!heroLogo || !monogram) return;

  var TAU = Math.PI * 2;
  /* mouvement réduit : plus de mouvement automatique, les effets
     ne répondent qu'au geste de l'utilisateur */
  var autoMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;

  function isDark() { return root.dataset.theme === "dark"; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }

  /* générateur pseudo-aléatoire à graine : la sculpture est la même
     à chaque visite */
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── Pointeur, normalisé sur la fenêtre (-1 … 1) ── */
  var pointer = { x: 0, y: 0, last: -1e9 };
  window.addEventListener("pointermove", function (e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    pointer.last = performance.now();
  }, { passive: true });
  /* au-delà de quelques secondes sans geste, on rend la main
     au mouvement automatique */
  function pointerLive(now) { return now - pointer.last < 3000; }

  /* ── Enveloppe du monogramme ──
     Le relief y empile des tranches du SVG, la sculpture y pose
     son canvas. */
  var DEPTH_LAYERS = 10;
  var wrap = document.createElement("div");
  wrap.className = "mono3d";
  monogram.parentNode.insertBefore(wrap, monogram);
  for (var d = DEPTH_LAYERS; d >= 1; d--) {
    var layer = monogram.cloneNode(true);
    layer.querySelectorAll("defs, .comet, .ripple").forEach(function (el) { el.remove(); });
    layer.querySelectorAll("[id]").forEach(function (el) { el.removeAttribute("id"); });
    layer.setAttribute("class", "depth-layer");
    layer.style.setProperty("--d", d);
    wrap.appendChild(layer);
  }
  wrap.appendChild(monogram);

  var FX = {};

  /* ════════════════════════════════════════════
     1 · CONSTELLATION — le fond de nœuds en vraie 3D
     Un nuage rigide dans un cylindre, vu en perspective, qui
     tourne lentement et pivote avec le pointeur.
     ════════════════════════════════════════════ */
  FX.constellation = (function () {
    var canvas = document.getElementById("field3d");
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, R = 0, cam = 0, focal = 0, linkDist = 0;
    var pts = [], links = [];
    var yaw = 0, lookX = 0, lookY = 0, startedAt = 0;

    function build() {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      if (!W || !H) return;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      R = Math.max(W, H) * 0.52;          // rayon du cylindre
      var halfH = H * 0.62;               // demi-hauteur
      cam = R * 1.3;                      // la caméra reste hors du nuage
      focal = cam * 0.95;

      var count = clamp(Math.floor((W * H) / 5500), 60, 230);
      /* portée des liens : ~3,2 voisins par nœud en moyenne */
      var volume = Math.PI * R * R * 2 * halfH;
      linkDist = Math.cbrt((3.2 * volume * 3) / (4 * Math.PI * count));

      pts = [];
      for (var i = 0; i < count; i++) {
        var a = Math.random() * TAU;
        var r = R * Math.sqrt(Math.random());
        pts.push({
          x: Math.cos(a) * r,
          y: (Math.random() * 2 - 1) * halfH,
          z: Math.sin(a) * r,
          r: 1 + Math.random() * 1.4,
          accent: i % 12 === 0,           // quelques nœuds « accent », comme celui du logo
          phase: Math.random() * TAU,
          sx: 0, sy: 0, s: 0, a: 0
        });
      }

      /* le nuage est rigide : les paires liées se calculent une fois */
      links = [];
      for (i = 0; i < count; i++) {
        for (var j = i + 1; j < count; j++) {
          var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, dz = pts[i].z - pts[j].z;
          var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < linkDist) links.push({ a: pts[i], b: pts[j], w: 1 - dist / linkDist });
        }
      }
    }

    function frame(now, dt) {
      if (!W) { build(); if (!W) return; }

      yaw += dt * 0.045 * autoMotion;
      var live = pointerLive(now);
      lookX += ((live ? pointer.x * 0.4 : 0) - lookX) * 0.05;
      lookY += ((live ? pointer.y * 0.22 : 0) - lookY) * 0.05;

      /* arrivée : la caméra recule depuis l'intérieur du nuage */
      var intro = easeOut((now - startedAt) / 2200);
      var camNow = cam * (0.55 + 0.45 * intro);

      var cy = Math.cos(yaw + lookX), sy = Math.sin(yaw + lookX);
      var cp = Math.cos(lookY), sp = Math.sin(lookY);
      var t = now / 1000 * autoMotion;

      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var py = p.y + Math.sin(t * 0.6 + p.phase) * 7;   // légère respiration
        var x1 = p.x * cy + p.z * sy;
        var z1 = -p.x * sy + p.z * cy;
        var y2 = py * cp - z1 * sp;
        var z2 = py * sp + z1 * cp;
        var depth = camNow + z2;
        if (depth < cam * 0.1) { p.a = 0; continue; }
        p.s = focal / depth;
        p.sx = W / 2 + x1 * p.s;
        p.sy = H / 2 + y2 * p.s;
        /* brume : les lointains s'effacent ; les très proches aussi,
           pour ne pas passer en gros plan devant le logo */
        var far = 1 - clamp((z2 + R) / (2 * R), 0, 1) * 0.8;
        var near = 1 - clamp((p.s - 1.7) / 1.6, 0, 1);
        p.a = far * near * intro;
      }

      var dark = isDark();
      var rgb = dark ? "91, 124, 255" : "0, 47, 167";
      ctx.clearRect(0, 0, W, H);

      for (i = 0; i < links.length; i++) {
        var l = links[i];
        var alpha = l.w * Math.min(l.a.a, l.b.a) * (dark ? 0.5 : 0.4);
        if (alpha < 0.004) continue;
        ctx.strokeStyle = "rgba(" + rgb + ", " + alpha.toFixed(3) + ")";
        ctx.lineWidth = 0.7 * (l.a.s + l.b.s) / 2;
        ctx.beginPath();
        ctx.moveTo(l.a.sx, l.a.sy);
        ctx.lineTo(l.b.sx, l.b.sy);
        ctx.stroke();
      }

      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        if (p.a < 0.01) continue;
        var rad = p.r * p.s * (p.accent ? 1.9 : 1);
        if (p.accent) {
          ctx.fillStyle = "rgba(" + rgb + ", " + (p.a * 0.12).toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, rad * 3, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(" + rgb + ", " + (p.a * (p.accent ? 0.85 : dark ? 0.6 : 0.5)).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, rad, 0, TAU);
        ctx.fill();
      }
    }

    window.addEventListener("resize", function () { if (active.constellation) build(); });

    return {
      start: function () { startedAt = performance.now(); build(); },
      stop: function () { W = 0; },
      frame: frame
    };
  })();

  /* ════════════════════════════════════════════
     2 · LOGO EN RELIEF — inclinaison + épaisseur
     Le bloc logo pivote vers le pointeur ; l'épaisseur vient des
     tranches empilées (CSS), la parallaxe des plans décalés en Z.
     ════════════════════════════════════════════ */
  FX.relief = (function () {
    var rx = 0, ry = 0;

    function frame(now) {
      var tx, ty;
      if (pointerLive(now)) {
        ty = pointer.x * 20;
        tx = -pointer.y * 13;
      } else {
        var t = now / 1000 * autoMotion;      // balancement au repos (et au tactile)
        ty = Math.sin(t * 0.55) * 13 * autoMotion;
        tx = Math.cos(t * 0.4) * 5 * autoMotion;
      }
      rx += (tx - rx) * 0.07;
      ry += (ty - ry) * 0.07;
      heroLogo.style.setProperty("--rx", rx.toFixed(2) + "deg");
      heroLogo.style.setProperty("--ry", ry.toFixed(2) + "deg");
    }

    return {
      start: function () { rx = 0; ry = 0; },
      stop: function () {
        heroLogo.style.removeProperty("--rx");
        heroLogo.style.removeProperty("--ry");
      },
      frame: frame
    };
  })();

  /* ════════════════════════════════════════════
     3 · SCULPTURE — le monogramme comme objet 3D
     Le N (tubes + sphères) au centre d'un petit réseau de
     satellites. Il oscille pour rester lisible ; on peut le
     faire tourner au glissé, il revient de face.
     Unités du modèle = celles du viewBox du logo (140 × 170).
     ════════════════════════════════════════════ */
  FX.sculpture = (function () {
    var canvas = document.createElement("canvas");
    canvas.className = "sculpt";
    canvas.setAttribute("aria-hidden", "true");
    wrap.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var CW = 0, CH = 0, unit = 1;
    var CAM = 520;

    /* les 4 nœuds du N, centrés ; l'ordre suit le tracé */
    var N = [
      { x: -44, y:  58, z: 0, r: 10 },
      { x: -44, y: -58, z: 0, r: 10 },
      { x:  44, y:  58, z: 0, r: 13, accent: true },
      { x:  44, y: -58, z: 0, r: 10 }
    ];
    var SEG = [116, 145.6, 116], PATH_LEN = 377.6;

    /* satellites : petits nœuds de part et d'autre du plan du N */
    var rand = seeded(7);
    var sats = [];
    for (var i = 0; i < 16; i++) {
      var a = rand() * TAU;
      var rad = 62 + rand() * 62;
      var side = i % 2 ? 1 : -1;
      sats.push({
        x: Math.cos(a) * rad,
        y: Math.sin(a) * rad * 0.62,
        z: side * (26 + rand() * 70),
        r: 2.2 + rand() * 2.6,
        accent: i % 5 === 0,
        phase: rand() * TAU
      });
    }
    sats.forEach(function (s) {
      /* chaque satellite se relie au nœud du N le plus proche,
         et à un voisin du même côté du plan s'il y en a un */
      var best = null, bestD = 1e9;
      N.forEach(function (n) {
        var dd = Math.hypot(s.x - n.x, s.y - n.y, s.z - n.z);
        if (dd < bestD) { bestD = dd; best = n; }
      });
      s.links = [best];
      var mate = null, mateD = 85;
      sats.forEach(function (o) {
        if (o === s || (o.z > 0) !== (s.z > 0)) return;
        var dd = Math.hypot(s.x - o.x, s.y - o.y, s.z - o.z);
        if (dd < mateD) { mateD = dd; mate = o; }
      });
      if (mate) s.links.push(mate);
    });

    var yawDrag = 0, yawVel = 0, dragging = false, lastX = 0;
    var hoverYaw = 0, hoverPitch = 0, startedAt = 0;

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

    function resize() {
      CW = canvas.offsetWidth;
      CH = canvas.offsetHeight;
      if (!CW || !CH) return;
      canvas.width = CW * dpr;
      canvas.height = CH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      unit = wrap.offsetHeight / 170;      // pixels par unité du viewBox
    }

    function sphere(p, base, hi, lo, alpha) {
      var r = p.r * p.s;
      var g = ctx.createRadialGradient(p.sx - r * 0.35, p.sy - r * 0.4, r * 0.05, p.sx, p.sy, r);
      g.addColorStop(0, hi);
      g.addColorStop(0.5, base);
      g.addColorStop(1, lo);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!CW) { resize(); if (!CW) return; }
      var t = now / 1000 * autoMotion;
      var dark = isDark();

      /* inertie du glissé, puis retour de face (au tour le plus proche) */
      if (!dragging) {
        yawDrag += yawVel;
        yawVel *= 0.94;
        if (Math.abs(yawVel) < 0.004) {
          yawDrag += (Math.round(yawDrag / TAU) * TAU - yawDrag) * 0.035;
        }
      }
      var live = pointerLive(now) && !dragging;
      hoverYaw += ((live ? pointer.x * 0.3 : 0) - hoverYaw) * 0.06;
      hoverPitch += ((live ? pointer.y * 0.2 : 0) - hoverPitch) * 0.06;

      var yaw = Math.sin(t * 0.5) * 0.55 * autoMotion + yawDrag + hoverYaw;
      var pitch = Math.sin(t * 0.37) * 0.09 * autoMotion + hoverPitch;
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var cp = Math.cos(pitch), sp = Math.sin(pitch);

      var intro = easeOut((now - startedAt) / 1100);
      var k = unit * (0.72 + 0.28 * intro);
      var cx = CW / 2, cyy = CH / 2;

      function project(p, bob) {
        var py = p.y + (bob || 0);
        var x1 = p.x * cy + p.z * sy;
        var z1 = -p.x * sy + p.z * cy;
        var y2 = py * cp - z1 * sp;
        var z2 = py * sp + z1 * cp;
        var s = CAM / (CAM + z2) * k;
        p.sx = cx + x1 * s;
        p.sy = cyy + y2 * s;
        p.s = s;
        p.vz = z2;
      }

      N.forEach(function (n) { project(n); });
      sats.forEach(function (s) { project(s, Math.sin(t * 0.8 + s.phase) * 3); });

      /* le N est plan : un satellite est soit devant, soit derrière.
         Normale du plan vue par la caméra : son z vaut cos(yaw)·cos(pitch). */
      var normalZ = cy * cp;
      var back = [], front = [];
      sats.forEach(function (s) { (s.z * normalZ < 0 ? front : back).push(s); });
      var byDepth = function (a, b) { return b.vz - a.vz; };
      back.sort(byDepth);
      front.sort(byDepth);

      var ink = dark ? "245, 247, 250" : "18, 22, 29";
      var acc = dark ? "91, 124, 255" : "0, 47, 167";

      ctx.clearRect(0, 0, CW, CH);
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      /* ombre au sol : elle s'affine quand le N se présente de profil */
      var shadowW = (30 + 50 * Math.abs(cy)) * k, shadowY = cyy + 84 * k;
      ctx.save();
      ctx.translate(cx, shadowY);
      ctx.scale(1, 0.16);
      var sg = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowW);
      sg.addColorStop(0, "rgba(0, 0, 0, " + (dark ? 0.5 : 0.16) * intro + ")");
      sg.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, shadowW, 0, TAU);
      ctx.fill();
      ctx.restore();

      function drawSats(list) {
        list.forEach(function (s) {
          var fog = clamp(1 - (s.vz + 110) / 300, 0.25, 1) * intro;
          ctx.lineWidth = Math.max(0.6, 0.8 * s.s);
          s.links.forEach(function (o) {
            /* le lien s'arrête à la surface des sphères, pas en leur centre */
            var lx = o.sx - s.sx, ly = o.sy - s.sy, len = Math.hypot(lx, ly);
            var r0 = s.r * s.s, r1 = o.r * o.s;
            if (len <= r0 + r1) return;
            lx /= len; ly /= len;
            ctx.strokeStyle = "rgba(" + acc + ", " + (0.34 * fog).toFixed(3) + ")";
            ctx.beginPath();
            ctx.moveTo(s.sx + lx * r0, s.sy + ly * r0);
            ctx.lineTo(o.sx - lx * r1, o.sy - ly * r1);
            ctx.stroke();
          });
        });
        list.forEach(function (s) {
          var fog = clamp(1 - (s.vz + 110) / 300, 0.3, 1) * intro;
          if (s.accent) {
            sphere(s, dark ? "#5B7CFF" : "#002FA7", dark ? "#C5D1FF" : "#7D98FF", dark ? "#2B46B8" : "#001A66", fog);
          } else {
            sphere(s, dark ? "#AEB6C6" : "#5A6372", dark ? "#FFFFFF" : "#98A1B0", dark ? "#6B7486" : "#2E3440", fog);
          }
        });
      }

      drawSats(back);

      /* le tracé du N : un tube = trait épais + filet de lumière décalé */
      var tubeW = 6 * k;
      function tracePath(dx, dy) {
        ctx.beginPath();
        ctx.moveTo(N[0].sx + dx, N[0].sy + dy);
        for (var j = 1; j < 4; j++) ctx.lineTo(N[j].sx + dx, N[j].sy + dy);
      }
      ctx.globalAlpha = intro;
      ctx.strokeStyle = "rgb(" + ink + ")";
      ctx.lineWidth = tubeW;
      tracePath(0, 0);
      ctx.stroke();
      ctx.strokeStyle = dark ? "rgba(11, 18, 32, 0.22)" : "rgba(255, 255, 255, 0.24)";
      ctx.lineWidth = tubeW * 0.26;
      var off = tubeW * (dark ? 0.2 : -0.2);
      tracePath(off, off);
      ctx.stroke();
      ctx.globalAlpha = 1;

      /* la comète et les ondes du logo, rejouées dans l'espace */
      if (autoMotion) {
        var cyc = (now / 1000) % 6.5;
        var u = (cyc - 0.4) / 1.6;
        if (u > 0 && u < 1) {
          var dist = u * PATH_LEN, seg = 0;
          while (seg < 2 && dist > SEG[seg]) { dist -= SEG[seg]; seg++; }
          var f = dist / SEG[seg], A = N[seg], B = N[seg + 1];
          var mx = A.sx + (B.sx - A.sx) * f, my = A.sy + (B.sy - A.sy) * f;
          var life = Math.min(1, u / 0.06, (1 - u) / 0.1);
          var cg = ctx.createRadialGradient(mx, my, 0, mx, my, 15 * k);
          cg.addColorStop(0, "rgba(" + (dark ? "143, 166, 255" : acc) + ", " + (0.95 * life).toFixed(3) + ")");
          cg.addColorStop(0.35, "rgba(" + acc + ", " + (0.5 * life).toFixed(3) + ")");
          cg.addColorStop(1, "rgba(" + acc + ", 0)");
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.arc(mx, my, 15 * k, 0, TAU);
          ctx.fill();
        }
        [[1.51, 1.1, 2], [1.72, 1.3, 1.5]].forEach(function (rp) {
          var v = (cyc - rp[0]) / rp[1];
          if (v <= 0 || v >= 1) return;
          var e = easeOut(v), rr = N[2].r * N[2].s * (1 + 2.1 * e);
          ctx.strokeStyle = "rgba(" + acc + ", " + (0.7 * (1 - e)).toFixed(3) + ")";
          ctx.lineWidth = rp[2] * k;
          ctx.beginPath();
          /* l'onde reste dans le plan du N : ellipse écrasée par la rotation */
          ctx.ellipse(N[2].sx, N[2].sy, Math.max(0.5, rr * Math.abs(cy)), rr, 0, 0, TAU);
          ctx.stroke();
        });
      }

      N.slice().sort(byDepth).forEach(function (n) {
        if (n.accent) {
          sphere(n, dark ? "#5B7CFF" : "#002FA7", dark ? "#C5D1FF" : "#7D98FF", dark ? "#2B46B8" : "#001A66", intro);
        } else {
          sphere(n, dark ? "#F5F7FA" : "#12161D", dark ? "#FFFFFF" : "#566070", dark ? "#98A1B3" : "#05070A", intro);
        }
      });

      drawSats(front);
    }

    window.addEventListener("resize", function () { if (active.sculpture) resize(); });

    return {
      start: function () { startedAt = performance.now(); yawDrag = 0; yawVel = 0; resize(); },
      stop: function () { CW = 0; },
      frame: frame
    };
  })();

  /* ════════════════════════════════════════════
     4 · CARTES INCLINABLES — bascule + reflet sous le curseur
     Souris et stylet uniquement : au doigt, il n'y a pas de survol.
     ════════════════════════════════════════════ */
  FX.cards = (function () {
    var cards = Array.prototype.slice.call(document.querySelectorAll(".work-card"));
    var MAX = 11;   // degrés

    function move(e) {
      if (!active.cards || e.pointerType === "touch") return;
      var card = e.currentTarget;
      var box = card.getBoundingClientRect();
      var px = clamp((e.clientX - box.left) / box.width, 0, 1);
      var py = clamp((e.clientY - box.top) / box.height, 0, 1);
      card.classList.add("tilting");
      card.style.setProperty("--cry", ((px - 0.5) * 2 * MAX).toFixed(2) + "deg");
      card.style.setProperty("--crx", ((0.5 - py) * 2 * MAX).toFixed(2) + "deg");
      card.style.setProperty("--gx", (px * 100).toFixed(1) + "%");
      card.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
    }
    function reset(card) {
      card.classList.remove("tilting");
      card.style.removeProperty("--crx");
      card.style.removeProperty("--cry");
    }

    cards.forEach(function (card) {
      card.addEventListener("pointermove", move);
      card.addEventListener("pointerleave", function () { reset(card); });
    });

    return {
      start: function () {},
      stop: function () { cards.forEach(reset); },
      frame: null
    };
  })();

  /* ════════════════════════════════════════════
     Chef d'orchestre : état, panneau, URL
     ════════════════════════════════════════════ */
  var NAMES = ["constellation", "relief", "sculpture", "cards"];
  var EXCLUSIVE = { relief: "sculpture", sculpture: "relief" };   // deux lectures du même logo
  var active = {};
  var inputs = document.querySelectorAll("[data-fx]");
  var countEl = document.getElementById("labCount");

  function setFx(name, on) {
    on = !!on;
    if (!!active[name] === on) return;
    if (on && EXCLUSIVE[name]) setFx(EXCLUSIVE[name], false);
    active[name] = on;
    root.classList.toggle("fx-" + name, on);
    FX[name][on ? "start" : "stop"]();
  }

  function syncUi() {
    var on = NAMES.filter(function (n) { return active[n]; });
    inputs.forEach(function (input) { input.checked = !!active[input.getAttribute("data-fx")]; });
    if (countEl) countEl.textContent = on.length + " / " + NAMES.length;
    /* la combinaison vit dans l'URL : un lien suffit à la partager */
    try {
      history.replaceState(null, "", location.pathname + "?fx=" + (on.join(",") || "aucun"));
    } catch (e) { /* history indisponible */ }
  }

  inputs.forEach(function (input) {
    input.addEventListener("change", function () {
      setFx(input.getAttribute("data-fx"), input.checked);
      syncUi();
    });
  });

  var fold = document.getElementById("labFold");
  var lab = document.getElementById("lab");
  if (fold && lab) {
    var setFolded = function (folded) {
      lab.classList.toggle("folded", folded);
      fold.setAttribute("aria-expanded", String(!folded));
    };
    fold.addEventListener("click", function () { setFolded(!lab.classList.contains("folded")); });
    /* sur petit écran le panneau couvrirait le hero : replié d'office */
    if (window.matchMedia("(max-width: 1100px)").matches) setFolded(true);
  }

  var wanted = new URLSearchParams(location.search).get("fx");
  (wanted === null ? ["constellation", "relief", "cards"] : wanted.split(",")).forEach(function (name) {
    if (FX[name]) setFx(name, true);
  });
  syncUi();

  var prev = performance.now();
  (function loop(now) {
    var dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    for (var i = 0; i < NAMES.length; i++) {
      var fx = FX[NAMES[i]];
      if (active[NAMES[i]] && fx.frame) fx.frame(now, dt);
    }
    requestAnimationFrame(loop);
  })(prev);
})();
