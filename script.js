/* ════════════════════════════════════════════
   NODUSING PARIS — animation du logo & interactions
   ════════════════════════════════════════════ */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Thème clair / sombre ──
     L'attribut data-theme est posé sur <html> par le script
     inline du <head> (anti-flash) ; ici on gère la bascule. */
  var themeToggle = document.getElementById("themeToggle");

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) { /* stockage indisponible */ }
      updateControlLabels();
    });
  }

  /* ── Langue FR / EN ── */
  var I18N = {
    fr: {
      "title.home": "nodusing Paris — Applications sur mesure",
      "title.contact": "Contact — nodusing Paris",
      "cta": "Contactez-moi",
      "contact.h2": "Démarrons votre projet<span class=\"pt\">.</span>",
      "contact.sub": "Parlez-nous de votre idée — nous revenons vers vous sous 24&nbsp;heures.",
      "label.nom": "Nom",
      "label.email": "Email",
      "label.message": "Votre projet",
      "ph.nom": "Marie Dupont",
      "ph.email": "marie@entreprise.fr",
      "ph.message": "Décrivez votre idée…",
      "send": "Envoyer",
      "sending": "Envoi en cours…",
      "success.h3": "Message bien reçu<span class=\"pt\">.</span>",
      "success.p": "Nous revenons vers vous sous 24&nbsp;heures ouvrées.",
      "contact.or": "Ou écrivez-nous directement à",
      "err.required": "Ce champ est requis.",
      "err.email": "Adresse email invalide.",
      "err.fix": "Merci de corriger les champs signalés.",
      "err.network": "Une erreur est survenue. Réessayez dans un instant.",
      "theme.toDark": "Passer en mode sombre",
      "theme.toLight": "Passer en mode clair",
      "lang.switch": "Switch to English",
      "works.apps": "Applications mobiles",
      "works.game": "Le petit jeu",
      "works.knot": "Le Nœud",
      "works.knot.sub": "Testez votre logique",
      "works.logik": "Logik",
      "works.logik.sub": "Un défi de logique par jour",
      "works.brick": "Brick Rogue",
      "works.brick.sub": "Le roguelite calme, hors ligne",
      "works.beta": "Bêta",
      "title.brick": "Brick Rogue — puzzle roguelite | nodusing Paris",
      "brick.eyebrow": "Application mobile",
      "brick.h1": "Le moule se souvient de vous<span class=\"pt\">.</span>",
      "brick.sub": "Un puzzle roguelite calme et tactile. Glissez des pièces dans le moule, pivotez d'une touche, remplissez sans un seul trou. Ici, on ne perd jamais — on fait plus beau.",
      "brick.cta": "Rejoindre la bêta",
      "brick.cta.note": "Test fermé sur Google&nbsp;Play — l'accès est ouvert à tous.",
      "brick.shots": "En images",
      "brick.shot1": "Le Moule du jour — le même pour tout le monde.",
      "brick.shot2": "L'Ascension — choisissez votre chemin.",
      "brick.shot3": "L'Établi — votre Grand Sceau se grave.",
      "brick.shot4": "Le Reliquaire — en écus gagnés, jamais en argent réel.",
      "brick.shot1.alt": "Le Moule du jour : des pièces colorées à glisser dans un moule vide.",
      "brick.shot2.alt": "La Planche : un arbre de nœuds reliés menant au Sceau majeur.",
      "brick.shot3.alt": "L'Établi du graveur : le Grand Sceau, les rituels du jour et de la semaine.",
      "brick.shot4.alt": "Le Reliquaire : des coffrets de reliques achetables en écus gagnés en jouant.",
      "brick.why": "Ce qui le distingue",
      "brick.p1.t": "Skill pur",
      "brick.p1.d": "Pas de vies, pas de minuteur, aucun achat d'avantage.",
      "brick.p2.t": "Hors ligne",
      "brick.p2.d": "Jouable partout, aucune donnée collectée par le studio.",
      "brick.p3.t": "Respectueux",
      "brick.p3.d": "Aucune publicité ; les seuls achats sont cosmétiques.",
      "brick.p4.t": "Pensé pour tous",
      "brick.p4.d": "Palette daltonienne, lecteur d'écran, texte ×2, jouable au pouce.",
      "brick.note": "Développé à Paris par nodusing.",
      "brick.privacy": "Politique de confidentialité",
      "title.game": "Le Nœud — démo technique | nodusing Paris",
      "game.eyebrow": "Démo technique",
      "game.h2": "Démêlez le réseau<span class=\"pt\">.</span>",
      "game.sub": "Déplacez les nœuds pour qu'aucune connexion n'en croise une autre. Chaque niveau est un réseau généré procéduralement — toujours soluble, jamais le même.",
      "game.level": "Niveau",
      "game.crossings": "Croisements",
      "game.moves": "Coups",
      "game.time": "Temps",
      "game.hint": "Indice",
      "game.shuffle": "Mélanger",
      "game.win": "Réseau démêlé&nbsp;!",
      "game.next": "Niveau suivant",
      "game.best": "Record",
      "game.note": "Généré procéduralement : géométrie computationnelle, détection de croisements en temps réel, rendu canvas — 100&nbsp;% code maison, zéro bibliothèque."
    },
    en: {
      "title.home": "nodusing Paris — Custom applications",
      "title.contact": "Contact — nodusing Paris",
      "cta": "Contact me",
      "contact.h2": "Let's start your project<span class=\"pt\">.</span>",
      "contact.sub": "Tell us about your idea — we'll get back to you within 24&nbsp;hours.",
      "label.nom": "Name",
      "label.email": "Email",
      "label.message": "Your project",
      "ph.nom": "Jane Smith",
      "ph.email": "jane@company.com",
      "ph.message": "Tell us about your idea…",
      "send": "Send",
      "sending": "Sending…",
      "success.h3": "Message received<span class=\"pt\">.</span>",
      "success.p": "We'll get back to you within one business day.",
      "contact.or": "Or email us directly at",
      "err.required": "This field is required.",
      "err.email": "Invalid email address.",
      "err.fix": "Please correct the highlighted fields.",
      "err.network": "Something went wrong. Please try again.",
      "theme.toDark": "Switch to dark mode",
      "theme.toLight": "Switch to light mode",
      "lang.switch": "Passer en français",
      "works.apps": "Mobile apps",
      "works.game": "The little game",
      "works.knot": "The Knot",
      "works.knot.sub": "Test your logic",
      "works.logik": "Logik",
      "works.logik.sub": "A daily logic challenge",
      "works.brick": "Brick Rogue",
      "works.brick.sub": "The calm offline roguelite",
      "works.beta": "Beta",
      "title.brick": "Brick Rogue — roguelite puzzle | nodusing Paris",
      "brick.eyebrow": "Mobile app",
      "brick.h1": "The mould remembers you<span class=\"pt\">.</span>",
      "brick.sub": "A calm, tactile roguelite puzzle. Slide pieces into the mould, tap to rotate, fill it without a single gap. You never lose here — you aim for beauty.",
      "brick.cta": "Join the beta",
      "brick.cta.note": "Closed testing on Google&nbsp;Play — open to everyone.",
      "brick.shots": "In pictures",
      "brick.shot1": "The Daily Mould — the same for everyone.",
      "brick.shot2": "The Ascension — pick your path.",
      "brick.shot3": "The Workbench — your Great Seal takes shape.",
      "brick.shot4": "The Reliquary — earned coins only, never real money.",
      "brick.shot1.alt": "The Daily Mould: colourful pieces waiting to be slid into an empty mould.",
      "brick.shot2.alt": "The Board: a tree of linked nodes leading to the Major Seal.",
      "brick.shot3.alt": "The engraver's Workbench: the Great Seal, the daily and weekly rituals.",
      "brick.shot4.alt": "The Reliquary: relic boxes bought with coins earned by playing.",
      "brick.why": "What sets it apart",
      "brick.p1.t": "Pure skill",
      "brick.p1.d": "No lives, no timer, no paid advantages, ever.",
      "brick.p2.t": "Offline",
      "brick.p2.d": "Playable anywhere; the studio collects no data.",
      "brick.p3.t": "Respectful",
      "brick.p3.d": "No ads; the only purchases are cosmetic.",
      "brick.p4.t": "For everyone",
      "brick.p4.d": "Colour-blind palette, screen-reader support, 2× text, one-thumb play.",
      "brick.note": "Built in Paris by nodusing.",
      "brick.privacy": "Privacy policy",
      "title.game": "The Knot — tech demo | nodusing Paris",
      "game.eyebrow": "Tech demo",
      "game.h2": "Untangle the network<span class=\"pt\">.</span>",
      "game.sub": "Drag the nodes so that no connection crosses another. Every level is a procedurally generated network — always solvable, never the same.",
      "game.level": "Level",
      "game.crossings": "Crossings",
      "game.moves": "Moves",
      "game.time": "Time",
      "game.hint": "Hint",
      "game.shuffle": "Shuffle",
      "game.win": "Network untangled!",
      "game.next": "Next level",
      "game.best": "Best",
      "game.note": "Procedurally generated: computational geometry, real-time crossing detection, canvas rendering — 100% hand-written code, zero libraries."
    }
  };

  var lang = "fr";
  try { lang = localStorage.getItem("lang") === "en" ? "en" : "fr"; } catch (e) { /* stockage indisponible */ }

  var langToggle = document.getElementById("langToggle");

  function t(key) {
    return (I18N[lang] && I18N[lang][key]) || I18N.fr[key] || key;
  }

  function updateControlLabels() {
    if (themeToggle) {
      themeToggle.setAttribute("aria-label", t(currentTheme() === "dark" ? "theme.toLight" : "theme.toDark"));
    }
    if (langToggle) {
      langToggle.textContent = lang === "fr" ? "EN" : "FR";
      langToggle.setAttribute("aria-label", t("lang.switch"));
    }
  }

  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      el.setAttribute("alt", t(el.getAttribute("data-i18n-alt")));
    });
    // Captures Brick Rogue : l'interface du jeu est elle-meme traduite,
    // on sert donc le jeu de captures de la langue courante.
    // Le HTML code le francais en dur (crawlers, sans-JS) ; on precharge
    // avant de permuter, sinon l'image se vide le temps du telechargement.
    document.querySelectorAll("[data-shot]").forEach(function (el) {
      var next = "assets/brickrogue/" + el.getAttribute("data-shot") + "-" + lang + ".webp";
      if (el.getAttribute("src") === next) return;
      var pre = new Image();
      pre.onload = function () { el.setAttribute("src", next); };
      pre.src = next;   // en cas d'echec on garde l'image en place
    });
    var titleKey = document.body.getAttribute("data-title-key");
    if (titleKey) document.title = t(titleKey);
    // re-traduit les messages d'erreur déjà affichés
    document.querySelectorAll(".form-field.invalid input, .form-field.invalid textarea").forEach(function (el) {
      validateField(el);
    });
    updateControlLabels();
  }

  if (langToggle) {
    langToggle.addEventListener("click", function () {
      lang = lang === "fr" ? "en" : "fr";
      try { localStorage.setItem("lang", lang); } catch (e) { /* stockage indisponible */ }
      applyLang();
    });
  }

  applyLang();

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
      var rgb = currentTheme() === "dark" ? "91, 124, 255" : "0, 47, 167";
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
            var a = (1 - Math.sqrt(d2) / LINK_DIST) * (rgb === "0, 47, 167" ? 0.1 : 0.12);
            ctx.strokeStyle = "rgba(" + rgb + ", " + a.toFixed(3) + ")";
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      for (i = 0; i < nodes.length; i++) {
        ctx.fillStyle = "rgba(" + rgb + ", " + (rgb === "0, 47, 167" ? 0.28 : 0.35) + ")";
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

  /* ── L'animation du logo, en boucle ──
     CSS : .cycle déclenche le dessin du monogramme (trait,
     nœuds, ondes) ; .play déclenche les éléments joués une
     seule fois (wordmark, PARIS, tagline). La comète suit le
     tracé via SMIL (animateMotion), relancée à chaque cycle. */
  var heroLogo = document.getElementById("heroLogo");
  var cometMove = document.getElementById("cometMove");
  var CYCLE_MS = 6500; // séquence ~2.8 s + pause contemplative

  function runCycle() {
    heroLogo.classList.remove("cycle");
    void heroLogo.offsetWidth; // force le redémarrage des animations CSS
    heroLogo.classList.add("cycle");

    // la comète part avec le trait (délai 0.4s, voir CSS)
    setTimeout(function () {
      try { cometMove.beginElement(); } catch (e) { /* SMIL indisponible */ }
    }, 400);
  }

  if (heroLogo && !reducedMotion) {
    heroLogo.classList.add("play");
    document.body.classList.add("play");
    runCycle();
    setInterval(runCycle, CYCLE_MS);
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
      setError(input, t("err.required"));
      return false;
    }
    if (input.type === "email" && value) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        setError(input, t("err.email"));
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
        formStatus.textContent = t("err.fix");
        formStatus.classList.add("error");
        var firstInvalid = form.querySelector(".form-field.invalid input, .form-field.invalid textarea");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var submitBtn = form.querySelector(".btn-submit");
      var btnLabel = submitBtn.querySelector(".btn-label");
      submitBtn.disabled = true;
      btnLabel.textContent = t("sending");
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
          submitBtn.disabled = false;
          btnLabel.textContent = t("send");
        })
        .catch(function () {
          submitBtn.disabled = false;
          btnLabel.textContent = t("send");
          formStatus.textContent = t("err.network");
          formStatus.classList.add("error");
        });
    });
  }

  /* ── Année courante ── */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
