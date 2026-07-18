/* =============================================================
   Malerwerkstätte Frey — Farbdesigner
   Kein Framework, keine Abhängigkeiten (außer der API-Route).
   ============================================================= */
(function () {
  "use strict";

  /* ----------------------------------------------------------------
     Farbpalette (kuratiert)
  ---------------------------------------------------------------- */
  var PALETTE = [
    { name: "Warmweiß",     hex: "#F5F0E8" },
    { name: "Creme",        hex: "#F0E6D0" },
    { name: "Sand",         hex: "#D9C8A8" },
    { name: "Beige",        hex: "#C8B89A" },
    { name: "Greige",       hex: "#B5A898" },
    { name: "Hellgrau",     hex: "#C8CCCA" },
    { name: "Silbergrau",   hex: "#A8AEB0" },
    { name: "Anthrazit",    hex: "#4A4F52" },
    { name: "Dunkelgrün",   hex: "#2D4A38" },
    { name: "Waldgrün",     hex: "#4A7055" },
    { name: "Salbeigrün",   hex: "#879783" },
    { name: "Mint",         hex: "#A8C5B8" },
    { name: "Olivgrün",     hex: "#8A8A5C" },
    { name: "Taubenblau",   hex: "#8099AA" },
    { name: "Petrol",       hex: "#2D6B72" },
    { name: "Stahlblau",    hex: "#4A6E8A" },
    { name: "Dunkelblau",   hex: "#2A3D5E" },
    { name: "Terrakotta",   hex: "#B5654A" },
    { name: "Altrosa",      hex: "#C4907A" },
    { name: "Zartrosa",     hex: "#DDB5A8" },
    { name: "Bordeaux",     hex: "#6B2A35" },
    { name: "Senfgelb",     hex: "#C8A838" },
    { name: "Ocker",        hex: "#B88A3A" },
    { name: "Lavendel",     hex: "#9088AA" }
  ];

  /* ----------------------------------------------------------------
     Farben für bis zu 3 Wandflächen (halbtransparent über Canvas)
  ---------------------------------------------------------------- */
  var WALL_COLORS = ["rgba(80,160,220,.45)", "rgba(220,120,60,.45)", "rgba(120,200,100,.45)"];
  var WALL_NAMES  = ["Wand 1", "Wand 2", "Wand 3"];

  /* ----------------------------------------------------------------
     Anwendungszustand
  ---------------------------------------------------------------- */
  var state = {
    // Upload
    originalImage: null,        // HTMLImageElement (original, korrigiert)
    preparedDataUrl: null,      // String (verkleinert, JPEG/WebP)
    preparedWidth: 0,
    preparedHeight: 0,

    // Werkzeuge
    activeTool: "select",       // select | exclude | brush | eraser
    brushSize: 20,

    // Wandflächen (max 3)
    walls: [
      { points: [], maskData: null, color: "#6FA354", applied: false },
    ],
    activeWall: 0,

    // Farbe
    selectedColor: "#879783",
    selectedColorName: "Salbeigrün",
    intensity: 70,              // 30-100

    // Undo-Stack pro Wand
    undoStacks: [[]],

    // Auto-Segmentierung (einmalig nach Upload)
    combinedMaskImageData: null,   // ImageData des meta/sam-2 combined_mask
    segmentationReady: false,      // true sobald combined_mask geladen
    isSegmenting: false,
    hasResult: false,

    // Compare-Slider
    comparePos: 0.5,
    isDraggingCompare: false,
  };

  /* ----------------------------------------------------------------
     DOM-Referenzen
  ---------------------------------------------------------------- */
  var els = {};

  function initDomRefs() {
    els.upload        = document.getElementById("fdUpload");
    els.fileInput     = document.getElementById("fdFileInput");
    els.progress      = document.getElementById("fdProgress");
    els.progressLabel = document.getElementById("fdProgressLabel");
    els.progressSub   = document.getElementById("fdProgressSub");
    els.editor        = document.getElementById("fdEditor");
    els.canvasWrap    = document.getElementById("fdCanvasWrap");
    els.canvas        = document.getElementById("fdCanvas");
    els.overlay       = document.getElementById("fdOverlay");
    els.error         = document.getElementById("fdError");
    els.errorMsg      = document.getElementById("fdErrorMsg");
    els.walls         = document.getElementById("fdWalls");
    els.addWall       = document.getElementById("fdAddWall");
    els.btnSelect     = document.getElementById("fdToolSelect");
    els.btnExclude    = document.getElementById("fdToolExclude");
    els.btnBrush      = document.getElementById("fdToolBrush");
    els.btnEraser     = document.getElementById("fdToolEraser");
    els.btnUndo       = document.getElementById("fdToolUndo");
    els.btnClear      = document.getElementById("fdToolClear");
    els.brushSizeWrap = document.getElementById("fdBrushSizeWrap");
    els.brushSizeInput= document.getElementById("fdBrushSize");
    els.btnConfirm    = document.getElementById("fdConfirmWall");
    els.btnNewPhoto   = document.getElementById("fdNewPhoto");
    els.palette       = document.getElementById("fdPalette");
    els.colorPicker   = document.getElementById("fdColorPicker");
    els.colorName     = document.getElementById("fdColorName");
    els.colorHex      = document.getElementById("fdColorHex");
    els.intensity     = document.getElementById("fdIntensity");
    els.intensityVal  = document.getElementById("fdIntensityVal");
    els.wallInfo      = document.getElementById("fdWallInfo");
    els.compareWrap   = document.getElementById("fdCompareWrap");
    els.compareBefore = document.getElementById("fdCompareBefore");
    els.compareAfter  = document.getElementById("fdCompareAfter");
    els.compareHandle = document.getElementById("fdCompareHandle");
    els.compareLine   = document.getElementById("fdCompareLine");
    els.btnDownload   = document.getElementById("fdDownload");
    els.btnConsult    = document.getElementById("fdConsult");
  }

  /* ----------------------------------------------------------------
     Hilfsfunktionen — EXIF-Orientierung
  ---------------------------------------------------------------- */
  function readExifOrientation(buffer) {
    var view = new DataView(buffer);
    if (view.getUint16(0) !== 0xFFD8) return 1; // kein JPEG
    var len = view.byteLength;
    var offset = 2;
    while (offset < len - 2) {
      var marker = view.getUint16(offset);
      offset += 2;
      if (marker === 0xFFE1) { // APP1
        if (view.getUint32(offset + 2) === 0x45786966) { // "Exif"
          var little = view.getUint16(offset + 8) === 0x4949;
          var ifdOffset = view.getUint32(offset + 14, little) + offset + 8;
          var entries = view.getUint16(ifdOffset, little);
          for (var i = 0; i < entries; i++) {
            var tag = view.getUint16(ifdOffset + 2 + i * 12, little);
            if (tag === 0x0112) {
              return view.getUint16(ifdOffset + 2 + i * 12 + 8, little);
            }
          }
        }
        break;
      }
      if (marker < 0xFF00) break;
      offset += view.getUint16(offset) + 2;
    }
    return 1;
  }

  function applyExifOrientation(img, orientation, canvas, ctx) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (orientation >= 5) { canvas.width = h; canvas.height = w; }
    else { canvas.width = w; canvas.height = h; }
    ctx.save();
    switch (orientation) {
      case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
      case 3: ctx.transform(-1, 0, 0,-1, w, h); break;
      case 4: ctx.transform( 1, 0, 0,-1, 0, h); break;
      case 5: ctx.transform( 0, 1, 1, 0, 0, 0); break;
      case 6: ctx.transform( 0, 1,-1, 0, h, 0); break;
      case 7: ctx.transform( 0,-1,-1, 0, h, w); break;
      case 8: ctx.transform( 0,-1, 1, 0, 0, w); break;
      default: break;
    }
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  /* ----------------------------------------------------------------
     Bild vorbereiten (resize + EXIF + komprimieren)
  ---------------------------------------------------------------- */
  var MAX_DIM = 2048;
  var MAX_FILE_BYTES = 10 * 1024 * 1024;
  var ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

  function prepareImage(file, onDone, onError) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return onError("Dieser Dateityp wird nicht unterstützt. Bitte JPEG, PNG oder WebP hochladen.");
    }
    if (file.size > MAX_FILE_BYTES) {
      return onError("Das Foto ist zu groß (max. 10 MB). Bitte ein kleineres Bild wählen.");
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var arrayBuf = e.target.result;
      var orientation = 1;
      try { orientation = readExifOrientation(arrayBuf); } catch (_) {}

      var blob = new Blob([arrayBuf], { type: file.type });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var tmpCanvas = document.createElement("canvas");
        var tmpCtx = tmpCanvas.getContext("2d");

        // EXIF-Orientierung anwenden
        applyExifOrientation(img, orientation, tmpCanvas, tmpCtx);
        URL.revokeObjectURL(url);

        // Auf MAX_DIM skalieren
        var sw = tmpCanvas.width, sh = tmpCanvas.height;
        if (sw > MAX_DIM || sh > MAX_DIM) {
          var scale = Math.min(MAX_DIM / sw, MAX_DIM / sh);
          var newW = Math.round(sw * scale), newH = Math.round(sh * scale);
          var scaleCanvas = document.createElement("canvas");
          scaleCanvas.width = newW; scaleCanvas.height = newH;
          var scaleCtx = scaleCanvas.getContext("2d");
          scaleCtx.imageSmoothingEnabled = true;
          scaleCtx.imageSmoothingQuality = "high";
          scaleCtx.drawImage(tmpCanvas, 0, 0, newW, newH);
          tmpCanvas = scaleCanvas;
        }

        var quality = file.type === "image/png" ? 0.92 : 0.88;
        var outMime = file.type === "image/png" ? "image/png" : "image/jpeg";
        var dataUrl = tmpCanvas.toDataURL(outMime, quality);

        var result = new Image();
        result.onload = function () {
          onDone(result, dataUrl, tmpCanvas.width, tmpCanvas.height);
        };
        result.onerror = function () { onError("Bild konnte nicht dekodiert werden."); };
        result.src = dataUrl;
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        onError("Bild konnte nicht gelesen werden. Bitte ein anderes Foto versuchen.");
      };
      img.src = url;
    };
    reader.onerror = function () {
      onError("Datei konnte nicht gelesen werden.");
    };
    reader.readAsArrayBuffer(file);
  }

  /* ----------------------------------------------------------------
     Canvas-Koordinaten (normalisiert: 0–1)
  ---------------------------------------------------------------- */
  function getNormalizedCoords(event) {
    var rect = els.canvas.getBoundingClientRect();
    var clientX, clientY;
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top)  / rect.height,
    };
  }

  /* ----------------------------------------------------------------
     Canvas-Rendering
  ---------------------------------------------------------------- */
  var dpr = window.devicePixelRatio || 1;
  var cachedOriginalPixels = null;   // ImageData des Originalbildes
  var cachedMaskImageData = null;    // {wall: index, data: ImageData}
  var colorizedCache = null;         // {wall, color, intensity, pixels: ImageData}

  function setupCanvas() {
    var w = state.preparedWidth, h = state.preparedHeight;
    els.canvas.width  = w * dpr;
    els.canvas.height = h * dpr;
    els.overlay.width  = w * dpr;
    els.overlay.height = h * dpr;
    var ctx = els.canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.drawImage(state.originalImage, 0, 0, w, h);
    cachedOriginalPixels = ctx.getImageData(0, 0, w * dpr, h * dpr);
  }

  function renderCanvas() {
    if (!state.originalImage) return;
    var w = state.preparedWidth, h = state.preparedHeight;
    var ctx = els.canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    // Originals zeichnen
    ctx.drawImage(state.originalImage, 0, 0, w, h);

    // Alle bestätigten Wandmasken mit Farbe einfärben
    for (var wi = 0; wi < state.walls.length; wi++) {
      var wall = state.walls[wi];
      if (wall.maskData && wall.applied) {
        applyColorToCanvas(ctx, wall, wi === state.activeWall);
      }
    }

    // Overlay: aktive Maske als halbtransparente Fläche
    renderOverlay();
  }

  function renderOverlay() {
    var octx = els.overlay.getContext("2d");
    var w = state.preparedWidth, h = state.preparedHeight;
    octx.clearRect(0, 0, w * dpr, h * dpr);
    octx.save();
    octx.scale(dpr, dpr);

    var activeWall = state.walls[state.activeWall];

    // Maske als halbtransparentes Overlay (wenn noch nicht bestätigt)
    if (activeWall.maskData && !activeWall.applied) {
      octx.globalAlpha = 0.5;
      octx.fillStyle = WALL_COLORS[state.activeWall % WALL_COLORS.length];
      // Maske pixelweise rendern
      drawMaskOverlay(octx, activeWall.maskData, w, h);
      octx.globalAlpha = 1;
    }

    // Punkte visualisieren
    for (var i = 0; i < activeWall.points.length; i++) {
      var p = activeWall.points[i];
      var px = p.x * w, py = p.y * h;
      var isInclude = p.label === "include";

      octx.beginPath();
      octx.arc(px, py, 9, 0, Math.PI * 2);
      octx.fillStyle = isInclude ? "#4CAF50" : "#F44336";
      octx.fill();
      octx.strokeStyle = "#fff";
      octx.lineWidth = 2;
      octx.stroke();

      // + / − Symbol
      octx.fillStyle = "#fff";
      octx.font = "bold 14px sans-serif";
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.fillText(isInclude ? "+" : "−", px, py);
    }

    octx.restore();
  }

  function drawMaskOverlay(ctx, maskData, w, h) {
    // maskData ist ein ImageData (Graustufen oder RGBA) von der Maske
    // Wir zeichnen die Maske als geclippten Bereich
    var tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = maskData.width;
    tmpCanvas.height = maskData.height;
    var tmpCtx = tmpCanvas.getContext("2d");
    tmpCtx.putImageData(maskData, 0, 0);
    ctx.drawImage(tmpCanvas, 0, 0, w, h);
  }

  /* ----------------------------------------------------------------
     Farbverarbeitung — HSL-basiert, lokal im Browser
  ---------------------------------------------------------------- */
  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    return [r, g, b];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    var r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      function hue2rgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q-p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q-p) * (2/3 - t) * 6;
        return p;
      }
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
  }

  /**
   * Trägt die gewählte Farbe auf den Canvas auf.
   * Nur Hue + Saturation werden ersetzt; Luminanz (= Helligkeit/Schatten)
   * bleibt erhalten. Das Ergebnis wirkt natürlich und erhält Texturen.
   */
  function applyColorToCanvas(ctx, wall, isActive) {
    if (!wall.maskData || !cachedOriginalPixels) return;
    var w = state.preparedWidth, h = state.preparedHeight;
    var intensity = state.intensity / 100;

    // Cache-Check: gleiche Farbe + Intensität → nicht neu berechnen
    var cacheKey = wall.color + "|" + state.intensity + "|" + state.activeWall;
    if (
      colorizedCache &&
      colorizedCache.key === cacheKey &&
      colorizedCache.wallIndex === state.walls.indexOf(wall)
    ) {
      var tmpC = document.createElement("canvas");
      tmpC.width = w; tmpC.height = h;
      tmpC.getContext("2d").putImageData(colorizedCache.pixels, 0, 0);
      ctx.drawImage(tmpC, 0, 0);
      return;
    }

    var targetRgb = hexToRgb(wall.color);
    var targetHsl = rgbToHsl(targetRgb[0], targetRgb[1], targetRgb[2]);
    var tH = targetHsl[0], tS = targetHsl[1];

    // Originalbild als Pixeldaten (auf Display-Auflösung)
    var origData = cachedOriginalPixels.data;

    // Maske skaliert auf Bildgröße
    var maskCanvas = document.createElement("canvas");
    maskCanvas.width = w; maskCanvas.height = h;
    var maskCtx = maskCanvas.getContext("2d");
    var tmpMask = document.createElement("canvas");
    tmpMask.width = wall.maskData.width;
    tmpMask.height = wall.maskData.height;
    tmpMask.getContext("2d").putImageData(wall.maskData, 0, 0);
    maskCtx.drawImage(tmpMask, 0, 0, w, h);
    var maskPixels = maskCtx.getImageData(0, 0, w, h);

    // Ausgabe-ImageData (von aktuellem Canvas-Zustand)
    var outData = ctx.getImageData(0, 0, w, h);
    var od = outData.data;

    for (var i = 0; i < od.length; i += 4) {
      var maskAlpha = maskPixels.data[i] / 255; // Graustufenmaske: R-Kanal
      if (maskAlpha < 0.04) continue;

      var r = od[i], g = od[i+1], b = od[i+2];
      var hsl = rgbToHsl(r, g, b);
      var newL = hsl[2]; // Helligkeit beibehalten

      // Neue Sättigung: Ziel-Sättigung, aber gedämpft bei sehr dunklen/hellen Pixeln
      var adjustedS = tS * (0.6 + 0.4 * (1 - Math.abs(2 * newL - 1)));
      var newRgb = hslToRgb(tH, adjustedS, newL);

      // Blend: maskAlpha * intensity steuert Stärke der Einfärbung
      var blend = maskAlpha * intensity;
      od[i]   = Math.round(r + (newRgb[0] - r) * blend);
      od[i+1] = Math.round(g + (newRgb[1] - g) * blend);
      od[i+2] = Math.round(b + (newRgb[2] - b) * blend);
    }

    ctx.putImageData(outData, 0, 0);

    // Cache für diese Wandfläche
    colorizedCache = {
      key: cacheKey,
      wallIndex: state.walls.indexOf(wall),
      pixels: ctx.getImageData(0, 0, w, h),
    };
  }

  /* ----------------------------------------------------------------
     Masken-Normalisierung (Replicate → lokales ImageData)
  ---------------------------------------------------------------- */
  function normalizeMask(maskDataUrl, width, height, onDone, onError) {
    var img = new Image();
    img.onload = function () {
      var mc = document.createElement("canvas");
      mc.width = img.naturalWidth || width;
      mc.height = img.naturalHeight || height;
      var mctx = mc.getContext("2d");
      mctx.drawImage(img, 0, 0);
      var maskPx = mctx.getImageData(0, 0, mc.width, mc.height);

      // Prüfen: Maske fast leer?
      var nonZero = 0;
      for (var i = 0; i < maskPx.data.length; i += 4) {
        if (maskPx.data[i] > 20) nonZero++;
      }
      var ratio = nonZero / (mc.width * mc.height);
      if (ratio < 0.005) {
        return onError("Die Wand konnte nicht eindeutig erkannt werden. Setzen Sie einen weiteren Punkt auf die Wand oder schließen Sie einen falschen Bereich aus.");
      }
      if (ratio > 0.95) {
        return onError("Die erkannte Fläche umfasst fast das gesamte Bild. Bitte grenzen Sie den Bereich mit Ausschlusspunkten ein.");
      }

      onDone(maskPx);
    };
    img.onerror = function () {
      onError("Die Maskenantwort konnte nicht verarbeitet werden.");
    };
    img.src = maskDataUrl;
  }

  /* ----------------------------------------------------------------
     Segmentierung aufrufen
  ---------------------------------------------------------------- */
  var pendingSegmentId = 0;

  /* ----------------------------------------------------------------
     Auto-Segmentierung — läuft einmalig nach dem Upload
     meta/sam-2 liefert ein combined_mask-Bild: jedes Segment hat eine
     eigene Farbe. Beim Klick lesen wir die Pixelfarbe aus und erzeugen
     lokal eine binäre Maske — kein weiterer API-Aufruf nötig.
  ---------------------------------------------------------------- */
  function runAutoSegmentation() {
    if (state.isSegmenting) return;
    state.isSegmenting = true;
    state.segmentationReady = false;
    state.combinedMaskImageData = null;

    showProgress("Bild wird analysiert …", "KI erkennt alle Wandflächen. Das dauert ca. 15–30 Sekunden.");
    hideError();

    var payload = JSON.stringify({
      imageDataUrl: state.preparedDataUrl,
      imageWidth: state.preparedWidth,
      imageHeight: state.preparedHeight,
    });

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var fetchOpts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    };
    if (controller) fetchOpts.signal = controller.signal;

    var timeoutId = setTimeout(function () {
      if (controller) controller.abort();
    }, 60000);

    fetch("/api/segment", fetchOpts)
      .then(function (res) {
        clearTimeout(timeoutId);
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        state.isSegmenting = false;
        hideProgress();

        if (!result.ok) {
          showError((result.data && result.data.error) || "Unbekannter Fehler bei der Bildanalyse.");
          return;
        }

        // combined_mask als ImageData laden
        loadCombinedMask(result.data.combinedMaskDataUrl, result.data.width, result.data.height);
      })
      .catch(function (err) {
        clearTimeout(timeoutId);
        state.isSegmenting = false;
        hideProgress();
        if (err.name === "AbortError") {
          showError("Die Verbindung wurde unterbrochen. Sie können Wände manuell mit dem Pinsel auswählen.");
        } else {
          showError("Die KI-Erkennung ist momentan nicht verfügbar. Sie können Wände manuell mit dem Pinsel auswählen.");
        }
      });
  }

  function loadCombinedMask(combinedMaskDataUrl, width, height) {
    var img = new Image();
    img.onload = function () {
      var oc = document.createElement("canvas");
      oc.width = width || img.naturalWidth;
      oc.height = height || img.naturalHeight;
      var ctx = oc.getContext("2d");
      ctx.drawImage(img, 0, 0, oc.width, oc.height);
      state.combinedMaskImageData = ctx.getImageData(0, 0, oc.width, oc.height);
      state.segmentationReady = true;
      hideError();
      // Hinweistext aktualisieren
      var hint = document.getElementById("fd-hint");
      if (hint) hint.textContent = "Tippen/Klicken Sie auf eine Wand, um sie auszuwählen.";
    };
    img.onerror = function () {
      showError("Combined-Mask konnte nicht geladen werden. Bitte Pinsel verwenden.");
    };
    img.src = combinedMaskDataUrl;
  }

  /* ----------------------------------------------------------------
     Segment aus combined_mask extrahieren — rein lokal, kein API-Aufruf
     Liest die Pixelfarbe am Klickpunkt und erstellt eine binäre Maske
     für alle Pixel desselben Segments.
  ---------------------------------------------------------------- */
  function extractSegmentAtPoint(normX, normY) {
    if (!state.combinedMaskImageData) return null;
    var cm = state.combinedMaskImageData;
    var px = Math.round(normX * cm.width);
    var py = Math.round(normY * cm.height);
    px = Math.max(0, Math.min(cm.width  - 1, px));
    py = Math.max(0, Math.min(cm.height - 1, py));

    var idx4 = (py * cm.width + px) * 4;
    var tr = cm.data[idx4];
    var tg = cm.data[idx4 + 1];
    var tb = cm.data[idx4 + 2];
    var ta = cm.data[idx4 + 3];

    // Schwarze / transparente Pixel = kein Segment
    if (ta < 10 || (tr < 10 && tg < 10 && tb < 10)) return null;

    // Binäre Maske erzeugen: alle Pixel mit gleicher Farbe (±Toleranz)
    var TOL = 12;
    var maskCanvas = document.createElement("canvas");
    maskCanvas.width = cm.width;
    maskCanvas.height = cm.height;
    var mCtx = maskCanvas.getContext("2d");
    var maskId = mCtx.createImageData(cm.width, cm.height);
    var md = maskId.data;
    var cd = cm.data;

    for (var i = 0; i < cd.length; i += 4) {
      var match = Math.abs(cd[i]   - tr) <= TOL &&
                  Math.abs(cd[i+1] - tg) <= TOL &&
                  Math.abs(cd[i+2] - tb) <= TOL &&
                  cd[i+3] > 10;
      var v = match ? 255 : 0;
      md[i] = v; md[i+1] = v; md[i+2] = v; md[i+3] = 255;
    }

    return maskId;
  }

  /* Nicht mehr verwendet — bleibt als Fallback für ältere Tests */
  function runSegmentation() { runAutoSegmentation(); }

  /* ----------------------------------------------------------------
     Pinsel / Radierer — manuelle Maskenbearbeitung
  ---------------------------------------------------------------- */
  var isDrawing = false;
  var lastDrawPos = null;

  function drawOnMask(normX, normY, erase) {
    var wall = state.walls[state.activeWall];
    if (!wall.maskData) {
      // Neue leere Maske erstellen
      var md = document.createElement("canvas");
      md.width = state.preparedWidth;
      md.height = state.preparedHeight;
      wall.maskData = md.getContext("2d").getImageData(0, 0, md.width, md.height);
    }

    var w = wall.maskData.width, h = wall.maskData.height;
    var px = normX * w, py = normY * h;
    var r = state.brushSize;
    var data = wall.maskData.data;

    var x0 = Math.max(0, Math.floor(px - r));
    var x1 = Math.min(w - 1, Math.ceil(px + r));
    var y0 = Math.max(0, Math.floor(py - r));
    var y1 = Math.min(h - 1, Math.ceil(py + r));

    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = x - px, dy = y - py;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > r) continue;
        // Weiche Kanten (Feathering)
        var alpha = Math.max(0, 1 - dist / r);
        var idx4 = (y * w + x) * 4;
        if (erase) {
          data[idx4]   = Math.max(0, data[idx4]   - Math.round(alpha * 255));
          data[idx4+1] = data[idx4]; data[idx4+2] = data[idx4]; data[idx4+3] = 255;
        } else {
          data[idx4]   = Math.min(255, data[idx4]   + Math.round(alpha * 255));
          data[idx4+1] = data[idx4]; data[idx4+2] = data[idx4]; data[idx4+3] = 255;
        }
      }
    }

    colorizedCache = null;
    renderCanvas();
  }

  /* ----------------------------------------------------------------
     Upload-Events
  ---------------------------------------------------------------- */
  function handleFile(file) {
    // Laufende Segmentierung abbrechen
    pendingSegmentId++;
    state.isSegmenting = false;

    showProgress("Foto wird vorbereitet …", "Bitte warten.");

    prepareImage(
      file,
      function (img, dataUrl, w, h) {
        state.originalImage   = img;
        state.preparedDataUrl = dataUrl;
        state.preparedWidth   = w;
        state.preparedHeight  = h;

        // Zustand zurücksetzen
        state.walls = [{ points: [], maskData: null, color: state.selectedColor, applied: false }];
        state.activeWall = 0;
        state.undoStacks = [[]];
        state.hasResult = false;
        state.combinedMaskImageData = null;
        state.segmentationReady = false;
        colorizedCache = null;
        cachedOriginalPixels = null;
        cachedMaskImageData = null;

        hideProgress();
        showEditor();
        setupCanvas();
        renderCanvas();
        renderWallChips();
        updateWallInfo();
        updateColorDisplay();

        // Sofort Auto-Segmentierung starten
        runAutoSegmentation();
      },
      function (errMsg) {
        hideProgress();
        showUpload();
        showError(errMsg);
      }
    );
  }

  function initUpload() {
    if (!els.upload) return;

    els.upload.addEventListener("dragover", function (e) {
      e.preventDefault();
      els.upload.classList.add("is-dragging");
    });
    els.upload.addEventListener("dragleave", function () {
      els.upload.classList.remove("is-dragging");
    });
    els.upload.addEventListener("drop", function (e) {
      e.preventDefault();
      els.upload.classList.remove("is-dragging");
      var file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    if (els.fileInput) {
      els.fileInput.addEventListener("change", function () {
        if (els.fileInput.files[0]) handleFile(els.fileInput.files[0]);
      });
    }
  }

  /* ----------------------------------------------------------------
     Canvas-Interaktion
  ---------------------------------------------------------------- */
  function handleCanvasPointerDown(event) {
    event.preventDefault();
    var coords = getNormalizedCoords(event);

    if (state.activeTool === "select" || state.activeTool === "exclude") {
      var wall = state.walls[state.activeWall];

      if (!state.segmentationReady) {
        if (state.isSegmenting) {
          showError("Bitte warten — Bild wird noch analysiert …");
        } else {
          showError("Analyse nicht verfügbar. Bitte verwenden Sie den Pinsel zum manuellen Auswählen.");
        }
        return;
      }

      // Undo-Stack
      state.undoStacks[state.activeWall].push({ maskData: wall.maskData });
      if (state.undoStacks[state.activeWall].length > 20) state.undoStacks[state.activeWall].shift();

      if (state.activeTool === "select") {
        // Segment lokal aus combined_mask extrahieren
        var extracted = extractSegmentAtPoint(coords.x, coords.y);
        if (!extracted) {
          showError("Kein Segment an dieser Stelle. Bitte auf eine andere Fläche klicken.");
          return;
        }
        // Additiv: vorhandene Maske + neues Segment zusammenführen (ODER)
        if (wall.maskData) {
          var wd2 = wall.maskData.data;
          var ed2 = extracted.data;
          for (var ai = 0; ai < wd2.length; ai += 4) {
            var merged = Math.max(wd2[ai], ed2[ai]);
            wd2[ai] = merged; wd2[ai+1] = merged; wd2[ai+2] = merged; wd2[ai+3] = 255;
          }
          cachedMaskImageData = { wall: state.activeWall, data: wall.maskData };
        } else {
          wall.maskData = extracted;
          cachedMaskImageData = { wall: state.activeWall, data: extracted };
        }
        colorizedCache = null;
        renderCanvas();
      } else {
        // exclude: Segment von der bestehenden Maske abziehen
        var toExclude = extractSegmentAtPoint(coords.x, coords.y);
        if (toExclude && wall.maskData) {
          var wd = wall.maskData.data;
          var ed = toExclude.data;
          for (var ei = 0; ei < wd.length; ei += 4) {
            if (ed[ei] > 128) { wd[ei] = 0; wd[ei+1] = 0; wd[ei+2] = 0; }
          }
          colorizedCache = null;
          renderCanvas();
        }
      }
      return;
    }

    if (state.activeTool === "brush" || state.activeTool === "eraser") {
      isDrawing = true;
      lastDrawPos = coords;
      // Undo-Snapshot
      var wall = state.walls[state.activeWall];
      var snap = wall.maskData ? new ImageData(new Uint8ClampedArray(wall.maskData.data), wall.maskData.width, wall.maskData.height) : null;
      state.undoStacks[state.activeWall].push({ points: wall.points.slice(), maskData: snap });
      drawOnMask(coords.x, coords.y, state.activeTool === "eraser");
    }
  }

  function handleCanvasPointerMove(event) {
    event.preventDefault();
    if (!isDrawing) return;
    if (state.activeTool !== "brush" && state.activeTool !== "eraser") return;
    var coords = getNormalizedCoords(event);
    drawOnMask(coords.x, coords.y, state.activeTool === "eraser");
    lastDrawPos = coords;
  }

  function handleCanvasPointerUp(event) {
    isDrawing = false;
    lastDrawPos = null;
  }

  function initCanvas() {
    if (!els.canvas) return;

    els.canvas.addEventListener("mousedown",  handleCanvasPointerDown, { passive: false });
    els.canvas.addEventListener("mousemove",  handleCanvasPointerMove, { passive: false });
    els.canvas.addEventListener("mouseup",    handleCanvasPointerUp);
    els.canvas.addEventListener("mouseleave", handleCanvasPointerUp);
    els.canvas.addEventListener("touchstart", handleCanvasPointerDown, { passive: false });
    els.canvas.addEventListener("touchmove",  handleCanvasPointerMove, { passive: false });
    els.canvas.addEventListener("touchend",   handleCanvasPointerUp,   { passive: false });
  }

  /* ----------------------------------------------------------------
     Toolbar
  ---------------------------------------------------------------- */
  function setTool(tool) {
    state.activeTool = tool;
    var tools = { select: els.btnSelect, exclude: els.btnExclude, brush: els.btnBrush, eraser: els.btnEraser };
    Object.keys(tools).forEach(function (k) {
      if (tools[k]) tools[k].classList.toggle("is-active", k === tool);
    });
    if (els.canvasWrap) {
      els.canvasWrap.className = els.canvasWrap.className.replace(/\bmode-\S+/g, "").trim();
      if (tool === "brush" || tool === "eraser") {
        els.canvasWrap.classList.add("mode-" + tool);
      }
    }
    if (els.brushSizeWrap) {
      els.brushSizeWrap.classList.toggle("is-visible", tool === "brush" || tool === "eraser");
    }
  }

  function initToolbar() {
    if (els.btnSelect)  els.btnSelect.addEventListener("click",  function () { setTool("select"); });
    if (els.btnExclude) els.btnExclude.addEventListener("click", function () { setTool("exclude"); });
    if (els.btnBrush)   els.btnBrush.addEventListener("click",   function () { setTool("brush"); });
    if (els.btnEraser)  els.btnEraser.addEventListener("click",  function () { setTool("eraser"); });

    if (els.btnUndo) {
      els.btnUndo.addEventListener("click", function () {
        var stack = state.undoStacks[state.activeWall];
        if (!stack || stack.length === 0) return;
        var prev = stack.pop();
        var wall = state.walls[state.activeWall];
        wall.points = prev.points;
        wall.maskData = prev.maskData;
        colorizedCache = null;
        renderCanvas();
      });
    }

    if (els.btnClear) {
      els.btnClear.addEventListener("click", function () {
        var wall = state.walls[state.activeWall];
        state.undoStacks[state.activeWall].push({ points: wall.points.slice(), maskData: wall.maskData });
        wall.points = [];
        wall.maskData = null;
        wall.applied = false;
        colorizedCache = null;
        renderCanvas();
      });
    }

    if (els.brushSizeInput) {
      els.brushSizeInput.addEventListener("input", function () {
        state.brushSize = parseInt(els.brushSizeInput.value, 10);
      });
    }

    if (els.btnConfirm) {
      els.btnConfirm.addEventListener("click", function () {
        var wall = state.walls[state.activeWall];
        if (!wall.maskData) {
          showError("Bitte wählen Sie zunächst eine Wand aus.");
          return;
        }
        wall.applied = true;
        wall.color = state.selectedColor;
        state.hasResult = true;
        colorizedCache = null;
        renderCanvas();
        updateCompare();
        if (els.compareWrap) els.compareWrap.classList.add("is-active");
        updateWallInfo();
      });
    }

    if (els.btnNewPhoto) {
      els.btnNewPhoto.addEventListener("click", function () {
        pendingSegmentId++;
        state.isSegmenting = false;
        showUpload();
        hideEditor();
        hideError();
      });
    }
  }

  /* ----------------------------------------------------------------
     Wandflächen-Verwaltung
  ---------------------------------------------------------------- */
  function renderWallChips() {
    if (!els.walls) return;
    // Bestehende Chips entfernen (außer "Hinzufügen")
    var chips = els.walls.querySelectorAll(".fd-wall-chip:not(#fdAddWall)");
    chips.forEach(function (c) { c.remove(); });

    state.walls.forEach(function (wall, i) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "fd-wall-chip" + (i === state.activeWall ? " is-active" : "");
      var dotEl = document.createElement("span");
      dotEl.className = "fd-wall-chip__dot";
      dotEl.style.background = WALL_COLORS[i % WALL_COLORS.length];
      chip.appendChild(dotEl);
      chip.appendChild(document.createTextNode(WALL_NAMES[i]));
      chip.setAttribute("aria-label", WALL_NAMES[i] + " auswählen");
      chip.addEventListener("click", function () {
        state.activeWall = i;
        renderWallChips();
        renderCanvas();
        updateWallInfo();
        updateColorDisplay();
      });
      els.walls.insertBefore(chip, document.getElementById("fdAddWall"));
    });

    if (els.addWall) {
      els.addWall.disabled = state.walls.length >= 3;
    }
  }

  function initWallManagement() {
    if (els.addWall) {
      els.addWall.addEventListener("click", function () {
        if (state.walls.length >= 3) return;
        state.walls.push({ points: [], maskData: null, color: state.selectedColor, applied: false });
        state.undoStacks.push([]);
        state.activeWall = state.walls.length - 1;
        colorizedCache = null;
        renderWallChips();
        renderCanvas();
        updateWallInfo();
      });
    }
  }

  /* ----------------------------------------------------------------
     Farbauswahl
  ---------------------------------------------------------------- */
  function updateColorDisplay() {
    if (els.colorName) els.colorName.textContent = state.selectedColorName;
    if (els.colorHex)  els.colorHex.textContent  = state.selectedColor.toUpperCase();
    if (els.colorPicker) els.colorPicker.value   = state.selectedColor;

    // Aktiven Swatch markieren
    var swatches = document.querySelectorAll(".fd-swatch");
    swatches.forEach(function (sw) {
      sw.classList.toggle("is-selected", sw.dataset.hex === state.selectedColor);
    });
  }

  function setColor(hex, name) {
    state.selectedColor = hex;
    state.selectedColorName = name || hex;
    var wall = state.walls[state.activeWall];
    wall.color = hex;
    colorizedCache = null;
    updateColorDisplay();
    if (wall.applied) { renderCanvas(); updateCompare(); }
    updateWallInfo();
  }

  function initColorPalette() {
    if (!els.palette) return;

    PALETTE.forEach(function (entry) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fd-swatch";
      btn.dataset.hex = entry.hex;
      btn.style.background = entry.hex;
      btn.setAttribute("aria-label", entry.name + " (" + entry.hex + ")");
      btn.setAttribute("title", entry.name);
      btn.addEventListener("click", function () { setColor(entry.hex, entry.name); });
      els.palette.appendChild(btn);
    });

    if (els.colorPicker) {
      els.colorPicker.addEventListener("input", function () {
        setColor(els.colorPicker.value, "Eigene Farbe");
      });
    }

    if (els.intensity) {
      els.intensity.addEventListener("input", function () {
        state.intensity = parseInt(els.intensity.value, 10);
        if (els.intensityVal) els.intensityVal.textContent = state.intensity + " %";
        colorizedCache = null;
        var anyApplied = state.walls.some(function (w) { return w.applied; });
        if (anyApplied) { renderCanvas(); updateCompare(); }
      });
    }

    // Standard-Farbe vorauswählen
    updateColorDisplay();
    if (els.intensity) els.intensity.value = state.intensity;
    if (els.intensityVal) els.intensityVal.textContent = state.intensity + " %";
  }

  /* ----------------------------------------------------------------
     Wandflächen-Info
  ---------------------------------------------------------------- */
  function updateWallInfo() {
    if (!els.wallInfo) return;
    var wall = state.walls[state.activeWall];
    var statusText = wall.applied
      ? ('<strong>' + WALL_NAMES[state.activeWall] + '</strong>: ' + state.selectedColorName + ' (' + state.selectedColor.toUpperCase() + ')')
      : ('<strong>' + WALL_NAMES[state.activeWall] + '</strong>: Noch keine Farbe ausgewählt');
    els.wallInfo.innerHTML = statusText;
  }

  /* ----------------------------------------------------------------
     Vorher-Nachher-Vergleich
  ---------------------------------------------------------------- */
  function updateCompare() {
    if (!els.compareBefore || !els.compareAfter) return;
    var w = state.preparedWidth, h = state.preparedHeight;

    // Vorher: Originalbild
    els.compareBefore.width  = w;
    els.compareBefore.height = h;
    els.compareBefore.getContext("2d").drawImage(state.originalImage, 0, 0);

    // Nachher: aktueller Canvas-Zustand
    els.compareAfter.width  = w;
    els.compareAfter.height = h;
    els.compareAfter.getContext("2d").drawImage(els.canvas, 0, 0, w * dpr, h * dpr, 0, 0, w, h);

    // Slider auf 50% zurücksetzen
    state.comparePos = 0.5;
    applyComparePos();
  }

  function applyComparePos() {
    var pct = (state.comparePos * 100).toFixed(1) + "%";
    if (els.compareAfter)  els.compareAfter.style.clipPath = "inset(0 " + (100 - state.comparePos * 100).toFixed(1) + "% 0 0)";
    if (els.compareLine)   els.compareLine.style.left  = pct;
    if (els.compareHandle) els.compareHandle.style.left = pct;
  }

  function initCompare() {
    if (!els.compareWrap) return;

    function onMove(event) {
      if (!state.isDraggingCompare) return;
      event.preventDefault();
      var rect = els.compareWrap.querySelector(".fd-compare").getBoundingClientRect();
      var clientX = event.touches ? event.touches[0].clientX : event.clientX;
      state.comparePos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      applyComparePos();
    }

    var compareEl = els.compareWrap.querySelector(".fd-compare");
    if (compareEl) {
      compareEl.addEventListener("mousedown",  function (e) { state.isDraggingCompare = true; onMove(e); });
      compareEl.addEventListener("touchstart", function (e) { state.isDraggingCompare = true; onMove(e); }, { passive: false });
    }
    document.addEventListener("mousemove",  onMove);
    document.addEventListener("touchmove",  onMove, { passive: false });
    document.addEventListener("mouseup",    function () { state.isDraggingCompare = false; });
    document.addEventListener("touchend",   function () { state.isDraggingCompare = false; });
  }

  /* ----------------------------------------------------------------
     Download
  ---------------------------------------------------------------- */
  function initDownload() {
    if (!els.btnDownload) return;
    els.btnDownload.addEventListener("click", function () {
      if (!state.hasResult) return;
      var w = state.preparedWidth, h = state.preparedHeight;
      var tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = w; tmpCanvas.height = h;
      var tmpCtx = tmpCanvas.getContext("2d");
      tmpCtx.drawImage(els.canvas, 0, 0, w * dpr, h * dpr, 0, 0, w, h);

      var today = new Date();
      var dateStr = today.getFullYear() + "-" +
        String(today.getMonth()+1).padStart(2,"0") + "-" +
        String(today.getDate()).padStart(2,"0");
      var filename = "frey-farbvorschau-" + dateStr + ".jpg";

      tmpCanvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      }, "image/jpeg", 0.92);
    });
  }

  /* ----------------------------------------------------------------
     Beratungs-CTA
  ---------------------------------------------------------------- */
  function initConsult() {
    function openConsult(colorName, hex) {
      var subject = "Farbberatung — " + (colorName || "Farbdesigner");
      var body =
        "Guten Tag,\n\n" +
        "ich interessiere mich für eine Farbberatung.\n\n" +
        "Ausgewählter Farbton: " + (colorName || "Eigene Farbe") + "\n" +
        "HEX-Wert: " + (hex || "").toUpperCase() + "\n\n" +
        "Die Auswahl wurde im digitalen Farbdesigner auf Ihrer Website erstellt.\n\n" +
        "Bitte nehmen Sie Kontakt mit mir auf.\n";

      window.location.href =
        "mailto:post@maler-langenau.de" +
        "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(body);
    }

    if (els.btnConsult) {
      els.btnConsult.addEventListener("click", function () {
        openConsult(state.selectedColorName, state.selectedColor);
      });
    }

    // CTA-Button auf der Seite (außerhalb des Editors)
    var consultBtns = document.querySelectorAll("[data-fd-consult]");
    consultBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        openConsult(state.selectedColorName, state.selectedColor);
      });
    });
  }

  /* ----------------------------------------------------------------
     UI-Zustände
  ---------------------------------------------------------------- */
  function showUpload() {
    if (els.upload)  els.upload.style.display   = "";
    if (els.editor)  els.editor.classList.remove("is-active");
    if (els.progress) els.progress.classList.remove("is-active");
  }
  function hideEditor() {
    if (els.editor) els.editor.classList.remove("is-active");
  }
  function showEditor() {
    if (els.upload)  els.upload.style.display   = "none";
    if (els.progress) els.progress.classList.remove("is-active");
    if (els.editor)  els.editor.classList.add("is-active");
  }
  function showProgress(label, sub) {
    if (els.upload)  els.upload.style.display   = "none";
    if (els.editor) {
      // Progress innerhalb des Editors anzeigen (nicht den Editor verbergen)
    }
    if (els.progress)      els.progress.classList.add("is-active");
    if (els.progressLabel) els.progressLabel.textContent = label || "";
    if (els.progressSub)   els.progressSub.textContent   = sub || "";
  }
  function hideProgress() {
    if (els.progress) els.progress.classList.remove("is-active");
  }
  function showError(msg) {
    if (!els.error || !els.errorMsg) return;
    els.errorMsg.textContent = msg;
    els.error.classList.add("is-visible");
  }
  function hideError() {
    if (els.error) els.error.classList.remove("is-visible");
  }

  /* ----------------------------------------------------------------
     Initialisierung
  ---------------------------------------------------------------- */
  function init() {
    initDomRefs();
    if (!els.upload) return; // nicht auf der Farbdesigner-Seite

    initUpload();
    initCanvas();
    initToolbar();
    initWallManagement();
    initColorPalette();
    initCompare();
    initDownload();
    initConsult();

    setTool("select");
    renderWallChips();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ----------------------------------------------------------------
     Exports für Tests (CommonJS, falls vorhanden)
  ---------------------------------------------------------------- */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      rgbToHsl: rgbToHsl,
      hslToRgb: hslToRgb,
      hexToRgb: hexToRgb,
      readExifOrientation: readExifOrientation,
      PALETTE: PALETTE,
    };
  }
})();
