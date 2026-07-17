/* =============================================================
   Malerwerkstätte Frey — main.js
   Kein Framework, keine Abhängigkeiten.
   ============================================================= */
(function () {
  "use strict";

  var root = document.documentElement;

  /* JS ist aktiv → Scroll-Reveals dürfen Inhalte zunächst verstecken.
     (Ohne diese Klasse bleibt bei deaktiviertem JS alles sichtbar.) */
  root.classList.add("js");

  /* ---------------------------------------------------------
     1) Farbwechsel — der Kern der Seite
     Pro Swatch: Akzentfarbe (--accent) + individuell kalibrierter
     Filter für das Chamäleon-Bild (nur das Tier, nicht der Ast).
     Werte am echten Foto abgestimmt: das Ausgangsbild ist blau-grün.
     --------------------------------------------------------- */
  var SWATCHES = {
    amber:  { accent: "#DFA23A", cham: "hue-rotate(332deg) saturate(1.15) brightness(1.18)" },
    petrol: { accent: "#167A72", cham: "hue-rotate(0deg) saturate(1.1) brightness(1)" },
    leaf:   { accent: "#6FA354", cham: "hue-rotate(45deg) saturate(1.2) brightness(1.03)" },
    coral:  { accent: "#C6553A", cham: "hue-rotate(330deg) saturate(1.6) brightness(0.82)" }
  };

  var swatches = Array.prototype.slice.call(document.querySelectorAll("[data-swatch]"));

  // Reihenfolge des automatischen Farbwechsels
  var ORDER = ["amber", "leaf", "petrol", "coral"];
  var idx = 0;
  var timer = null;
  var CYCLE_MS = 4800;   // ruhiger, automatischer Wechsel — ganz ohne Zutun

  function applySwatch(key) {
    var s = SWATCHES[key];
    if (!s) return;
    root.style.setProperty("--accent", s.accent);
    root.style.setProperty("--cham-filter", s.cham);
    swatches.forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.swatch === key));
    });
    idx = ORDER.indexOf(key);
  }
  function advance() { applySwatch(ORDER[(idx + 1) % ORDER.length]); }

  function startCycle() { if (!timer) timer = window.setInterval(advance, CYCLE_MS); }
  function stopCycle() { if (timer) { window.clearInterval(timer); timer = null; } }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Das Chamäleon wechselt von selbst die Farbe — mit weichem Übergang (siehe CSS).
  if (!reduceMotion) {
    startCycle();
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopCycle(); else startCycle();
    });
  }

  // Optional: antippen setzt die Farbe und der Lauf geht dort weiter.
  swatches.forEach(function (btn) {
    btn.addEventListener("click", function () {
      applySwatch(btn.dataset.swatch);
      if (!reduceMotion) { stopCycle(); startCycle(); }
    });
  });

  /* ---------------------------------------------------------
     2) Mobile-Navigation
     --------------------------------------------------------- */
  var header = document.getElementById("siteHeader");
  var toggle = document.getElementById("navToggle");
  var navLinks = document.getElementById("navLinks");

  function setMenu(open) {
    header.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      setMenu(!header.classList.contains("open"));
    });
    // Menü nach Klick auf einen Link schließen
    navLinks.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    // Esc schließt das Menü
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenu(false);
    });
  }

  /* ---------------------------------------------------------
     3) Scroll-Reveal (dezent) — respektiert reduced-motion
     --------------------------------------------------------- */
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealEls = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));

  if (reduce || !("IntersectionObserver" in window)) {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------
     4) Kontaktformular → mailto (kein Server nötig)
     --------------------------------------------------------- */
  var form = document.getElementById("contactForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      var name = form.name.value.trim();
      var kontakt = form.kontakt.value.trim();
      var nachricht = form.nachricht.value.trim();

      var subject = "Anfrage über die Website — " + (name || "Interessent");
      var body =
        "Name: " + name + "\n" +
        "Kontakt: " + kontakt + "\n\n" +
        nachricht + "\n";

      window.location.href =
        "mailto:post@maler-langenau.de" +
        "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(body);
    });
  }

  /* ---------------------------------------------------------
     5) Referenzen-Slider (mobil) — Punkt-Navigation
     Auf Desktop bleibt .ref-grid ein CSS-Grid und ist nicht scrollbar;
     die Punkte sind dort per CSS ausgeblendet, die Beobachtung hier
     ist dann einfach wirkungslos.
     --------------------------------------------------------- */
  var refGrid = document.querySelector("#referenzen .ref-grid");
  var refDots = document.querySelector(".ref-dots");
  if (refGrid && refDots && "IntersectionObserver" in window) {
    var refSlides = Array.prototype.slice.call(refGrid.children);
    var dotEls = refSlides.map(function (slide, i) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", "Bild " + (i + 1) + " von " + refSlides.length);
      dot.setAttribute("aria-current", String(i === 0));
      dot.addEventListener("click", function () {
        slide.scrollIntoView({ behavior: reduce ? "auto" : "smooth", inline: "center", block: "nearest" });
      });
      refDots.appendChild(dot);
      return dot;
    });
    var refIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!(entry.isIntersecting && entry.intersectionRatio > 0.6)) return;
        var idx = refSlides.indexOf(entry.target);
        if (idx === -1) return;
        dotEls.forEach(function (d, di) { d.setAttribute("aria-current", String(di === idx)); });
      });
    }, { root: refGrid, threshold: [0.6] });
    refSlides.forEach(function (slide) { refIo.observe(slide); });
  }

  /* ---------------------------------------------------------
     6) Referenzen-Lightbox — nur für echte Fotos, nicht für
     Platzhalter-Karten (da gibt es nichts zu vergrößern).
     --------------------------------------------------------- */
  var refPhotos = Array.prototype.slice.call(document.querySelectorAll(".ref > img"));
  if (refPhotos.length) {
    var lightbox = document.createElement("div");
    lightbox.className = "lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-hidden", "true");
    lightbox.innerHTML =
      '<button type="button" class="lightbox__close" aria-label="Schließen">' +
        '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      '</button>' +
      '<figure class="lightbox__frame">' +
        '<img class="lightbox__img" src="" alt="">' +
        '<figcaption class="lightbox__cap"></figcaption>' +
      '</figure>';
    document.body.appendChild(lightbox);

    var lbImg = lightbox.querySelector(".lightbox__img");
    var lbCap = lightbox.querySelector(".lightbox__cap");
    var lbClose = lightbox.querySelector(".lightbox__close");
    var lastTrigger = null;

    function openLightbox(img) {
      lastTrigger = img;
      lbImg.src = img.src;
      lbImg.alt = img.alt;
      var cap = img.closest(".ref").querySelector(".ref__cap");
      lbCap.textContent = cap ? cap.textContent : "";
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.documentElement.classList.add("lightbox-open");
      lbClose.focus();
    }
    function closeLightbox() {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("lightbox-open");
      if (lastTrigger) lastTrigger.focus();
    }

    refPhotos.forEach(function (img) {
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", "Bild vergrößern: " + img.alt);
      img.addEventListener("click", function () { openLightbox(img); });
      img.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(img); }
      });

      var zoomHint = document.createElement("span");
      zoomHint.className = "ref__zoom";
      zoomHint.setAttribute("aria-hidden", "true");
      zoomHint.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/><path d="M10.5 8v5M8 10.5h5"/>' +
        '</svg>';
      img.insertAdjacentElement("afterend", zoomHint);
    });

    lbClose.addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && lightbox.classList.contains("is-open")) closeLightbox();
    });
  }

  /* ---------------------------------------------------------
     7) Jahreszahl im Footer
     --------------------------------------------------------- */
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
