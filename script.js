/* ════════════════════════════════════════════
   NODUSING PARIS — animation du logo & interactions
   ════════════════════════════════════════════ */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Champ de nœuds connectés (fond du hero) ── */
  var canvas = document.getElementById("nodeField");
  if (canvas && !reducedMotion) {
    var ctx = canvas.getContext("2d");
    var nodes = [];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var LINK_DIST = 150;

    var resize = function () {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var count = Math.min(90, Math.floor((W * H) / 16000));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: 1 + Math.random() * 1.4
        });
      }
    };

    var tick = function () {
      ctx.clearRect(0, 0, W, H);

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -10) n.x = W + 10; else if (n.x > W + 10) n.x = -10;
        if (n.y < -10) n.y = H + 10; else if (n.y > H + 10) n.y = -10;
      }

      for (i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var dx = nodes[i].x - nodes[j].x;
          var dy = nodes[i].y - nodes[j].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST) {
            var a = (1 - Math.sqrt(d2) / LINK_DIST) * 0.12;
            ctx.strokeStyle = "rgba(91, 124, 255, " + a.toFixed(3) + ")";
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      for (i = 0; i < nodes.length; i++) {
        ctx.fillStyle = "rgba(91, 124, 255, 0.35)";
        ctx.beginPath();
        ctx.arc(nodes[i].x, nodes[i].y, nodes[i].r, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(tick);
  }

  /* ── L'animation du logo ──
     CSS : la classe .play déclenche la séquence (trait, nœuds,
     ondes, lettres). SMIL : la comète et l'impulsion suivent le
     tracé via animateMotion, déclenchées ici pour rester
     synchronisées et respecter prefers-reduced-motion. */
  var heroLogo = document.getElementById("heroLogo");
  var cometMove = document.getElementById("cometMove");
  var pulseMove = document.getElementById("pulseMove");
  var pulseFade = document.getElementById("pulseFade");
  var cometTimer = null;

  function playIntro() {
    if (reducedMotion) return;

    heroLogo.classList.remove("play");
    document.body.classList.remove("play");
    void heroLogo.offsetWidth; // force le redémarrage des animations CSS
    heroLogo.classList.add("play");
    document.body.classList.add("play");

    // la comète part avec le trait (délai 0.4s, voir CSS)
    clearTimeout(cometTimer);
    cometTimer = setTimeout(function () {
      try { cometMove.beginElement(); } catch (e) { /* SMIL indisponible */ }
    }, 400);
  }

  function firePulse() {
    try {
      pulseMove.beginElement();
      pulseFade.beginElement();
    } catch (e) { /* SMIL indisponible */ }
  }

  if (heroLogo) {
    if (!reducedMotion) {
      playIntro();

      // impulsion lumineuse périodique une fois l'intro posée
      setTimeout(function () {
        firePulse();
        setInterval(firePulse, 7500);
      }, 5200);

      // rejouer au clic ou au clavier
      heroLogo.addEventListener("click", playIntro);
      heroLogo.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          playIntro();
        }
      });
    }
  }

  /* ── Formulaire de contact (Netlify Forms, AJAX) ── */
  var form = document.getElementById("contactForm");
  var formStatus = document.getElementById("formStatus");
  var formSuccess = document.getElementById("formSuccess");

  function setError(input, message) {
    var field = input.closest(".form-field");
    if (!field) return;
    var errorEl = field.querySelector(".field-error");
    field.classList.toggle("invalid", !!message);
    if (errorEl) errorEl.textContent = message || "";
  }

  function validateField(input) {
    var value = input.value.trim();
    if (input.required && !value) {
      setError(input, "Ce champ est requis.");
      return false;
    }
    if (input.type === "email" && value) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        setError(input, "Adresse email invalide.");
        return false;
      }
    }
    setError(input, "");
    return true;
  }

  if (form) {
    var fields = form.querySelectorAll("input:not([type=hidden]):not([name=bot-field]), textarea");

    fields.forEach(function (input) {
      input.addEventListener("blur", function () { validateField(input); });
      input.addEventListener("input", function () {
        var field = input.closest(".form-field");
        if (field && field.classList.contains("invalid")) validateField(input);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var allValid = true;
      fields.forEach(function (input) {
        if (!validateField(input)) allValid = false;
      });
      if (!allValid) {
        formStatus.textContent = "Merci de corriger les champs signalés.";
        formStatus.classList.add("error");
        var firstInvalid = form.querySelector(".form-field.invalid input, .form-field.invalid textarea");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var submitBtn = form.querySelector(".btn-submit");
      var btnLabel = submitBtn.querySelector(".btn-label");
      submitBtn.disabled = true;
      btnLabel.textContent = "Envoi en cours…";
      formStatus.textContent = "";
      formStatus.classList.remove("error");

      var formData = new FormData(form);
      var body = new URLSearchParams();
      formData.forEach(function (value, key) { body.append(key, value); });

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          form.hidden = true;
          formSuccess.hidden = false;
        })
        .catch(function () {
          submitBtn.disabled = false;
          btnLabel.textContent = "Envoyer";
          formStatus.textContent = "Une erreur est survenue. Réessayez dans un instant.";
          formStatus.classList.add("error");
        });
    });
  }

  /* ── Année courante ── */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
