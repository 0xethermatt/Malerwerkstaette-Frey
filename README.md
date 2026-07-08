# Malerwerkstätte Frey — Website

Statische One-Page-Website für die Malerwerkstätte Frey in Langenau.
Reines **HTML / CSS / Vanilla JS**, kein Build-Step, keine Abhängigkeiten.

## Struktur

```
/
├── index.html          Seiteninhalt (7 Abschnitte)
├── css/style.css       Styles + Design-Tokens
├── js/main.js          Farbwechsel, Menü, Scroll-Reveals, Formular
└── assets/
    ├── chameleon.webp          volles Chamäleon (Social-/OG-Bild)
    ├── chameleon-branch.webp   Ast-Ebene (bleibt Holz, färbt NICHT um)
    ├── chameleon-animal.webp   Tier-Ebene (bekommt den Farb-Filter)
    ├── ref-fassade.webp        Referenzfoto (echt)
    ├── ref-fachwerk.webp       Referenzfoto (echt)
    └── team-fuhrpark.webp      Fuhrpark-/Teamfoto (echt)
```

## Deployen

Einfach den kompletten Ordner auf einen beliebigen Webspace, Vercel, Netlify
o. ä. hochladen — es ist ein rein statisches Verzeichnis, kein Server nötig.

## Der „Farbwechsel“

Die Farbauswahl-Leiste im Hero setzt zwei Dinge:

- `--accent` (Akzentfarbe der ganzen Seite) und
- `--cham-filter` (CSS-`filter` **nur** auf der Tier-Ebene des Chamäleons).

Der Ast liegt als eigene, statische Bild-Ebene darunter und bleibt deshalb
immer aus Holz. Die Filter-Werte pro Farbe sind in `js/main.js` (`SWATCHES`)
am echten Foto abgestimmt.

## Platzhalter-Fotos ersetzen

Drei Referenz-Slots sind noch Platzhalter. Zum Austauschen den
`<div class="placeholder">…</div>` in `index.html` durch ein Bild ersetzen:

```html
<figure class="ref">
  <img src="assets/mein-projekt.webp" alt="Kurze Beschreibung" loading="lazy" width="1200" height="900">
  <figcaption class="ref__cap">Projekt · Ort</figcaption>
</figure>
```

Seitenverhältnis der Kacheln ist **4:3**, die Bilder werden per
`object-fit: cover` beschnitten — es bricht nichts im Layout.

## Anpassen

- **Farbtöne / Fonts:** Tokens ganz oben in `css/style.css` (`:root`).
- **Kontaktdaten:** im Abschnitt `#kontakt` in `index.html`.
- **Impressum / Datenschutz:** Footer-Links sind Platzhalter (`href="#"`) und
  müssen noch mit echten Seiten verknüpft werden.
