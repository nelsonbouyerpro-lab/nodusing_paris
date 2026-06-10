/* ════════════════════════════════════════════
   NODUSING PARIS — interactions
   ════════════════════════════════════════════ */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Navbar : fond translucide au scroll ── */
  var navbar = document.getElementById("navbar");
  function onScroll() {
    navbar.classList.toggle("scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ── Menu mobile ── */
  var navToggle = document.getElementById("navToggle");
  var navLinks = document.getElementById("navLinks");
  navToggle.addEventListener("click", function () {
    var open = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
  });
  navLinks.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      navLinks.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });

  /* ── Champ de nœuds connectés (hero) ── */
  var canvas = document.getElementById("nodeField");
  if (canvas && !reducedMotion) {
    var ctx = canvas.getContext("2d");
    var nodes = [];
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var LINK_DIST = 150;

    function resize() {
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
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -10) n.x = W + 10; else if (n.x > W + 10) n.x = -10;
        if (n.y < -10) n.y = H + 10; else if (n.y > H + 10) n.y = -10;
      }

      // liaisons fines entre nœuds proches
      for (i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var dx = nodes[i].x - nodes[j].x;
          var dy = nodes[i].y - nodes[j].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST) {
            var a = (1 - Math.sqrt(d2) / LINK_DIST) * 0.13;
            ctx.strokeStyle = "rgba(216, 178, 106, " + a.toFixed(3) + ")";
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // points dorés
      for (i = 0; i < nodes.length; i++) {
        ctx.fillStyle = "rgba(216, 178, 106, 0.35)";
        ctx.beginPath();
        ctx.arc(nodes[i].x, nodes[i].y, nodes[i].r, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(tick);
  }

  /* ── Révélations au scroll ── */
  var staggerParents = document.querySelectorAll(".stagger");
  staggerParents.forEach(function (parent) {
    Array.prototype.forEach.call(parent.children, function (child, i) {
      child.style.transitionDelay = (i * 90) + "ms";
    });
  });

  var revealables = document.querySelectorAll(".reveal, .stagger > *");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) { el.classList.add("visible"); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealables.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ── Compteurs animés ── */
  var counters = document.querySelectorAll(".counter");
  function animateCounter(el) {
    var target = parseInt(el.dataset.target, 10);
    if (reducedMotion) { el.textContent = target; return; }
    var duration = 1600;
    var start = null;
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      el.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  if ("IntersectionObserver" in window && !reducedMotion) {
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { counterObserver.observe(el); });
  } else {
    counters.forEach(function (el) { el.textContent = el.dataset.target; });
  }

  /* ── Effet magnétique sur les CTA ── */
  if (!reducedMotion && window.matchMedia("(pointer: fine)").matches) {
    document.querySelectorAll(".magnetic").forEach(function (btn) {
      var strength = 0.3;
      btn.addEventListener("mousemove", function (e) {
        var rect = btn.getBoundingClientRect();
        var dx = e.clientX - (rect.left + rect.width / 2);
        var dy = e.clientY - (rect.top + rect.height / 2);
        btn.style.transform = "translate(" + (dx * strength) + "px, " + (dy * strength) + "px)";
      });
      btn.addEventListener("mouseleave", function () {
        btn.style.transform = "";
      });
    });
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
      var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
      if (!emailOk) {
        setError(input, "Adresse email invalide.");
        return false;
      }
    }
    if (input.type === "tel" && value) {
      var telOk = /^[+0-9 ().-]{6,20}$/.test(value);
      if (!telOk) {
        setError(input, "Numéro de téléphone invalide.");
        return false;
      }
    }
    setError(input, "");
    return true;
  }

  if (form) {
    var fields = form.querySelectorAll("input:not([type=hidden]):not([name=bot-field]), select, textarea");

    fields.forEach(function (input) {
      input.addEventListener("blur", function () { validateField(input); });
      input.addEventListener("input", function () {
        if (input.closest(".form-field") && input.closest(".form-field").classList.contains("invalid")) {
          validateField(input);
        }
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
        var firstInvalid = form.querySelector(".form-field.invalid input, .form-field.invalid select, .form-field.invalid textarea");
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
          formSuccess.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
        })
        .catch(function () {
          submitBtn.disabled = false;
          btnLabel.textContent = "Envoyer ma demande";
          formStatus.textContent = "Une erreur est survenue. Réessayez ou écrivez-nous directement.";
          formStatus.classList.add("error");
        });
    });
  }

  /* ── Année courante ── */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
