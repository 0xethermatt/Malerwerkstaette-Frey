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
  var CYCLE_MS = 5000;

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

  function advance() {
    idx = (idx + 1) % ORDER.length;
    applySwatch(ORDER[idx]);
  }

  function startCycle() {
    if (timer) return;
    timer = window.setInterval(advance, CYCLE_MS);
  }
  function stopCycle() {
    if (timer) { window.clearInterval(timer); timer = null; }
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Automatischer Farbwechsel „mit der Zeit" — das ist die Magie der Seite.
  if (!reduceMotion) {
    startCycle();
    // Wenn der Tab im Hintergrund ist, pausieren (spart Ressourcen).
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopCycle(); else startCycle();
    });
  }

  // Neugierige dürfen trotzdem tippen: Farbe setzen und den Zyklus dort fortsetzen.
  swatches.forEach(function (btn) {
    btn.addEventListener("click", function () {
      applySwatch(btn.dataset.swatch);
      if (!reduceMotion) { stopCycle(); startCycle(); }  // Rhythmus neu ab dieser Farbe
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
     5) Jahreszahl im Footer
     --------------------------------------------------------- */
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
