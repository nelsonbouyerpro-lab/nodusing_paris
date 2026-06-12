/* ════════════════════════════════════════════
   LE NŒUD — démêlez le réseau
   Jeu de planarité : graphe planaire généré
   procéduralement, à démêler à la main.
   Géométrie computationnelle pure, zéro lib.
   ════════════════════════════════════════════ */
(function () {
  "use strict";

  var canvas = document.getElementById("gameCanvas");
  if (!canvas) return;

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ctx = canvas.getContext("2d");
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;

  var hudLevel = document.getElementById("hudLevel");
  var hudCross = document.getElementById("hudCross");
  var hudMoves = document.getElementById("hudMoves");
  var hudTime  = document.getElementById("hudTime");
  var winPanel = document.getElementById("winPanel");
  var winTime  = document.getElementById("winTime");
  var winMoves = document.getElementById("winMoves");
  var winBest  = document.getElementById("winBest");
  var btnNext  = document.getElementById("btnNext");
  var btnHint  = document.getElementById("btnHint");
  var btnShuffle = document.getElementById("btnShuffle");

  var MAX_LEVEL = 10;
  var level = 1;
  try { level = Math.min(Math.max(parseInt(localStorage.getItem("jeu.level"), 10) || 1, 1), MAX_LEVEL); } catch (e) { /* stockage indisponible */ }

  /* coordonnées normalisées [0,1] ; conversion px au rendu */
  var nodes = [], edges = [], solution = [];
  var crossings = 0, moves = 0, startTime = null, finalTime = 0, won = false;
  var dragging = -1, hintTween = null, particles = [];

  /* ── Génération — le procédé du jeu Planarity ──
     L droites en position générale : chaque intersection
     devient un nœud, chaque segment entre intersections
     consécutives sur une même droite devient une arête.
     Le graphe obtenu est planaire PAR CONSTRUCTION : la
     disposition d'origine est une solution garantie. */
  function generate(L) {
    var lines = [], i, j;
    for (i = 0; i < L; i++) {
      // angles bien séparés : jamais deux droites quasi parallèles
      var angle = (Math.PI * i) / L + (0.25 + Math.random() * 0.5) * Math.PI / L;
      lines.push({
        px: Math.random(), py: Math.random(),
        dx: Math.cos(angle), dy: Math.sin(angle),
        hits: []
      });
    }

    var pts = [];
    for (i = 0; i < L; i++) {
      for (j = i + 1; j < L; j++) {
        var A = lines[i], B = lines[j];
        var den = A.dx * B.dy - A.dy * B.dx;
        if (Math.abs(den) < 1e-9) continue;
        var t = ((B.px - A.px) * B.dy - (B.py - A.py) * B.dx) / den;
        var x = A.px + A.dx * t;
        var y = A.py + A.dy * t;
        var id = pts.length;
        pts.push({ x: x, y: y });
        A.hits.push({ t: t, id: id });
        B.hits.push({ t: (x - B.px) * B.dx + (y - B.py) * B.dy, id: id });
      }
    }

    edges = [];
    lines.forEach(function (ln) {
      ln.hits.sort(function (a, b) { return a.t - b.t; });
      for (var k = 0; k + 1 < ln.hits.length; k++) {
        edges.push([ln.hits[k].id, ln.hits[k + 1].id]);
      }
    });

    // la solution : les positions d'origine, normalisées dans [0.08, 0.92]
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    solution = pts.map(function (p) {
      return {
        x: 0.08 + 0.84 * (p.x - minX) / ((maxX - minX) || 1),
        y: 0.08 + 0.84 * (p.y - minY) / ((maxY - minY) || 1)
      };
    });

    // positions de départ : mélangées sur un anneau
    var order = pts.map(function (_, k) { return k; });
    for (i = order.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    nodes = pts.map(function () { return null; });
    order.forEach(function (id, k) {
      var a = (k / pts.length) * Math.PI * 2 - Math.PI / 2;
      var r = 0.32 + Math.random() * 0.09;
      nodes[id] = { x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r };
    });
  }

  /* ── Géométrie : croisement strict de deux segments ── */
  function orient(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }
  function segmentsCross(e, f) {
    if (e[0] === f[0] || e[0] === f[1] || e[1] === f[0] || e[1] === f[1]) return false;
    var a = nodes[e[0]], b = nodes[e[1]], c = nodes[f[0]], d = nodes[f[1]];
    var o1 = orient(a.x, a.y, b.x, b.y, c.x, c.y);
    var o2 = orient(a.x, a.y, b.x, b.y, d.x, d.y);
    var o3 = orient(c.x, c.y, d.x, d.y, a.x, a.y);
    var o4 = orient(c.x, c.y, d.x, d.y, b.x, b.y);
    return o1 * o2 < 0 && o3 * o4 < 0;
  }

  function recount() {
    crossings = 0;
    var i, j;
    for (i = 0; i < edges.length; i++) edges[i].crossed = false;
    for (i = 0; i < edges.length; i++) {
      for (j = i + 1; j < edges.length; j++) {
        if (segmentsCross(edges[i], edges[j])) {
          edges[i].crossed = true;
          edges[j].crossed = true;
          crossings++;
        }
      }
    }
    hudCross.textContent = crossings;
  }

  /* ── Partie ── */
  function newGame(sameLevel) {
    var attempts = 0;
    do {
      generate(level + 3);
      recount();
      attempts++;
    } while (crossings < edges.length / 4 && attempts < 8); // départ jamais déjà démêlé

    moves = 0; startTime = null; finalTime = 0; won = false;
    dragging = -1; hintTween = null; particles = [];
    winPanel.hidden = true;
    hudLevel.textContent = level;
    hudMoves.textContent = "0";
    hudTime.textContent = "00:00";
    if (!sameLevel) {
      try { localStorage.setItem("jeu.level", String(level)); } catch (e) { /* stockage indisponible */ }
    }
  }

  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function finish() {
    won = true;
    finalTime = startTime ? (Date.now() - startTime) : 0;
    hudTime.textContent = formatTime(finalTime);

    var best = null;
    var key = "jeu.best." + level;
    try {
      best = parseInt(localStorage.getItem(key), 10) || null;
      if (!best || finalTime < best) { best = finalTime; localStorage.setItem(key, String(best)); }
    } catch (e) { /* stockage indisponible */ }

    winTime.textContent = formatTime(finalTime);
    winMoves.textContent = moves;
    winBest.textContent = best ? formatTime(best) : "—";
    winPanel.hidden = false;

    if (!reducedMotion) {
      nodes.forEach(function (n) {
        for (var k = 0; k < 6; k++) {
          var a = Math.random() * Math.PI * 2;
          var v = 0.4 + Math.random() * 1.2;
          particles.push({
            x: n.x, y: n.y,
            vx: Math.cos(a) * v * 0.004, vy: Math.sin(a) * v * 0.004 - 0.002,
            life: 1
          });
        }
      });
    }
  }

  function checkWin() {
    if (!won && moves > 0 && crossings === 0) finish();
  }

  /* ── Indice : ramène le nœud le plus « emmêlé » vers sa
     position dans la solution d'origine ── */
  function hint() {
    if (won) return;
    var score = nodes.map(function () { return 0; });
    edges.forEach(function (e) {
      if (e.crossed) { score[e[0]]++; score[e[1]]++; }
    });
    var worst = -1, max = 0;
    score.forEach(function (s, i) { if (s > max) { max = s; worst = i; } });
    if (worst < 0) return;
    if (!startTime) startTime = Date.now();
    moves++;
    hudMoves.textContent = moves;
    if (reducedMotion) {
      nodes[worst].x = solution[worst].x;
      nodes[worst].y = solution[worst].y;
      recount();
      checkWin();
    } else {
      hintTween = {
        id: worst, t0: Date.now(), dur: 450,
        fx: nodes[worst].x, fy: nodes[worst].y,
        tx: solution[worst].x, ty: solution[worst].y
      };
    }
  }

  /* ── Rendu ── */
  function palette() {
    var dark = document.documentElement.dataset.theme === "dark";
    return dark ? {
      edge: "rgba(245, 247, 250, 0.28)",
      bad: "rgba(224, 123, 107, 0.9)",
      node: "#F5F7FA",
      accent: "#5B7CFF",
      halo: "rgba(91, 124, 255, 0.4)"
    } : {
      edge: "rgba(18, 22, 29, 0.28)",
      bad: "rgba(192, 58, 43, 0.85)",
      node: "#12161D",
      accent: "#002FA7",
      halo: "rgba(0, 47, 167, 0.3)"
    };
  }

  var margin = 26;
  function sx(x) { return margin + x * (W - margin * 2); }
  function sy(y) { return margin + y * (H - margin * 2); }

  function nodeRadius() {
    return Math.max(6, 13 - nodes.length * 0.08);
  }

  function render() {
    // rattrape un layout arrivé tard (onglet ouvert en arrière-plan…)
    if (canvas.offsetWidth !== W || canvas.offsetHeight !== H) resize();

    var pal = palette();
    var r = nodeRadius();
    ctx.clearRect(0, 0, W, H);

    // tween d'indice en cours
    if (hintTween) {
      var p = Math.min((Date.now() - hintTween.t0) / hintTween.dur, 1);
      var ease = 1 - Math.pow(1 - p, 3);
      nodes[hintTween.id].x = hintTween.fx + (hintTween.tx - hintTween.fx) * ease;
      nodes[hintTween.id].y = hintTween.fy + (hintTween.ty - hintTween.fy) * ease;
      recount();
      if (p >= 1) { hintTween = null; checkWin(); }
    }

    // arêtes
    var i;
    for (i = 0; i < edges.length; i++) {
      var e = edges[i];
      ctx.strokeStyle = won ? pal.accent : (e.crossed ? pal.bad : pal.edge);
      ctx.lineWidth = e.crossed ? 1.8 : 1.5;
      ctx.beginPath();
      ctx.moveTo(sx(nodes[e[0]].x), sy(nodes[e[0]].y));
      ctx.lineTo(sx(nodes[e[1]].x), sy(nodes[e[1]].y));
      ctx.stroke();
    }

    // nœuds
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var active = i === dragging || (hintTween && hintTween.id === i);
      if (active) {
        ctx.fillStyle = pal.halo;
        ctx.beginPath();
        ctx.arc(sx(n.x), sy(n.y), r + 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = active || won ? pal.accent : pal.node;
      ctx.beginPath();
      ctx.arc(sx(n.x), sy(n.y), r, 0, Math.PI * 2);
      ctx.fill();
    }

    // particules de victoire
    for (i = particles.length - 1; i >= 0; i--) {
      var pt = particles[i];
      pt.x += pt.vx; pt.y += pt.vy;
      pt.vy += 0.00008;
      pt.life -= 0.012;
      if (pt.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(sx(pt.x), sy(pt.y), 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // chrono
    if (startTime && !won) hudTime.textContent = formatTime(Date.now() - startTime);

    requestAnimationFrame(render);
  }

  /* ── Interactions (souris + tactile via Pointer Events) ── */
  function eventPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left - margin) / (rect.width - margin * 2),
      y: (ev.clientY - rect.top - margin) / (rect.height - margin * 2)
    };
  }

  canvas.addEventListener("pointerdown", function (ev) {
    if (won) return;
    if (hintTween) {
      // un clic termine l'indice en cours au lieu d'attendre le tween
      nodes[hintTween.id].x = hintTween.tx;
      nodes[hintTween.id].y = hintTween.ty;
      hintTween = null;
      recount();
      checkWin();
      if (won) return;
    }
    var p = eventPos(ev);
    var hitR = (nodeRadius() + 9) / (canvas.getBoundingClientRect().width - margin * 2);
    var bestD = Infinity, bestI = -1;
    nodes.forEach(function (n, i) {
      var d = (n.x - p.x) * (n.x - p.x) + (n.y - p.y) * (n.y - p.y);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    if (bestI >= 0 && bestD < hitR * hitR) {
      dragging = bestI;
      if (!startTime) startTime = Date.now();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* pointeur déjà libéré */ }
      ev.preventDefault();
    }
  });

  canvas.addEventListener("pointermove", function (ev) {
    if (dragging < 0) return;
    var p = eventPos(ev);
    nodes[dragging].x = Math.min(Math.max(p.x, 0), 1);
    nodes[dragging].y = Math.min(Math.max(p.y, 0), 1);
    recount();
    ev.preventDefault();
  });

  function endDrag() {
    if (dragging < 0) return;
    dragging = -1;
    moves++;
    hudMoves.textContent = moves;
    checkWin();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  btnHint.addEventListener("click", hint);
  btnShuffle.addEventListener("click", function () { newGame(true); });
  btnNext.addEventListener("click", function () {
    if (level < MAX_LEVEL) level++;
    newGame(false);
  });

  /* ── Mise à l'échelle ── */
  function resize() {
    W = canvas.offsetWidth;
    H = canvas.offsetHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  /* hook de test (console uniquement) */
  window.JEU = {
    state: function () {
      return { level: level, nodes: nodes.length, edges: edges.length, crossings: crossings, moves: moves, won: won };
    },
    solve: function () {
      nodes.forEach(function (n, i) { n.x = solution[i].x; n.y = solution[i].y; });
      moves++; if (!startTime) startTime = Date.now();
      recount(); checkWin();
    }
  };

  resize();
  newGame(true);
  requestAnimationFrame(render);
})();
