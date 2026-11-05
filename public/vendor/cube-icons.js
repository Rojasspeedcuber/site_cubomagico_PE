(function (global) {
  "use strict";

  // ─── Color Schemes ───
  const COLOR_SCHEMES = {
    wca: {
      W: "#ffffff", R: "#b71234", B: "#0046ad", O: "#ff5800",
      G: "#009b48", Y: "#ffd500", P: "#800080", Br: "#8b4513",
      Pk: "#ff69b4", Lg: "#90ee90", Lb: "#add8e6", Gy: "#808080",
      Be: "#d2b48c", X: "#333333",
    },
    stickerless: {
      W: "#f0f0f0", R: "#e03030", B: "#3070e0", O: "#f08020",
      G: "#30b060", Y: "#e0c020", P: "#9040b0", Br: "#906030",
      Pk: "#e080a0", Lg: "#80d090", Lb: "#80c0e0", Gy: "#909090",
      Be: "#c8b080", X: "#404040",
    },
    japanese: {
      W: "#ffffff", R: "#b71234", B: "#ffd500", O: "#ff5800",
      G: "#009b48", Y: "#0046ad", P: "#800080", Br: "#8b4513",
      Pk: "#ff69b4", Lg: "#90ee90", Lb: "#add8e6", Gy: "#808080",
      Be: "#d2b48c", X: "#333333",
    },
    pastel: {
      W: "#f5f5f5", R: "#f28b82", B: "#aecbfa", O: "#fdd663",
      G: "#81c995", Y: "#fef0b0", P: "#d7aefb", Br: "#c4a882",
      Pk: "#fdcfe8", Lg: "#b7e1cd", Lb: "#cbf0f8", Gy: "#c0c0c0",
      Be: "#e0d0b0", X: "#555555",
    },
    monokai: {
      W: "#f8f8f2", R: "#f92672", B: "#66d9ef", O: "#fd971f",
      G: "#a6e22e", Y: "#e6db74", P: "#ae81ff", Br: "#75715e",
      Pk: "#f92672", Lg: "#a6e22e", Lb: "#66d9ef", Gy: "#75715e",
      Be: "#a89070", X: "#272822",
    },
  };

  let COLORS = COLOR_SCHEMES.wca;

  // ─── Theme Support ───
  let THEME = "dark";
  const THEME_CONFIG = {
    dark:  { stroke: "#111111", monoFill: "#888888", monoStroke: "#444444", bg: "#1a1a1a" },
    light: { stroke: "#555555", monoFill: "#aaaaaa", monoStroke: "#888888", bg: "#ffffff" },
  };

  function detectTheme() {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return "dark";
  }

  function getTheme() { return THEME_CONFIG[THEME] || THEME_CONFIG.dark; }

  let MONO_FILL = "#888888";
  let MONO_STROKE = "#444444";
  let BG_COLOR = "#1a1a1a";
  let STROKE_COLOR = "#111111";
  const DEFAULT_ROUNDED = 0.15;

  /** Resolve sticker corner radius from config; `scale` adapts to each puzzle's coordinate system. */
  function getRounded(config, scale) {
    const base = config && config.rounded != null ? config.rounded : DEFAULT_ROUNDED;
    return base * (scale != null ? scale : 1);
  }

  function applyTheme(t) {
    THEME = t;
    const cfg = getTheme();
    MONO_FILL = cfg.monoFill;
    MONO_STROKE = cfg.monoStroke;
    BG_COLOR = cfg.bg;
    STROKE_COLOR = cfg.stroke;
  }

  const COS30 = Math.cos(Math.PI / 6);
  const SIN30 = Math.sin(Math.PI / 6);

  // ─── Utility helpers ───

  function deepClone(arr) {
    if (Array.isArray(arr)) return arr.map(deepClone);
    return arr;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      let t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  // ─── 3D → 2D Projections ───

  function projectFront(x, y, z) {
    return [x, -y];
  }

  function projectIso(x, y, z) {
    return [(x - z) * COS30, (x + z) * SIN30 - y];
  }

  function getProjection(angle) {
    if (angle === "iso") return projectIso;
    return projectFront;
  }

  function rotate3D(x, y, z, rotXDeg, rotYDeg) {
    const rx = rotXDeg * Math.PI / 180;
    const ry = rotYDeg * Math.PI / 180;
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);
    const y1 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;
    return [x1, y1, z2];
  }

  function projectRotated(x, y, z, rotXDeg, rotYDeg) {
    const p = rotate3D(x, y, z, rotXDeg, rotYDeg);
    return [p[0], -p[1]];
  }

  function getVisibleFaces(rotXDeg, rotYDeg) {
    const normals = {
      U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1],
      B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0],
    };
    const faces = ["U", "D", "F", "B", "R", "L"];
    const visible = [];
    for (let i = 0; i < faces.length; i++) {
      const name = faces[i];
      const n = normals[name];
      const rn = rotate3D(n[0], n[1], n[2], rotXDeg, rotYDeg);
      if (rn[2] > 0.01) {
        visible.push({ name: name, depth: rn[2] });
      }
    }
    visible.sort(function (a, b) { return a.depth - b.depth; });
    return visible.map(function (f) { return f.name; });
  }

  // ─── SVG Builder ───

  function svgOpen(vb) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
      vb +
      '" style="width:100%;height:100%">'
    );
  }

  function polygon(points, fill, stroke, strokeWidth, rx) {
    if (rx && rx > 0) {
      return roundedPolygon(points, fill, stroke, strokeWidth, rx);
    }
    const pts = points.map(function (p) { return p[0] + "," + p[1]; }).join(" ");
    return (
      '<polygon points="' + pts +
      '" fill="' + fill +
      '" stroke="' + (stroke || STROKE_COLOR) +
      '" stroke-width="' + (strokeWidth || 0.5) +
      '" stroke-linejoin="round"/>'
    );
  }

  function roundedPolygon(points, fill, stroke, strokeWidth, rx) {
    let n = points.length;
    let d = "";
    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n];
      const cur = points[i];
      const next = points[(i + 1) % n];

      const dx1 = cur[0] - prev[0], dy1 = cur[1] - prev[1];
      const dx2 = next[0] - cur[0], dy2 = next[1] - cur[1];
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      let t = Math.min(rx, len1 * 0.4, len2 * 0.4);
      const p1x = cur[0] - (dx1 / len1) * t;
      const p1y = cur[1] - (dy1 / len1) * t;
      const p2x = cur[0] + (dx2 / len2) * t;
      const p2y = cur[1] + (dy2 / len2) * t;

      if (i === 0) {
        d += "M" + p1x + "," + p1y;
      } else {
        d += "L" + p1x + "," + p1y;
      }
      d += "Q" + cur[0] + "," + cur[1] + " " + p2x + "," + p2y;
    }
    d += "Z";
    return (
      '<path d="' + d +
      '" fill="' + fill +
      '" stroke="' + (stroke || STROKE_COLOR) +
      '" stroke-width="' + (strokeWidth || 0.5) +
      '" stroke-linejoin="round"/>'
    );
  }

  function circle(cx, cy, r, fill, stroke, strokeWidth) {
    return (
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
      '" fill="' + fill +
      '" stroke="' + (stroke || STROKE_COLOR) +
      '" stroke-width="' + (strokeWidth || 0.5) + '"/>'
    );
  }

  function line(x1, y1, x2, y2, stroke, strokeWidth) {
    return (
      '<line x1="' + x1 + '" y1="' + y1 +
      '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="' + (stroke || STROKE_COLOR) +
      '" stroke-width="' + (strokeWidth || 0.3) + '"/>'
    );
  }

  function rect(x, y, w, h, fill, stroke, strokeWidth, rx) {
    return (
      '<rect x="' + x + '" y="' + y +
      '" width="' + w + '" height="' + h +
      '" fill="' + fill +
      '" stroke="' + (stroke || STROKE_COLOR) +
      '" stroke-width="' + (strokeWidth || 0.5) +
      '" rx="' + (rx || 0) + '"/>'
    );
  }

  // ─── SVG Overlay Primitives ───

  function svgText(x, y, text, fontSize, fill, opacity) {
    return '<text x="' + x + '" y="' + y +
      '" font-size="' + fontSize +
      '" fill="' + (fill || '#fff') +
      '" opacity="' + (opacity != null ? opacity : 0.75) +
      '" text-anchor="middle" dominant-baseline="central"' +
      ' font-family="Arial,sans-serif" font-weight="bold"' +
      ' stroke="' + STROKE_COLOR + '" stroke-width="' + (fontSize * 0.06) +
      '" paint-order="stroke">' + text + '</text>';
  }

  function svgArrowMarker(id, color, size) {
    return '<marker id="' + id + '" markerWidth="' + size +
      '" markerHeight="' + (size * 0.7) +
      '" refX="' + (size * 0.85) + '" refY="' + (size * 0.35) +
      '" orient="auto-start-reverse" markerUnits="userSpaceOnUse" overflow="visible">' +
      '<polygon points="0,0 ' + size + ',' + (size * 0.35) + ' 0,' + (size * 0.7) +
      '" fill="' + color + '"/></marker>';
  }

  function svgArrowLine(x1, y1, x2, y2, color, sw, endId, startId) {
    let dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return '';
    let a = ' stroke="' + color + '" stroke-width="' + sw + '" fill="none" stroke-linecap="round"';
    if (endId) a += ' marker-end="url(#' + endId + ')"';
    if (startId) a += ' marker-start="url(#' + startId + ')"';
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"' + a + '/>';
  }

  function centroid(pts) {
    let sx = 0, sy = 0;
    for (let i = 0; i < pts.length; i++) { sx += pts[i][0]; sy += pts[i][1]; }
    return [sx / pts.length, sy / pts.length];
  }

  let _customColor = null;

  function getColorValue(c, mono, outlined) {
    if (outlined) return "none";
    if (mono) return _customColor || MONO_FILL;
    return COLORS[c] || c || COLORS.X;
  }

  function getStrokeFor(mono, outlined) {
    if (outlined) return _customColor || "#333333";
    if (mono) return _customColor ? darkenHex(_customColor) : MONO_STROKE;
    return STROKE_COLOR;
  }

  function darkenHex(hex) {
    if (!hex || hex.charAt(0) !== "#" || hex.length < 7) return MONO_STROKE;
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.floor(r * 0.6); g = Math.floor(g * 0.6); b = Math.floor(b * 0.6);
    return "#" + ("0" + r.toString(16)).slice(-2) + ("0" + g.toString(16)).slice(-2) + ("0" + b.toString(16)).slice(-2);
  }

  function getStrokeWidthFor(outlined, base) {
    return outlined ? base * 2.5 : base;
  }

  // ─── NxN Cube State Engine ───

  function createNxNState(n) {
    const faceOrder = ["U", "R", "F", "L", "B", "D"];
    const colorOrder = ["W", "R", "G", "O", "B", "Y"];
    let state = {};
    for (let i = 0; i < 6; i++) {
      state[faceOrder[i]] = [];
      for (let r = 0; r < n; r++) {
        state[faceOrder[i]][r] = [];
        for (let c = 0; c < n; c++) {
          state[faceOrder[i]][r][c] = colorOrder[i];
        }
      }
    }
    return state;
  }

  function rotateFaceCW(face) {
    let n = face.length;
    const nf = [];
    for (let r = 0; r < n; r++) {
      nf[r] = [];
      for (let c = 0; c < n; c++) {
        nf[r][c] = face[n - 1 - c][r];
      }
    }
    return nf;
  }

  function rotateFaceCCW(face) {
    let n = face.length;
    const nf = [];
    for (let r = 0; r < n; r++) {
      nf[r] = [];
      for (let c = 0; c < n; c++) {
        nf[r][c] = face[c][n - 1 - r];
      }
    }
    return nf;
  }

  function getRow(face, r) {
    return face[r].slice();
  }

  function getCol(face, c) {
    return face.map(function (row) { return row[c]; });
  }

  function setRow(face, r, vals) {
    for (let i = 0; i < vals.length; i++) face[r][i] = vals[i];
  }

  function setCol(face, c, vals) {
    for (let i = 0; i < vals.length; i++) face[i][c] = vals[i];
  }

  // ─── NxN net display coords + cube rotations (map-based, base 5×5) ───

  function cloneNxNFace(face) {
    return face.map(function (row) { return row.slice(); });
  }

  function nxnNetDisplayToStateRC(face, dr, dc, n) {
    const last = n - 1;
    if (face === "U") return [last - dr, dc];
    return [dr, dc];
  }

  function nxnNetStateToDisplayRC(face, sr, sc, n) {
    const last = n - 1;
    if (face === "U") return [last - sr, sc];
    return [sr, sc];
  }

  function nxnNetReadCell(state, face, dr, dc, n) {
    const rc = nxnNetDisplayToStateRC(face, dr, dc, n);
    return state[face][rc[0]][rc[1]];
  }

  function nxnNetDisplayFaceToState(face, displayFlat, n) {
    const grid = Array.from({ length: n }, function () { return Array(n); });
    for (let dr = 0; dr < n; dr++) {
      for (let dc = 0; dc < n; dc++) {
        const rc = nxnNetDisplayToStateRC(face, dr, dc, n);
        grid[rc[0]][rc[1]] = displayFlat[dr * n + dc];
      }
    }
    let out = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) out += grid[r][c];
    }
    return out;
  }

  function parseRotationMove(move) {
    let m = move.trim().replace(/[\u2018\u2019\u0060\u00B4]/g, "'");
    if (!m) return null;
    const match = m.match(/^([xyz])(2|')?$/i);
    if (!match) return null;
    let quarters = 1;
    if (match[2] === "2") quarters = 2;
    else if (match[2] === "'") quarters = 3;
    return { axis: match[1].toLowerCase(), quarters: quarters };
  }

  const NXN_FACE_ORDER = ["U", "R", "F", "L", "B", "D"];
  const NXN_ROT_MAP_BASE_N = 5;

  const NXN_ROT_STICKER_MAPS = {
  "x": {
    "U0": "B24",
    "U1": "B23",
    "U2": "B22",
    "U3": "B21",
    "U4": "B20",
    "U5": "B19",
    "U6": "B18",
    "U7": "B17",
    "U8": "B16",
    "U9": "B15",
    "U10": "B14",
    "U11": "B13",
    "U12": "B12",
    "U13": "B11",
    "U14": "B10",
    "U15": "B9",
    "U16": "B8",
    "U17": "B7",
    "U18": "B6",
    "U19": "B5",
    "U20": "B4",
    "U21": "B3",
    "U22": "B2",
    "U23": "B1",
    "U24": "B0",
    "R0": "R4",
    "R1": "R9",
    "R2": "R14",
    "R3": "R19",
    "R4": "R24",
    "R5": "R3",
    "R6": "R8",
    "R7": "R13",
    "R8": "R18",
    "R9": "R23",
    "R10": "R2",
    "R11": "R7",
    "R12": "R12",
    "R13": "R17",
    "R14": "R22",
    "R15": "R1",
    "R16": "R6",
    "R17": "R11",
    "R18": "R16",
    "R19": "R21",
    "R20": "R0",
    "R21": "R5",
    "R22": "R10",
    "R23": "R15",
    "R24": "R20",
    "F0": "U0",
    "F1": "U1",
    "F2": "U2",
    "F3": "U3",
    "F4": "U4",
    "F5": "U5",
    "F6": "U6",
    "F7": "U7",
    "F8": "U8",
    "F9": "U9",
    "F10": "U10",
    "F11": "U11",
    "F12": "U12",
    "F13": "U13",
    "F14": "U14",
    "F15": "U15",
    "F16": "U16",
    "F17": "U17",
    "F18": "U18",
    "F19": "U19",
    "F20": "U20",
    "F21": "U21",
    "F22": "U22",
    "F23": "U23",
    "F24": "U24",
    "L0": "L20",
    "L1": "L15",
    "L2": "L10",
    "L3": "L5",
    "L4": "L0",
    "L5": "L21",
    "L6": "L16",
    "L7": "L11",
    "L8": "L6",
    "L9": "L1",
    "L10": "L22",
    "L11": "L17",
    "L12": "L12",
    "L13": "L7",
    "L14": "L2",
    "L15": "L23",
    "L16": "L18",
    "L17": "L13",
    "L18": "L8",
    "L19": "L3",
    "L20": "L24",
    "L21": "L19",
    "L22": "L14",
    "L23": "L9",
    "L24": "L4",
    "B0": "D24",
    "B1": "D23",
    "B2": "D22",
    "B3": "D21",
    "B4": "D20",
    "B5": "D19",
    "B6": "D18",
    "B7": "D17",
    "B8": "D16",
    "B9": "D15",
    "B10": "D14",
    "B11": "D13",
    "B12": "D12",
    "B13": "D11",
    "B14": "D10",
    "B15": "D9",
    "B16": "D8",
    "B17": "D7",
    "B18": "D6",
    "B19": "D5",
    "B20": "D4",
    "B21": "D3",
    "B22": "D2",
    "B23": "D1",
    "B24": "D0",
    "D0": "F0",
    "D1": "F1",
    "D2": "F2",
    "D3": "F3",
    "D4": "F4",
    "D5": "F5",
    "D6": "F6",
    "D7": "F7",
    "D8": "F8",
    "D9": "F9",
    "D10": "F10",
    "D11": "F11",
    "D12": "F12",
    "D13": "F13",
    "D14": "F14",
    "D15": "F15",
    "D16": "F16",
    "D17": "F17",
    "D18": "F18",
    "D19": "F19",
    "D20": "F20",
    "D21": "F21",
    "D22": "F22",
    "D23": "F23",
    "D24": "F24"
  },
  "y": {
    "U0": "U4",
    "U1": "U9",
    "U2": "U14",
    "U3": "U19",
    "U4": "U24",
    "U5": "U3",
    "U6": "U8",
    "U7": "U13",
    "U8": "U18",
    "U9": "U23",
    "U10": "U2",
    "U11": "U7",
    "U12": "U12",
    "U13": "U17",
    "U14": "U22",
    "U15": "U1",
    "U16": "U6",
    "U17": "U11",
    "U18": "U16",
    "U19": "U21",
    "U20": "U0",
    "U21": "U5",
    "U22": "U10",
    "U23": "U15",
    "U24": "U20",
    "R0": "F0",
    "R1": "F1",
    "R2": "F2",
    "R3": "F3",
    "R4": "F4",
    "R5": "F5",
    "R6": "F6",
    "R7": "F7",
    "R8": "F8",
    "R9": "F9",
    "R10": "F10",
    "R11": "F11",
    "R12": "F12",
    "R13": "F13",
    "R14": "F14",
    "R15": "F15",
    "R16": "F16",
    "R17": "F17",
    "R18": "F18",
    "R19": "F19",
    "R20": "F20",
    "R21": "F21",
    "R22": "F22",
    "R23": "F23",
    "R24": "F24",
    "F0": "L0",
    "F1": "L1",
    "F2": "L2",
    "F3": "L3",
    "F4": "L4",
    "F5": "L5",
    "F6": "L6",
    "F7": "L7",
    "F8": "L8",
    "F9": "L9",
    "F10": "L10",
    "F11": "L11",
    "F12": "L12",
    "F13": "L13",
    "F14": "L14",
    "F15": "L15",
    "F16": "L16",
    "F17": "L17",
    "F18": "L18",
    "F19": "L19",
    "F20": "L20",
    "F21": "L21",
    "F22": "L22",
    "F23": "L23",
    "F24": "L24",
    "L0": "B0",
    "L1": "B1",
    "L2": "B2",
    "L3": "B3",
    "L4": "B4",
    "L5": "B5",
    "L6": "B6",
    "L7": "B7",
    "L8": "B8",
    "L9": "B9",
    "L10": "B10",
    "L11": "B11",
    "L12": "B12",
    "L13": "B13",
    "L14": "B14",
    "L15": "B15",
    "L16": "B16",
    "L17": "B17",
    "L18": "B18",
    "L19": "B19",
    "L20": "B20",
    "L21": "B21",
    "L22": "B22",
    "L23": "B23",
    "L24": "B24",
    "B0": "R0",
    "B1": "R1",
    "B2": "R2",
    "B3": "R3",
    "B4": "R4",
    "B5": "R5",
    "B6": "R6",
    "B7": "R7",
    "B8": "R8",
    "B9": "R9",
    "B10": "R10",
    "B11": "R11",
    "B12": "R12",
    "B13": "R13",
    "B14": "R14",
    "B15": "R15",
    "B16": "R16",
    "B17": "R17",
    "B18": "R18",
    "B19": "R19",
    "B20": "R20",
    "B21": "R21",
    "B22": "R22",
    "B23": "R23",
    "B24": "R24",
    "D0": "D20",
    "D1": "D15",
    "D2": "D10",
    "D3": "D5",
    "D4": "D0",
    "D5": "D21",
    "D6": "D16",
    "D7": "D11",
    "D8": "D6",
    "D9": "D1",
    "D10": "D22",
    "D11": "D17",
    "D12": "D12",
    "D13": "D7",
    "D14": "D2",
    "D15": "D23",
    "D16": "D18",
    "D17": "D13",
    "D18": "D8",
    "D19": "D3",
    "D20": "D24",
    "D21": "D19",
    "D22": "D14",
    "D23": "D9",
    "D24": "D4"
  },
  "z": {
    "U0": "R4",
    "U1": "R9",
    "U2": "R14",
    "U3": "R19",
    "U4": "R24",
    "U5": "R3",
    "U6": "R8",
    "U7": "R13",
    "U8": "R18",
    "U9": "R23",
    "U10": "R2",
    "U11": "R7",
    "U12": "R12",
    "U13": "R17",
    "U14": "R22",
    "U15": "R1",
    "U16": "R6",
    "U17": "R11",
    "U18": "R16",
    "U19": "R21",
    "U20": "R0",
    "U21": "R5",
    "U22": "R10",
    "U23": "R15",
    "U24": "R20",
    "R0": "D4",
    "R1": "D9",
    "R2": "D14",
    "R3": "D19",
    "R4": "D24",
    "R5": "D3",
    "R6": "D8",
    "R7": "D13",
    "R8": "D18",
    "R9": "D23",
    "R10": "D2",
    "R11": "D7",
    "R12": "D12",
    "R13": "D17",
    "R14": "D22",
    "R15": "D1",
    "R16": "D6",
    "R17": "D11",
    "R18": "D16",
    "R19": "D21",
    "R20": "D0",
    "R21": "D5",
    "R22": "D10",
    "R23": "D15",
    "R24": "D20",
    "F0": "F4",
    "F1": "F9",
    "F2": "F14",
    "F3": "F19",
    "F4": "F24",
    "F5": "F3",
    "F6": "F8",
    "F7": "F13",
    "F8": "F18",
    "F9": "F23",
    "F10": "F2",
    "F11": "F7",
    "F12": "F12",
    "F13": "F17",
    "F14": "F22",
    "F15": "F1",
    "F16": "F6",
    "F17": "F11",
    "F18": "F16",
    "F19": "F21",
    "F20": "F0",
    "F21": "F5",
    "F22": "F10",
    "F23": "F15",
    "F24": "F20",
    "L0": "U4",
    "L1": "U9",
    "L2": "U14",
    "L3": "U19",
    "L4": "U24",
    "L5": "U3",
    "L6": "U8",
    "L7": "U13",
    "L8": "U18",
    "L9": "U23",
    "L10": "U2",
    "L11": "U7",
    "L12": "U12",
    "L13": "U17",
    "L14": "U22",
    "L15": "U1",
    "L16": "U6",
    "L17": "U11",
    "L18": "U16",
    "L19": "U21",
    "L20": "U0",
    "L21": "U5",
    "L22": "U10",
    "L23": "U15",
    "L24": "U20",
    "B0": "B20",
    "B1": "B15",
    "B2": "B10",
    "B3": "B5",
    "B4": "B0",
    "B5": "B21",
    "B6": "B16",
    "B7": "B11",
    "B8": "B6",
    "B9": "B1",
    "B10": "B22",
    "B11": "B17",
    "B12": "B12",
    "B13": "B7",
    "B14": "B2",
    "B15": "B23",
    "B16": "B18",
    "B17": "B13",
    "B18": "B8",
    "B19": "B3",
    "B20": "B24",
    "B21": "B19",
    "B22": "B14",
    "B23": "B9",
    "B24": "B4",
    "D0": "L4",
    "D1": "L9",
    "D2": "L14",
    "D3": "L19",
    "D4": "L24",
    "D5": "L3",
    "D6": "L8",
    "D7": "L13",
    "D8": "L18",
    "D9": "L23",
    "D10": "L2",
    "D11": "L7",
    "D12": "L12",
    "D13": "L17",
    "D14": "L22",
    "D15": "L1",
    "D16": "L6",
    "D17": "L11",
    "D18": "L16",
    "D19": "L21",
    "D20": "L0",
    "D21": "L5",
    "D22": "L10",
    "D23": "L15",
    "D24": "L20"
  }
};

  function getNxNStickerIds(n) {
    const ids = [];
    for (let fi = 0; fi < NXN_FACE_ORDER.length; fi++) {
      const face = NXN_FACE_ORDER[fi];
      for (let dr = 0; dr < n; dr++) {
        for (let dc = 0; dc < n; dc++) ids.push(face + (dr * n + dc));
      }
    }
    return ids;
  }

  function parseNxNStickerId(id, n) {
    const m = String(id).trim().toUpperCase().match(/^([URFLBD])(\d+)$/);
    if (!m) return null;
    const idx = parseInt(m[2], 10);
    if (idx < 0 || idx >= n * n) return null;
    return { face: m[1], dr: Math.floor(idx / n), dc: idx % n };
  }

  function nxnStickerIdToFraction(id, n) {
    const p = parseNxNStickerId(id, n);
    if (!p) return null;
    const last = n - 1;
    return { face: p.face, fr: last > 0 ? p.dr / last : 0, fc: last > 0 ? p.dc / last : 0 };
  }

  function nxnFractionToStickerId(face, fr, fc, n) {
    const last = n - 1;
    const dr = last > 0 ? Math.round(fr * last) : 0;
    const dc = last > 0 ? Math.round(fc * last) : 0;
    return face + (dr * n + dc);
  }

  function rescaleNxNStickerId(id, fromN, toN) {
    const p = parseNxNStickerId(id, fromN);
    if (!p) return id;
    if (fromN === toN) return id;
    const cell = nxnDisplayToBaseCell(p.face, p.dr, p.dc, fromN, toN);
    if (fromN > toN) {
      return cell.face + (cell.dr * toN + cell.dc);
    }
    const group = nxnTargetStickersInBaseCell(cell.face, cell.dr, cell.dc, toN, fromN);
    return group[Math.floor(group.length / 2)] || id;
  }

  function nxnIdentityStickerMap(n) {
    const map = {};
    getNxNStickerIds(n).forEach(function (id) { map[id] = id; });
    return map;
  }

  function nxnBaseCellBounds(baseDr, baseDc, targetN, baseN) {
    return {
      dr0: Math.floor(baseDr * targetN / baseN),
      dr1: Math.floor((baseDr + 1) * targetN / baseN),
      dc0: Math.floor(baseDc * targetN / baseN),
      dc1: Math.floor((baseDc + 1) * targetN / baseN),
    };
  }

  function nxnTargetStickersInBaseCell(face, baseDr, baseDc, targetN, baseN) {
    const b = nxnBaseCellBounds(baseDr, baseDc, targetN, baseN);
    const list = [];
    const h = b.dr1 - b.dr0;
    const w = b.dc1 - b.dc0;
    for (let dr = b.dr0; dr < b.dr1; dr++) {
      for (let dc = b.dc0; dc < b.dc1; dc++) {
        list.push({
          id: face + (dr * targetN + dc),
          sort: (dr - b.dr0) * w + (dc - b.dc0),
        });
      }
    }
    list.sort(function (a, b) { return a.sort - b.sort; });
    return list.map(function (x) { return x.id; });
  }

  function nxnDisplayToBaseCell(face, dr, dc, targetN, baseN) {
    return {
      face: face,
      dr: Math.min(baseN - 1, Math.floor(dr * baseN / targetN)),
      dc: Math.min(baseN - 1, Math.floor(dc * baseN / targetN)),
    };
  }

  const _nxnBuiltRotMapCache = {};

  function createNxNDisplayTagGrid(n) {
    const tags = {};
    for (let fi = 0; fi < NXN_FACE_ORDER.length; fi++) {
      const face = NXN_FACE_ORDER[fi];
      tags[face] = [];
      for (let dr = 0; dr < n; dr++) {
        tags[face][dr] = [];
        for (let dc = 0; dc < n; dc++) {
          tags[face][dr][dc] = face + (dr * n + dc);
        }
      }
    }
    return tags;
  }

  function cloneNxNDisplayTagGrid(tags) {
    const out = {};
    for (let fi = 0; fi < NXN_FACE_ORDER.length; fi++) {
      const f = NXN_FACE_ORDER[fi];
      out[f] = tags[f].map(function (row) { return row.slice(); });
    }
    return out;
  }

  function rotateDisplayGridCW(grid) {
    const n = grid.length;
    const out = Array.from({ length: n }, function () { return Array(n); });
    for (let dr = 0; dr < n; dr++) {
      for (let dc = 0; dc < n; dc++) {
        out[dc][n - 1 - dr] = grid[dr][dc];
      }
    }
    return out;
  }

  function rotateDisplayGridCCW(grid) {
    const n = grid.length;
    const out = Array.from({ length: n }, function () { return Array(n); });
    for (let dr = 0; dr < n; dr++) {
      for (let dc = 0; dc < n; dc++) {
        out[n - 1 - dc][dr] = grid[dr][dc];
      }
    }
    return out;
  }

  function flipDisplayGrid180(grid) {
    return grid.slice().reverse().map(function (row) { return row.slice().reverse(); });
  }

  function cloneDisplayGrid(grid) {
    return grid.map(function (row) { return row.slice(); });
  }

  function applyNxNDisplayRotation(tags, axis) {
    if (axis === "x") {
      const srcU = cloneDisplayGrid(tags.U);
      const srcF = cloneDisplayGrid(tags.F);
      const srcD = cloneDisplayGrid(tags.D);
      const srcB = cloneDisplayGrid(tags.B);
      tags.U = cloneDisplayGrid(srcF);
      tags.F = cloneDisplayGrid(srcD);
      tags.D = flipDisplayGrid180(srcB);
      tags.B = flipDisplayGrid180(srcU);
      tags.R = rotateDisplayGridCW(tags.R);
      tags.L = rotateDisplayGridCCW(tags.L);
    } else if (axis === "y") {
      const srcF = cloneDisplayGrid(tags.F);
      const srcR = cloneDisplayGrid(tags.R);
      const srcB = cloneDisplayGrid(tags.B);
      const srcL = cloneDisplayGrid(tags.L);
      tags.F = cloneDisplayGrid(srcR);
      tags.L = cloneDisplayGrid(srcF);
      tags.B = cloneDisplayGrid(srcL);
      tags.R = cloneDisplayGrid(srcB);
      tags.U = rotateDisplayGridCW(tags.U);
      tags.D = rotateDisplayGridCCW(tags.D);
    } else if (axis === "z") {
      const srcU = cloneDisplayGrid(tags.U);
      const srcR = cloneDisplayGrid(tags.R);
      const srcD = cloneDisplayGrid(tags.D);
      const srcL = cloneDisplayGrid(tags.L);
      tags.R = rotateDisplayGridCW(srcU);
      tags.D = rotateDisplayGridCW(srcR);
      tags.L = rotateDisplayGridCW(srcD);
      tags.U = rotateDisplayGridCW(srcL);
      tags.F = rotateDisplayGridCW(tags.F);
      tags.B = rotateDisplayGridCCW(tags.B);
    }
    return tags;
  }

  function buildNxNDisplayRotationMap(axis, n) {
    const cacheKey = axis + ":" + n;
    if (_nxnBuiltRotMapCache[cacheKey]) return _nxnBuiltRotMapCache[cacheKey];

    const before = createNxNDisplayTagGrid(n);
    const after = createNxNDisplayTagGrid(n);
    applyNxNDisplayRotation(after, axis);

    const locAfter = {};
    for (let fi = 0; fi < NXN_FACE_ORDER.length; fi++) {
      const face = NXN_FACE_ORDER[fi];
      for (let dr = 0; dr < n; dr++) {
        for (let dc = 0; dc < n; dc++) {
          locAfter[after[face][dr][dc]] = { face: face, dr: dr, dc: dc };
        }
      }
    }

    const map = {};
    for (let fi = 0; fi < NXN_FACE_ORDER.length; fi++) {
      const face = NXN_FACE_ORDER[fi];
      for (let dr = 0; dr < n; dr++) {
        for (let dc = 0; dc < n; dc++) {
          const fromId = before[face][dr][dc];
          const pos = locAfter[fromId];
          if (!pos) continue;
          map[fromId] = pos.face + (pos.dr * n + pos.dc);
        }
      }
    }

    _nxnBuiltRotMapCache[cacheKey] = map;
    return map;
  }

  function extrapolateNxNStickerMap(map, baseN, targetN) {
    if (baseN === targetN) {
      const out = {};
      for (const key in map) {
        if (Object.prototype.hasOwnProperty.call(map, key)) out[key] = map[key];
      }
      return out;
    }
    const out = {};
    const baseIds = getNxNStickerIds(baseN);
    for (let i = 0; i < baseIds.length; i++) {
      const fromBid = baseIds[i];
      const toBid = map[fromBid] || fromBid;
      const fromB = parseNxNStickerId(fromBid, baseN);
      const toB = parseNxNStickerId(toBid, baseN);
      if (!fromB || !toB) continue;
      const fromGroup = nxnTargetStickersInBaseCell(fromB.face, fromB.dr, fromB.dc, targetN, baseN);
      const toGroup = nxnTargetStickersInBaseCell(toB.face, toB.dr, toB.dc, targetN, baseN);
      for (let j = 0; j < fromGroup.length; j++) {
        out[fromGroup[j]] = toGroup[j] || fromGroup[j];
      }
    }
    getNxNStickerIds(targetN).forEach(function (id) {
      if (!Object.prototype.hasOwnProperty.call(out, id)) out[id] = id;
    });
    return out;
  }

  function applyNxNStickerMap(state, stickerMap, n) {
    n = n || state.U.length;
    const src = {};
    for (let fi = 0; fi < NXN_FACE_ORDER.length; fi++) {
      const f = NXN_FACE_ORDER[fi];
      src[f] = state[f].map(function (row) { return row.slice(); });
    }
    for (const fromId in stickerMap) {
      if (!Object.prototype.hasOwnProperty.call(stickerMap, fromId)) continue;
      const toId = stickerMap[fromId];
      const from = parseNxNStickerId(fromId, n);
      const to = parseNxNStickerId(toId, n);
      if (!from || !to) continue;
      const fromRC = nxnNetDisplayToStateRC(from.face, from.dr, from.dc, n);
      const toRC = nxnNetDisplayToStateRC(to.face, to.dr, to.dc, n);
      state[to.face][toRC[0]][toRC[1]] = src[from.face][fromRC[0]][fromRC[1]];
    }
    return state;
  }

  function getNxNRotationStickerMap(axis, n) {
    n = n || NXN_ROT_MAP_BASE_N;
    if (!NXN_ROT_STICKER_MAPS[axis]) return null;
    return buildNxNDisplayRotationMap(axis, n);
  }

  function buildNxNRotationStickerMap(axis, n) {
    return getNxNRotationStickerMap(axis, n) || nxnIdentityStickerMap(n || NXN_ROT_MAP_BASE_N);
  }

  function applyNxNCubeRotation(state, axis, quarters) {
    const n = state.U.length;
    if (!NXN_ROT_STICKER_MAPS[axis]) return state;
    quarters = ((quarters % 4) + 4) % 4;
    const map = buildNxNDisplayRotationMap(axis, n);
    for (let t = 0; t < quarters; t++) applyNxNStickerMap(state, map, n);
    return state;
  }

  function nxnStickerMapToArrows(stickerMap, n, opts) {
    opts = opts || {};
    const onlyFrom = opts.onlyFrom || null;
    const color = opts.color || "#ffdd00";
    const arrows = [];
    for (const fromId in stickerMap) {
      if (!Object.prototype.hasOwnProperty.call(stickerMap, fromId)) continue;
      const toId = stickerMap[fromId];
      if (fromId === toId) continue;
      if (onlyFrom && fromId !== onlyFrom) continue;
      arrows.push(fromId + "->" + toId + ":" + color);
    }
    return arrows.join(",");
  }

  function applyNxNAlgorithmWithRotMaps(state, alg, rotMaps, baseN) {
    const n = state.U.length;
    baseN = baseN || NXN_ROT_MAP_BASE_N;
    const moves = alg.trim().split(/\s+/).filter(function (m) { return !!m; });
    for (let i = 0; i < moves.length; i++) {
      const rot = parseRotationMove(moves[i]);
      if (rot) {
        const raw = rotMaps[rot.axis];
        if (!raw) continue;
        const map = extrapolateNxNStickerMap(raw, baseN, n);
        for (let t = 0; t < rot.quarters; t++) applyNxNStickerMap(state, map, n);
      } else {
        applyNxNMove(state, moves[i]);
      }
    }
    return state;
  }
  function applyNxNMove(state, move) {
    let n = state.U.length;
    const parsed = parseMove(move);
    if (!parsed) return state;
    if (parsed.layer < 0 || parsed.layer >= n) return state;
    let face = parsed.face;
    let count = parsed.count;
    let layer = parsed.layer;
    let wide = parsed.wide;

    const sliceMap = { M: "L", E: "D", S: "F" };
    if (sliceMap[face]) {
      const sliceLayer = 1;
      for (let t = 0; t < count; t++) {
        applyLayerTurn(state, sliceMap[face], sliceLayer, n);
      }
      return state;
    }

    for (let t = 0; t < count; t++) {
      const layers = [];
      if (wide) {
        for (let l = 0; l <= layer; l++) layers.push(l);
      } else {
        layers.push(layer);
      }
      for (let li = 0; li < layers.length; li++) {
        applyLayerTurn(state, face, layers[li], n);
      }
    }
    return state;
  }

  function parseMove(m) {
    m = m.trim();
    if (!m) return null;

    m = m.replace(/[\u2018\u2019\u0060\u00B4]/g, "'");

    let wide = false;
    let layer = 0;
    let count = 1;

    if (m.length >= 3 && m.slice(-2) === "2'") {
      count = 2;
      m = m.slice(0, -2);
    } else if (m[m.length - 1] === "'") {
      count = 3;
      m = m.slice(0, -1);
    } else if (m[m.length - 1] === "2") {
      count = 2;
      m = m.slice(0, -1);
    }

    let face = m;
    let hadLayerPrefix = false;
    if (face.length > 1 && /[0-9]/.test(face[0])) {
      layer = parseInt(face[0], 10) - 1;
      face = face.slice(1);
      hadLayerPrefix = true;
    }
    if (face.endsWith("w") || (!hadLayerPrefix && face === face.toLowerCase() && face.length === 1 && "rulfbd".indexOf(face) >= 0)) {
      wide = true;
      if (face.endsWith("w")) face = face.slice(0, -1);
      face = face.toUpperCase();
      if (layer === 0) layer = 1;
    }
    face = face.toUpperCase();

    if (face.length !== 1 || "URFLBDMES".indexOf(face) < 0) return null;

    return { face: face, count: count, layer: layer, wide: wide };
  }

  function applyLayerTurn(state, face, layer, n) {
    let s = state;
    let last = n - 1;
    const idx = layer;

    if (idx < 0 || idx > last || !s[face]) return;
    if (idx === 0) {
      if (face === "U") {
        s[face] = rotateFaceCW(rotateFaceCW(rotateFaceCW(s[face])));
      } else {
        s[face] = rotateFaceCW(s[face]);
      }
    }

    for (let i = 0; i < n; i++) {
      let t;
      if (face === "R") {
        let c = last - idx;
        t = s.U[i][c];
        s.U[i][c] = s.F[last - i][c];
        s.F[last - i][c] = s.D[last - i][c];
        s.D[last - i][c] = s.B[i][idx];
        s.B[i][idx] = t;
      } else if (face === "L") {
        let c = idx;
        t = s.U[i][c];
        s.U[i][c] = s.B[i][last - c];
        s.B[i][last - c] = s.D[last - i][c];
        s.D[last - i][c] = s.F[last - i][c];
        s.F[last - i][c] = t;
      } else if (face === "U") {
        let r = idx;
        t = s.F[r][i];
        s.F[r][i] = s.R[r][i];
        s.R[r][i] = s.B[r][i];
        s.B[r][i] = s.L[r][i];
        s.L[r][i] = t;
      } else if (face === "D") {
        let r = last - idx;
        t = s.F[r][i];
        s.F[r][i] = s.L[r][i];
        s.L[r][i] = s.B[r][i];
        s.B[r][i] = s.R[r][i];
        s.R[r][i] = t;
      } else if (face === "F") {
        t = s.U[idx][i];
        s.U[idx][i] = s.L[last - i][last - idx];
        s.L[last - i][last - idx] = s.D[idx][last - i];
        s.D[idx][last - i] = s.R[i][idx];
        s.R[i][idx] = t;
      } else if (face === "B") {
        t = s.U[last - idx][i];
        s.U[last - idx][i] = s.R[i][last - idx];
        s.R[i][last - idx] = s.D[last - idx][last - i];
        s.D[last - idx][last - i] = s.L[last - i][idx];
        s.L[last - i][idx] = t;
      }
    }
  }

  function generateNxNScramble(n) {
    const moves = ["R", "L", "U", "D", "F", "B"];
    const mods = ["", "'", "2"];
    let scramble = [];
    let last = "";
    for (let i = 0; i < 60; i++) {
      let m;
      do {
        m = moves[Math.floor(Math.random() * moves.length)];
      } while (m === last);
      last = m;
      scramble.push(m + mods[Math.floor(Math.random() * mods.length)]);
    }
    return scramble.join(" ");
  }

  function applyAlgorithm(state, alg, n) {
    const moves = alg.trim().split(/\s+/).filter(function (m) { return !!m; });
    for (let i = 0; i < moves.length; i++) {
      const rot = parseRotationMove(moves[i]);
      if (rot) applyNxNCubeRotation(state, rot.axis, rot.quarters);
      else applyNxNMove(state, moves[i]);
    }
    return state;
  }

  function parseStateString(str, n) {
    const faceOrder = ["U", "R", "F", "L", "B", "D"];
    let faces = str.split(",");
    const defaultState = createNxNState(n);

    if (faces.length === 6) {
      let state = {};
      for (let fi = 0; fi < 6; fi++) {
        const chars = faces[fi].trim().split("");
        if (chars.length !== n * n) return null;
        state[faceOrder[fi]] = [];
        for (let r = 0; r < n; r++) {
          state[faceOrder[fi]][r] = [];
          for (let c = 0; c < n; c++) {
            state[faceOrder[fi]][r][c] = chars[r * n + c];
          }
        }
      }
      return state;
    }

    function parseFaceStr(s, n) {
      const chars = s.trim().split("");
      if (chars.length !== n * n) return null;
      let face = [];
      for (let r = 0; r < n; r++) {
        face[r] = [];
        for (let c = 0; c < n; c++) face[r][c] = chars[r * n + c];
      }
      return face;
    }

    if (faces.length === 1) {
      let f = parseFaceStr(faces[0], n);
      if (!f) return null;
      defaultState.U = f;
      return defaultState;
    }

    if (faces.length === 3) {
      const u = parseFaceStr(faces[0], n);
      let r = parseFaceStr(faces[1], n);
      let f = parseFaceStr(faces[2], n);
      if (!u || !r || !f) return null;
      defaultState.U = u; defaultState.R = r; defaultState.F = f;
      return defaultState;
    }

    if (faces.length === 5) {
      const u = parseFaceStr(faces[0], n);
      if (!u) return null;
      defaultState.U = u;
      const sideNames = ["B", "F", "L", "R"];
      for (let si = 0; si < 4; si++) {
        const row = faces[1 + si].trim().split("");
        if (row.length !== n) return null;
        for (let c = 0; c < n; c++) {
          if (si === 0) defaultState.B[0][n - 1 - c] = row[c];
          else if (si === 1) defaultState.F[0][c] = row[c];
          else if (si === 2) defaultState.L[0][n - 1 - c] = row[c];
          else defaultState.R[0][c] = row[c];
        }
      }
      return defaultState;
    }

    return null;
  }

  // ─── NxN Cube Renderer ───

  function renderNxNCube(n, angle, state, mono, outlined, config) {
    const project = getProjection(angle);
    const gap = 0.08;
    const stickerSize = 1;
    const totalFace = n * (stickerSize + gap) - gap;
    const polys = [];

    function addFace(faceState, transform, depth) {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const x0 = c * (stickerSize + gap);
          const y0 = r * (stickerSize + gap);
          const corners3d = [
            transform(x0, y0),
            transform(x0 + stickerSize, y0),
            transform(x0 + stickerSize, y0 + stickerSize),
            transform(x0, y0 + stickerSize),
          ];
          const projected = corners3d.map(function (p) {
            return project(p[0], p[1], p[2]);
          });
          const color = faceState[r][c];
          const avgDepth = depth;
          polys.push({ pts: projected, color: color, depth: avgDepth });
        }
      }
    }

    const rx = getRounded(config);

    if (angle === "front") {
      let fSk = getStrokeFor(mono, outlined);
      let fSw = getStrokeWidthFor(outlined, 0.06);
      const pad = 0.3;
      const vb = (-pad) + " " + (-pad) + " " + (totalFace + pad * 2) + " " + (totalFace + pad * 2);
      let svg = svgOpen(vb);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const x0 = c * (stickerSize + gap);
          const y0 = r * (stickerSize + gap);
          svg += rect(x0, y0, stickerSize, stickerSize, getColorValue(state.U[r][c], mono, outlined), fSk, fSw, rx);
        }
      }
      svg += "</svg>";
      return svg;
    } else if (angle === "iso") {
      addFace(state.U, function (x, y) { return [x, totalFace, totalFace - y]; }, 2);
      addFace(state.F, function (x, y) { return [x, totalFace - y, totalFace]; }, 1);
      addFace(state.R, function (x, y) { return [totalFace, totalFace - y, totalFace - x]; }, 0);
    } else if (angle === "top") {
      return renderNxNTop(n, state, mono, outlined, config);
    } else if (angle === "net") {
      return renderNxNNet(n, state, mono, outlined, config);
    }

    polys.sort(function (a, b) { return a.depth - b.depth; });

    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    });
    const pad = 0.3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);

    let svg = svgOpen(vb);
    polys.forEach(function (p) {
      svg += polygon(p.pts, getColorValue(p.color, mono, outlined), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.06), rx);
    });
    svg += "</svg>";
    return svg;
  }

  function renderNxNRotated(n, state, rotX, rotY, mono, outlined, config) {
    const gap = 0.08;
    const stickerSize = 1;
    const totalFace = n * (stickerSize + gap) - gap;
    const h = totalFace / 2;
    const polys = [];
    const rx = getRounded(config);

    const faceTransforms = {
      U: function (x, y) { return [x - h, h, h - y]; },
      D: function (x, y) { return [x - h, -h, h - y]; },
      F: function (x, y) { return [x - h, h - y, h]; },
      B: function (x, y) { return [h - x, h - y, -h]; },
      R: function (x, y) { return [h, h - y, h - x]; },
      L: function (x, y) { return [-h, h - y, x - h]; },
    };

    const visible = getVisibleFaces(rotX, rotY);
    for (let vi = 0; vi < visible.length; vi++) {
      const faceName = visible[vi];
      const faceState = state[faceName];
      const transform = faceTransforms[faceName];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const x0 = c * (stickerSize + gap);
          const y0 = r * (stickerSize + gap);
          const corners3d = [
            transform(x0, y0),
            transform(x0 + stickerSize, y0),
            transform(x0 + stickerSize, y0 + stickerSize),
            transform(x0, y0 + stickerSize),
          ];
          let zSum = 0;
          const projected = corners3d.map(function (p) {
            const rot = rotate3D(p[0], p[1], p[2], rotX, rotY);
            zSum += rot[2];
            return [rot[0], -rot[1]];
          });
          polys.push({ pts: projected, color: faceState[r][c], depth: zSum / 4 });
        }
      }
    }

    polys.sort(function (a, b) { return a.depth - b.depth; });

    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    });
    const pad = 0.3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);

    let svg = svgOpen(vb);
    polys.forEach(function (p) {
      svg += polygon(p.pts, getColorValue(p.color, mono, outlined), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.06), rx);
    });
    svg += "</svg>";
    return svg;
  }

  // ─── NxN Top View Renderer ───

  function renderNxNTop(n, state, mono, outlined, config) {
    const oll = config && config.oll;
    const gap = 0.08;
    const ss = 1;
    const unit = ss + gap;
    const faceSize = n * unit - gap;
    const sd = 0.45;
    let sk = getStrokeFor(mono, outlined);
    let sw = getStrokeWidthFor(outlined, 0.06);
    const rx = getRounded(config);
    const GRAY = COLORS.Gy;

    const uColor = state.U[Math.floor(n / 2)] ? state.U[Math.floor(n / 2)][Math.floor(n / 2)] : "W";
    function colorFor(c) {
      if (oll) return c === uColor ? getColorValue("Y", mono, outlined) : (outlined ? "none" : GRAY);
      return getColorValue(c, mono, outlined);
    }

    const totalW = faceSize + 2 * sd;
    const totalH = faceSize + 2 * sd;
    const pad = 0.15;
    const vb = (-pad) + " " + (-pad) + " " + (totalW + pad * 2) + " " + (totalH + pad * 2);
    let svg = svgOpen(vb);

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const x = sd + c * unit;
        const y = sd + r * unit;
        svg += rect(x, y, ss, ss, colorFor(state.U[r][c]), sk, sw, rx);
      }
    }

    const sideRx = rx * 0.5;

    for (let c = 0; c < n; c++) {
      const x = sd + c * unit;
      svg += rect(x, 0, ss, sd, colorFor(state.B[0][n - 1 - c]), sk, sw, sideRx);
    }

    for (let c = 0; c < n; c++) {
      const x = sd + c * unit;
      svg += rect(x, sd + faceSize, ss, sd, colorFor(state.F[0][c]), sk, sw, sideRx);
    }

    for (let r = 0; r < n; r++) {
      const y = sd + r * unit;
      svg += rect(0, y, sd, ss, colorFor(state.L[0][n - 1 - r]), sk, sw, sideRx);
    }

    for (let r = 0; r < n; r++) {
      const y = sd + r * unit;
      svg += rect(sd + faceSize, y, sd, ss, colorFor(state.R[0][r]), sk, sw, sideRx);
    }

    svg += "</svg>";
    return svg;
  }

  // ─── NxN Net (Planificação) Renderer ───

  function renderNxNNet(n, state, mono, outlined, config) {
    const gap = 0.08;
    const ss = 1;
    const unit = ss + gap;
    const faceSize = n * unit - gap;
    const faceUnit = faceSize + gap * 3;
    let sk = getStrokeFor(mono, outlined);
    let sw = getStrokeWidthFor(outlined, 0.06);
    const rx = getRounded(config);

    const totalW = 4 * faceUnit - gap * 3;
    const totalH = 3 * faceUnit - gap * 3;
    const pad = 0.2;
    const vb = (-pad) + " " + (-pad) + " " + (totalW + pad * 2) + " " + (totalH + pad * 2);
    let svg = svgOpen(vb);

    function drawFace(faceKey, faceGrid, offX, offY) {
      for (let dr = 0; dr < n; dr++) {
        for (let dc = 0; dc < n; dc++) {
          const x = offX + dc * unit;
          const y = offY + dr * unit;
          const color = nxnNetReadCell(faceGrid, faceKey, dr, dc, n);
          svg += rect(x, y, ss, ss, getColorValue(color, mono, outlined), sk, sw, rx);
        }
      }
    }

    const col0 = 0;
    const col1 = faceUnit;
    const col2 = 2 * faceUnit;
    const col3 = 3 * faceUnit;
    const row0 = 0;
    const row1 = faceUnit;
    const row2 = 2 * faceUnit;

    drawFace("U", state, col1, row0);
    drawFace("L", state, col0, row1);
    drawFace("F", state, col1, row1);
    drawFace("R", state, col2, row1);
    drawFace("B", state, col3, row1);
    drawFace("D", state, col1, row2);

    svg += "</svg>";
    return svg;
  }

  // ─── Skewb State Engine ───

  function createSkewbState() {
    return {
      U: ["W", "W", "W", "W", "W"],
      R: ["R", "R", "R", "R", "R"],
      F: ["G", "G", "G", "G", "G"],
      L: ["O", "O", "O", "O", "O"],
      B: ["B", "B", "B", "B", "B"],
      D: ["Y", "Y", "Y", "Y", "Y"],
    };
  }

  function createSkewbOLLState() {
    return {
      U: ["Y", "Y", "Y", "Y", "Y"],
      R: ["O", "O", "O", "O", "O"],
      F: ["G", "G", "G", "G", "G"],
      L: ["R", "R", "R", "R", "R"],
      B: ["B", "B", "B", "B", "B"],
      D: ["W", "W", "W", "W", "W"],
    };
  }

  function applySkewbMove(state, move) {
    let s = state;
    let m = move.trim().replace(/[\u2018\u2019\u0060\u00B4]/g, "'");
    if (!m) return state;
    let prime = m.endsWith("'");
    if (prime) m = m.slice(0, -1);
    let t;

    if (m === "R") {
      if (!prime) {
        t=s.R[0]; s.R[0]=s.D[0]; s.D[0]=s.B[0]; s.B[0]=t;
        t=s.D[3]; s.D[3]=s.B[4]; s.B[4]=s.R[3]; s.R[3]=t;
        t=s.R[2]; s.R[2]=s.D[2]; s.D[2]=s.B[3]; s.B[3]=t;
        t=s.R[4]; s.R[4]=s.D[4]; s.D[4]=s.B[1]; s.B[1]=t;
        t=s.U[3]; s.U[3]=s.F[3]; s.F[3]=s.L[4]; s.L[4]=t;
      } else {
        t=s.R[0]; s.R[0]=s.B[0]; s.B[0]=s.D[0]; s.D[0]=t;
        t=s.D[3]; s.D[3]=s.R[3]; s.R[3]=s.B[4]; s.B[4]=t;
        t=s.R[2]; s.R[2]=s.B[3]; s.B[3]=s.D[2]; s.D[2]=t;
        t=s.R[4]; s.R[4]=s.B[1]; s.B[1]=s.D[4]; s.D[4]=t;
        t=s.U[3]; s.U[3]=s.L[4]; s.L[4]=s.F[3]; s.F[3]=t;
      }
    } else if (m === "L") {
      if (!prime) {
        t=s.L[0]; s.L[0]=s.D[0]; s.D[0]=s.F[0]; s.F[0]=t;
        t=s.D[1]; s.D[1]=s.F[4]; s.F[4]=s.L[3]; s.L[3]=t;
        t=s.L[2]; s.L[2]=s.D[4]; s.D[4]=s.F[3]; s.F[3]=t;
        t=s.L[4]; s.L[4]=s.D[2]; s.D[2]=s.F[1]; s.F[1]=t;
        t=s.U[1]; s.U[1]=s.B[3]; s.B[3]=s.R[4]; s.R[4]=t;
      } else {
        t=s.L[0]; s.L[0]=s.F[0]; s.F[0]=s.D[0]; s.D[0]=t;
        t=s.D[1]; s.D[1]=s.L[3]; s.L[3]=s.F[4]; s.F[4]=t;
        t=s.L[2]; s.L[2]=s.F[3]; s.F[3]=s.D[4]; s.D[4]=t;
        t=s.L[4]; s.L[4]=s.F[1]; s.F[1]=s.D[2]; s.D[2]=t;
        t=s.U[1]; s.U[1]=s.R[4]; s.R[4]=s.B[3]; s.B[3]=t;
      }
    } else if (m === "U") {
      if (!prime) {
        t=s.U[0]; s.U[0]=s.B[0]; s.B[0]=s.L[0]; s.L[0]=t;
        t=s.U[4]; s.U[4]=s.B[2]; s.B[2]=s.L[1]; s.L[1]=t;
        t=s.U[1]; s.U[1]=s.B[1]; s.B[1]=s.L[4]; s.L[4]=t;
        t=s.U[3]; s.U[3]=s.B[3]; s.B[3]=s.L[2]; s.L[2]=t;
        t=s.F[1]; s.F[1]=s.R[2]; s.R[2]=s.D[4]; s.D[4]=t;
      } else {
        t=s.U[0]; s.U[0]=s.L[0]; s.L[0]=s.B[0]; s.B[0]=t;
        t=s.U[4]; s.U[4]=s.L[1]; s.L[1]=s.B[2]; s.B[2]=t;
        t=s.U[1]; s.U[1]=s.L[4]; s.L[4]=s.B[1]; s.B[1]=t;
        t=s.U[3]; s.U[3]=s.L[2]; s.L[2]=s.B[3]; s.B[3]=t;
        t=s.F[1]; s.F[1]=s.D[4]; s.D[4]=s.R[2]; s.R[2]=t;
      }
    } else if (m === "B") {
      if (!prime) {
        t=s.D[0]; s.D[0]=s.L[0]; s.L[0]=s.B[0]; s.B[0]=t;
        t=s.D[4]; s.D[4]=s.L[4]; s.L[4]=s.B[3]; s.B[3]=t;
        t=s.U[4]; s.U[4]=s.R[3]; s.R[3]=s.F[4]; s.F[4]=t;
        t=s.L[1]; s.L[1]=s.B[4]; s.B[4]=s.D[1]; s.D[1]=t;
        t=s.B[2]; s.B[2]=s.D[3]; s.D[3]=s.L[3]; s.L[3]=t;
      } else {
        t=s.D[0]; s.D[0]=s.B[0]; s.B[0]=s.L[0]; s.L[0]=t;
        t=s.D[4]; s.D[4]=s.B[3]; s.B[3]=s.L[4]; s.L[4]=t;
        t=s.U[4]; s.U[4]=s.F[4]; s.F[4]=s.R[3]; s.R[3]=t;
        t=s.L[1]; s.L[1]=s.D[1]; s.D[1]=s.B[4]; s.B[4]=t;
        t=s.B[2]; s.B[2]=s.L[3]; s.L[3]=s.D[3]; s.D[3]=t;
      }
    }
    return state;
  }

  function applySkewbAlgorithm(state, alg) {
    const moves = alg.trim().split(/\s+/);
    for (let i = 0; i < moves.length; i++) {
      applySkewbMove(state, moves[i]);
    }
    return state;
  }

  function generateSkewbScramble() {
    const moves = ["R", "L", "U", "B"];
    const mods = ["", "'"];
    let scramble = [];
    let last = "";
    for (let i = 0; i < 9; i++) {
      let m;
      do { m = moves[Math.floor(Math.random() * moves.length)]; } while (m === last);
      last = m;
      scramble.push(m + mods[Math.floor(Math.random() * mods.length)]);
    }
    return scramble.join(" ");
  }

  function skewbColorFor(c, mono, outlined, config) {
    const oll = config && config.oll;
    if (oll) return c === "Y" ? getColorValue("Y", mono, outlined) : (outlined ? "none" : COLORS.Gy);
    return getColorValue(c, mono, outlined);
  }

  function renderSkewb(angle, state, mono, outlined, config) {
    const project = getProjection(angle);
    const polys = [];
    let s = 3;

    function shrinkPoly(pts, f) {
      let cx = 0, cy = 0;
      for (let i = 0; i < pts.length; i++) { cx += pts[i][0]; cy += pts[i][1]; }
      cx /= pts.length; cy /= pts.length;
      return pts.map(function (p) { return [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f]; });
    }

    function addSkewbFace(faceState, transform, depth) {
      let cx = s / 2, cy = s / 2;

      const triCorners = [
        { idx: 1, pts: [[0, 0], [cx, 0], [0, cy]] },
        { idx: 2, pts: [[s, 0], [s, cy], [cx, 0]] },
        { idx: 3, pts: [[s, s], [cx, s], [s, cy]] },
        { idx: 4, pts: [[0, s], [0, cy], [cx, s]] },
      ];

      triCorners.forEach(function (tri) {
        let shrunk = shrinkPoly(tri.pts, 0.88);
        const projected = shrunk.map(function (p) {
          let t = transform(p[0], p[1]);
          return project(t[0], t[1], t[2]);
        });
        polys.push({ pts: projected, color: faceState[tri.idx], depth: depth });
      });

      const centerPts = [
        [cx, 0], [s, cy], [cx, s], [0, cy]
      ];
      let shrunkCenter = shrinkPoly(centerPts, 0.88);
      const projected = shrunkCenter.map(function (p) {
        let t = transform(p[0], p[1]);
        return project(t[0], t[1], t[2]);
      });
      polys.push({ pts: projected, color: faceState[0], depth: depth + 0.01 });
    }

    if (angle === "front") {
      addSkewbFace(state.U, function (x, y) { return [x, s - y, 0]; }, 0);
    } else if (angle === "top") {
      return renderSkewbTop(state, mono, outlined, config);
    } else if (angle === "iso") {
      addSkewbFace(state.U, function (x, y) { return [x, s, s - y]; }, 2);
      addSkewbFace(state.F, function (x, y) { return [x, s - y, s]; }, 1);
      addSkewbFace(state.R, function (x, y) { return [s, s - y, s - x]; }, 0);
    }

    polys.sort(function (a, b) { return a.depth - b.depth; });
    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 0.3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const skRx = getRounded(config, 2);
    polys.forEach(function (p) {
      svg += polygon(p.pts, skewbColorFor(p.color, mono, outlined, config), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.06), skRx);
    });
    svg += "</svg>";
    return svg;
  }

  function renderSkewbTop(state, mono, outlined, config) {
    const polys = [];
    const s = 3;
    const cx = s / 2;
    const cy = s / 2;
    const shrink = 0.88;
    const skRx = getRounded(config, 2);
    const centerPts = [[cx, 0], [s, cy], [cx, s], [0, cy]];
    const nw = s, ne = s * 2, sw = s, se = s * 2;
    const icx = cx + s, icy = cy + s;

    function shrinkPoly(pts, f) {
      let pcx = 0, pcy = 0;
      for (let i = 0; i < pts.length; i++) { pcx += pts[i][0]; pcy += pts[i][1]; }
      pcx /= pts.length; pcy /= pts.length;
      return pts.map(function (p) { return [pcx + (p[0] - pcx) * f, pcy + (p[1] - pcy) * f]; });
    }

    function pushTri(pts, color) {
      polys.push({ pts: shrinkPoly(pts, shrink), color: color });
    }

    function placeCenter(faceState, dx, dy) {
      pushTri(centerPts.map(function (p) { return [dx + p[0], dy + p[1]]; }), faceState[0]);
    }

    // U: TL=U4, TR=U3, BL=U1, BR=U2, C=U0 (layout validado; builder lê fills nesta ordem)
    pushTri([[nw, nw], [icx, nw], [nw, icy]], state.U[4]);
    pushTri([[ne, nw], [icx, nw], [ne, icy]], state.U[3]);
    pushTri([[sw, se], [icx, se], [sw, icy]], state.U[1]);
    pushTri([[ne, se], [icx, se], [ne, icy]], state.U[2]);
    pushTri(centerPts.map(function (p) { return [s + p[0], s + p[1]]; }), state.U[0]);

    placeCenter(state.B, s, 0);
    placeCenter(state.F, s, s * 2);
    placeCenter(state.L, 0, s);
    placeCenter(state.R, s * 2, s);

    pushTri([[nw, nw], [icx, nw], [nw, nw - cy]], state.B[2]);
    pushTri([[ne, nw], [icx, nw], [ne, nw - cy]], state.B[1]);
    pushTri([[ne, nw], [ne + cx, nw], [ne, icy]], state.R[2]);
    pushTri([[ne, se], [ne + cx, se], [ne, icy]], state.R[1]);
    pushTri([[sw, se], [icx, se], [sw, se + cy]], state.F[1]);
    pushTri([[ne, se], [icx, se], [ne, se + cy]], state.F[2]);
    pushTri([[nw, nw], [nw - cx, nw], [nw, icy]], state.L[1]);
    pushTri([[sw, se], [sw - cx, se], [sw, icy]], state.L[2]);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    polys.forEach(function (p) {
      p.pts.forEach(function (pt) {
        if (pt[0] < minX) minX = pt[0]; if (pt[1] < minY) minY = pt[1];
        if (pt[0] > maxX) maxX = pt[0]; if (pt[1] > maxY) maxY = pt[1];
      });
    });
    const pad = 0.3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    polys.forEach(function (p) {
      svg += polygon(p.pts, skewbColorFor(p.color, mono, outlined, config), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.06), skRx);
    });
    svg += "</svg>";
    return svg;
  }

  // ─── Skewb Net (Planificação) Renderer ───
  // Iso cluster (U, F, R) + B/L/D unfolded by edge reflection — matches iso view with hidden faces to the sides.

  function buildSkewbNetFaceConfigs() {
    return [
      { face: "U" }, { face: "F" }, { face: "R" },
      { face: "B" }, { face: "L" }, { face: "D" },
    ];
  }

  let _skewbNetFaceConfigs = null;
  function getSkewbNetFaceConfigs() {
    if (!_skewbNetFaceConfigs) _skewbNetFaceConfigs = buildSkewbNetFaceConfigs();
    return _skewbNetFaceConfigs;
  }

  function renderSkewbNet(state, mono, outlined, config) {
    const polys = [];
    const s = 3;
    const shrink = 0.88;
    const cx = s / 2;
    const cy = s / 2;

    const faceXf = {
      U: function (x, y) { return [x, s, s - y]; },
      F: function (x, y) { return [x, s - y, s]; },
      R: function (x, y) { return [s, s - y, s - x]; },
      L: function (x, y) { return [0, s - y, x]; },
      B: function (x, y) { return [s - x, s - y, 0]; },
      D: function (x, y) { return [x, 0, y]; },
    };

    function shrinkPoly(pts, f) {
      let pcx = 0, pcy = 0;
      for (let i = 0; i < pts.length; i++) { pcx += pts[i][0]; pcy += pts[i][1]; }
      pcx /= pts.length; pcy /= pts.length;
      return pts.map(function (p) { return [pcx + (p[0] - pcx) * f, pcy + (p[1] - pcy) * f]; });
    }

    function projFace(x, y, fn) {
      const t = faceXf[fn](x, y);
      return projectIso(t[0], t[1], t[2]);
    }

    function reflectPt(pt, ax, ay, bx, by) {
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) return pt.slice();
      const t = ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / len2;
      const px = ax + t * dx;
      const py = ay + t * dy;
      return [2 * px - pt[0], 2 * py - pt[1]];
    }

    function mapPts(pts, fn) {
      return pts.map(function (p) { return fn(p); });
    }

    const unfoldEdge = {
      B: [[2.598076211353316, -1.5], [0, -3]],
      L: [[-2.598076211353316, -1.5], [-2.598076211353316, 1.5]],
      D: [[0, 3], [2.598076211353316, 1.5]],
    };

    function transformPt(pt, faceName) {
      const edge = unfoldEdge[faceName];
      if (!edge) return pt;
      return reflectPt(pt, edge[0][0], edge[0][1], edge[1][0], edge[1][1]);
    }

    function localFaceXY(x, y, faceName) {
      if (faceName === "D") return [x, s - y];
      return [x, y];
    }

    function addFacePolys(faceName, faceState) {
      const triCorners = [
        { idx: 1, pts: [[0, 0], [cx, 0], [0, cy]] },
        { idx: 2, pts: [[s, 0], [s, cy], [cx, 0]] },
        { idx: 3, pts: [[s, s], [cx, s], [s, cy]] },
        { idx: 4, pts: [[0, s], [0, cy], [cx, s]] },
      ];
      const centerPts = [[cx, 0], [s, cy], [cx, s], [0, cy]];

      function pushPoly(pts, color) {
        const shrunk = shrinkPoly(pts, shrink);
        const projected = mapPts(shrunk.map(function (p) {
          const loc = localFaceXY(p[0], p[1], faceName);
          return projFace(loc[0], loc[1], faceName);
        }), function (p) { return transformPt(p, faceName); });
        polys.push({ pts: projected, color: color });
      }

      triCorners.forEach(function (tri) {
        pushPoly(tri.pts, faceState[tri.idx]);
      });
      pushPoly(centerPts, faceState[0]);
    }

    ["U", "F", "R", "B", "L", "D"].forEach(function (fn) {
      addFacePolys(fn, state[fn]);
    });

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    polys.forEach(function (p) {
      p.pts.forEach(function (pt) {
        if (pt[0] < minX) minX = pt[0]; if (pt[1] < minY) minY = pt[1];
        if (pt[0] > maxX) maxX = pt[0]; if (pt[1] > maxY) maxY = pt[1];
      });
    });
    const pad = 0.4;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const skNetRx = getRounded(config, 2);
    polys.forEach(function (p) {
      svg += polygon(p.pts, skewbColorFor(p.color, mono, outlined, config), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.06), skNetRx);
    });
    svg += "</svg>";
    return svg;
  }

  function renderSkewbRotated(state, rotX, rotY, mono, outlined, config) {
    const polys = [];
    const s = 3;
    const h = s / 2;

    const faceNormals = {
      U: [0, 1, 0], F: [0, 0, 1], R: [1, 0, 0],
      L: [-1, 0, 0], B: [0, 0, -1], D: [0, -1, 0],
    };

    function shrinkPoly(pts, f) {
      let cx = 0, cy = 0;
      for (let i = 0; i < pts.length; i++) { cx += pts[i][0]; cy += pts[i][1]; }
      cx /= pts.length; cy /= pts.length;
      return pts.map(function (p) { return [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f]; });
    }

    const faceTransforms = {
      U: function (x, y) { return [x, s, s - y]; },
      F: function (x, y) { return [x, s - y, s]; },
      R: function (x, y) { return [s, s - y, s - x]; },
      L: function (x, y) { return [0, s - y, x]; },
      B: function (x, y) { return [s - x, s - y, 0]; },
      D: function (x, y) { return [x, 0, s - y]; },
    };

    function projectSkewbPoint(x, y, z) {
      const rot = rotate3D(x - h, y - h, z - h, rotX, rotY);
      return {
        screen: projectIso(rot[0] + h, rot[1] + h, rot[2] + h),
        depth: rot[0] + rot[1] + rot[2],
      };
    }

    function addSkewbFaceRotated(faceState, transform) {
      const cx = s / 2, cy = s / 2;
      const triCorners = [
        { idx: 1, pts: [[0, 0], [cx, 0], [0, cy]] },
        { idx: 2, pts: [[s, 0], [s, cy], [cx, 0]] },
        { idx: 3, pts: [[s, s], [cx, s], [s, cy]] },
        { idx: 4, pts: [[0, s], [0, cy], [cx, s]] },
      ];

      function pushPoly(pts, color) {
        const shrunk = shrinkPoly(pts, 0.88);
        let dSum = 0;
        const projected = shrunk.map(function (p) {
          const t = transform(p[0], p[1]);
          const pr = projectSkewbPoint(t[0], t[1], t[2]);
          dSum += pr.depth;
          return pr.screen;
        });
        polys.push({ pts: projected, color: color, depth: dSum / shrunk.length });
      }

      triCorners.forEach(function (tri) {
        pushPoly(tri.pts, faceState[tri.idx]);
      });

      const centerPts = [[cx, 0], [s, cy], [cx, s], [0, cy]];
      pushPoly(centerPts, faceState[0]);
    }

    const faceNames = ["U", "F", "R", "L", "B", "D"];
    const visible = [];
    for (let fi = 0; fi < faceNames.length; fi++) {
      const fn = faceNames[fi];
      const n = faceNormals[fn];
      const rn = rotate3D(n[0], n[1], n[2], rotX, rotY);
      const dot = rn[0] + rn[1] + rn[2];
      if (dot > 0.05) visible.push({ name: fn, depth: dot });
    }
    visible.sort(function (a, b) { return a.depth - b.depth; });

    for (let vi = 0; vi < visible.length; vi++) {
      const faceName = visible[vi].name;
      if (state[faceName]) {
        addSkewbFaceRotated(state[faceName], faceTransforms[faceName]);
      }
    }

    polys.sort(function (a, b) { return a.depth - b.depth; });
    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 0.3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const skRx = getRounded(config, 2);
    polys.forEach(function (p) {
      svg += polygon(p.pts, skewbColorFor(p.color, mono, outlined, config), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.06), skRx);
    });
    svg += "</svg>";
    return svg;
  }

  // ─── Pyraminx State Engine ───

  function createPyraminxState() {
    return {
      U: ["W", "W", "W", "W", "W", "W", "W", "W", "W"],
      F: ["G", "G", "G", "G", "G", "G", "G", "G", "G"],
      R: ["B", "B", "B", "B", "B", "B", "B", "B", "B"],
      L: ["R", "R", "R", "R", "R", "R", "R", "R", "R"],
      D: ["Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
    };
  }

  function generatePyraminxScramble() {
    const moves = ["U", "L", "R", "B"];
    const mods = ["", "'"];
    let scramble = [];
    let last = "";
    for (let i = 0; i < 10; i++) {
      let m;
      do { m = moves[Math.floor(Math.random() * moves.length)]; } while (m === last);
      last = m;
      scramble.push(m + mods[Math.floor(Math.random() * mods.length)]);
    }
    const tips = ["u", "l", "r", "b"];
    for (let i = 0; i < 4; i++) {
      if (Math.random() < 0.5) {
        scramble.push(tips[i] + mods[Math.floor(Math.random() * mods.length)]);
      }
    }
    return scramble.join(" ");
  }

  function applyPyraminxMove(state, move) {
    let m = move.trim().replace(/[\u2018\u2019\u0060\u00B4]/g, "'");
    if (!m) return state;
    let prime = m.endsWith("'");
    if (prime) m = m.slice(0, -1);
    let s = state;

    function cyc(arr, rev) {
      const a = arr[0], b = arr[1], c = arr[2];
      if (rev) {
        let t = s[a[0]][a[1]];
        s[a[0]][a[1]] = s[b[0]][b[1]];
        s[b[0]][b[1]] = s[c[0]][c[1]];
        s[c[0]][c[1]] = t;
      } else {
        let t = s[a[0]][a[1]];
        s[a[0]][a[1]] = s[c[0]][c[1]];
        s[c[0]][c[1]] = s[b[0]][b[1]];
        s[b[0]][b[1]] = t;
      }
    }

    let cycles;
    if (m === "U" || m === "u") {
      cycles = [[["F",0],["R",4],["L",8]]];
      if (m === "U") {
        cycles.push([["F",1],["R",1],["L",6]]);
        cycles.push([["F",3],["R",6],["L",3]]);
        cycles.push([["F",2],["R",5],["L",7]]);
      }
    } else if (m === "R" || m === "r") {
      cycles = [[["F",8],["D",4],["R",0]]];
      if (m === "R") {
        cycles.push([["F",3],["D",6],["R",3]]);
        cycles.push([["R",1],["F",6],["D",1]]);
        cycles.push([["F",7],["D",5],["R",2]]);
      }
    } else if (m === "L" || m === "l") {
      cycles = [[["F",4],["L",0],["D",8]]];
      if (m === "L") {
        cycles.push([["F",1],["L",1],["D",6]]);
        cycles.push([["L",3],["D",3],["F",6]]);
        cycles.push([["F",5],["L",2],["D",7]]);
      }
    } else if (m === "B" || m === "b") {
      cycles = [[["R",8],["D",0],["L",4]]];
      if (m === "B") {
        cycles.push([["R",6],["D",1],["L",1]]);
        cycles.push([["R",3],["D",3],["L",6]]);
        cycles.push([["R",7],["D",2],["L",5]]);
      }
    } else {
      return state;
    }

    for (let i = 0; i < cycles.length; i++) cyc(cycles[i], !prime);
    return state;
  }

  function applyPyraminxAlgorithm(state, alg) {
    const moves = alg.trim().split(/\s+/);
    for (let i = 0; i < moves.length; i++) {
      applyPyraminxMove(state, moves[i]);
    }
    return state;
  }

  function renderPyraminx(angle, state, mono, outlined, config) {
    const polys = [];
    let s = 100;
    const h = s * Math.sqrt(3) / 2;

    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

    function shrink(pts, f) {
      let cx = 0, cy = 0;
      for (let i = 0; i < pts.length; i++) { cx += pts[i][0]; cy += pts[i][1]; }
      cx /= pts.length; cy /= pts.length;
      return pts.map(function (p) { return [cx + (p[0] - cx) * f, cy + (p[1] - cy) * f]; });
    }

    function addPyraminxFace(fs, top, bl, br, depth) {
      let L1 = lerp(top, bl, 1 / 3), L2 = lerp(top, bl, 2 / 3);
      let R1 = lerp(top, br, 1 / 3), R2 = lerp(top, br, 2 / 3);
      let B1 = lerp(bl, br, 1 / 3), B2 = lerp(bl, br, 2 / 3);
      let M = lerp(L2, R2, 0.5);

      const rows = [[top], [L1, R1], [L2, M, R2], [bl, B1, B2, br]];
      const tris = [
        { pts: [rows[0][0], rows[1][0], rows[1][1]], c: fs[0] },
        { pts: [rows[1][0], rows[2][0], rows[2][1]], c: fs[1] },
        { pts: [rows[1][0], rows[2][1], rows[1][1]], c: fs[2] },
        { pts: [rows[1][1], rows[2][1], rows[2][2]], c: fs[3] },
        { pts: [rows[2][0], rows[3][0], rows[3][1]], c: fs[4] },
        { pts: [rows[2][0], rows[3][1], rows[2][1]], c: fs[5] },
        { pts: [rows[2][1], rows[3][1], rows[3][2]], c: fs[6] },
        { pts: [rows[2][1], rows[3][2], rows[2][2]], c: fs[7] },
        { pts: [rows[2][2], rows[3][2], rows[3][3]], c: fs[8] },
      ];

      for (let i = 0; i < tris.length; i++) {
        polys.push({ pts: shrink(tris[i].pts, 0.92), color: tris[i].c, depth: depth });
      }
    }

    if (angle === "front") {
      addPyraminxFace(state.F, [s / 2, 0], [0, h], [s, h], 0);
    } else if (angle === "iso" || angle === "net") {
      const g = s * 0.06;
      const gx = g * Math.sqrt(3) / 2;
      const gy = g / 2;
      addPyraminxFace(state.F, [s / 2, 0], [0, h], [s, h], 0);
      addPyraminxFace(state.R, [s + gx, h - gy], [s / 2 + gx, -gy], [s * 1.5 + gx, -gy], 1);
      addPyraminxFace(state.L, [-gx, h - gy], [-s / 2 - gx, -gy], [s / 2 - gx, -gy], 2);
      addPyraminxFace(state.D, [s / 2, 2 * h + g], [s, h + g], [0, h + g], 3);
    }

    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 2;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const pyRx = getRounded(config, 20);
    polys.forEach(function (p) {
      svg += polygon(p.pts, getColorValue(p.color, mono, outlined), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.8), pyRx);
    });
    svg += "</svg>";
    return svg;
  }

  function renderPyraminxRotated(state, rotX, rotY, mono, outlined, config) {
    const polys = [];
    const r = 2;
    const SHRINK = 0.92;

    function lerp3(a, b, t) {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }

    function shrink2d(pts, f) {
      let pcx = 0, pcy = 0;
      for (let i = 0; i < pts.length; i++) { pcx += pts[i][0]; pcy += pts[i][1]; }
      pcx /= pts.length; pcy /= pts.length;
      return pts.map(function (p) { return [pcx + (p[0] - pcx) * f, pcy + (p[1] - pcy) * f]; });
    }

    // Regular tetrahedron vertices centered at origin
    const sq2 = Math.sqrt(2), sq3 = Math.sqrt(3);
    const V = {
      T:  [0, r, 0],
      FL: [-r * sq2 / sq3, -r / 3, r * sq2 / 3],
      FR: [r * sq2 / sq3, -r / 3, r * sq2 / 3],
      B:  [0, -r / 3, -r * 2 * sq2 / 3],
    };

    // 4 faces of the tetrahedron: [tip_vertex, base_left, base_right]
    // Sticker layout: 0=tip, 4=bottom-left corner, 8=bottom-right corner
    // Mapping derived from applyPyraminxMove cycle analysis:
    //   F[0]=T, F[4]=FL, F[8]=FR
    //   R[0]=FR, R[4]=T, R[8]=B
    //   L[0]=FL, L[4]=B, L[8]=T
    //   D[0]=B, D[4]=FR, D[8]=FL
    const faceVerts = {
      F: ["T", "FL", "FR"],
      R: ["FR", "T", "B"],
      L: ["FL", "B", "T"],
      D: ["B", "FR", "FL"],
    };

    function addPyraRotatedFace(faceState, top, bl, br) {
      const L1 = lerp3(top, bl, 1 / 3), L2 = lerp3(top, bl, 2 / 3);
      const R1 = lerp3(top, br, 1 / 3), R2 = lerp3(top, br, 2 / 3);
      const B1 = lerp3(bl, br, 1 / 3), B2 = lerp3(bl, br, 2 / 3);
      const M = lerp3(L2, R2, 0.5);

      const rows = [[top], [L1, R1], [L2, M, R2], [bl, B1, B2, br]];
      const tris = [
        { pts: [rows[0][0], rows[1][0], rows[1][1]], c: faceState[0] },
        { pts: [rows[1][0], rows[2][0], rows[2][1]], c: faceState[1] },
        { pts: [rows[1][0], rows[2][1], rows[1][1]], c: faceState[2] },
        { pts: [rows[1][1], rows[2][1], rows[2][2]], c: faceState[3] },
        { pts: [rows[2][0], rows[3][0], rows[3][1]], c: faceState[4] },
        { pts: [rows[2][0], rows[3][1], rows[2][1]], c: faceState[5] },
        { pts: [rows[2][1], rows[3][1], rows[3][2]], c: faceState[6] },
        { pts: [rows[2][1], rows[3][2], rows[2][2]], c: faceState[7] },
        { pts: [rows[2][2], rows[3][2], rows[3][3]], c: faceState[8] },
      ];

      for (let i = 0; i < tris.length; i++) {
        let zSum = 0;
        const projected = tris[i].pts.map(function (p) {
          const rot = rotate3D(p[0], p[1], p[2], rotX, rotY);
          zSum += rot[2];
          return [rot[0], -rot[1]];
        });
        polys.push({ pts: shrink2d(projected, SHRINK), color: tris[i].c, depth: zSum / 3 });
      }
    }

    // Visibility by face center direction (outward normal for centrosymmetric solid)
    const faceNames = ["F", "R", "L", "D"];
    const visible = [];
    for (let fi = 0; fi < faceNames.length; fi++) {
      const fn = faceNames[fi];
      const vn = faceVerts[fn];
      const tip = V[vn[0]], bl = V[vn[1]], br = V[vn[2]];
      const cx = (tip[0] + bl[0] + br[0]) / 3;
      const cy = (tip[1] + bl[1] + br[1]) / 3;
      const cz = (tip[2] + bl[2] + br[2]) / 3;
      const rc = rotate3D(cx, cy, cz, rotX, rotY);
      if (rc[2] > 0.01) {
        visible.push({ name: fn, depth: rc[2] });
      }
    }
    visible.sort(function (a, b) { return a.depth - b.depth; });

    for (let vi = 0; vi < visible.length; vi++) {
      const faceName = visible[vi].name;
      const vn = faceVerts[faceName];
      addPyraRotatedFace(state[faceName], V[vn[0]], V[vn[1]], V[vn[2]]);
    }

    polys.sort(function (a, b) { return a.depth - b.depth; });

    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 0.3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const pyRx = getRounded(config, 1.5);
    polys.forEach(function (p) {
      svg += polygon(p.pts, getColorValue(p.color, mono, outlined), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.04), pyRx);
    });
    svg += "</svg>";
    return svg;
  }

  // ─── Megaminx State Engine ───

  function createMegaminxState() {
    const colors = ["W", "G", "R", "B", "Y", "P", "Gy", "Lb", "Be", "Pk", "Lg", "O"];
    let state = {};
    const faceNames = ["U", "F", "R", "BR", "BL", "L", "D", "DL", "DR", "DBR", "B", "DBL"];
    for (let i = 0; i < 12; i++) {
      state[faceNames[i]] = [];
      for (let j = 0; j < 11; j++) {
        state[faceNames[i]][j] = colors[i];
      }
    }
    return state;
  }

  function generateMegaminxScramble() {
    let scramble = [];
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 5; j++) {
        scramble.push((Math.random() < 0.5 ? "R" : "R'") + (Math.random() < 0.5 ? " D" : " D'"));
      }
      scramble.push(Math.random() < 0.5 ? "U" : "U'");
    }
    return scramble.join(" ");
  }

  // Megaminx adjacency: for each face, the 5 neighbors CW and the shared-edge
  // sticker indices on each neighbor. Layout: [0]=center, [1,3,5,7,9]=corners, [2,4,6,8,10]=edges.
  // Rotating face CW by 72°: corners cycle 1→3→5→7→9→1, edges cycle 2→4→6→8→10→2.
  // The 5 neighbors each share 3 stickers with the face (corner, edge, corner).

  const MEGA_ADJ = {
    U:  [["F",1,2,3],  ["R",1,2,3],  ["BR",1,2,3], ["BL",1,2,3], ["L",1,2,3]],
    F:  [["U",7,8,9],  ["R",10,9,8], ["DR",1,2,3],  ["DL",5,4,3], ["L",8,9,10]],
    R:  [["U",9,10,1], ["BR",10,9,8],["DBR",1,2,3], ["DR",5,4,3], ["F",8,9,10]],
    BR: [["U",1,2,3],  ["BL",10,9,8],["B",1,2,3], ["DBR",5,4,3],["R",8,9,10]],
    BL: [["U",3,4,5],  ["L",10,9,8], ["DBL",1,2,3],  ["B",5,4,3],["BR",8,9,10]],
    L:  [["U",5,6,7],  ["F",10,9,8], ["DL",1,2,3],  ["DBL",5,4,3], ["BL",8,9,10]],
    D:  [["DR",7,8,9], ["DBR",7,8,9],["B",7,8,9], ["DBL",7,8,9], ["DL",7,8,9]],
    DL: [["L",7,8,9],  ["F",6,7,8],  ["DR",6,5,4],  ["D",9,10,1], ["DBL",10,9,8]],
    DR: [["F",7,8,9],  ["R",6,7,8],  ["DBR",6,5,4], ["D",1,2,3],  ["DL",10,9,8]],
    DBR:[["R",7,8,9],  ["BR",6,7,8], ["B",6,5,4], ["D",3,4,5],  ["DR",10,9,8]],
    B:[["BR",7,8,9], ["BL",6,7,8], ["DBL",6,5,4],  ["D",5,6,7],  ["DBR",10,9,8]],
    DBL: [["BL",7,8,9], ["L",6,7,8],  ["DL",6,5,4],  ["D",7,8,9],  ["B",10,9,8]],
  };

  function megaFaceRotateCW(state, face) {
    const f = state[face];
    const s = f.slice();
    f[1]=s[9]; f[2]=s[10]; f[3]=s[1]; f[4]=s[2];
    f[5]=s[3]; f[6]=s[4];  f[7]=s[5]; f[8]=s[6];
    f[9]=s[7]; f[10]=s[8];
    const adj = MEGA_ADJ[face];
    const buf = [];
    for (let i = 0; i < 5; i++) {
      const nb = adj[i];
      const fn = nb[0];
      const l1 = megaNetVisToLog(fn, nb[1]);
      const l2 = megaNetVisToLog(fn, nb[2]);
      const l3 = megaNetVisToLog(fn, nb[3]);
      buf.push([state[fn][l1], state[fn][l2], state[fn][l3]]);
    }
    for (let i = 0; i < 5; i++) {
      const src = buf[(i + 4) % 5];
      const nb = adj[i];
      const fn = nb[0];
      const l1 = megaNetVisToLog(fn, nb[1]);
      const l2 = megaNetVisToLog(fn, nb[2]);
      const l3 = megaNetVisToLog(fn, nb[3]);
      state[fn][l1] = src[0];
      state[fn][l2] = src[1];
      state[fn][l3] = src[2];
    }
  }

  let _megaPochData = {"derived":{"R++":{"cp":[19,15,14,3,4,18,16,5,8,9,17,10,0,13,12,7,11,6,1,2],"co":[3,4,5,0,0,2,1,4,0,0,1,4,2,0,3,1,1,2,4,3],"ep":[24,25,20,10,4,29,26,11,8,9,17,23,28,27,21,12,5,0,18,19,16,22,13,1,3,7,15,14,6,2],"eo":[1,1,0,1,0,1,0,1,0,0,1,1,0,0,0,1,0,1,0,0,0,1,1,1,0,0,0,0,1,1],"centers":{"U":"Lb","F":"O","R":"Gy","BR":"Be","BL":"G","L":"P","D":"B","DL":"Y","DR":"Lg","DBR":"Pk","B":"R","DBL":"W"}},"R--":{"cp":[12,18,19,3,4,7,17,15,8,9,11,16,14,13,2,1,6,10,5,0],"co":[2,3,4,0,0,3,2,1,0,0,3,1,4,0,5,3,1,1,2,4],"ep":[17,23,29,24,4,16,28,25,8,9,3,7,15,22,27,26,20,10,18,19,2,14,21,11,0,1,6,13,12,5],"eo":[1,1,1,0,0,0,1,0,0,0,1,1,1,1,0,0,0,1,0,0,0,0,1,1,1,1,0,0,0,1],"centers":{"U":"O","F":"Y","R":"Lg","BR":"Gy","BL":"Lb","L":"P","D":"R","DL":"W","DR":"B","DBR":"Pk","B":"Be","DBL":"G"}},"D++":{"cp":[0,1,2,3,4,8,9,5,6,7,13,14,10,11,12,18,19,15,16,17],"co":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"ep":[0,1,2,3,4,8,9,5,6,7,16,17,18,19,10,11,12,13,14,15,23,24,20,21,22,28,29,25,26,27],"eo":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"centers":{"U":"W","F":"Y","R":"P","BR":"G","BL":"R","L":"B","D":"Gy","DL":"Lg","DR":"O","DBR":"Lb","B":"Be","DBL":"Pk"}},"D--":{"cp":[0,1,2,3,4,7,8,9,5,6,12,13,14,10,11,17,18,19,15,16],"co":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"ep":[0,1,2,3,4,7,8,9,5,6,14,15,16,17,18,19,10,11,12,13,22,23,24,20,21,27,28,29,25,26],"eo":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"centers":{"U":"W","F":"B","R":"Y","BR":"P","BL":"G","L":"R","D":"Gy","DL":"Pk","DR":"Lg","DBR":"O","B":"Lb","DBL":"Be"}}},"cornerHomeColors":[["W","G","R"],["W","R","B"],["W","B","Y"],["W","Y","P"],["W","P","G"],["G","R","Be"],["R","B","Pk"],["B","Y","Lg"],["Y","P","O"],["P","G","Lb"],["R","Pk","Be"],["B","Lg","Pk"],["Y","O","Lg"],["P","Lb","O"],["G","Be","Lb"],["Gy","Be","Lb"],["Gy","Pk","Be"],["Gy","Lg","Pk"],["Gy","O","Lg"],["Gy","Lb","O"]],"edgeHomeColors":[["W","G"],["W","R"],["W","B"],["W","Y"],["W","P"],["G","R"],["R","B"],["B","Y"],["Y","P"],["P","G"],["G","Lb"],["G","Be"],["R","Be"],["R","Pk"],["B","Pk"],["B","Lg"],["Y","Lg"],["Y","O"],["P","O"],["P","Lb"],["Lb","Be"],["Be","Pk"],["Pk","Lg"],["Lg","O"],["O","Lb"],["Gy","Lb"],["Gy","Be"],["Gy","Pk"],["Gy","Lg"],["Gy","O"]],"cornerSlots":[{"faces":["U","F","R"],"idx":[3,3,1]},{"faces":["U","R","BR"],"idx":[5,3,1]},{"faces":["U","BR","BL"],"idx":[7,3,1]},{"faces":["U","BL","L"],"idx":[9,3,1]},{"faces":["U","L","F"],"idx":[1,3,1]},{"faces":["F","R","DR"],"idx":[5,9,3]},{"faces":["R","BR","DBR"],"idx":[5,9,3]},{"faces":["BR","BL","B"],"idx":[5,9,3]},{"faces":["BL","L","DBL"],"idx":[5,9,3]},{"faces":["L","F","DL"],"idx":[5,9,3]},{"faces":["R","DBR","DR"],"idx":[7,1,5]},{"faces":["BR","B","DBR"],"idx":[7,1,5]},{"faces":["BL","DBL","B"],"idx":[7,1,5]},{"faces":["L","DL","DBL"],"idx":[7,1,5]},{"faces":["F","DR","DL"],"idx":[7,1,5]},{"faces":["D","DR","DL"],"idx":[1,9,7]},{"faces":["D","DBR","DR"],"idx":[3,9,7]},{"faces":["D","B","DBR"],"idx":[5,9,7]},{"faces":["D","DBL","B"],"idx":[7,9,7]},{"faces":["D","DL","DBL"],"idx":[9,9,7]}],"edgeSlots":[{"faces":["U","F"],"idx":[2,2]},{"faces":["U","R"],"idx":[4,2]},{"faces":["U","BR"],"idx":[6,2]},{"faces":["U","BL"],"idx":[8,2]},{"faces":["U","L"],"idx":[10,2]},{"faces":["F","R"],"idx":[4,10]},{"faces":["R","BR"],"idx":[4,10]},{"faces":["BR","BL"],"idx":[4,10]},{"faces":["BL","L"],"idx":[4,10]},{"faces":["L","F"],"idx":[4,10]},{"faces":["F","DL"],"idx":[8,4]},{"faces":["F","DR"],"idx":[6,2]},{"faces":["R","DR"],"idx":[8,4]},{"faces":["R","DBR"],"idx":[6,2]},{"faces":["BR","DBR"],"idx":[8,4]},{"faces":["BR","B"],"idx":[6,2]},{"faces":["BL","B"],"idx":[8,4]},{"faces":["BL","DBL"],"idx":[6,2]},{"faces":["L","DBL"],"idx":[8,4]},{"faces":["L","DL"],"idx":[6,2]},{"faces":["DL","DR"],"idx":[6,10]},{"faces":["DR","DBR"],"idx":[6,10]},{"faces":["DBR","B"],"idx":[6,10]},{"faces":["B","DBL"],"idx":[6,10]},{"faces":["DBL","DL"],"idx":[6,10]},{"faces":["D","DL"],"idx":[10,8]},{"faces":["D","DR"],"idx":[2,8]},{"faces":["D","DBR"],"idx":[4,8]},{"faces":["D","B"],"idx":[6,8]},{"faces":["D","DBL"],"idx":[8,8]}],"CORNERS":[["U","F","R"],["U","R","BR"],["U","BR","BL"],["U","BL","L"],["U","L","F"],["F","R","DR"],["R","BR","DBR"],["BR","BL","B"],["BL","L","DBL"],["L","F","DL"],["R","DBR","DR"],["BR","B","DBR"],["BL","DBL","B"],["L","DL","DBL"],["F","DR","DL"],["D","DR","DL"],["D","DBR","DR"],["D","B","DBR"],["D","DBL","B"],["D","DL","DBL"]],"EDGES":[["U","F"],["U","R"],["U","BR"],["U","BL"],["U","L"],["F","R"],["R","BR"],["BR","BL"],["BL","L"],["L","F"],["F","DL"],["F","DR"],["R","DR"],["R","DBR"],["BR","DBR"],["BR","B"],["BL","B"],["BL","DBL"],["L","DBL"],["L","DL"],["DL","DR"],["DR","DBR"],["DBR","B"],["B","DBL"],["DBL","DL"],["D","DL"],["D","DR"],["D","DBR"],["D","B"],["D","DBL"]],"FACES":["U","F","R","BR","BL","L","D","DL","DR","DBR","B","DBL"],"perms3":[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]],"colorToFace":{"W":"U","G":"F","R":"R","B":"BR","Y":"BL","P":"L","Gy":"D","Lb":"DL","Be":"DR","Pk":"DBR","Lg":"B","O":"DBL"}};

  function _megaFindPiece(homeColors, cols) {
    let s = cols.slice().sort().join(",");
    for (let i = 0; i < homeColors.length; i++) {
      if (homeColors[i].slice().sort().join(",") === s) return i;
    }
    return -1;
  }

  function _megaFindCornerOri(d, piece, cols) {
    let home = d.cornerHomeColors[piece];
    let perms3 = d.perms3;
    for (let pi = 0; pi < 6; pi++) {
      let perm = perms3[pi];
      let ok = true;
      for (let j = 0; j < 3; j++) if (home[perm[j]] !== cols[j]) { ok = false; break; }
      if (ok) return pi;
    }
    return 0;
  }

  function _megaFindEdgeOri(d, piece, cols) {
    let home = d.edgeHomeColors[piece];
    if (home[0] === cols[0] && home[1] === cols[1]) return 0;
    if (home[0] === cols[1] && home[1] === cols[0]) return 1;
    return 0;
  }

  function _megaStickersToPieces(state) {
    let d = _megaPochData;
    let corners = new Array(20);
    let edges = new Array(30);
    let centers = {};
    for (let pos = 0; pos < 20; pos++) {
      let slot = d.cornerSlots[pos];
      let cols = slot.faces.map(function(f, j) { return state[f][slot.idx[j]]; });
      let piece = _megaFindPiece(d.cornerHomeColors, cols);
      corners[pos] = { piece: piece, ori: _megaFindCornerOri(d, piece, cols) };
    }
    for (let pos = 0; pos < 30; pos++) {
      let slot = d.edgeSlots[pos];
      let cols = slot.faces.map(function(f, j) { return state[f][slot.idx[j]]; });
      let piece = _megaFindPiece(d.edgeHomeColors, cols);
      edges[pos] = { piece: piece, ori: _megaFindEdgeOri(d, piece, cols) };
    }
    for (let fi = 0; fi < d.FACES.length; fi++) {
      let f = d.FACES[fi];
      centers[f] = state[f][0];
    }
    return { corners: corners, edges: edges, centers: centers };
  }

  function _megaComposeOri(d, ofrom, oto) {
    let q = d.perms3[ofrom];
    let p = d.perms3[oto];
    let r = [p[q[0]], p[q[1]], p[q[2]]];
    for (let i = 0; i < 6; i++) {
      let x = d.perms3[i];
      if (x[0] === r[0] && x[1] === r[1] && x[2] === r[2]) return i;
    }
    return 0;
  }

  function _megaApplyPochPS(ps, mv) {
    let d = _megaPochData;
    let m = d.derived[mv];
    if (!m) return ps;
    let pieceDest = new Array(20);
    let edgeDest = new Array(30);
    for (let to = 0; to < 20; to++) pieceDest[m.cp[to]] = to;
    for (let to = 0; to < 30; to++) edgeDest[m.ep[to]] = to;
    let nc = new Array(20);
    let ne = new Array(30);
    for (let from = 0; from < 20; from++) {
      let to = pieceDest[from];
      nc[to] = {
        piece: ps.corners[from].piece,
        ori: _megaComposeOri(d, ps.corners[from].ori, m.co[to]),
      };
    }
    for (let from = 0; from < 30; from++) {
      let to = edgeDest[from];
      ne[to] = {
        piece: ps.edges[from].piece,
        ori: (ps.edges[from].ori + m.eo[to]) % 2,
      };
    }
    let ncen = {};
    for (let fi = 0; fi < d.FACES.length; fi++) {
      let toF = d.FACES[fi];
      let fromF = d.colorToFace[m.centers[toF]];
      ncen[toF] = ps.centers[fromF];
    }
    return { corners: nc, edges: ne, centers: ncen };
  }

  function _megaPiecesToStickers(ps) {
    let d = _megaPochData;
    let st = {};
    for (let fi = 0; fi < d.FACES.length; fi++) st[d.FACES[fi]] = new Array(11);
    for (let fi = 0; fi < d.FACES.length; fi++) {
      let f = d.FACES[fi];
      st[f][0] = ps.centers[f];
      for (let j = 1; j < 11; j++) st[f][j] = null;
    }
    for (let pos = 0; pos < 20; pos++) {
      let p = ps.corners[pos];
      let perm = d.perms3[p.ori];
      let slot = d.cornerSlots[pos];
      for (let j = 0; j < 3; j++) {
        let f = d.CORNERS[pos][j];
        st[f][slot.idx[j]] = d.cornerHomeColors[p.piece][perm[j]];
      }
    }
    for (let pos = 0; pos < 30; pos++) {
      let p = ps.edges[pos];
      let swap = p.ori === 1;
      let slot = d.edgeSlots[pos];
      for (let j = 0; j < 2; j++) {
        let f = d.EDGES[pos][j];
        st[f][slot.idx[j]] = d.edgeHomeColors[p.piece][swap ? 1 - j : j];
      }
    }
    return st;
  }

  function megaApplyPochmannMove(state, mv) {
    let ps = _megaStickersToPieces(state);
    ps = _megaApplyPochPS(ps, mv);
    let st = _megaPiecesToStickers(ps);
    for (let fi = 0; fi < _megaPochData.FACES.length; fi++) {
      let f = _megaPochData.FACES[fi];
      state[f] = st[f];
    }
    return state;
  }

  function megaRotateFaceStickers(arr, clicks) {
    let f = arr.slice();
    let count = ((clicks % 5) + 5) % 5;
    for (let t = 0; t < count; t++) {
      let sf = f.slice();
      f[1] = sf[9]; f[2] = sf[10]; f[3] = sf[1]; f[4] = sf[2];
      f[5] = sf[3]; f[6] = sf[4]; f[7] = sf[5]; f[8] = sf[6];
      f[9] = sf[7]; f[10] = sf[8];
    }
    return f;
  }

  function megaNetRotStickers(arr, clicks) {
    let c = ((clicks % 5) + 5) % 5;
    if (c === 0) return arr;
    let r = [arr[0]];
    for (let i = 1; i <= 10; i++) r.push(arr[((i - 1 + c * 2) % 10) + 1]);
    return r;
  }

  // Net shift maps visual slot -> logical sticker: idx = ((vis-1 + shift*2) % 10) + 1
  // Must match _movement_mapper.html mapIdx() exactly.
  function megaNetLogicalIdx(visualIdx, shift) {
    if (visualIdx === 0) return 0;
    return ((visualIdx - 1 + shift * 2) % 10) + 1;
  }

  // Frozen net layout — same shifts as _movement_mapper.html buildFaceConfigs().
  function buildMegaNetFaceConfigs() {
    let R = 28;
    let step = 2 * Math.PI / 5;
    let d = 2 * R * Math.cos(Math.PI / 5);
    let alphaU = 3 * Math.PI / 10;
    let alphaD = -7 * Math.PI / 10;
    let uNeighbors = ["F", "L", "BL", "BR", "R"];
    let dNeighbors = ["B", "DBL", "DL", "DR", "DBR"];
    let petalAnglesU = [];
    let petalAnglesD = [];
    for (let k = 0; k < 5; k++) {
      petalAnglesU.push(alphaU + k * step + step / 2);
      petalAnglesD.push(alphaD + k * step + step / 2);
    }
    let maxRightU = 0;
    let maxLeftD = 0;
    for (let k = 0; k < 5; k++) {
      let extU = d * Math.cos(petalAnglesU[k]) + R;
      if (extU > maxRightU) maxRightU = extU;
      let extD = -(d * Math.cos(petalAnglesD[k]) - R);
      if (extD > maxLeftD) maxLeftD = extD;
    }
    let sep = maxRightU + maxLeftD + R * 0.3;
    let uCx = -sep / 2;
    let uCy = 0;
    let dCx = sep / 2 - R * 0.3;
    let dCy = R * 0.5;
    let cfgs = [];
    cfgs.push({ face: "U", cx: uCx, cy: uCy, sa: alphaU, shift: 3 });
    for (let k = 0; k < 5; k++) {
      let maU = alphaU + k * step + step / 2;
      cfgs.push({
        face: uNeighbors[k],
        cx: uCx + d * Math.cos(maU),
        cy: uCy + d * Math.sin(maU),
        sa: alphaU + k * step + Math.PI,
        shift: 0,
      });
    }
    cfgs.push({ face: "D", cx: dCx, cy: dCy, sa: alphaD, shift: 0 });
    for (let k = 0; k < 5; k++) {
      let maD = alphaD + k * step + step / 2;
      cfgs.push({
        face: dNeighbors[k],
        cx: dCx + d * Math.cos(maD),
        cy: dCy + d * Math.sin(maD),
        sa: alphaD + k * step + Math.PI,
        shift: 3,
      });
    }
    return cfgs;
  }

  let _megaNetFaceConfigs = null;
  function getMegaNetFaceConfigs() {
    if (!_megaNetFaceConfigs) _megaNetFaceConfigs = buildMegaNetFaceConfigs();
    return _megaNetFaceConfigs;
  }

  function megaNetFaceStickers(arr, fc) {
    return megaNetRotStickers(arr, fc.shift || 0);
  }

  function megaURingRotateCW(state, clicks) {
    let count = ((clicks % 5) + 5) % 5;
    if (count === 0) return;
    let adj = MEGA_ADJ.U;
    for (let t = 0; t < count; t++) {
      let buf = [];
      for (let i = 0; i < 5; i++) {
        let nb = adj[i];
        buf.push([state[nb[0]][nb[1]], state[nb[0]][nb[2]], state[nb[0]][nb[3]]]);
      }
      for (let i = 0; i < 5; i++) {
        let src = buf[(i + 4) % 5];
        let nb = adj[i];
        state[nb[0]][nb[1]] = src[0];
        state[nb[0]][nb[2]] = src[1];
        state[nb[0]][nb[3]] = src[2];
      }
    }
  }

  // ── Sticker-cycle engine (visual net indices) ───────────────────────────
  // Faces rendered with shift=3 in the net: logical = ((vis-1+6)%10)+1
  let _megaNetShift3 = {U:1,DL:1,DR:1,DBR:1,B:1,DBL:1};
  function megaNetVisToLog(face, vis) {
    if (vis === 0) return 0;
    if (!_megaNetShift3[face]) return vis;
    return ((vis - 1 + 6) % 10) + 1;
  }

  let _megaCycleDefs = {
    "R++":[[{"f":"DL","v":0},{"f":"U","v":0},{"f":"DBL","v":0},{"f":"F","v":0},{"f":"BL","v":0}],[{"f":"DL","v":8},{"f":"U","v":6},{"f":"DBL","v":10},{"f":"F","v":2},{"f":"BL","v":6}],[{"f":"DL","v":4},{"f":"U","v":2},{"f":"DBL","v":6},{"f":"F","v":8},{"f":"BL","v":2}],[{"f":"DL","v":3},{"f":"U","v":1},{"f":"DBL","v":5},{"f":"F","v":7},{"f":"BL","v":1}],[{"f":"DL","v":2},{"f":"U","v":10},{"f":"DBL","v":4},{"f":"F","v":6},{"f":"BL","v":10}],[{"f":"DL","v":1},{"f":"U","v":9},{"f":"DBL","v":3},{"f":"F","v":5},{"f":"BL","v":9}],[{"f":"DL","v":10},{"f":"U","v":8},{"f":"DBL","v":2},{"f":"F","v":4},{"f":"BL","v":8}],[{"f":"DL","v":9},{"f":"U","v":7},{"f":"DBL","v":1},{"f":"F","v":3},{"f":"BL","v":7}],[{"f":"D","v":0},{"f":"R","v":0},{"f":"B","v":0},{"f":"DR","v":0},{"f":"BR","v":0}],[{"f":"D","v":8},{"f":"R","v":4},{"f":"B","v":2},{"f":"DR","v":8},{"f":"BR","v":6}],[{"f":"D","v":2},{"f":"R","v":8},{"f":"B","v":6},{"f":"DR","v":2},{"f":"BR","v":10}],[{"f":"D","v":1},{"f":"R","v":7},{"f":"B","v":5},{"f":"DR","v":1},{"f":"BR","v":9}],[{"f":"D","v":10},{"f":"R","v":6},{"f":"B","v":4},{"f":"DR","v":10},{"f":"BR","v":8}],[{"f":"D","v":9},{"f":"R","v":5},{"f":"B","v":3},{"f":"DR","v":9},{"f":"BR","v":7}],[{"f":"D","v":3},{"f":"R","v":9},{"f":"B","v":7},{"f":"DR","v":3},{"f":"BR","v":1}],[{"f":"D","v":4},{"f":"R","v":10},{"f":"B","v":8},{"f":"DR","v":4},{"f":"BR","v":2}],[{"f":"D","v":5},{"f":"R","v":1},{"f":"B","v":9},{"f":"DR","v":5},{"f":"BR","v":3}],[{"f":"D","v":6},{"f":"R","v":2},{"f":"B","v":10},{"f":"DR","v":6},{"f":"BR","v":4}],[{"f":"D","v":7},{"f":"R","v":3},{"f":"B","v":1},{"f":"DR","v":7},{"f":"BR","v":5}],[{"f":"DBR","v":1},{"f":"DBR","v":5},{"f":"DBR","v":9},{"f":"DBR","v":3},{"f":"DBR","v":7}],[{"f":"DBR","v":2},{"f":"DBR","v":6},{"f":"DBR","v":10},{"f":"DBR","v":4},{"f":"DBR","v":8}]],
    "D++":[[{"f":"BL","v":0},{"f":"F","v":0},{"f":"BR","v":0},{"f":"L","v":0},{"f":"R","v":0}],[{"f":"BL","v":4},{"f":"F","v":4},{"f":"BR","v":4},{"f":"L","v":4},{"f":"R","v":4}],[{"f":"BL","v":10},{"f":"F","v":10},{"f":"BR","v":10},{"f":"L","v":10},{"f":"R","v":10}],[{"f":"BR","v":5},{"f":"L","v":9},{"f":"R","v":5},{"f":"BL","v":5},{"f":"F","v":5}],[{"f":"BR","v":9},{"f":"L","v":5},{"f":"R","v":9},{"f":"BL","v":9},{"f":"F","v":9}],[{"f":"BL","v":7},{"f":"F","v":7},{"f":"BR","v":7},{"f":"L","v":7},{"f":"R","v":7}],[{"f":"BL","v":8},{"f":"F","v":8},{"f":"BR","v":8},{"f":"L","v":6},{"f":"R","v":8}],[{"f":"BL","v":6},{"f":"F","v":6},{"f":"BR","v":6},{"f":"L","v":8},{"f":"R","v":6}],[{"f":"DR","v":0},{"f":"B","v":0},{"f":"DL","v":0},{"f":"DBR","v":0},{"f":"DBL","v":0}],[{"f":"DR","v":10},{"f":"B","v":10},{"f":"DL","v":10},{"f":"DBR","v":10},{"f":"DBL","v":10}],[{"f":"DR","v":4},{"f":"B","v":4},{"f":"DL","v":4},{"f":"DBR","v":4},{"f":"DBL","v":4}],[{"f":"DR","v":7},{"f":"B","v":7},{"f":"DL","v":7},{"f":"DBR","v":7},{"f":"DBL","v":7}],[{"f":"DR","v":9},{"f":"B","v":9},{"f":"DL","v":9},{"f":"DBR","v":9},{"f":"DBL","v":9}],[{"f":"DR","v":5},{"f":"B","v":5},{"f":"DL","v":5},{"f":"DBR","v":5},{"f":"DBL","v":5}],[{"f":"DR","v":8},{"f":"B","v":8},{"f":"DL","v":8},{"f":"DBR","v":8},{"f":"DBL","v":8}],[{"f":"DR","v":6},{"f":"B","v":6},{"f":"DL","v":6},{"f":"DBR","v":6},{"f":"DBL","v":6}],[{"f":"DR","v":2},{"f":"B","v":2},{"f":"DL","v":2},{"f":"DBR","v":2},{"f":"DBL","v":2}],[{"f":"DR","v":3},{"f":"B","v":3},{"f":"DL","v":3},{"f":"DBR","v":3},{"f":"DBL","v":3}],[{"f":"DR","v":1},{"f":"B","v":1},{"f":"DL","v":1},{"f":"DBR","v":1},{"f":"DBL","v":1}],[{"f":"D","v":8},{"f":"D","v":2},{"f":"D","v":6},{"f":"D","v":10},{"f":"D","v":4}],[{"f":"D","v":9},{"f":"D","v":3},{"f":"D","v":7},{"f":"D","v":1},{"f":"D","v":5}]],
    "U":[[{"f":"F","v":3},{"f":"L","v":3},{"f":"BL","v":3},{"f":"BR","v":3},{"f":"R","v":3}],[{"f":"F","v":1},{"f":"L","v":1},{"f":"BL","v":1},{"f":"BR","v":1},{"f":"R","v":1}],[{"f":"F","v":2},{"f":"L","v":2},{"f":"BL","v":2},{"f":"BR","v":2},{"f":"R","v":2}],[{"f":"U","v":1},{"f":"U","v":3},{"f":"U","v":5},{"f":"U","v":7},{"f":"U","v":9}],[{"f":"U","v":2},{"f":"U","v":4},{"f":"U","v":6},{"f":"U","v":8},{"f":"U","v":10}]],
    "R":[[{"f":"R","v":3},{"f":"R","v":5},{"f":"R","v":7},{"f":"R","v":9},{"f":"R","v":1}],[{"f":"R","v":2},{"f":"R","v":4},{"f":"R","v":6},{"f":"R","v":8},{"f":"R","v":10}],[{"f":"U","v":1},{"f":"BR","v":1},{"f":"DBR","v":7},{"f":"DR","v":9},{"f":"F","v":5}],[{"f":"U","v":10},{"f":"BR","v":10},{"f":"DBR","v":6},{"f":"DR","v":8},{"f":"F","v":4}],[{"f":"U","v":9},{"f":"BR","v":9},{"f":"DBR","v":5},{"f":"DR","v":7},{"f":"F","v":3}]],
    "L":[[{"f":"BL","v":5},{"f":"U","v":5},{"f":"F","v":1},{"f":"DL","v":7},{"f":"DBL","v":9}],[{"f":"BL","v":4},{"f":"U","v":4},{"f":"F","v":10},{"f":"DL","v":6},{"f":"DBL","v":8}],[{"f":"BL","v":3},{"f":"U","v":3},{"f":"F","v":9},{"f":"DL","v":5},{"f":"DBL","v":7}],[{"f":"L","v":9},{"f":"L","v":1},{"f":"L","v":3},{"f":"L","v":5},{"f":"L","v":7}],[{"f":"L","v":10},{"f":"L","v":2},{"f":"L","v":4},{"f":"L","v":6},{"f":"L","v":8}]],
    "F":[[{"f":"L","v":5},{"f":"U","v":3},{"f":"R","v":1},{"f":"DR","v":7},{"f":"DL","v":9}],[{"f":"L","v":4},{"f":"U","v":2},{"f":"R","v":10},{"f":"DR","v":6},{"f":"DL","v":8}],[{"f":"L","v":3},{"f":"U","v":1},{"f":"R","v":9},{"f":"DR","v":5},{"f":"DL","v":7}],[{"f":"F","v":9},{"f":"F","v":1},{"f":"F","v":3},{"f":"F","v":5},{"f":"F","v":7}],[{"f":"F","v":10},{"f":"F","v":2},{"f":"F","v":4},{"f":"F","v":6},{"f":"F","v":8}]],
    "BR":[[{"f":"R","v":5},{"f":"U","v":9},{"f":"BL","v":1},{"f":"B","v":7},{"f":"DBR","v":9}],[{"f":"R","v":4},{"f":"U","v":8},{"f":"BL","v":10},{"f":"B","v":6},{"f":"DBR","v":8}],[{"f":"R","v":3},{"f":"U","v":7},{"f":"BL","v":9},{"f":"B","v":5},{"f":"DBR","v":7}],[{"f":"BR","v":9},{"f":"BR","v":1},{"f":"BR","v":3},{"f":"BR","v":5},{"f":"BR","v":7}],[{"f":"BR","v":10},{"f":"BR","v":2},{"f":"BR","v":4},{"f":"BR","v":6},{"f":"BR","v":8}]],
    "BL":[[{"f":"BR","v":5},{"f":"U","v":7},{"f":"L","v":1},{"f":"DBL","v":7},{"f":"B","v":9}],[{"f":"BR","v":4},{"f":"U","v":6},{"f":"L","v":10},{"f":"DBL","v":6},{"f":"B","v":8}],[{"f":"BR","v":3},{"f":"U","v":5},{"f":"L","v":9},{"f":"DBL","v":5},{"f":"B","v":7}],[{"f":"BL","v":9},{"f":"BL","v":1},{"f":"BL","v":3},{"f":"BL","v":5},{"f":"BL","v":7}],[{"f":"BL","v":10},{"f":"BL","v":2},{"f":"BL","v":4},{"f":"BL","v":6},{"f":"BL","v":8}]],
    "D":[[{"f":"D","v":3},{"f":"D","v":5},{"f":"D","v":7},{"f":"D","v":9},{"f":"D","v":1}],[{"f":"D","v":4},{"f":"D","v":6},{"f":"D","v":8},{"f":"D","v":10},{"f":"D","v":2}],[{"f":"B","v":1},{"f":"DBL","v":1},{"f":"DL","v":1},{"f":"DR","v":1},{"f":"DBR","v":1}],[{"f":"B","v":2},{"f":"DBL","v":2},{"f":"DL","v":2},{"f":"DR","v":2},{"f":"DBR","v":2}],[{"f":"B","v":3},{"f":"DBL","v":3},{"f":"DL","v":3},{"f":"DR","v":3},{"f":"DBR","v":3}]],
    "DL":[[{"f":"DL","v":9},{"f":"DL","v":1},{"f":"DL","v":3},{"f":"DL","v":5},{"f":"DL","v":7}],[{"f":"DL","v":10},{"f":"DL","v":2},{"f":"DL","v":4},{"f":"DL","v":6},{"f":"DL","v":8}],[{"f":"DR","v":5},{"f":"D","v":7},{"f":"DBL","v":1},{"f":"L","v":7},{"f":"F","v":9}],[{"f":"DR","v":4},{"f":"D","v":6},{"f":"DBL","v":10},{"f":"L","v":6},{"f":"F","v":8}],[{"f":"DR","v":3},{"f":"D","v":5},{"f":"DBL","v":9},{"f":"L","v":5},{"f":"F","v":7}]],
    "DR":[[{"f":"DR","v":1},{"f":"DR","v":3},{"f":"DR","v":5},{"f":"DR","v":7},{"f":"DR","v":9}],[{"f":"DR","v":2},{"f":"DR","v":4},{"f":"DR","v":6},{"f":"DR","v":8},{"f":"DR","v":10}],[{"f":"DBR","v":5},{"f":"D","v":9},{"f":"DL","v":1},{"f":"F","v":7},{"f":"R","v":9}],[{"f":"DBR","v":4},{"f":"D","v":8},{"f":"DL","v":10},{"f":"F","v":6},{"f":"R","v":8}],[{"f":"DBR","v":3},{"f":"D","v":7},{"f":"DL","v":9},{"f":"F","v":5},{"f":"R","v":7}]],
    "DBR":[[{"f":"DBR","v":9},{"f":"DBR","v":1},{"f":"DBR","v":3},{"f":"DBR","v":5},{"f":"DBR","v":7}],[{"f":"DBR","v":10},{"f":"DBR","v":2},{"f":"DBR","v":4},{"f":"DBR","v":6},{"f":"DBR","v":8}],[{"f":"B","v":5},{"f":"D","v":1},{"f":"DR","v":1},{"f":"R","v":7},{"f":"BR","v":9}],[{"f":"B","v":4},{"f":"D","v":10},{"f":"DR","v":10},{"f":"R","v":6},{"f":"BR","v":8}],[{"f":"B","v":3},{"f":"D","v":9},{"f":"DR","v":9},{"f":"R","v":5},{"f":"BR","v":7}]],
    "B":[[{"f":"B","v":9},{"f":"B","v":1},{"f":"B","v":3},{"f":"B","v":5},{"f":"B","v":7}],[{"f":"B","v":10},{"f":"B","v":2},{"f":"B","v":4},{"f":"B","v":6},{"f":"B","v":8}],[{"f":"DBL","v":5},{"f":"D","v":3},{"f":"DBR","v":1},{"f":"BR","v":7},{"f":"BL","v":9}],[{"f":"DBL","v":4},{"f":"D","v":2},{"f":"DBR","v":10},{"f":"BR","v":6},{"f":"BL","v":8}],[{"f":"DBL","v":3},{"f":"D","v":1},{"f":"DBR","v":9},{"f":"BR","v":5},{"f":"BL","v":7}]],
    "DBL":[[{"f":"DBL","v":9},{"f":"DBL","v":1},{"f":"DBL","v":3},{"f":"DBL","v":5},{"f":"DBL","v":7}],[{"f":"DBL","v":10},{"f":"DBL","v":2},{"f":"DBL","v":4},{"f":"DBL","v":6},{"f":"DBL","v":8}],[{"f":"DL","v":5},{"f":"D","v":5},{"f":"B","v":1},{"f":"BL","v":7},{"f":"L","v":9}],[{"f":"DL","v":4},{"f":"D","v":4},{"f":"B","v":10},{"f":"BL","v":6},{"f":"L","v":8}],[{"f":"DL","v":3},{"f":"D","v":3},{"f":"B","v":9},{"f":"BL","v":5},{"f":"L","v":7}]]
  };

  function megaApplyCycleVis(state, cycle, inv) {
    let sv = [];
    for (let i = 0; i < 5; i++) sv.push(state[cycle[i].f][megaNetVisToLog(cycle[i].f, cycle[i].v)]);
    if (!inv) {
      for (let j = 0; j < 5; j++) state[cycle[(j+1)%5].f][megaNetVisToLog(cycle[(j+1)%5].f, cycle[(j+1)%5].v)] = sv[j];
    } else {
      for (let k = 0; k < 5; k++) state[cycle[k].f][megaNetVisToLog(cycle[k].f, cycle[k].v)] = sv[(k+1)%5];
    }
  }

  function megaApplyCycleMoveVis(state, moveName, inv) {
    let cycles = _megaCycleDefs[moveName];
    if (!cycles) return state;
    for (let i = 0; i < cycles.length; i++) megaApplyCycleVis(state, cycles[i], inv);
    return state;
  }
  // ────────────────────────────────────────────────────────────────────────

  function applyMegaminxDTable(state, shift) {
    let ring = ["DR", "DBR", "B", "DBL", "DL"];
    let normShift = ((shift % 5) + 5) % 5;
    if (normShift === 0) return state;
    let saved = {};
    for (let i = 0; i < 5; i++) saved[ring[i]] = state[ring[i]].slice();
    for (let i = 0; i < 5; i++) {
      let srcIdx = ((i - normShift) % 5 + 5) % 5;
      state[ring[i]] = saved[ring[srcIdx]].slice();
    }
    state.D = megaRotateFaceStickers(state.D, normShift);
    return state;
  }

  // --- Explicit Pochmann move engine (block-rotation model) ---

  function megaXferFace(state, saved, dst, src, indexMap, preserveIdx) {
    state[dst][0] = saved[src][0];
    for (let j = 1; j <= 10; j++) state[dst][j] = saved[src][indexMap(j)];
    if (preserveIdx) {
      for (let pi = 0; pi < preserveIdx.length; pi++) {
        let idx = preserveIdx[pi];
        state[dst][idx] = saved[dst][idx];
      }
    }
  }

  function megaApplyDPetalBlockPerm(state, saved, perm) {
    let dst;
    for (dst in perm) {
      if (Object.prototype.hasOwnProperty.call(perm, dst)) {
        state[dst] = saved[perm[dst]].slice();
      }
    }
    return state;
  }

  let MEGA_D_PLUS_PETAL = { DL: "DR", DBL: "DBR", B: "B", DBR: "DBL", DR: "DL" };
  let MEGA_D_MINUS_PETAL = { DL: "DL", DBL: "DR", B: "DBR", DBR: "B", DR: "DBL" };

  // R++ fix puts solid R on DL and the old DL block on B; D-- then routes B→DBR,
  // leaving R on DL and Y/Lb on DBR. Swap restores the xfer-composed placement.
  function megaFixDClusterAfterRpp(state) {
    let solid = state.DL[0];
    let dfUniform = true;
    for (let i = 1; i < 11; i++) {
      if (state.DL[i] !== solid) {
        dfUniform = false;
        break;
      }
    }
    if (dfUniform && solid === "R" && state.DBR[0] === "Y") {
      let tmp = state.DL.slice();
      state.DL = state.DBR.slice();
      state.DBR = tmp;
    }
    return state;
  }

  function megaFixRDCluster(state, plus) {
    let df = state.DL.slice();
    state.B = df.slice();
    let tmpDr = state.DR.slice();
    state.DR = state.DBR.slice();
    state.DBR = tmpDr;
    let solid = plus ? "R" : "Be";
    for (let i = 0; i < 11; i++) state.DL[i] = solid;
    return state;
  }

  function megaApplyRPochmann(state, plus) {
    let saved = {};
    let allFaces = ["U", "F", "R", "BR", "BL", "L", "D", "DL", "DR", "DBR", "B", "DBL"];
    for (let fi = 0; fi < allFaces.length; fi++) saved[allFaces[fi]] = state[allFaces[fi]].slice();

    let lBand = { U: [1, 9, 10], F: [1, 9, 10], BL: [3, 4, 5], DBL: [3, 4, 5], DL: [1, 2, 3] };
    function rotK(k) { return function(j) { return ((j - 1 - 2 * k + 100) % 10) + 1; }; }
    let lCapK = [0, 3, 1, 2, 0];
    let capRots = [3, 0, 0, 2, 4];
    let dRing = ["R", "BR", "B", "D", "DR"];
    let dShift = plus ? 2 : 3;

    if (plus) {
      megaXferFace(state, saved, "U", "DL", rotK(lCapK[0]), lBand.U);
      megaXferFace(state, saved, "DBL", "U", rotK(lCapK[1]), lBand.DBL);
      megaXferFace(state, saved, "F", "DBL", rotK(lCapK[2]), lBand.F);
      megaXferFace(state, saved, "BL", "F", rotK(lCapK[3]), lBand.BL);
      megaXferFace(state, saved, "DL", "BL", rotK(lCapK[4]), lBand.DL);
    } else {
      megaXferFace(state, saved, "U", "DBL", rotK(lCapK[0]), lBand.U);
      megaXferFace(state, saved, "F", "BL", rotK(lCapK[1]), lBand.F);
      megaXferFace(state, saved, "DL", "U", rotK(lCapK[2]), lBand.DL);
      megaXferFace(state, saved, "DBL", "F", rotK(lCapK[3]), lBand.DBL);
      megaXferFace(state, saved, "BL", "DL", rotK(lCapK[4]), lBand.BL);
    }

    for (let di = 0; di < 5; di++) {
      let srcIdx = ((di - dShift) % 5 + 5) % 5;
      state[dRing[di]] = megaRotateFaceStickers(saved[dRing[srcIdx]], capRots[di]);
    }

    let dbrClicks = plus ? 2 : 3;
    state.DBR = megaRotateFaceStickers(state.DBR, dbrClicks);
    return megaFixRDCluster(state, plus);
  }

  function megaApplyDPochmann(state, plus) {
    let ring1 = ["F", "R", "BR", "BL", "L"];
    let bodyShift = plus ? 3 : 2;
    let savedU = state.U.slice();
    let savedUBands = {};
    for (let ui = 0; ui < 5; ui++) {
      let uf = ring1[ui];
      savedUBands[uf] = [state[uf][1], state[uf][2], state[uf][3]];
    }
    let saved = {};
    for (let i = 0; i < 5; i++) saved[ring1[i]] = state[ring1[i]].slice();
    saved.DL = state.DL.slice();
    saved.DR = state.DR.slice();
    saved.DBR = state.DBR.slice();
    saved.B = state.B.slice();
    saved.DBL = state.DBL.slice();

    for (let i = 0; i < 5; i++) {
      let dst = ring1[i];
      let srcBrd = ring1[(i + bodyShift) % 5];
      let srcBdy = ring1[(i + bodyShift) % 5];
      state[dst][1] = saved[srcBrd][1];
      state[dst][2] = saved[srcBrd][2];
      state[dst][3] = saved[srcBrd][3];
      state[dst][0] = saved[srcBdy][0];
      for (let s = 4; s <= 10; s++) state[dst][s] = saved[srcBdy][s];
    }

    megaApplyDPetalBlockPerm(state, saved, plus ? MEGA_D_PLUS_PETAL : MEGA_D_MINUS_PETAL);
    megaURingRotateCW(state, bodyShift);

    let uLayerFixed = savedU.every(function(c) { return c === savedU[0]; });
    if (!uLayerFixed) {
      state.U = savedU;
      for (let ri = 0; ri < 5; ri++) {
        let rf = ring1[ri];
        let band = savedUBands[rf];
        state[rf][1] = band[0];
        state[rf][2] = band[1];
        state[rf][3] = band[2];
      }
    }
    if (!plus) megaFixDClusterAfterRpp(state);
    return state;
  }

  function applyMegaminxMove(state, move) {
    let m = move.trim().replace(/[\u2018\u2019\u0060\u00B4]/g, "'");
    if (!m) return state;

    let pochPlus = m.endsWith("++");
    let pochMinus = !pochPlus && m.endsWith("--");
    if (pochPlus) m = m.slice(0, -2);
    else if (pochMinus) m = m.slice(0, -2);

    let prime = !pochPlus && !pochMinus && m.endsWith("'");
    if (prime) m = m.slice(0, -1);
    let double = !pochPlus && !pochMinus && m.endsWith("2");
    if (double) m = m.slice(0, -1);

    if (m === "D" && (pochPlus || pochMinus)) {
      return megaApplyCycleMoveVis(state, "D++", pochMinus);
    }

    if (m === "R" && (pochPlus || pochMinus)) {
      return megaApplyCycleMoveVis(state, "R++", pochMinus);
    }

    if (!pochPlus && !pochMinus && Object.prototype.hasOwnProperty.call(_megaCycleDefs, m)) {
      let cCount = double ? 2 : 1;
      for (let ct = 0; ct < cCount; ct++) megaApplyCycleMoveVis(state, m, prime);
      return state;
    }

    const faceMap = {
      "F": "F", "R": "R", "BR": "BR", "BL": "BL", "L": "L",
      "D": "D", "DL": "DL", "DR": "DR", "DBR": "DBR", "B": "B", "DBL": "DBL",
    };
    let turnFace = faceMap[m];
    if (!turnFace || !MEGA_ADJ[turnFace]) return state;
    let count;
    if (double) count = 2;
    else if (prime) count = 4;
    else count = 1;

    for (let t = 0; t < count; t++) megaFaceRotateCW(state, turnFace);
    return state;
  }

  function applyMegaminxAlgorithm(state, alg) {
    const moves = alg.trim().split(/\s+/);
    for (let i = 0; i < moves.length; i++) {
      applyMegaminxMove(state, moves[i]);
    }
    return state;
  }

  function renderMegaminx(angle, state, mono, outlined, config) {
    const polys = [];
    let cx = 50, cy = 50;
    const outerR = 42;
    const step = 2 * Math.PI / 5;
    const startA = -Math.PI / 2;

    function pentPts(cxx, cyy, r, sa) {
      const pts = [];
      for (let i = 0; i < 5; i++) {
        pts.push([cxx + r * Math.cos(sa + i * step), cyy + r * Math.sin(sa + i * step)]);
      }
      return pts;
    }

    function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }

    function drawMegaFace(fs, cxx, cyy, r, sa, depth) {
      let outer = pentPts(cxx, cyy, r, sa);
      let inner = pentPts(cxx, cyy, r * 0.382, sa);
      const edgeMids = [];
      for (let i = 0; i < 5; i++) edgeMids.push(mid(outer[i], outer[(i + 1) % 5]));

      polys.push({ pts: inner.slice(), color: fs[0], depth: depth + 0.02 });

      for (let i = 0; i < 5; i++) {
        const ni = (i + 1) % 5;
        polys.push({
          pts: [inner[i], edgeMids[(i + 4) % 5], outer[i], edgeMids[i]],
          color: fs[1 + i * 2],
          depth: depth,
        });
        polys.push({
          pts: [inner[i], edgeMids[i], inner[ni]],
          color: fs[2 + i * 2],
          depth: depth + 0.01,
        });
      }
    }

    drawMegaFace(state.U, cx, cy, outerR, startA, 0);

    if (angle === "iso") {
      const adjacentFaces = ["F", "R", "BR", "BL", "L"];
      let outerMain = pentPts(cx, cy, outerR, startA);

      for (let i = 0; i < 5; i++) {
        const ni = (i + 1) % 5;
        const pA = outerMain[i];
        const pB = outerMain[ni];
        let edgeMid = mid(pA, pB);

        const edgeAngle = Math.atan2(pB[1] - pA[1], pB[0] - pA[0]);
        const outAngle = edgeAngle - Math.PI / 2;

        const apothem = outerR * Math.cos(Math.PI / 5);
        const fcx = edgeMid[0] + Math.cos(outAngle) * apothem;
        const fcy = edgeMid[1] + Math.sin(outAngle) * apothem;

        const adjSA = Math.atan2(pB[1] - fcy, pB[0] - fcx);

        if (state[adjacentFaces[i]]) {
          drawMegaFace(state[adjacentFaces[i]], fcx, fcy, outerR, adjSA, -1);
        }
      }
    }

    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const megaRx = getRounded(config, 20);
    polys.sort(function (a, b) { return a.depth - b.depth; });
    polys.forEach(function (p) {
      svg += polygon(p.pts, getColorValue(p.color, mono, outlined), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.5), megaRx);
    });
    svg += "</svg>";
    return svg;
  }

  function renderMegaminxNet(state, mono, outlined, config) {
    const polys = [];
    const R = 28;
    const step = 2 * Math.PI / 5;

    function pVerts(cx, cy, r, sa) {
      const v = [];
      for (let i = 0; i < 5; i++) v.push([cx + r * Math.cos(sa + i * step), cy + r * Math.sin(sa + i * step)]);
      return v;
    }
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

    function drawFace(fs, cx, cy, r, sa) {
      const outer = pVerts(cx, cy, r, sa);
      const inner = pVerts(cx, cy, r * 0.382, sa);
      const W = 0.08;
      const cuts = [];
      for (let i = 0; i < 5; i++) {
        cuts.push([
          lerp(outer[i], outer[(i + 1) % 5], 0.5 - W),
          lerp(outer[i], outer[(i + 1) % 5], 0.5 + W),
        ]);
      }
      polys.push({ pts: inner.slice(), color: fs[0] });
      for (let i = 0; i < 5; i++) {
        const ni = (i + 1) % 5;
        const pi = (i + 4) % 5;
        polys.push({ pts: [inner[i], cuts[pi][1], outer[i], cuts[i][0]], color: fs[1 + i * 2] });
        polys.push({ pts: [inner[i], cuts[i][0], cuts[i][1], inner[ni]], color: fs[2 + i * 2] });
      }
    }

    getMegaNetFaceConfigs().forEach(function(fc) {
      drawFace(megaNetFaceStickers(state[fc.face], fc), fc.cx, fc.cy, R, fc.sa);
    });

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    polys.forEach(function(p) {
      p.pts.forEach(function(pt) {
        if (pt[0] < minX) minX = pt[0]; if (pt[1] < minY) minY = pt[1];
        if (pt[0] > maxX) maxX = pt[0]; if (pt[1] > maxY) maxY = pt[1];
      });
    });
    const pad = 2;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const megaNetRx = getRounded(config, 20);
    polys.forEach(function(p) {
      svg += polygon(p.pts, getColorValue(p.color, mono, outlined), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.5), megaNetRx);
    });
    svg += "</svg>";
    return svg;
  }

  function renderMegaminxRotated(state, rotX, rotY, mono, outlined, config) {
    const polys = [];
    const SHRINK = 0.94;

    // Convert logical → visual for faces with shift=3 (so colors match the net view)
    function mega3dVisArr(fn) {
      let arr = state[fn];
      if (!_megaNetShift3[fn]) return arr;
      let r = [arr[0]];
      for (let vis = 1; vis <= 10; vis++) r.push(arr[((vis - 1 + 6) % 10) + 1]);
      return r;
    }

    // Per-face rot_corner (maps visual sticker positions to 3D geometric vertex indices)
    // STANDARD faces: pVerts[k] <-> DODEC[(rc-k+5)%5]
    //   corner at geom i -> visual k = (rc-i+5)%5, edge at geom i -> visual k = (rc-i+4)%5
    // REVERSED faces: pVerts[k] <-> DODEC[(rc+k)%5]
    //   corner at geom i -> visual k = (i-rc+5)%5, edge at geom i -> same k
    const ROT_CORNER = {U:3, F:1, R:1, BR:0, BL:0, L:1, D:3, DL:4, DR:3, DBR:3, B:4, DBL:3};
    const REVERSED_WIND = {BR:true, BL:true, D:true, DR:true, DBR:true, DBL:true};

    function shrink2d(pts, f) {
      let pcx = 0, pcy = 0;
      for (let i = 0; i < pts.length; i++) { pcx += pts[i][0]; pcy += pts[i][1]; }
      pcx /= pts.length; pcy /= pts.length;
      return pts.map(function (p) { return [pcx + (p[0] - pcx) * f, pcy + (p[1] - pcy) * f]; });
    }

    // Regular dodecahedron with U-D axis along Y, U at top
    const dodecVerts = [
      [0, -0.3249196962, -1.7013016167],
      [-1, -1.3763819205, -0.3249196962],
      [-0.6180339887, 1.3763819205, -0.8506508084],
      [-1.6180339887, 0.3249196962, 0.5257311121],
      [1.6180339887, -0.3249196962, -0.5257311121],
      [0.6180339887, -1.3763819205, 0.8506508084],
      [1, 1.3763819205, 0.3249196962],
      [0, 0.3249196962, 1.7013016167],
      [1, 0.3249196962, -1.3763819205],
      [-0.6180339887, -1.3763819205, 0.8506508084],
      [0.6180339887, 1.3763819205, -0.8506508084],
      [-1, -0.3249196962, 1.3763819205],
      [0, -1.3763819205, -1.0514622242],
      [-1, 1.3763819205, 0.3249196962],
      [1, -1.3763819205, -0.3249196962],
      [0, 1.3763819205, 1.0514622242],
      [-1, 0.3249196962, -1.3763819205],
      [-1.6180339887, -0.3249196962, -0.5257311121],
      [1.6180339887, 0.3249196962, 0.5257311121],
      [1, -0.3249196962, 1.3763819205],
    ];

    const DODEC_FACES = {
      U:   [2,13,15,6,10],
      F:   [6,15,7,19,18],
      R:   [10,6,18,4,8],
      BR:  [10,2,16,0,8],
      BL:  [2,13,3,17,16],
      L:   [15,13,3,11,7],
      D:   [9,5,14,12,1],
      DL:  [19,7,11,9,5],
      DR:  [19,18,4,14,5],
      DBR: [4,8,0,12,14],
      B: [17,16,0,12,1],
      DBL:  [17,3,11,9,1],
    };

    const faceNames = ["U","F","R","BR","BL","L","D","DL","DR","DBR","B","DBL"];

    function pentCenter(idxs) {
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < idxs.length; i++) {
        sx += dodecVerts[idxs[i]][0];
        sy += dodecVerts[idxs[i]][1];
        sz += dodecVerts[idxs[i]][2];
      }
      return [sx / 5, sy / 5, sz / 5];
    }

    function proj(p3) {
      const rot = rotate3D(p3[0], p3[1], p3[2], rotX, rotY);
      return { screen: [rot[0], -rot[1]], depth: rot[2] };
    }

    function lerp3d(a, b, t) {
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
    }

    function drawMegaFace3D(fs, idxs, rc, isRev) {
      const center3d = pentCenter(idxs);
      const outerPts3d = [];
      for (let i = 0; i < 5; i++) outerPts3d.push(dodecVerts[idxs[i]]);

      const innerR = 0.382;
      const innerPts3d = [];
      for (let i = 0; i < 5; i++) {
        innerPts3d.push([
          center3d[0] + (outerPts3d[i][0] - center3d[0]) * innerR,
          center3d[1] + (outerPts3d[i][1] - center3d[1]) * innerR,
          center3d[2] + (outerPts3d[i][2] - center3d[2]) * innerR,
        ]);
      }

      // Cut parameter: edge sticker occupies middle ~36% of outer edge;
      // corner sticker takes the 32% on each side up to the outer vertex.
      const T = 0.4;

      // Center pentagon [0]
      let dSum = 0;
      const centerPts = innerPts3d.map(function (p) {
        const pr = proj(p);
        dSum += pr.depth;
        return pr.screen;
      });
      polys.push({ pts: shrink2d(centerPts, SHRINK), color: fs[0], depth: dSum / 5 });

      for (let i = 0; i < 5; i++) {
        const ni = (i + 1) % 5;
        const pi = (i + 4) % 5;

        // Visual sticker indices (which slot in fs[] to use for this geometric position)
        let k_corner, k_edge;
        if (isRev) {
          k_corner = (i - rc + 5) % 5;
          k_edge   = k_corner;            // REVERSED: edge uses same index as corner
        } else {
          k_corner = (rc - i + 5) % 5;
          k_edge   = (rc - i + 4) % 5;   // STANDARD: edge is one slot less
        }

        // Trapezoid cut-points on the outer edges adjacent to vertex i
        const prevCutR = lerp3d(outerPts3d[pi], outerPts3d[i],  1 - T); // right end of prev outer edge
        const nextCutL = lerp3d(outerPts3d[i],  outerPts3d[ni], T);     // left  end of next outer edge
        // Cut-points for the edge between i and ni
        const edgeCutL = nextCutL;
        const edgeCutR = lerp3d(outerPts3d[i], outerPts3d[ni], 1 - T);

        // Corner kite: inner vertex → left outer side → outer vertex → right outer side
        const cornerPts3d = [innerPts3d[i], prevCutR, outerPts3d[i], nextCutL];
        let cd = 0;
        const cornerScreen = cornerPts3d.map(function (p) {
          const pr = proj(p);
          cd += pr.depth;
          return pr.screen;
        });
        polys.push({ pts: shrink2d(cornerScreen, SHRINK), color: fs[1 + k_corner * 2], depth: cd / 4 });

        // Edge trapezoid: inner-left → outer-left → outer-right → inner-right
        const edgePts3d = [innerPts3d[i], edgeCutL, edgeCutR, innerPts3d[ni]];
        let ed = 0;
        const edgeScreen = edgePts3d.map(function (p) {
          const pr = proj(p);
          ed += pr.depth;
          return pr.screen;
        });
        polys.push({ pts: shrink2d(edgeScreen, SHRINK), color: fs[2 + k_edge * 2], depth: ed / 4 });
      }
    }

    // Visible faces via center-vector culling
    const visible = [];
    for (let fi = 0; fi < faceNames.length; fi++) {
      const fn = faceNames[fi];
      const idxs = DODEC_FACES[fn];
      const ctr = pentCenter(idxs);
      const rc = rotate3D(ctr[0], ctr[1], ctr[2], rotX, rotY);
      if (rc[2] > 0.01) {
        visible.push({ name: fn, depth: rc[2] });
      }
    }
    visible.sort(function (a, b) { return a.depth - b.depth; });

    for (let vi = 0; vi < visible.length; vi++) {
      const fn = visible[vi].name;
      if (state[fn]) {
        drawMegaFace3D(mega3dVisArr(fn), DODEC_FACES[fn], ROT_CORNER[fn], !!REVERSED_WIND[fn]);
      }
    }

    polys.sort(function (a, b) { return a.depth - b.depth; });

    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 0.3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const megaRx = getRounded(config, 1.5);
    polys.forEach(function (p) {
      svg += polygon(p.pts, getColorValue(p.color, mono, outlined), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.03), megaRx);
    });
    svg += "</svg>";
    return svg;
  }

  // ─── Megaminx Top View Renderer ───
  //
  // Layout based on standard megaminx LL diagrams.
  //
  // The U face is a pentagon whose internal lines are defined by 5 diagonals
  // connecting the 1/3 split points of opposite edges:
  //   E0a↔E3b, E0b↔E2a, E1a↔E4b, E1b↔E3a, E2b↔E4a
  // These diagonals intersect to form the inner pentagon (center sticker)
  // and divide the U face into 11 stickers (1 center + 5 corners + 5 edges).
  //
  // Around the U face, a thin band shows one edge sticker per adjacent face.
  // Beyond each edge sticker, a small pentagon represents that face's center.
  //
  // Adjacent faces CW from top vertex: F(0), R(1), BR(2), BL(3), L(4)
  // Face sticker layout: [0]=center  [1,3,5,7,9]=corners  [2,4,6,8,10]=edges

  function renderMegaminxTop(state, mono, outlined, config) {
    const oll = config && config.oll;
    const polys = [];
    let cx = 50, cy = 50;
    const step = 2 * Math.PI / 5;
    const startA = -Math.PI / 2;
    const GRAY = COLORS.Gy;
    const SHRINK = 0.92;

    const uColor = state.U[0];
    function colorFor(c) {
      if (oll) return c === uColor ? getColorValue("Y", mono, outlined) : (outlined ? "none" : GRAY);
      return getColorValue(c, mono, outlined);
    }

    function shrinkPoly(pts, f) {
      let scx = 0, scy = 0;
      for (let i = 0; i < pts.length; i++) { scx += pts[i][0]; scy += pts[i][1]; }
      scx /= pts.length; scy /= pts.length;
      return pts.map(function (p) { return [scx + (p[0] - scx) * f, scy + (p[1] - scy) * f]; });
    }

    function pentPts(cxx, cyy, r, sa) {
      const pts = [];
      for (let k = 0; k < 5; k++) pts.push([cxx + r * Math.cos(sa + k * step), cyy + r * Math.sin(sa + k * step)]);
      return pts;
    }
    function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function lineIntersect(p1, p2, p3, p4) {
      const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
      const d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];
      const denom = d1x * d2y - d1y * d2x;
      if (Math.abs(denom) < 1e-10) return mid(p1, p3);
      let t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denom;
      return [p1[0] + t * d1x, p1[1] + t * d1y];
    }

    const outerR = 30;
    const bandDepth = outerR * 0.30;
    const centerPentR = outerR * 0.12;

    // ── 1. Compute shared geometry ──
    let outer = pentPts(cx, cy, outerR, startA);
    const adjacentFaces = ["BR", "R", "F", "L", "BL"];

    // Split points on each edge at 1/3 and 2/3
    const edgeData = [];
    for (let i = 0; i < 5; i++) {
      const ni = (i + 1) % 5;
      const pA = outer[i], pB = outer[ni];
      const eAng = Math.atan2(pB[1] - pA[1], pB[0] - pA[0]);
      const outA = eAng - Math.PI / 2;
      let ndx = Math.cos(outA), ndy = Math.sin(outA);

      let i1 = lerp(pA, pB, 1 / 3);
      let i2 = lerp(pA, pB, 2 / 3);

      const oA = [pA[0] + ndx * bandDepth, pA[1] + ndy * bandDepth];
      const oB = [pB[0] + ndx * bandDepth, pB[1] + ndy * bandDepth];
      let o1 = lerp(oA, oB, 1 / 3);
      let o2 = lerp(oA, oB, 2 / 3);

      edgeData.push({ iA: pA, iB: pB, i1: i1, i2: i2, oA: oA, oB: oB, o1: o1, o2: o2, ndx: ndx, ndy: ndy });
    }

    // ── 2. U face internals ──
    // 5 diagonals define ALL internal lines:
    //   diag 0: E0a → E3b    diag 1: E1a → E4b    diag 2: E2a → E0b
    //   diag 3: E3a → E1b    diag 4: E4a → E2b
    const diags = [];
    for (let i = 0; i < 5; i++) {
      diags.push({ a: edgeData[i].i1, b: edgeData[(i + 3) % 5].i2 });
    }

    // Compute all 10 pairwise intersections, classify by distance to center
    function dist2(p) { return (p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy); }
    const allIx = [];
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        const p = lineIntersect(diags[i].a, diags[i].b, diags[j].a, diags[j].b);
        allIx.push({ pt: p, d: dist2(p), di: i, dj: j });
      }
    }
    allIx.sort(function (a, b) { return a.d - b.d; });
    // First 5 (closest to center) = inner pentagon, last 5 = star tips
    let innerIx = allIx.slice(0, 5);
    const starIx = allIx.slice(5);

    // Sort inner vertices by angle for correct polygon winding
    innerIx.forEach(function (ix) { ix.ang = Math.atan2(ix.pt[1] - cy, ix.pt[0] - cx); });
    innerIx.sort(function (a, b) { return a.ang - b.ang; });
    const inner = innerIx.map(function (ix) { return ix.pt; });

    // Sort star vertices by angle too
    starIx.forEach(function (ix) { ix.ang = Math.atan2(ix.pt[1] - cy, ix.pt[0] - cx); });
    starIx.sort(function (a, b) { return a.ang - b.ang; });
    const star = starIx.map(function (ix) { return ix.pt; });

    // Each diagonal has 2 inner intersections. Going from 'a' end to 'b' end,
    // we need the ordered pair. For each diagonal, find its two inner pts.
    const diagInnerPts = [];
    for (let i = 0; i < 5; i++) {
      const pts = [];
      for (let j = 0; j < 5; j++) {
        if (innerIx[j].di === i || innerIx[j].dj === i) pts.push(innerIx[j].pt);
      }
      // Order by distance from diag 'a' end
      const a = diags[i].a;
      pts.sort(function (p, q) {
        return ((p[0] - a[0]) * (p[0] - a[0]) + (p[1] - a[1]) * (p[1] - a[1])) -
               ((q[0] - a[0]) * (q[0] - a[0]) + (q[1] - a[1]) * (q[1] - a[1]));
      });
      diagInnerPts.push(pts);
    }

    // Also find the star point for each diagonal
    const diagStarPt = [];
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (starIx[j].di === i || starIx[j].dj === i) {
          diagStarPt.push(starIx[j].pt);
          break;
        }
      }
    }

    // Center pentagon
    polys.push({ pts: shrinkPoly(inner.slice(), SHRINK), color: colorFor(state.U[0]) });

    // 5 edge quads
    for (let i = 0; i < 5; i++) {
      const nearA = diagInnerPts[i][0];
      const dj = (i + 2) % 5;
      const nearB = diagInnerPts[dj][1];
      polys.push({
        pts: shrinkPoly([edgeData[i].i1, edgeData[i].i2, nearB, nearA], SHRINK),
        color: colorFor(state.U[2 + ((i + 1) % 5) * 2])
      });
    }

    // 5 corner quads
    for (let k = 0; k < 5; k++) {
      const pk = (k + 4) % 5;
      const dA = (k + 1) % 5;
      const dB = k;
      const starPt = lineIntersect(diags[dA].a, diags[dA].b, diags[dB].a, diags[dB].b);
      polys.push({
        pts: shrinkPoly([outer[k], edgeData[pk].i2, starPt, edgeData[k].i1], SHRINK),
        color: colorFor(state.U[1 + ((k + 1) % 5) * 2])
      });
    }

    // ── 3. Band: 3 stickers per side (corner, edge, corner) ──
    const noBand = config && config.noBand;
    if (!noBand) {
      for (let i = 0; i < 5; i++) {
        let d = edgeData[i];
        let face = adjacentFaces[i];
        if (!state[face]) continue;

        const bc0 = colorFor(state[face][3]);
        const bc1 = colorFor(state[face][2]);
        const bc2 = colorFor(state[face][1]);
        polys.push({ pts: shrinkPoly([d.iA, d.i1, d.o1, d.oA], SHRINK), color: bc0 });
        polys.push({ pts: shrinkPoly([d.i1, d.i2, d.o2, d.o1], SHRINK), color: bc1 });
        polys.push({ pts: shrinkPoly([d.i2, d.iB, d.oB, d.o2], SHRINK), color: bc2 });
      }
    }

    // ── 4. Center pentagons for each adjacent face (skip in OLL and noBand modes) ──
    if (oll || noBand) { /* no center pentagons */ }
    else for (let i = 0; i < 5; i++) {
      let d = edgeData[i];
      let face = adjacentFaces[i];
      if (!state[face]) continue;

      const mx = (d.o1[0] + d.o2[0]) / 2;
      const my = (d.o1[1] + d.o2[1]) / 2;

      const pentEdge = Math.sqrt((d.o2[0] - d.o1[0]) * (d.o2[0] - d.o1[0]) + (d.o2[1] - d.o1[1]) * (d.o2[1] - d.o1[1]));
      const apothem = pentEdge / (2 * Math.tan(Math.PI / 5));
      let pcx = mx + d.ndx * apothem;
      let pcy = my + d.ndy * apothem;

      let pentSA = Math.atan2(d.ndy, d.ndx);
      const circumR = pentEdge / (2 * Math.sin(Math.PI / 5));
      let pentVerts = pentPts(pcx, pcy, circumR, pentSA);

      polys.push({ pts: shrinkPoly(pentVerts, SHRINK), color: colorFor(state[face][0]) });
    }

    // ── Build SVG ──
    const rx = getRounded(config, 10);
    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    let sk = getStrokeFor(mono, outlined);
    let sw = getStrokeWidthFor(outlined, 0.5);
    polys.forEach(function (p) {
      svg += polygon(p.pts, p.color, sk, sw, rx);
    });
    svg += "</svg>";
    return svg;
  }

  // ─── FTO (Face-Turning Octahedron) State Engine ───

  function createFTOState() {
    return {
      U:  ["W", "W", "W", "W", "W", "W", "W", "W", "W"],
      R:  ["R", "R", "R", "R", "R", "R", "R", "R", "R"],
      F:  ["G", "G", "G", "G", "G", "G", "G", "G", "G"],
      L:  ["P", "P", "P", "P", "P", "P", "P", "P", "P"],
      D:  ["Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y", "Y"],
      B:  ["B", "B", "B", "B", "B", "B", "B", "B", "B"],
      BR: ["Gy", "Gy", "Gy", "Gy", "Gy", "Gy", "Gy", "Gy", "Gy"],
      BL: ["O", "O", "O", "O", "O", "O", "O", "O", "O"],
    };
  }

  const FTO_VERTS = {
    U:["T","Le","Fr"], R:["T","Fr","Ri"], F:["Bo","Ri","Fr"], L:["Bo","Fr","Le"],
    D:["Bo","Ba","Ri"], B:["T","Ba","Le"], BR:["T","Ri","Ba"], BL:["Bo","Le","Ba"]
  };
  const _ftoVP = {};
  function ftoVP(face, vert) {
    let k = face + vert;
    if (_ftoVP[k] !== undefined) return _ftoVP[k];
    const v = FTO_VERTS[face];
    let r = v[0] === vert ? 0 : v[1] === vert ? 4 : v[2] === vert ? 8 : -1;
    _ftoVP[k] = r;
    return r;
  }
  function ftoCNP(p) { return p === 0 ? 2 : p === 4 ? 5 : 7; }
  function ftoEP(a, b) { const s = a + b; return s === 4 ? 1 : s === 8 ? 3 : 6; }

  function applyFTOMove(state, move) {
    let m = move.trim().replace(/[\u2018\u2019\u0060\u00B4]/g, "'");
    if (!m) return;

    let prime = false;
    if (m.endsWith("'")) {
      prime = true;
      m = m.slice(0, -1);
    } else if (m.endsWith("2")) {
      prime = true;
      m = m.slice(0, -1);
    }

    const V = FTO_VERTS[m];
    if (!V) return;

    let s = state;
    let f = s[m].slice();
    if (prime) {
      s[m] = [f[8],f[3],f[7],f[6],f[0],f[2],f[1],f[5],f[4]];
    } else {
      s[m] = [f[4],f[6],f[5],f[1],f[8],f[7],f[3],f[2],f[0]];
    }

    const edges = [[V[2],V[0]], [V[0],V[1]], [V[1],V[2]]];
    const faces = ["U","R","F","L","D","B","BR","BL"];
    const adj = [null, null, null];
    const nadj = {};

    for (let fi = 0; fi < faces.length; fi++) {
      const fn = faces[fi];
      if (fn === m) continue;
      const ov = FTO_VERTS[fn], shared = [];
      for (let j = 0; j < 3; j++) if (ov.indexOf(V[j]) >= 0) shared.push(V[j]);
      if (shared.length === 2) {
        for (let e = 0; e < 3; e++) {
          if (shared.indexOf(edges[e][0]) >= 0 && shared.indexOf(edges[e][1]) >= 0) adj[e] = fn;
        }
      } else if (shared.length === 1) {
        nadj[shared[0]] = fn;
      }
    }

    const ss = [];
    for (let k = 0; k < 3; k++) {
      const pa = ftoVP(adj[k], edges[k][0]), pb = ftoVP(adj[k], edges[k][1]);
      ss.push([pa, pb, ftoEP(pa, pb), ftoCNP(pa), ftoCNP(pb)]);
    }

    let t;
    for (let i = 0; i < 5; i++) {
      if (prime) {
        t = s[adj[0]][ss[0][i]];
        s[adj[0]][ss[0][i]] = s[adj[2]][ss[2][i]];
        s[adj[2]][ss[2][i]] = s[adj[1]][ss[1][i]];
        s[adj[1]][ss[1][i]] = t;
      } else {
        t = s[adj[0]][ss[0][i]];
        s[adj[0]][ss[0][i]] = s[adj[1]][ss[1][i]];
        s[adj[1]][ss[1][i]] = s[adj[2]][ss[2][i]];
        s[adj[2]][ss[2][i]] = t;
      }
    }

    const nf0 = nadj[V[0]], nf1 = nadj[V[1]], nf2 = nadj[V[2]];
    const np0 = ftoVP(nf0, V[0]), np1 = ftoVP(nf1, V[1]), np2 = ftoVP(nf2, V[2]);
    if (prime) {
      t = s[nf0][np0]; s[nf0][np0] = s[nf2][np2]; s[nf2][np2] = s[nf1][np1]; s[nf1][np1] = t;
    } else {
      t = s[nf0][np0]; s[nf0][np0] = s[nf1][np1]; s[nf1][np1] = s[nf2][np2]; s[nf2][np2] = t;
    }
  }

  function applyFTOAlgorithm(state, alg) {
    const moves = alg.trim().split(/\s+/);
    for (let i = 0; i < moves.length; i++) {
      applyFTOMove(state, moves[i]);
    }
    return state;
  }

  function generateFTOScramble() {
    const moves = ["U", "R", "F", "L", "D", "B", "BL", "BR"];
    const mods = ["", "'"];
    let scramble = [];
    let last = "";
    for (let i = 0; i < 30; i++) {
      let m;
      do {
        m = moves[Math.floor(Math.random() * moves.length)];
      } while (m === last);
      last = m;
      scramble.push(m + mods[Math.floor(Math.random() * mods.length)]);
    }
    let state = createFTOState();
    applyFTOAlgorithm(state, scramble.join(" "));
    return state;
  }

  // ─── FTO Renderer ───

  function renderFTO(angle, state, mono, outlined, config) {
    const oll = config && config.oll;
    const polys = [];
    let s = 50;
    let cx = 50, cy = 50;
    const SHRINK = 0.90;
    const GRAY = COLORS.Gy;

    function colorFor(c) {
      if (oll) return c === "W" ? getColorValue("Y", mono, outlined) : (outlined ? "none" : GRAY);
      return getColorValue(c, mono, outlined);
    }

    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

    function shrink(pts, f) {
      let pcx = 0, pcy = 0;
      for (let i = 0; i < pts.length; i++) { pcx += pts[i][0]; pcy += pts[i][1]; }
      pcx /= pts.length; pcy /= pts.length;
      return pts.map(function (p) { return [pcx + (p[0] - pcx) * f, pcy + (p[1] - pcy) * f]; });
    }

    function addFTOFace(faceState, top, bl, br, depth) {
      let L1 = lerp(top, bl, 1 / 3), L2 = lerp(top, bl, 2 / 3);
      let R1 = lerp(top, br, 1 / 3), R2 = lerp(top, br, 2 / 3);
      let B1 = lerp(bl, br, 1 / 3), B2 = lerp(bl, br, 2 / 3);
      let M = lerp(L2, R2, 0.5);

      const rows = [[top], [L1, R1], [L2, M, R2], [bl, B1, B2, br]];
      const tris = [
        { pts: [rows[0][0], rows[1][0], rows[1][1]], c: faceState[0] },
        { pts: [rows[1][0], rows[2][0], rows[2][1]], c: faceState[1] },
        { pts: [rows[1][0], rows[2][1], rows[1][1]], c: faceState[2] },
        { pts: [rows[1][1], rows[2][1], rows[2][2]], c: faceState[3] },
        { pts: [rows[2][0], rows[3][0], rows[3][1]], c: faceState[4] },
        { pts: [rows[2][0], rows[3][1], rows[2][1]], c: faceState[5] },
        { pts: [rows[2][1], rows[3][1], rows[3][2]], c: faceState[6] },
        { pts: [rows[2][1], rows[3][2], rows[2][2]], c: faceState[7] },
        { pts: [rows[2][2], rows[3][2], rows[3][3]], c: faceState[8] },
      ];

      for (let i = 0; i < tris.length; i++) {
        polys.push({ pts: shrink(tris[i].pts, SHRINK), color: tris[i].c, depth: depth });
      }
    }

    if (angle === "top") {
      return renderFTOTop(state, mono, outlined, config);
    }

    if (angle === "dual") {
      return renderFTODual(state, mono, outlined, config);
    }

    const top = [cx + s, cy - s];
    const right = [cx + s, cy + s];
    const bottom = [cx - s, cy + s];
    const left = [cx - s, cy - s];
    const center = [cx, cy];

    addFTOFace(state.U, top, left, center, 0);
    addFTOFace(state.R, top, center, right, 0);
    addFTOFace(state.F, bottom, right, center, 0);
    addFTOFace(state.L, bottom, center, left, 0);

    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 2;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const ftoRx = getRounded(config, 20);
    polys.forEach(function (p) {
      svg += polygon(p.pts, colorFor(p.color), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.8), ftoRx);
    });
    svg += "</svg>";
    return svg;
  }

  function renderFTOSquare(state, cx, cy, s, faceNames, mono, outlined, config, faceRots) {
    const oll = config && config.oll;
    const polys = [];
    const SHRINK = 0.90;
    const GRAY = COLORS.Gy;

    function colorFor(c) {
      if (oll) return c === "W" ? getColorValue("Y", mono, outlined) : (outlined ? "none" : GRAY);
      return getColorValue(c, mono, outlined);
    }

    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

    function shrink(pts, f) {
      let pcx = 0, pcy = 0;
      for (let i = 0; i < pts.length; i++) { pcx += pts[i][0]; pcy += pts[i][1]; }
      pcx /= pts.length; pcy /= pts.length;
      return pts.map(function (p) { return [pcx + (p[0] - pcx) * f, pcy + (p[1] - pcy) * f]; });
    }

    // rot: +1 = 120° CW, -1 = 120° CCW (same permutation as applyFTOMove face spin)
    function orientFace(f, rot) {
      if (!rot) return f;
      let cur = f;
      const steps = rot > 0 ? rot : -rot;
      for (let i = 0; i < steps; i++) {
        if (rot > 0) cur = [cur[4], cur[6], cur[5], cur[1], cur[8], cur[7], cur[3], cur[2], cur[0]];
        else cur = [cur[8], cur[3], cur[7], cur[6], cur[0], cur[2], cur[1], cur[5], cur[4]];
      }
      return cur;
    }

    function addFace(faceState, top, bl, br, depth) {
      let L1 = lerp(top, bl, 1 / 3), L2 = lerp(top, bl, 2 / 3);
      let R1 = lerp(top, br, 1 / 3), R2 = lerp(top, br, 2 / 3);
      let B1 = lerp(bl, br, 1 / 3), B2 = lerp(bl, br, 2 / 3);
      let M = lerp(L2, R2, 0.5);
      const rows = [[top], [L1, R1], [L2, M, R2], [bl, B1, B2, br]];
      const tris = [
        { pts: [rows[0][0], rows[1][0], rows[1][1]], c: faceState[0] },
        { pts: [rows[1][0], rows[2][0], rows[2][1]], c: faceState[1] },
        { pts: [rows[1][0], rows[2][1], rows[1][1]], c: faceState[2] },
        { pts: [rows[1][1], rows[2][1], rows[2][2]], c: faceState[3] },
        { pts: [rows[2][0], rows[3][0], rows[3][1]], c: faceState[4] },
        { pts: [rows[2][0], rows[3][1], rows[2][1]], c: faceState[5] },
        { pts: [rows[2][1], rows[3][1], rows[3][2]], c: faceState[6] },
        { pts: [rows[2][1], rows[3][2], rows[2][2]], c: faceState[7] },
        { pts: [rows[2][2], rows[3][2], rows[3][3]], c: faceState[8] },
      ];
      for (let i = 0; i < tris.length; i++) {
        polys.push({ pts: shrink(tris[i].pts, SHRINK), color: tris[i].c, depth: depth });
      }
    }

    const top = [cx + s, cy - s];
    const right = [cx + s, cy + s];
    const bottom = [cx - s, cy + s];
    const left = [cx - s, cy - s];
    const center = [cx, cy];
    const rots = faceRots || [0, 0, 0, 0];

    addFace(orientFace(state[faceNames[0]], rots[0]), top, left, center, 0);
    addFace(orientFace(state[faceNames[1]], rots[1]), top, center, right, 0);
    addFace(orientFace(state[faceNames[2]], rots[2]), bottom, right, center, 0);
    addFace(orientFace(state[faceNames[3]], rots[3]), bottom, center, left, 0);

    return polys;
  }

  function renderFTODual(state, mono, outlined, config) {
    const gap = 6;
    const s = 42;
    const frontPolys = renderFTOSquare(state, 50, 50, s, ["U", "R", "F", "L"], mono, outlined, config);
    // Back: B/D appear 120° CW too far → compensate CCW; BL/BR appear 120° CCW too far → compensate CW
    const backPolys = renderFTOSquare(
      state, 150 + gap, 50, s,
      ["B", "BL", "D", "BR"],
      mono, outlined, config,
      [-1, 1, -1, 1]
    );
    const polys = frontPolys.concat(backPolys);

    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 2;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const ftoRx = getRounded(config, 20);
    polys.forEach(function (p) {
      svg += polygon(p.pts, getColorValue(p.color, mono, outlined), getStrokeFor(mono, outlined), getStrokeWidthFor(outlined, 0.8), ftoRx);
    });
    svg += "</svg>";
    return svg;
  }

  function renderFTORotated(state, rotX, rotY, mono, outlined, config) {
    const polys = [];
    const r = 2;
    const SHRINK = 0.92;
    const oll = config && config.oll;
    const GRAY = COLORS.Gy;

    function colorFor(c) {
      if (oll) return c === "W" ? getColorValue("Y", mono, outlined) : (outlined ? "none" : GRAY);
      return getColorValue(c, mono, outlined);
    }

    function lerp3(a, b, t) {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }

    function shrink(pts, f) {
      let pcx = 0, pcy = 0;
      for (let i = 0; i < pts.length; i++) { pcx += pts[i][0]; pcy += pts[i][1]; }
      pcx /= pts.length; pcy /= pts.length;
      return pts.map(function (p) { return [pcx + (p[0] - pcx) * f, pcy + (p[1] - pcy) * f]; });
    }

    function faceNormal(top, bl, br) {
      const v1 = [bl[0] - top[0], bl[1] - top[1], bl[2] - top[2]];
      const v2 = [br[0] - top[0], br[1] - top[1], br[2] - top[2]];
      return [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0],
      ];
    }

    const vertPos = {
      T: [0, r, 0], Bo: [0, -r, 0], Fr: [0, 0, r],
      Ba: [0, 0, -r], Ri: [r, 0, 0], Le: [-r, 0, 0],
    };

    const faceVerts = {
      U: ["T", "Le", "Fr"], R: ["T", "Fr", "Ri"], F: ["Bo", "Ri", "Fr"],
      L: ["Bo", "Fr", "Le"], D: ["Bo", "Ba", "Ri"], B: ["T", "Ba", "Le"],
      BR: ["T", "Ri", "Ba"], BL: ["Bo", "Le", "Ba"],
    };

    function addFTORotatedFace(faceState, top, bl, br) {
      const L1 = lerp3(top, bl, 1 / 3), L2 = lerp3(top, bl, 2 / 3);
      const R1 = lerp3(top, br, 1 / 3), R2 = lerp3(top, br, 2 / 3);
      const B1 = lerp3(bl, br, 1 / 3), B2 = lerp3(bl, br, 2 / 3);
      const M = lerp3(L2, R2, 0.5);

      const rows = [[top], [L1, R1], [L2, M, R2], [bl, B1, B2, br]];
      const tris = [
        { pts: [rows[0][0], rows[1][0], rows[1][1]], c: faceState[0] },
        { pts: [rows[1][0], rows[2][0], rows[2][1]], c: faceState[1] },
        { pts: [rows[1][0], rows[2][1], rows[1][1]], c: faceState[2] },
        { pts: [rows[1][1], rows[2][1], rows[2][2]], c: faceState[3] },
        { pts: [rows[2][0], rows[3][0], rows[3][1]], c: faceState[4] },
        { pts: [rows[2][0], rows[3][1], rows[2][1]], c: faceState[5] },
        { pts: [rows[2][1], rows[3][1], rows[3][2]], c: faceState[6] },
        { pts: [rows[2][1], rows[3][2], rows[2][2]], c: faceState[7] },
        { pts: [rows[2][2], rows[3][2], rows[3][3]], c: faceState[8] },
      ];

      for (let i = 0; i < tris.length; i++) {
        let zSum = 0;
        const projected = tris[i].pts.map(function (p) {
          const rot = rotate3D(p[0], p[1], p[2], rotX, rotY);
          zSum += rot[2];
          return [rot[0], -rot[1]];
        });
        polys.push({ pts: shrink(projected, SHRINK), color: tris[i].c, depth: zSum / 3 });
      }
    }

    const faceNames = ["U", "R", "F", "L", "D", "B", "BR", "BL"];
    const visible = [];
    for (let fi = 0; fi < faceNames.length; fi++) {
      const fn = faceNames[fi];
      const vn = faceVerts[fn];
      const top = vertPos[vn[0]], bl = vertPos[vn[1]], br = vertPos[vn[2]];
      const n = faceNormal(top, bl, br);
      const rn = rotate3D(n[0], n[1], n[2], rotX, rotY);
      if (rn[2] > 0.05) {
        const cx = (top[0] + bl[0] + br[0]) / 3;
        const cy = (top[1] + bl[1] + br[1]) / 3;
        const cz = (top[2] + bl[2] + br[2]) / 3;
        const rc = rotate3D(cx, cy, cz, rotX, rotY);
        visible.push({ name: fn, depth: rc[2] });
      }
    }
    visible.sort(function (a, b) { return a.depth - b.depth; });

    for (let vi = 0; vi < visible.length; vi++) {
      const faceName = visible[vi].name;
      const verts = faceVerts[faceName];
      addFTORotatedFace(state[faceName], vertPos[verts[0]], vertPos[verts[1]], vertPos[verts[2]]);
    }

    polys.sort(function (a, b) { return a.depth - b.depth; });

    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
    });
    const pad = 0.3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    const ftoRx = getRounded(config, 1.5);
    const ftoSw = getStrokeWidthFor(outlined, 0.04);
    polys.forEach(function (p) {
      svg += polygon(p.pts, colorFor(p.color), getStrokeFor(mono, outlined), ftoSw, ftoRx);
    });
    svg += "</svg>";
    return svg;
  }

  // ─── FTO Top View Renderer ───
  // Hexagonal perspective projection with occlusion.
  // Inner hexagon (radius R) holds U + 3 adjacent faces.
  // Corner faces use outer radius Ro so they peek beyond the inner faces.
  // Drawing order back-to-front: corners → adjacent → U.

  function renderFTOTop(state, mono, outlined, config) {
    const oll = config && config.oll;
    const GRAY = COLORS.Gy;
    let sk = getStrokeFor(mono, outlined);
    let sw = getStrokeWidthFor(outlined, 0.8);
    const ftoRx = getRounded(config, 20);
    const SHRINK = 0.88;

    function colorFor(c) {
      if (oll) return c === "W" ? getColorValue("Y", mono, outlined) : (outlined ? "none" : GRAY);
      return getColorValue(c, mono, outlined);
    }

    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

    function shrink(pts, f) {
      let pcx = 0, pcy = 0;
      for (let i = 0; i < pts.length; i++) { pcx += pts[i][0]; pcy += pts[i][1]; }
      pcx /= pts.length; pcy /= pts.length;
      return pts.map(function (p) { return [pcx + (p[0] - pcx) * f, pcy + (p[1] - pcy) * f]; });
    }

    function drawFace(faceState, top, bl, br) {
      let r1a = lerp(top, bl, 1 / 3), r1b = lerp(top, br, 1 / 3);
      let r2a = lerp(top, bl, 2 / 3), r2c = lerp(top, br, 2 / 3);
      const r2b = [(r2a[0] + r2c[0]) / 2, (r2a[1] + r2c[1]) / 2];
      let r3b = lerp(bl, br, 1 / 3), r3c = lerp(bl, br, 2 / 3);
      const tris = [
        [top, r1a, r1b], [r1a, r2a, r2b], [r1a, r2b, r1b],
        [r1b, r2b, r2c], [r2a, bl, r3b], [r2a, r3b, r2b],
        [r2b, r3b, r3c], [r2b, r3c, r2c], [r2c, r3c, br],
      ];
      let result = "";
      for (let i = 0; i < 9; i++) {
        result += polygon(shrink(tris[i], SHRINK), colorFor(faceState[i]), sk, sw, ftoRx);
      }
      return result;
    }

    const R = 36;
    const Ro = R * 1.1;
    const gap = 6;
    let cx = 50, cy = 50;

    function hv(i, r) {
      // +60° CW from the classic U-pointing layout
      const a = -Math.PI / 2 + Math.PI / 3 + i * Math.PI / 3;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }

    let vT = hv(0, R), vFr = hv(2, R), vLe = hv(4, R);
    let vRi = hv(1, R), vBo = hv(3, R), vBa = hv(5, R);
    let vRio = hv(1, Ro), vBoo = hv(3, Ro), vBao = hv(5, Ro);

    const s3 = Math.sqrt(3) / 2;
    function gp(v, dx, dy) { return [v[0] + dx * gap, v[1] + dy * gap]; }

    // Gap offsets also rotated +60° CW from (0,-1), (-s3,0.5), (s3,0.5)
    const bV = [gp(vT, s3, -0.5), gp(vRio, s3, -0.5), gp(vBao, s3, -0.5)];
    const dV = [gp(vBoo, -s3, -0.5), gp(vLe, -s3, -0.5), gp(vBao, -s3, -0.5)];
    const fV = [gp(vBoo, 0, 1), gp(vRio, 0, 1), gp(vFr, 0, 1)];

    const pad = 3;
    let allPts = [vT, vFr, vLe, bV[0], bV[1], bV[2], dV[0], dV[1], dV[2], fV[0], fV[1], fV[2]];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let pi = 0; pi < allPts.length; pi++) {
      if (allPts[pi][0] < minX) minX = allPts[pi][0];
      if (allPts[pi][1] < minY) minY = allPts[pi][1];
      if (allPts[pi][0] > maxX) maxX = allPts[pi][0];
      if (allPts[pi][1] > maxY) maxY = allPts[pi][1];
    }
    let svg = svgOpen((minX - pad) + " " + (minY - pad) + " " + (maxX - minX + 2 * pad) + " " + (maxY - minY + 2 * pad));

    // Corner peeks (faces not sharing an edge with U): BR, BL, F
    // Adjacent to U: B (T-Ba-Le), R (T-Fr-Ri), L (Bo-Fr-Le)
    svg += drawFace(state.BR, bV[0], bV[1], bV[2]);
    svg += drawFace(state.BL, dV[0], dV[1], dV[2]);
    svg += drawFace(state.F, fV[0], fV[1], fV[2]);

    svg += drawFace(state.B, vT, vBa, vLe);
    svg += drawFace(state.R, vT, vFr, vRi);
    svg += drawFace(state.L, vBo, vFr, vLe);

    svg += drawFace(state.U, vT, vLe, vFr);

    svg += "</svg>";
    return svg;
  }

  // ─── Square-1 State Engine ───
  // Each piece: { type: "C"|"E", color: letter, side: letter|[letter,letter] }
  // C (corner) = value 2 (60°), has 2 side colors (one per 30° half of outer edge).
  // E (edge) = value 1 (30°), has 1 side color.
  // Each face must sum to exactly 12. Total: 8 corners + 8 edges.

  function createSquare1State() {
    return {
      // U starts at -75°. WCA standard: front=Red(R), right=Blue(B), back=Orange(O), left=Green(G)
      U: [
        { type: "C", color: "W", side: ["O", "B"] }, { type: "E", color: "W", side: "B" },
        { type: "C", color: "W", side: ["B", "R"] }, { type: "E", color: "W", side: "R" },
        { type: "C", color: "W", side: ["R", "G"] }, { type: "E", color: "W", side: "G" },
        { type: "C", color: "W", side: ["G", "O"] }, { type: "E", color: "W", side: "O" },
      ],
      // D starts at 105°. Same side colors, positions shifted 180° relative to U.
      D: [
        { type: "C", color: "Y", side: ["R", "G"] }, { type: "E", color: "Y", side: "G" },
        { type: "C", color: "Y", side: ["G", "O"] }, { type: "E", color: "Y", side: "O" },
        { type: "C", color: "Y", side: ["O", "B"] }, { type: "E", color: "Y", side: "B" },
        { type: "C", color: "Y", side: ["B", "R"] }, { type: "E", color: "Y", side: "R" },
      ],
      // Offset in 30° slots from each layer's default start angle.
      // U default start: -75°.  D default start: 105°.
      // Turns only update these offsets; pieces are NEVER reordered by turns.
      uOff: 0,
      dOff: 0,
      // Equator ring: 4 variable panels (the 2 lateral Blue/Green panels are fixed).
      // Each panel: color letter + size letter  (R=Red, O=Orange, s=small, l=large).
      // Physical geometry: front face = small(left) + large(right); back = large(left) + small(right).
      // Slash swaps fR (front-right) with bR (back-right).
      eq: { fL: "Rs", fR: "Rl", bL: "Ol", bR: "Os" },
    };
  }

  function validateSquare1State(state) {
    function faceSum(face) {
      let s = 0;
      for (let i = 0; i < face.length; i++) s += face[i].type === "C" ? 2 : 1;
      return s;
    }
    function countType(face, t) {
      let c = 0;
      for (let i = 0; i < face.length; i++) if (face[i].type === t) c++;
      return c;
    }
    if (faceSum(state.U) !== 12 || faceSum(state.D) !== 12) return false;
    let totalC = countType(state.U, "C") + countType(state.D, "C");
    let totalE = countType(state.U, "E") + countType(state.D, "E");
    return totalC === 8 && totalE === 8;
  }

  function generateSquare1Scramble() {
    const sc = ["B", "R", "G", "O"];
    const fc = ["W", "Y"];
    const allPieces = [];
    for (let i = 0; i < 8; i++) allPieces.push({ type: "C", color: fc[Math.floor(Math.random() * 2)], side: [sc[Math.floor(Math.random() * 4)], sc[Math.floor(Math.random() * 4)]] });
    for (let i = 0; i < 8; i++) allPieces.push({ type: "E", color: fc[Math.floor(Math.random() * 2)], side: sc[Math.floor(Math.random() * 4)] });
    shuffle(allPieces);

    const uFace = [], dFace = []; let uSum = 0;
    for (let i = 0; i < allPieces.length; i++) {
      const val = allPieces[i].type === "C" ? 2 : 1;
      if (uSum + val <= 12) { uFace.push(allPieces[i]); uSum += val; }
      else { dFace.push(allPieces[i]); }
    }
    return { U: uFace, D: dFace };
  }

  function parseSquare1State(str) {
    const parts = str.split("/");
    if (parts.length < 2) return null;
    function parseFace(s, defaultColor) {
      const trimmed = s.trim();
      if (trimmed === "") return [];
      let tokens = trimmed.split(",");
      let face = [];
      for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i].trim().toUpperCase();
        if (t === "") continue;
        if (t === "C" || t === "E") {
          face.push({ type: t, color: defaultColor, side: null });
        } else {
          const segs = t.split(":");
          if (segs.length === 2) {
            const tp = segs[1];
            if (tp !== "C" && tp !== "E") return null;
            face.push({ type: tp, color: segs[0], side: null });
          } else if (segs.length === 3) {
            const tp = segs[1];
            if (tp !== "C" && tp !== "E") return null;
            let sideVal = segs[2];
            if (tp === "C" && i + 1 < tokens.length) {
              const nextT = tokens[i + 1].trim().toUpperCase();
              if (nextT.length === 1 && nextT !== "C" && nextT !== "E") {
                sideVal = [segs[2], nextT];
                i++;
              } else {
                sideVal = segs[2];
              }
            }
            face.push({ type: tp, color: segs[0], side: sideVal });
          } else if (segs.length === 4) {
            const tp = segs[1];
            if (tp !== "C" && tp !== "E") return null;
            face.push({ type: tp, color: segs[0], side: [segs[2], segs[3]] });
          } else {
            return null;
          }
        }
      }
      return face;
    }
    const uFace = parseFace(parts[0], "W");
    const dFace = parseFace(parts[1], "Y");
    if (!uFace || !dFace) return null;
    let state = { U: uFace, D: dFace };

    const sideSeq = ["B","R","R","G","G","O","O","B"];
    function assignDefaultSides(face) {
      let sIdx = 0;
      for (let i = 0; i < face.length; i++) {
        if (face[i].side === null) {
          if (face[i].type === "C") {
            face[i].side = [sideSeq[sIdx % 8], sideSeq[(sIdx + 1) % 8]];
            sIdx += 2;
          } else {
            face[i].side = sideSeq[sIdx % 8];
            sIdx += 1;
          }
        } else {
          sIdx += face[i].type === "C" ? 2 : 1;
        }
      }
    }
    assignDefaultSides(state.U);
    assignDefaultSides(state.D);
    return state;
  }

  function ensureSquare1MotionFields(state) {
    if (state.uOff == null) state.uOff = 0;
    if (state.dOff == null) state.dOff = 0;
    if (!state.eq) state.eq = { fL: "Rs", fR: "Rl", bL: "Ol", bR: "Os" };
    return state;
  }

  function resolveSquare1State(config) {
    if (config.stateObj) return ensureSquare1MotionFields(config.stateObj);
    if (config.state) {
      const parsed = parseSquare1State(config.state);
      if (parsed) return ensureSquare1MotionFields(parsed);
    }
    return createSquare1State();
  }

  function sq1PieceVal(p) { return p.type === "C" ? 2 : 1; }

  // Reverte a ordem das peças de um half E inverte os sides[] das quinas.
  // Quando um half é revertido no slash, a face CCW de cada quina vira CW e vice-versa.
  function sq1ReversedHalf(pieces) {
    return pieces.slice().reverse().map(function(p) {
      if (p.type === "C" && Array.isArray(p.side)) {
        return { type: p.type, color: p.color, side: [p.side[1], p.side[0]] };
      }
      return { type: p.type, color: p.color, side: Array.isArray(p.side) ? p.side.slice() : p.side };
    });
  }

  function sq1ClonePiece(p) {
    return {
      type: p.type,
      color: p.color,
      side: Array.isArray(p.side) ? p.side.slice() : p.side,
    };
  }

  function sq1CloneFace(face) {
    const out = [];
    for (let i = 0; i < face.length; i++) out.push(sq1ClonePiece(face[i]));
    return out;
  }

  function sq1NormUnits(n) {
    n = n % 12;
    if (n > 6) n -= 12;
    if (n < -6) n += 12;
    return n;
  }

  function sq1FaceToSlots(face) {
    const slots = [];
    for (let i = 0; i < face.length; i++) {
      const p = face[i];
      if (p.type === "C") {
        const s = p.side;
        slots.push({ t: "C", c: p.color, s: Array.isArray(s) ? s[0] : s, h: 0 });
        slots.push({ t: "C", c: p.color, s: Array.isArray(s) ? s[1] : s, h: 1 });
      } else {
        slots.push({ t: "E", c: p.color, s: Array.isArray(p.side) ? p.side[0] : p.side });
      }
    }
    return slots;
  }

  function sq1SlotsToFace(slots) {
    const face = [];
    let i = 0;
    while (i < slots.length) {
      if (i + 1 < slots.length &&
          slots[i].t === "C" && slots[i + 1].t === "C" &&
          slots[i].h === 0 && slots[i + 1].h === 1 &&
          slots[i].c === slots[i + 1].c) {
        face.push({ type: "C", color: slots[i].c, side: [slots[i].s, slots[i + 1].s] });
        i += 2;
      } else if (slots[i].t === "E") {
        face.push({ type: "E", color: slots[i].c, side: slots[i].s });
        i++;
      } else {
        i++;
      }
    }
    return face;
  }

  // ── Offset-aware helpers for slash ──────────────────────────────────────────

  // Extract exactly numSlots cumulative-slots worth of pieces starting from piece
  // index startIdx (wrapping around the array). Returns an array of cloned pieces.
  function sq1ExtractCircular(face, startIdx, numSlots) {
    const n = face.length;
    const result = [];
    let collected = 0;
    let k = 0;
    while (collected < numSlots) {
      const p = face[(startIdx + k) % n];
      result.push(sq1ClonePiece(p));
      collected += sq1PieceVal(p);
      k++;
    }
    return result;
  }

  // Find the piece index (0-based) whose CUMULATIVE slot count from the start
  // equals `target`. Returns -1 if target falls in the middle of a piece.
  // Special case: target===0 returns face.length-1 (knife is at the array start,
  // i.e. between the last and first pieces).
  function sq1FindSliceIndexAt(face, target) {
    if (target === 0) return face.length - 1;
    let sum = 0;
    for (let i = 0; i < face.length; i++) {
      sum += sq1PieceVal(face[i]);
      if (sum === target) return i;
      if (sum > target) return -1;
    }
    return -1;
  }

  // Find the piece index that STARTS exactly at `cumTarget` cumulative slots from
  // the array start.  Returns -1 if that position falls in the middle of a piece.
  // cumTarget===0 returns 0 (first piece).
  function sq1FindStartAt(face, cumTarget) {
    if (cumTarget === 0) return 0;
    let sum = 0;
    for (let i = 0; i < face.length; i++) {
      sum += sq1PieceVal(face[i]);
      if (sum === cumTarget) return (i + 1) % face.length;
      if (sum > cumTarget) return -1;
    }
    return -1;
  }

  function sq1RotateSlots(slots, amount) {
    amount = sq1NormUnits(amount);
    if (amount === 0) {
      return slots.map(function (s) { return Object.assign({}, s); });
    }
    amount = ((amount % 12) + 12) % 12;
    const out = new Array(12);
    for (let i = 0; i < 12; i++) {
      out[i] = Object.assign({}, slots[(i - amount + 12) % 12]);
    }
    return out;
  }

  function sq1RotateFace(face, amount, fromBottom) {
    const slots = sq1FaceToSlots(face);
    const amt = fromBottom ? -amount : amount;
    return sq1SlotsToFace(sq1RotateSlots(slots, amt));
  }

  function sq1FindSliceIndex(face) {
    // Legacy: find slice at the default position (cumSlots == 6 from face start).
    return sq1FindSliceIndexAt(face, 6);
  }

  function sq1CanSlash(state) {
    const uOff = ((state.uOff || 0) % 12 + 12) % 12;
    const dOff = ((state.dOff || 0) % 12 + 12) % 12;
    const uTarget = ((6 - uOff) + 12) % 12;
    const dTarget = ((6 - dOff) + 12) % 12;
    const ui = sq1FindSliceIndexAt(state.U, uTarget);
    const di = sq1FindSliceIndexAt(state.D, dTarget);
    if (ui < 0 || di < 0) return false;
    const ub = sq1FindStartAt(state.U, (12 - uOff) % 12);
    const db = sq1FindStartAt(state.D, (12 - dOff) % 12);
    return ub >= 0 && db >= 0;
  }

  function sq1ApplySlash(state) {
    if (!sq1CanSlash(state)) return false;

    const uOff = ((state.uOff || 0) % 12 + 12) % 12;
    const dOff = ((state.dOff || 0) % 12 + 12) % 12;

    // Position of the U-layer knife (physical 105°) in U's cumulative slot space.
    const uTarget = ((6 - uOff) + 12) % 12;
    // Position of the D-layer knife (physical 285°) in D's cumulative slot space.
    const dTarget = ((6 - dOff) + 12) % 12;

    const ui = sq1FindSliceIndexAt(state.U, uTarget);
    const di = sq1FindSliceIndexAt(state.D, dTarget);

    // Starting piece of U's "285°→105° front half" (= physical 285° in U's space).
    const ub = sq1FindStartAt(state.U, (12 - uOff) % 12);
    // Starting piece of D's "105°→285° unchanged half" (= physical 105° in D's space).
    const db = sq1FindStartAt(state.D, (12 - dOff) % 12);

    // Four 6-slot halves (each exactly 180° of the layer).
    const uFront = sq1ExtractCircular(state.U, ub, 6);                         // U 285°→105°
    const dFront = sq1ExtractCircular(state.D, (di + 1) % state.D.length, 6);  // D 285°→105°
    const uBack  = sq1ExtractCircular(state.U, (ub + uFront.length) % state.U.length, 6); // U 105°→285°
    const dBack  = sq1ExtractCircular(state.D, db, 6);                          // D 105°→285°

    // After the slash: right halves swap, each reversed (180° rotation reverses angular order).
    // Reversão de half → quinas trocam CCW↔CW (sq1ReversedHalf inverte o array E os sides[]).
    // New U: reversed D's right-half (fills U's right half) + U's left half (unchanged).
    // New D: D's left half (unchanged) + reversed U's right-half (fills D's right half).
    state.U = sq1ReversedHalf(dFront).concat(uBack);
    state.D = dBack.concat(sq1ReversedHalf(uFront));
    state.uOff = 0;
    state.dOff = 0;
    // Update equator ring: slash swaps front-right with back-right.
    if (state.eq) {
      let tmp = state.eq.fR;
      state.eq.fR = state.eq.bR;
      state.eq.bR = tmp;
    }
    return true;
  }

  function parseSquare1Moves(alg) {
    const moves = [];
    let s = (alg || "").replace(/\s+/g, "");
    let i = 0;
    while (i < s.length) {
      if (s[i] === "/") {
        moves.push({ type: "slash" });
        i++;
      } else if (s[i] === "(") {
        let j = s.indexOf(")", i);
        if (j < 0) break;
        const inner = s.slice(i + 1, j);
        const parts = inner.split(",");
        const top = parseInt(parts[0], 10) || 0;
        const bottom = parts.length > 1 ? (parseInt(parts[1], 10) || 0) : 0;
        moves.push({ type: "turn", top: top, bottom: bottom });
        i = j + 1;
      } else {
        let j = i;
        while (j < s.length && s[j] !== "/" && s[j] !== "(") j++;
        const seg = s.slice(i, j);
        if (seg.indexOf(",") >= 0) {
          const parts = seg.split(",");
          moves.push({
            type: "turn",
            top: parseInt(parts[0], 10) || 0,
            bottom: parseInt(parts[1], 10) || 0,
          });
        } else if (seg !== "") {
          moves.push({ type: "turn", top: parseInt(seg, 10) || 0, bottom: 0 });
        }
        i = j;
      }
    }
    return moves;
  }

  function applySquare1MoveParsed(state, move) {
    if (move.type === "slash") {
      sq1ApplySlash(state);
    } else {
      // Turns only update the rendering offset — pieces are NEVER reordered.
      state.uOff = ((state.uOff || 0) + move.top   + 120) % 12;
      state.dOff = ((state.dOff || 0) - move.bottom + 120) % 12;
    }
  }

  function applySquare1Algorithm(state, alg) {
    const moves = parseSquare1Moves(alg);
    for (let i = 0; i < moves.length; i++) {
      applySquare1MoveParsed(state, moves[i]);
    }
    return state;
  }

  function generateSquare1ScrambleAlg() {
    let state = createSquare1State();
    const parts = [];
    let moveCount = 0;
    let safety = 0;
    while (moveCount < 10 && safety++ < 1000) {
      const top = sq1NormUnits(Math.floor(Math.random() * 12));
      const bottom = sq1NormUnits(Math.floor(Math.random() * 12));
      if (top === 0 && bottom === 0) continue;
      const savedU = state.uOff, savedD = state.dOff;
      state.uOff = ((state.uOff + top + 120) % 12);
      state.dOff = ((state.dOff - bottom + 120) % 12);
      if (sq1CanSlash(state)) {
        parts.push("(" + top + "," + bottom + ")");
        sq1ApplySlash(state);
        parts.push("/");
        moveCount++;
      } else {
        state.uOff = savedU;
        state.dOff = savedD;
      }
    }
    return parts.join(" ");
  }

  // ─── Square-1 Renderer ───
  // Corners: kite shape spanning 60°, with 90° outer tip.
  // Edges: triangle spanning 30°.
  // A thin band on the outer edge of each piece shows its side color.

  function renderSquare1(state, mono, outlined, angle, config) {
    const R = 40;
    const BAND = 10;
    const showD = angle === "net";
    const faceGap = showD ? 16 : 8;
    const GAP = 1.0;
    const DEG = Math.PI / 180;
    const SLOT = 30 * DEG;
    let sk = getStrokeFor(mono, outlined);
    let sw = getStrokeWidthFor(outlined, 0.5);
    const sq1Rx = getRounded(config, 20);

    function insetPoly(pts, d) {
      let n = pts.length;
      const edges = [];
      for (let i = 0; i < n; i++) {
        let j = (i + 1) % n;
        const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1];
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-10) { edges.push({ nx: 0, ny: 0, d: 0 }); continue; }
        let nx = -dy / len, ny = dx / len;
        edges.push({ nx: nx, ny: ny, d: nx * pts[i][0] + ny * pts[i][1] + d });
      }
      let result = [];
      for (let i = 0; i < n; i++) {
        const e1 = edges[(i - 1 + n) % n], e2 = edges[i];
        const det = e1.nx * e2.ny - e1.ny * e2.nx;
        if (Math.abs(det) < 1e-10) { result.push(pts[i]); continue; }
        result.push([(e1.d * e2.ny - e2.d * e1.ny) / det, (e2.d * e1.nx - e1.d * e2.nx) / det]);
      }
      return result;
    }

    function ptR(ocx, ocy, r, a) {
      return [ocx + r * Math.cos(a), ocy + r * Math.sin(a)];
    }

    function drawSQ1Layer(svg, face, ocx, ocy, radius, bandW, startAngleDeg) {
      let currentAngle = startAngleDeg * DEG;
      const cOuterR = radius * Math.sin(105 * DEG) / Math.sin(45 * DEG);
      const totalR = radius + bandW;
      const cOuterRBand = totalR * Math.sin(105 * DEG) / Math.sin(45 * DEG);

      for (let i = 0; i < face.length; i++) {
        const isCorner = face[i].type === "C";
        const sweep = isCorner ? 2 * SLOT : SLOT;
        const a1 = currentAngle;
        const a2 = currentAngle + sweep;
        const side = face[i].side;

        if (isCorner) {
          const aMid = a1 + SLOT;
          let innerP1 = ptR(ocx, ocy, radius, a1);
          let innerTip = ptR(ocx, ocy, cOuterR, aMid);
          let innerP2 = ptR(ocx, ocy, radius, a2);
          let outerP1 = ptR(ocx, ocy, totalR, a1);
          let outerTip = ptR(ocx, ocy, cOuterRBand, aMid);
          let outerP2 = ptR(ocx, ocy, totalR, a2);

          if (side) {
            const s1 = Array.isArray(side) ? side[0] : side;
            const s2 = Array.isArray(side) ? side[1] : side;
            svg += polygon(insetPoly([innerP1, outerP1, outerTip, innerTip], GAP), getColorValue(s1, mono, outlined), sk, sw, sq1Rx);
            svg += polygon(insetPoly([innerTip, outerTip, outerP2, innerP2], GAP), getColorValue(s2, mono, outlined), sk, sw, sq1Rx);
          }

          const facePts = [[ocx, ocy], innerP1, innerTip, innerP2];
          svg += polygon(insetPoly(facePts, GAP), getColorValue(face[i].color, mono, outlined), sk, sw, sq1Rx);
        } else {
          let innerP1 = ptR(ocx, ocy, radius, a1);
          let innerP2 = ptR(ocx, ocy, radius, a2);
          let outerP1 = ptR(ocx, ocy, totalR, a1);
          let outerP2 = ptR(ocx, ocy, totalR, a2);

          if (side) {
            const sideColor = Array.isArray(side) ? side[0] : side;
            svg += polygon(insetPoly([innerP1, outerP1, outerP2, innerP2], GAP), getColorValue(sideColor, mono, outlined), sk, sw, sq1Rx);
          }

          const facePts = [[ocx, ocy], innerP1, innerP2];
          svg += polygon(insetPoly(facePts, GAP), getColorValue(face[i].color, mono, outlined), sk, sw, sq1Rx);
        }
        currentAngle = a2;
      }
      return svg;
    }

    const cornerOuterR = (R + BAND) * Math.sin(105 * DEG) / Math.sin(45 * DEG);
    const maxR = cornerOuterR;
    const W = maxR * 2 + 6;
    const faces = (showD ? 2 : 1);
    const totalH = faces === 2 ? (W + faceGap + W) : W;
    const pad = 3;
    let svg = svgOpen((-pad) + " " + (-pad) + " " + (W + pad * 2) + " " + (totalH + pad * 2));

    let cx = W / 2;
    const uStartDeg = -75 + (state.uOff || 0) * 30;
    const dStartDeg = 105 + (state.dOff || 0) * 30;
    const uCy = maxR + 3;
    svg = drawSQ1Layer(svg, state.U, cx, uCy, R, BAND, uStartDeg);

    if (showD) {
      const dCy = W + faceGap + maxR + 3;
      const uBottom = uCy + maxR;
      const dTop = dCy - maxR;
      const eqCy = (uBottom + dTop) / 2;
      const eqH = faceGap * 0.92;
      const eqW = 2 * (R + BAND) * 0.88;
      const eqX = cx - eqW / 2;
      const eqY = eqCy - eqH / 2;
      const bottomStrip = Math.max(1, eqH * 0.06);
      const mainH = eqH - bottomStrip;
      const eqSmallP = (Math.SQRT2 * Math.cos(75 * DEG));
      const eq = state.eq || {};
      const fL = eq.fL || "Rs";
      const fR = eq.fR || "Rl";
      const fLc = fL[0];
      const fRc = fR[0];
      const lS = fL[1] === "l" ? (1 - eqSmallP) : eqSmallP;
      const rS = fR[1] === "l" ? (1 - eqSmallP) : eqSmallP;
      const fLw = eqW * lS;
      const fRw = eqW * rS;
      const fLfill = mono ? MONO_FILL : getColorValue(fLc, false, outlined);
      const fRfill = mono ? MONO_FILL : getColorValue(fRc, false, outlined);
      svg += '<rect x="' + eqX.toFixed(1) + '" y="' + eqY.toFixed(1) + '" width="' + fLw.toFixed(1) + '" height="' + mainH.toFixed(1) + '" fill="' + fLfill + '" stroke="none"/>';
      svg += '<rect x="' + (eqX + fLw).toFixed(1) + '" y="' + eqY.toFixed(1) + '" width="' + fRw.toFixed(1) + '" height="' + mainH.toFixed(1) + '" fill="' + fRfill + '" stroke="none"/>';
      svg += '<rect x="' + eqX.toFixed(1) + '" y="' + (eqY + mainH).toFixed(1) + '" width="' + eqW.toFixed(1) + '" height="' + bottomStrip.toFixed(1) + '" fill="' + STROKE_COLOR + '" stroke="none"/>';
      svg = drawSQ1Layer(svg, state.D, cx, dCy, R, BAND, dStartDeg);
    }

    svg += "</svg>";
    return svg;
  }

  function renderSquare1Error(msg) {
    let svg = svgOpen("0 0 200 40");
    svg += '<text x="100" y="24" text-anchor="middle" font-size="11" font-family="monospace" fill="' + STROKE_COLOR + '">' + msg + '</text>';
    svg += "</svg>";
    return svg;
  }

  // ─── Square-1 3D Renderer ───

  function renderSquare1Rotated(state, rotX, rotY, mono, outlined, config) {
    const R = 40, BAND = 10;
    const D2R = Math.PI / 180;
    const SLOT = 30 * D2R;

    // Cube half-size: the corner tips reach the cube's vertical edges at ±45°,
    // so the flat face distance from center is HC = (R+BAND)·sin(105°) ≈ 48.3.
    // Vertical extent matches (±HC) so the solved puzzle is a real cube.
    const HC = (R + BAND) * Math.sin(105 * D2R);
    const EQ_H = HC / 3;                      // equator = mesma altura que U/D (2·EQ_H = HC−EQ_H)
    const SMALL = Math.SQRT2 * Math.cos(75 * D2R); // ≈0.366 (small equator panel fraction)
    const LARGE = 1 - SMALL;
    const tR = R + BAND;
    const cTipRo = tR * Math.sin(105 * D2R) / Math.sin(45 * D2R);

    const eq = state.eq || { fL: "Rs", fR: "Rl", bL: "Ol", bR: "Os" };
    const cubeshape = eq.fL[1] !== eq.fR[1] && eq.bL[1] !== eq.bR[1];

    const sk = getStrokeFor(mono, outlined);
    const sw = getStrokeWidthFor(outlined, 0.5);
    const rx = getRounded(config, 15);

    const polys = [];

    function r3(x, y, z) {
      return rotate3D(x, y, z, rotX, rotY);
    }

    function depth3(pts3) {
      let s = 0;
      for (let i = 0; i < pts3.length; i++) s += r3(pts3[i][0], pts3[i][1], pts3[i][2])[2];
      return s / pts3.length;
    }

    function prj(pts3) {
      return pts3.map(function (p) {
        const rp = r3(p[0], p[1], p[2]);
        return [rp[0], -rp[1]];
      });
    }

    function addFace(pts3, color) {
      polys.push({ pts: prj(pts3), color: color, depth: depth3(pts3) });
    }

    // Point on the cube's horizontal square boundary at angle `t` → [x, z].
    function sqPt(t) {
      const c = Math.cos(t), s = Math.sin(t);
      const m = Math.max(Math.abs(c), Math.abs(s));
      return [HC * c / m, HC * s / m];
    }

    // Outer profile of one piece at angle `t` (kite corners, round edges).
    function pieceOuterXZ(t, a1, a2, isC) {
      if (!isC) {
        return [tR * Math.cos(t), tR * Math.sin(t)];
      }
      const aMid = (a1 + a2) / 2;
      let rad;
      if (t <= aMid) {
        const f = (aMid - a1) < 1e-9 ? 1 : (t - a1) / (aMid - a1);
        rad = tR + (cTipRo - tR) * f;
      } else {
        const f = (a2 - aMid) < 1e-9 ? 1 : (t - aMid) / (a2 - aMid);
        rad = cTipRo + (tR - cTipRo) * f;
      }
      return [rad * Math.cos(t), rad * Math.sin(t)];
    }

    function ptXZ(t, a1, a2, isC) {
      return cubeshape ? sqPt(t) : pieceOuterXZ(t, a1, a2, isC);
    }

    // Draws one piece (corner or edge) of a layer: its top sticker (on the
    // horizontal cap at yTop) plus the vertical side stickers spanning yMid→yTop.
    function drawPiece(p, a1, a2, yTop, yMid) {
      const isC = p.type === "C";
      const aMid = (a1 + a2) / 2;
      let bps = [a1, a2];
      if (isC) bps.push(aMid);
      if (cubeshape) {
        for (let k = -4; k <= 8; k++) {
          const cang = (45 + 90 * k) * D2R;
          if (cang > a1 + 1e-6 && cang < a2 - 1e-6) bps.push(cang);
        }
      }
      bps.sort(function (x, y) { return x - y; });
      const uniq = [];
      for (let i = 0; i < bps.length; i++) {
        if (!uniq.length || Math.abs(bps[i] - uniq[uniq.length - 1]) > 1e-6) uniq.push(bps[i]);
      }
      bps = uniq;

      // Top sticker (fills its wedge of the cube's top/bottom square face).
      const top = [[0, yTop, 0]];
      for (let i = 0; i < bps.length; i++) {
        const q = ptXZ(bps[i], a1, a2, isC);
        top.push([q[0], yTop, q[1]]);
      }
      addFace(top, getColorValue(p.color, mono, outlined));

      // Inner bottom face (plastic body) — same shape as the top sticker but at
      // yMid.  These per-piece polygons are small enough that the painter's
      // algorithm sorts them correctly, sealing the hollow layer interior.
      const bot = [[0, yMid, 0]];
      for (let i = 0; i < bps.length; i++) {
        const q = ptXZ(bps[i], a1, a2, isC);
        bot.push([q[0], yMid, q[1]]);
      }
      addFace(bot, "#111");

      // Vertical side stickers.
      const side = p.side;
      if (!side) return;
      for (let i = 0; i < bps.length - 1; i++) {
        const qa = ptXZ(bps[i], a1, a2, isC);
        const qb = ptXZ(bps[i + 1], a1, a2, isC);
        let col;
        if (isC) {
          const midA = (bps[i] + bps[i + 1]) / 2;
          col = midA < aMid ? side[0] : side[1];
        } else {
          col = Array.isArray(side) ? side[0] : side;
        }
        addFace([
          [qa[0], yMid, qa[1]], [qa[0], yTop, qa[1]],
          [qb[0], yTop, qb[1]], [qb[0], yMid, qb[1]],
        ], getColorValue(col, mono, outlined));
      }
    }

    function addLayer(face, yTop, yMid, startDeg) {
      let a = startDeg * D2R;
      for (let i = 0; i < face.length; i++) {
        const p = face[i];
        const sweep = (p.type === "C" ? 2 : 1) * SLOT;
        drawPiece(p, a, a + sweep, yTop, yMid);
        a += sweep;
      }
    }

    addLayer(state.U, HC, EQ_H, -75 + (state.uOff || 0) * 30);
    addLayer(state.D, -HC, -EQ_H, 105 + (state.dOff || 0) * 30);

    // Equator ring: 4 vertical cube faces. Front/back are split into two panels
    // whose widths follow the eq state (small=36.6%, large=63.4% of the face).
    function eqC(k) { return mono ? MONO_FILL : getColorValue(k, false, outlined); }
    function frac(v) { return v[1] === "l" ? LARGE : SMALL; }

    function addEqFace(z, eqL, eqR) {
      const faceW = 2 * HC;
      const wL = faceW * frac(eqL);
      const wR = faceW * frac(eqR);
      const x0 = -HC;
      const x1 = x0 + wL;
      const x2 = x1 + wR;
      addFace([[x0, -EQ_H, z], [x0, EQ_H, z], [x1, EQ_H, z], [x1, -EQ_H, z]], eqC(eqL[0]));
      addFace([[x1, -EQ_H, z], [x1, EQ_H, z], [x2, EQ_H, z], [x2, -EQ_H, z]], eqC(eqR[0]));
    }

    addEqFace(HC, eq.fL, eq.fR);
    addEqFace(-HC, eq.bL, eq.bR);
    // Blue (right) panel: trapezoid connecting the actual right endpoint of the front
    // face to the actual right endpoint of the back face (equal in cubeshape, diverge when deformed).
    // Green (left) panel: both front and back start at x=-HC, so always a rectangle.
    const x2f = -HC + 2 * HC * (frac(eq.fL) + frac(eq.fR));
    const x2b = -HC + 2 * HC * (frac(eq.bL) + frac(eq.bR));
    addFace([[x2f, -EQ_H,  HC], [x2f,  EQ_H,  HC], [x2b,  EQ_H, -HC], [x2b, -EQ_H, -HC]], eqC("B"));
    addFace([[-HC, -EQ_H,  HC], [-HC,  EQ_H,  HC], [-HC,  EQ_H, -HC], [-HC, -EQ_H, -HC]], eqC("G"));

    polys.sort(function (a, b) { return a.depth - b.depth; });

    let allPts = [];
    polys.forEach(function (p) { allPts = allPts.concat(p.pts); });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPts.forEach(function (pt) {
      if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
    });
    const pad = 3;
    const vb = (minX - pad) + " " + (minY - pad) + " " + (maxX - minX + pad * 2) + " " + (maxY - minY + pad * 2);
    let svg = svgOpen(vb);
    polys.forEach(function (p) {
      svg += polygon(p.pts, p.color, sk, sw, rx);
    });
    svg += "</svg>";
    return svg;
  }

  // ─── Clock State Engine ───

  function createClockState() {
    const front = [];
    const back = [];
    for (let i = 0; i < 9; i++) {
      front.push(0);
      back.push(0);
    }
    return { front: front, back: back, pins: [false, false, false, false] };
  }

  function generateClockScramble() {
    let scramble = [];
    const positions = ["UR", "DR", "DL", "UL", "U", "R", "D", "L", "ALL"];
    for (let i = 0; i < positions.length; i++) {
      const val = Math.floor(Math.random() * 12);
      scramble.push(positions[i] + val + (val === 0 ? "" : (Math.random() < 0.5 ? "+" : "-")));
    }
    scramble.push("y2");
    for (let i = 0; i < positions.length; i++) {
      const val = Math.floor(Math.random() * 12);
      scramble.push(positions[i] + val + (val === 0 ? "" : (Math.random() < 0.5 ? "+" : "-")));
    }
    return scramble.join(" ");
  }

  // Pin indices: 0=UR, 1=DR, 2=DL, 3=UL. true = pin up (raised).
  // Clock grid (front): 0 1 2 / 3 4 5 / 6 7 8
  // Corner clocks (0,2,6,8) are shared between both faces and turn on both sides.
  // On the back face, a raised front-pin is down, so only the shared corner
  // clocks connected to that pin turn (in the opposite direction).
  const CLOCK_PIN_CLOCKS = {
    UR: [1, 2, 4, 5],
    DR: [4, 5, 7, 8],
    DL: [3, 4, 6, 7],
    UL: [0, 1, 3, 4],
    U:  [0, 1, 2, 3, 4, 5],
    R:  [1, 2, 4, 5, 7, 8],
    D:  [3, 4, 5, 6, 7, 8],
    L:  [0, 1, 3, 4, 6, 7],
    ALL:[0, 1, 2, 3, 4, 5, 6, 7, 8],
  };
  // The 4 corner clocks are single physical pieces shared by both faces.
  // The back view is mirrored horizontally, so a front corner maps to the
  // mirrored back index, and its visual turn direction is reversed.
  // Front corner index -> back view index: 0<->2, 6<->8 (horizontal mirror).
  const CLOCK_MIRROR = { 0: 2, 2: 0, 6: 8, 8: 6 };
  // Which front corner(s) each pin move drives (the corner adjacent to the pin).
  const CLOCK_PIN_CORNERS = {
    UR: [2],
    DR: [8],
    DL: [6],
    UL: [0],
    U:  [0, 2],
    R:  [2, 8],
    D:  [6, 8],
    L:  [0, 6],
    ALL:[0, 2, 6, 8],
  };

  function clockMod12(n) {
    return ((n % 12) + 12) % 12;
  }

  function clockAllPinsDown(state) {
    state.pins = [false, false, false, false];
  }

  function clockSetPins(state, name) {
    clockAllPinsDown(state);
    if (name === "ALL") {
      state.pins = [true, true, true, true];
    } else if (name === "U") {
      state.pins[0] = true;
      state.pins[3] = true;
    } else if (name === "R") {
      state.pins[0] = true;
      state.pins[1] = true;
    } else if (name === "D") {
      state.pins[1] = true;
      state.pins[2] = true;
    } else if (name === "L") {
      state.pins[2] = true;
      state.pins[3] = true;
    } else if (name === "UR") state.pins[0] = true;
    else if (name === "DR") state.pins[1] = true;
    else if (name === "DL") state.pins[2] = true;
    else if (name === "UL") state.pins[3] = true;
  }

  function clockSetPinsMulti(state, names) {
    clockAllPinsDown(state);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (name === "ALL") {
        state.pins = [true, true, true, true];
        return;
      }
      if (name === "U") {
        state.pins[0] = true;
        state.pins[3] = true;
      } else if (name === "R") {
        state.pins[0] = true;
        state.pins[1] = true;
      } else if (name === "D") {
        state.pins[1] = true;
        state.pins[2] = true;
      } else if (name === "L") {
        state.pins[2] = true;
        state.pins[3] = true;
      } else if (name === "UR") state.pins[0] = true;
      else if (name === "DR") state.pins[1] = true;
      else if (name === "DL") state.pins[2] = true;
      else if (name === "UL") state.pins[3] = true;
    }
  }

  function clockTurn(state, pinName, amount, dir) {
    if (!amount) return;
    const front = CLOCK_PIN_CLOCKS[pinName];
    const corners = CLOCK_PIN_CORNERS[pinName];
    if (!front) return;
    const delta = amount * dir;
    // Front: every clock around the raised pin(s) turns in the move direction.
    for (let i = 0; i < front.length; i++) {
      const idx = front[i];
      state.front[idx] = clockMod12(state.front[idx] + delta);
    }
    // Back: only the shared corner clocks driven by the pin turn. They are the
    // same physical pieces (mirrored index) and turn in the opposite direction.
    for (let i = 0; i < corners.length; i++) {
      const bIdx = CLOCK_MIRROR[corners[i]];
      state.back[bIdx] = clockMod12(state.back[bIdx] - delta);
    }
  }

  function clockFlipY2(state) {
    const tmp = state.front;
    state.front = state.back;
    state.back = tmp;
    // 180° flip: UR↔DL, DR↔UL — raised pins move to opposite side
    state.pins = [state.pins[2], state.pins[3], state.pins[0], state.pins[1]];
  }

  function applyClockMove(state, move) {
    let m = move.trim().replace(/[\u2018\u2019\u0060\u00B4]/g, "'");
    if (!m) return state;

    if (m === "y2" || m === "y" || m === "y'") {
      clockFlipY2(state);
      return state;
    }

    const paren = m.match(/^\(([^)]+)\)$/);
    if (paren) {
      clockSetPinsMulti(state, paren[1].trim().split(/\s+/).filter(Boolean));
      return state;
    }

    const tm = m.match(/^(UR|DR|DL|UL|U|R|D|L|ALL)(\d+)?([+-])?$/);
    if (!tm) return state;

    const name = tm[1];
    const amount = tm[2] ? parseInt(tm[2], 10) : 0;
    let dir = 1;
    if (tm[3] === "-") dir = -1;
    else if (tm[3] === "+") dir = 1;

    clockSetPins(state, name);
    if (amount > 0 || tm[3]) {
      clockTurn(state, name, amount, dir);
      clockAllPinsDown(state);
    }
    return state;
  }

  function applyClockAlgorithm(state, alg) {
    const moves = alg.trim().split(/\s+/).filter(function (m) { return !!m; });
    for (let i = 0; i < moves.length; i++) applyClockMove(state, moves[i]);
    return state;
  }

  function invertBasicAlgorithmMove(move) {
    if (!move) return move;
    if (move.endsWith("++")) return move.slice(0, -2) + "--";
    if (move.endsWith("--")) return move.slice(0, -2) + "++";
    if (move.endsWith("2")) return move;
    if (move.endsWith("'")) return move.slice(0, -1);
    return move + "'";
  }

  function invertSquare1MoveString(move) {
    if (!move) return "";
    if (move.type === "slash") return "/";
    return "(" + (-move.top) + "," + (-move.bottom) + ")";
  }

  function getInvertedAlgorithm(type, alg) {
    if (!alg || type === "clock") return alg || "";
    if (type === "square1") {
      const moves = parseSquare1Moves(alg);
      const inv = [];
      for (let i = moves.length - 1; i >= 0; i--) inv.push(invertSquare1MoveString(moves[i]));
      return inv.join(" ");
    }
    const moves = alg.trim().split(/\s+/).filter(function (m) { return !!m; });
    const inv = [];
    for (let i = moves.length - 1; i >= 0; i--) inv.push(invertBasicAlgorithmMove(moves[i]));
    return inv.join(" ");
  }

  function getEffectiveAlgorithm(config) {
    if (!config || !config.alg) return config ? (config.alg || "") : "";
    if (!config.inverse || config.type === "clock") return config.alg;
    return getInvertedAlgorithm(config.type, config.alg);
  }

  function renderClockFace(ox, oy, faceData, pins, faceColor, isDark, mono, outlined) {
    const faceR = 40;
    const clockR = 9;
    const dotR = 1.5;
    let cStroke = getStrokeFor(mono, outlined);

    const defaultFaceColor = isDark ? "#1a1a2e" : "#d4d4d4";
    const bgColor = faceColor || defaultFaceColor;
    let dialColor, tickColor, dotColor, handColor;
    if (outlined) {
      dialColor = "none"; tickColor = "none"; dotColor = "none"; handColor = cStroke;
    } else if (mono) {
      dialColor = "#555"; tickColor = "#888"; dotColor = "#444"; handColor = cStroke;
    } else {
      if (isDark) {
        dialColor = "#2a2a4a";
        tickColor = "#9999cc";
        dotColor = "#bbbbdd";
        handColor = "#ffffff";
      } else {
        dialColor = "#f5e6c8";
        tickColor = "#ccc";
        dotColor = "#333";
        handColor = "#333";
      }
    }

    let svg = "";
    svg += circle(ox, oy, faceR, outlined ? "none" : (mono ? "#666" : bgColor), cStroke, outlined ? 1.5 : 1.0);

    const positions = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        positions.push([ox + (col - 1) * 22, oy + (row - 1) * 22]);
      }
    }

    for (let i = 0; i < 9; i++) {
      const px = positions[i][0];
      const py = positions[i][1];
      const hour = faceData[i];

      svg += circle(px, py, clockR, outlined ? "none" : dialColor, cStroke, outlined ? 1.0 : 0.5);

      for (let h = 0; h < 12; h++) {
        const a = (h * Math.PI * 2 / 12) - Math.PI / 2;
        const dx = px + (clockR - 2) * Math.cos(a);
        const dy = py + (clockR - 2) * Math.sin(a);
        svg += circle(dx, dy, isDark ? 0.7 : 0.5, outlined ? "none" : tickColor, cStroke, outlined ? 0.3 : 0);
      }

      const handAngle = (hour * Math.PI * 2 / 12) - Math.PI / 2;
      const hx = px + (clockR - 3) * Math.cos(handAngle);
      const hy = py + (clockR - 3) * Math.sin(handAngle);
      svg += line(px, py, hx, hy, handColor, 1.2);
      svg += circle(px, py, dotR, outlined ? "none" : dotColor, cStroke, outlined ? 0.5 : 0);
    }

    if (pins) {
      const pinPositions = [
        [ox + 11, oy - 11], [ox + 11, oy + 11],
        [ox - 11, oy + 11], [ox - 11, oy - 11],
      ];
      for (let i = 0; i < 4; i++) {
        const pinFill = outlined ? "none" : (pins[i] ? (mono ? "#aaa" : "#FFD700") : (mono ? "#555" : "#8B7340"));
        svg += circle(pinPositions[i][0], pinPositions[i][1], 2.5, pinFill, cStroke, outlined ? 0.8 : 0.5);
      }
    }

    return svg;
  }

  function renderClock(angle, state, mono, outlined, config) {
    config = config || {};
    const showFront = angle !== "back";
    const showBack = angle === "back" || angle === "top" || angle === "dual";

    const frontColor = config.clockFront || null;
    const backColor = config.clockBack || null;

    if (showFront && showBack) {
      const gap = 6;
      let svg = svgOpen("0 0 " + (200 + gap) + " 100");
      svg += renderClockFace(50, 50, state.front, state.pins, frontColor, false, mono, outlined);
      svg += renderClockFace(150 + gap, 50, state.back, state.pins, backColor, true, mono, outlined);
      svg += "</svg>";
      return svg;
    }

    let svg = svgOpen("0 0 100 100");
    if (showBack) {
      svg += renderClockFace(50, 50, state.back, state.pins, backColor, true, mono, outlined);
    } else {
      svg += renderClockFace(50, 50, state.front, state.pins, frontColor, false, mono, outlined);
    }
    svg += "</svg>";
    return svg;
  }

  // ─── Overlay Engine (Arrows, Highlighting, Labels) ───

  const _PIECE_3X3 = {
    FRU:["U8","F2","R0"], FLU:["U6","F0","L2"], BRU:["U2","B0","R2"], BLU:["U0","B2","L0"],
    DFR:["D2","F8","R6"], DFL:["D0","F6","L8"], BDR:["D8","B6","R8"], BDL:["D6","B8","L6"],
    FU:["U7","F1"], RU:["U5","R1"], BU:["U1","B1"], LU:["U3","L1"],
    FR:["F5","R3"], FL:["F3","L5"], BR:["B3","R5"], BL:["B5","L3"],
    DF:["D1","F7"], DR:["D5","R7"], BD:["D7","B7"], DL:["D3","L7"]
  };

  function parseArrowStr(str) {
    if (!str) return [];
    const arrows = [], parts = str.split(',');
    for (let i = 0; i < parts.length; i++) {
      let part = parts[i].trim();
      if (!part) continue;
      let color = null, ci = part.lastIndexOf(':');
      if (ci > 0) { color = part.substring(ci + 1).trim(); part = part.substring(0, ci).trim(); }
      let style, fromTo;
      if (part.indexOf('<->') >= 0) { style = '<->'; fromTo = part.split('<->'); }
      else if (part.indexOf('->') >= 0) { style = '->'; fromTo = part.split('->'); }
      else if (part.indexOf('--') >= 0) { style = '--'; fromTo = part.split('--'); }
      else if (part.indexOf('>') >= 0) { style = '->'; fromTo = part.split('>'); }
      else continue;
      if (fromTo.length !== 2) continue;
      const from = fromTo[0].trim().match(/^([A-Za-z]+)(\d+)$/);
      const to = fromTo[1].trim().match(/^([A-Za-z]+)(\d+)$/);
      if (from && to) arrows.push({
        from: from[1].toUpperCase() + from[2], to: to[1].toUpperCase() + to[2],
        style: style, color: color
      });
    }
    return arrows;
  }

  function getOverlayScale(type) {
    if (type === "pyraminx") return { fs: 14, sw: 2.5, ah: 8 };
    if (type === "megaminx") return { fs: 6, sw: 1.2, ah: 4 };
    if (type === "fto") return { fs: 10, sw: 1.5, ah: 5 };
    if (type === "square1") return { fs: 8, sw: 1.2, ah: 4 };
    if (type === "clock") return { fs: 8, sw: 1.0, ah: 3.5 };
    if (type === "skewb") return { fs: 0.7, sw: 0.12, ah: 0.5 };
    return { fs: 0.55, sw: 0.1, ah: 0.4 };
  }

  function getNxNStickerPos(n, angle) {
    let gap = 0.08, ss = 1, unit = ss + gap, tf = n * unit - gap;
    const pos = {}, fc = {};
    function grid(face, ox, oy) {
      let sx = 0, sy = 0;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        let x = ox + c * unit + ss / 2, y = oy + r * unit + ss / 2;
        pos[face + (r * n + c)] = [x, y]; sx += x; sy += y;
      }
      fc[face] = [sx / (n * n), sy / (n * n)];
    }
    if (angle === "front") {
      grid("U", 0, 0);
    } else if (angle === "iso") {
      const xf = [
        ["U", function (x, y) { return [x, tf, tf - y]; }],
        ["F", function (x, y) { return [x, tf - y, tf]; }],
        ["R", function (x, y) { return [tf, tf - y, tf - x]; }]
      ];
      for (let fi = 0; fi < 3; fi++) {
        const fn = xf[fi][0], tr = xf[fi][1]; let sx = 0, sy = 0;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
          let p3 = tr(c * unit + ss / 2, r * unit + ss / 2);
          const p = projectIso(p3[0], p3[1], p3[2]);
          pos[fn + (r * n + c)] = p; sx += p[0]; sy += p[1];
        }
        fc[fn] = [sx / (n * n), sy / (n * n)];
      }
    } else if (angle === "top") {
      const sd = 0.45;
      grid("U", sd, sd);
      for (let i = 0; i < n; i++) {
        pos["B" + i] = [sd + (n - 1 - i) * unit + ss / 2, sd / 2];
        pos["F" + i] = [sd + i * unit + ss / 2, sd + tf + sd / 2];
        pos["L" + i] = [sd / 2, sd + (n - 1 - i) * unit + ss / 2];
        pos["R" + i] = [sd + tf + sd / 2, sd + i * unit + ss / 2];
      }
      fc["U"] = [sd + tf / 2, sd + tf / 2];
      fc["B"] = [sd + tf / 2, sd / 2];
      fc["F"] = [sd + tf / 2, sd + tf + sd / 2];
      fc["L"] = [sd / 2, sd + tf / 2];
      fc["R"] = [sd + tf + sd / 2, sd + tf / 2];
    } else if (angle === "net") {
      const fu = tf + gap * 3;
      const off = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
      const fns = ["U", "L", "F", "R", "B", "D"];
      for (let fi = 0; fi < 6; fi++) { const f = fns[fi], o = off[f]; grid(f, o[0] * fu, o[1] * fu); }
    }
    return { stickers: pos, faces: fc };
  }

  function getSkewbStickerPos(angle) {
    const pos = {}, fc = {};
    if (angle === "top") {
      const s = 3;
      const cx = s / 2;
      const cy = s / 2;
      const centerPts = [[cx, 0], [s, cy], [cx, s], [0, cy]];
      const nw = s, ne = s * 2, sw = s, se = s * 2;
      const icx = cx + s, icy = cy + s;

      function triCentroid(pts) {
        return centroid(pts);
      }

      pos["U4"] = triCentroid([[nw, nw], [icx, nw], [nw, icy]]);
      pos["U3"] = triCentroid([[ne, nw], [icx, nw], [ne, icy]]);
      pos["U1"] = triCentroid([[sw, se], [icx, se], [sw, icy]]);
      pos["U2"] = triCentroid([[ne, se], [icx, se], [ne, icy]]);
      pos["U0"] = triCentroid(centerPts.map(function (p) { return [s + p[0], s + p[1]]; }));
      fc["U"] = centroid([pos.U1, pos.U2, pos.U3, pos.U4, pos.U0]);

      pos["B0"] = triCentroid(centerPts.map(function (p) { return [s + p[0], p[1]]; }));
      pos["F0"] = triCentroid(centerPts.map(function (p) { return [s + p[0], s * 2 + p[1]]; }));
      pos["L0"] = triCentroid(centerPts.map(function (p) { return [p[0], s + p[1]]; }));
      pos["R0"] = triCentroid(centerPts.map(function (p) { return [s * 2 + p[0], s + p[1]]; }));
      fc["B"] = pos["B0"];
      fc["F"] = pos["F0"];
      fc["L"] = pos["L0"];
      fc["R"] = pos["R0"];

      pos["B2"] = triCentroid([[nw, nw], [icx, nw], [nw, nw - cy]]);
      pos["B1"] = triCentroid([[ne, nw], [icx, nw], [ne, nw - cy]]);
      pos["R2"] = triCentroid([[ne, nw], [ne + cx, nw], [ne, icy]]);
      pos["R1"] = triCentroid([[ne, se], [ne + cx, se], [ne, icy]]);
      pos["F1"] = triCentroid([[sw, se], [icx, se], [sw, se + cy]]);
      pos["F2"] = triCentroid([[ne, se], [icx, se], [ne, se + cy]]);
      pos["L1"] = triCentroid([[nw, nw], [nw - cx, nw], [nw, icy]]);
      pos["L2"] = triCentroid([[sw, se], [sw - cx, se], [sw, icy]]);

      return { stickers: pos, faces: fc };
    }
    if (angle === "net") {
      const s = 3;
      const cx = s / 2;
      const cy = s / 2;
      const faceXf = {
        U: function (x, y) { return [x, s, s - y]; },
        F: function (x, y) { return [x, s - y, s]; },
        R: function (x, y) { return [s, s - y, s - x]; },
        L: function (x, y) { return [0, s - y, x]; },
        B: function (x, y) { return [s - x, s - y, 0]; },
        D: function (x, y) { return [x, 0, y]; },
      };
      const unfoldEdge = {
        B: [[2.598076211353316, -1.5], [0, -3]],
        L: [[-2.598076211353316, -1.5], [-2.598076211353316, 1.5]],
        D: [[0, 3], [2.598076211353316, 1.5]],
      };
      function reflectPt(pt, ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / len2;
        const px = ax + t * dx;
        const py = ay + t * dy;
        return [2 * px - pt[0], 2 * py - pt[1]];
      }
      function netPt(x, y, fn) {
        if (fn === "D") y = s - y;
        const t = faceXf[fn](x, y);
        let p = projectIso(t[0], t[1], t[2]);
        const edge = unfoldEdge[fn];
        if (edge) p = reflectPt(p, edge[0][0], edge[0][1], edge[1][0], edge[1][1]);
        return p;
      }
      const triCorners = [
        { idx: 1, pts: [[0, 0], [cx, 0], [0, cy]] },
        { idx: 2, pts: [[s, 0], [s, cy], [cx, 0]] },
        { idx: 3, pts: [[s, s], [cx, s], [s, cy]] },
        { idx: 4, pts: [[0, s], [0, cy], [cx, s]] },
      ];
      const centerPts = [[cx, 0], [s, cy], [cx, s], [0, cy]];
      ["U", "F", "R", "B", "L", "D"].forEach(function (fn) {
        let sx = 0, sy = 0;
        const c0 = centroid(centerPts.map(function (p) { return netPt(p[0], p[1], fn); }));
        pos[fn + "0"] = c0;
        sx += c0[0]; sy += c0[1];
        triCorners.forEach(function (tri) {
          const c = centroid(tri.pts.map(function (p) { return netPt(p[0], p[1], fn); }));
          pos[fn + tri.idx] = c;
          sx += c[0]; sy += c[1];
        });
        fc[fn] = [sx / 5, sy / 5];
      });
      return { stickers: pos, faces: fc };
    }
    let s = 3, hf = s / 2, project = angle === "iso" ? projectIso : projectFront;
    function addFace(name, xf) {
      const cPts = [[hf, 0], [s, hf], [hf, s], [0, hf]].map(function (p) {
        let t = xf(p[0], p[1]); return project(t[0], t[1], t[2]);
      });
      pos[name + "0"] = centroid(cPts);
      const co = [[1, [[0, 0], [hf, 0], [0, hf]]], [2, [[s, 0], [s, hf], [hf, 0]]],
                [3, [[s, s], [hf, s], [s, hf]]], [4, [[0, s], [0, hf], [hf, s]]]];
      let sx = pos[name + "0"][0], sy = pos[name + "0"][1];
      for (let i = 0; i < 4; i++) {
        const pts = co[i][1].map(function (p) { const t = xf(p[0], p[1]); return project(t[0], t[1], t[2]); });
        let c = centroid(pts); pos[name + co[i][0]] = c; sx += c[0]; sy += c[1];
      }
      fc[name] = [sx / 5, sy / 5];
    }
    if (angle === "front") { addFace("U", function (x, y) { return [x, s - y, 0]; }); }
    else {
      addFace("U", function (x, y) { return [x, s, s - y]; });
      addFace("F", function (x, y) { return [x, s - y, s]; });
      addFace("R", function (x, y) { return [s, s - y, s - x]; });
    }
    return { stickers: pos, faces: fc };
  }

  function getPyraminxStickerPos(angle) {
    let s = 100, h = s * Math.sqrt(3) / 2, pos = {}, fc = {};
    function lr(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function addFace(name, top, bl, br) {
      let L1 = lr(top, bl, 1 / 3), L2 = lr(top, bl, 2 / 3), R1 = lr(top, br, 1 / 3), R2 = lr(top, br, 2 / 3);
      let B1 = lr(bl, br, 1 / 3), B2 = lr(bl, br, 2 / 3), M = lr(L2, R2, 0.5);
      const rows = [[top], [L1, R1], [L2, M, R2], [bl, B1, B2, br]];
      const tris = [
        [rows[0][0], rows[1][0], rows[1][1]], [rows[1][0], rows[2][0], rows[2][1]],
        [rows[1][0], rows[2][1], rows[1][1]], [rows[1][1], rows[2][1], rows[2][2]],
        [rows[2][0], rows[3][0], rows[3][1]], [rows[2][0], rows[3][1], rows[2][1]],
        [rows[2][1], rows[3][1], rows[3][2]], [rows[2][1], rows[3][2], rows[2][2]],
        [rows[2][2], rows[3][2], rows[3][3]]
      ];
      let sx = 0, sy = 0;
      for (let i = 0; i < 9; i++) { const c = centroid(tris[i]); pos[name + i] = c; sx += c[0]; sy += c[1]; }
      fc[name] = [sx / 9, sy / 9];
    }
    if (angle === "front") { addFace("F", [s / 2, 0], [0, h], [s, h]); }
    else {
      let g = s * 0.06, gx = g * Math.sqrt(3) / 2, gy = g / 2;
      addFace("F", [s / 2, 0], [0, h], [s, h]);
      addFace("R", [s + gx, h - gy], [s / 2 + gx, -gy], [s * 1.5 + gx, -gy]);
      addFace("L", [-gx, h - gy], [-s / 2 - gx, -gy], [s / 2 - gx, -gy]);
      addFace("D", [s / 2, 2 * h + g], [s, h + g], [0, h + g]);
    }
    return { stickers: pos, faces: fc };
  }

  function getMegaminxNetStickerPos() {
    const pos = {}, fc = {};
    const R = 28;
    const step = 2 * Math.PI / 5;
    function pVerts(cx, cy, r, sa) {
      const v = [];
      for (let i = 0; i < 5; i++) v.push([cx + r * Math.cos(sa + i * step), cy + r * Math.sin(sa + i * step)]);
      return v;
    }
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    getMegaNetFaceConfigs().forEach(function (cfg) {
      const face = cfg.face;
      const cx = cfg.cx;
      const cy = cfg.cy;
      const sa = cfg.sa;
      fc[face] = [cx, cy];
      pos[face + "0"] = [cx, cy];
      const outer = pVerts(cx, cy, R, sa);
      const inner = pVerts(cx, cy, R * 0.382, sa);
      fc[face] = centroid(inner);
      const W = 0.08;
      const cuts = [];
      for (let i = 0; i < 5; i++) {
        cuts.push([
          lerp(outer[i], outer[(i + 1) % 5], 0.5 - W),
          lerp(outer[i], outer[(i + 1) % 5], 0.5 + W),
        ]);
      }
      for (let i = 0; i < 5; i++) {
        const ni = (i + 1) % 5;
        const pi = (i + 4) % 5;
        pos[face + (1 + i * 2)] = centroid([inner[i], cuts[pi][1], outer[i], cuts[i][0]]);
        pos[face + (2 + i * 2)] = centroid([inner[i], cuts[i][0], cuts[i][1], inner[ni]]);
      }
    });
    return { stickers: pos, faces: fc };
  }

  function getMegaminxTopStickerPos(withPetals) {
    let cx = 50, cy = 50, outerR = 30, step = 2 * Math.PI / 5, startA = -Math.PI / 2;
    const pos = {}, fc = {};
    function pp(cxx, cyy, r, sa) {
      const pts = [];
      for (let i = 0; i < 5; i++) pts.push([cxx + r * Math.cos(sa + i * step), cyy + r * Math.sin(sa + i * step)]);
      return pts;
    }
    function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    let outer = pp(cx, cy, outerR, startA);
    let inner = pp(cx, cy, outerR * 0.382, startA);
    const edgeMids = [];
    for (let i = 0; i < 5; i++) edgeMids.push(mid(outer[i], outer[(i + 1) % 5]));
    pos["U0"] = [cx, cy];
    fc["U"] = [cx, cy];
    for (let i = 0; i < 5; i++) {
      pos["U" + (1 + i * 2)] = centroid([inner[i], edgeMids[(i + 4) % 5], outer[i], edgeMids[i]]);
      pos["U" + (2 + i * 2)] = centroid([inner[i], edgeMids[i], inner[(i + 1) % 5]]);
    }
    if (!withPetals) return { stickers: pos, faces: fc };
    const adj = ["BR", "R", "F", "L", "BL"];
    const bandDepth = outerR * 0.30;
    for (let i = 0; i < 5; i++) {
      const ni = (i + 1) % 5;
      const pA = outer[i];
      const pB = outer[ni];
      const eAng = Math.atan2(pB[1] - pA[1], pB[0] - pA[0]);
      const outA = eAng - Math.PI / 2;
      let ndx = Math.cos(outA);
      let ndy = Math.sin(outA);
      const oA = [pA[0] + ndx * bandDepth, pA[1] + ndy * bandDepth];
      const oB = [pB[0] + ndx * bandDepth, pB[1] + ndy * bandDepth];
      const o1 = lerp(oA, oB, 1 / 3);
      const o2 = lerp(oA, oB, 2 / 3);
      const mx = (o1[0] + o2[0]) / 2;
      const my = (o1[1] + o2[1]) / 2;
      const pentEdge = Math.sqrt((o2[0] - o1[0]) * (o2[0] - o1[0]) + (o2[1] - o1[1]) * (o2[1] - o1[1]));
      const apothem = pentEdge / (2 * Math.tan(Math.PI / 5));
      fc[adj[i]] = [mx + ndx * apothem, my + ndy * apothem];
    }
    return { stickers: pos, faces: fc };
  }

  function getMegaminx3dStickerPos(rotX, rotY) {
    const pos = {}, fc = {};
    const dodecVerts = [
      [0, -0.3249196962, -1.7013016167],
      [-1, -1.3763819205, -0.3249196962],
      [-0.6180339887, 1.3763819205, -0.8506508084],
      [-1.6180339887, 0.3249196962, 0.5257311121],
      [1.6180339887, -0.3249196962, -0.5257311121],
      [0.6180339887, -1.3763819205, 0.8506508084],
      [1, 1.3763819205, 0.3249196962],
      [0, 0.3249196962, 1.7013016167],
      [1, 0.3249196962, -1.3763819205],
      [-0.6180339887, -1.3763819205, 0.8506508084],
      [0.6180339887, 1.3763819205, -0.8506508084],
      [-1, -0.3249196962, 1.3763819205],
      [0, -1.3763819205, -1.0514622242],
      [-1, 1.3763819205, 0.3249196962],
      [1, -1.3763819205, -0.3249196962],
      [0, 1.3763819205, 1.0514622242],
      [-1, 0.3249196962, -1.3763819205],
      [-1.6180339887, -0.3249196962, -0.5257311121],
      [1.6180339887, 0.3249196962, 0.5257311121],
      [1, -0.3249196962, 1.3763819205],
    ];
    const dodecFaces = {
      U: [2, 13, 15, 6, 10], F: [6, 15, 7, 19, 18], R: [10, 6, 18, 4, 8],
      BR: [10, 2, 16, 0, 8], BL: [2, 13, 3, 11, 16], L: [15, 13, 3, 11, 7],
      D: [9, 5, 14, 12, 1], DL: [19, 7, 11, 9, 5], DR: [19, 18, 4, 14, 5],
      DBR: [4, 8, 0, 12, 14], B: [17, 16, 0, 12, 1], DBL: [17, 3, 11, 9, 1],
    };
    const faceNames = ["U", "F", "R", "BR", "BL", "L", "D", "DL", "DR", "DBR", "B", "DBL"];
    function pentCenter(idxs) {
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < idxs.length; i++) {
        sx += dodecVerts[idxs[i]][0];
        sy += dodecVerts[idxs[i]][1];
        sz += dodecVerts[idxs[i]][2];
      }
      return [sx / 5, sy / 5, sz / 5];
    }
    for (let fi = 0; fi < faceNames.length; fi++) {
      const fn = faceNames[fi];
      const ctr = pentCenter(dodecFaces[fn]);
      const rot = rotate3D(ctr[0], ctr[1], ctr[2], rotX, rotY);
      if (rot[2] <= 0.01) continue;
      fc[fn] = [rot[0], -rot[1]];
      pos[fn + "0"] = fc[fn];
    }
    return { stickers: pos, faces: fc };
  }

  function megaOverlayUses3d(config, angle) {
    return !!(config && config.rotate && angle !== "net" && angle !== "top" && !config.oll);
  }

  function getMegaminxStickerPos(angle, overlayConfig) {
    if (megaOverlayUses3d(overlayConfig, angle)) {
      return getMegaminx3dStickerPos(overlayConfig.rotate.x, overlayConfig.rotate.y);
    }
    if (angle === "net") return getMegaminxNetStickerPos();
    return getMegaminxTopStickerPos(angle !== "front");
  }

  function getFTOStickerPos(angle) {
    let s = 50, cx = 50, cy = 50, pos = {}, fc = {};
    function lr(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function addFace(name, top, bl, br) {
      let L1 = lr(top, bl, 1 / 3), L2 = lr(top, bl, 2 / 3), R1 = lr(top, br, 1 / 3), R2 = lr(top, br, 2 / 3);
      let B1 = lr(bl, br, 1 / 3), B2 = lr(bl, br, 2 / 3), M = lr(L2, R2, 0.5);
      const rows = [[top], [L1, R1], [L2, M, R2], [bl, B1, B2, br]];
      const tris = [
        [rows[0][0], rows[1][0], rows[1][1]], [rows[1][0], rows[2][0], rows[2][1]],
        [rows[1][0], rows[2][1], rows[1][1]], [rows[1][1], rows[2][1], rows[2][2]],
        [rows[2][0], rows[3][0], rows[3][1]], [rows[2][0], rows[3][1], rows[2][1]],
        [rows[2][1], rows[3][1], rows[3][2]], [rows[2][1], rows[3][2], rows[2][2]],
        [rows[2][2], rows[3][2], rows[3][3]]
      ];
      let sx = 0, sy = 0;
      for (let i = 0; i < 9; i++) { const c = centroid(tris[i]); pos[name + i] = c; sx += c[0]; sy += c[1]; }
      fc[name] = [sx / 9, sy / 9];
    }
    if (angle === "top") {
      let R = 36, gap = 6;
      function hv(i, r) {
        const a = -Math.PI / 2 + Math.PI / 3 + i * Math.PI / 3;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      }
      let vT = hv(0, R), vFr = hv(2, R), vLe = hv(4, R), vRi = hv(1, R), vBo = hv(3, R), vBa = hv(5, R);
      let Ro = R * 1.1, vRio = hv(1, Ro), vBoo = hv(3, Ro), vBao = hv(5, Ro);
      const s3 = Math.sqrt(3) / 2;
      function gp(v, dx, dy) { return [v[0] + dx * gap, v[1] + dy * gap]; }
      addFace("U", vT, vLe, vFr); addFace("R", vT, vFr, vRi); addFace("B", vT, vBa, vLe); addFace("L", vBo, vFr, vLe);
      addFace("BR", gp(vT, s3, -0.5), gp(vRio, s3, -0.5), gp(vBao, s3, -0.5));
      addFace("BL", gp(vBoo, -s3, -0.5), gp(vLe, -s3, -0.5), gp(vBao, -s3, -0.5));
      addFace("F", gp(vBoo, 0, 1), gp(vRio, 0, 1), gp(vFr, 0, 1));
    } else {
      const top = [cx + s, cy - s], right = [cx + s, cy + s], bottom = [cx - s, cy + s], left = [cx - s, cy - s], center = [cx, cy];
      addFace("U", top, left, center); addFace("R", top, center, right);
      addFace("F", bottom, right, center); addFace("L", bottom, center, left);
    }
    return { stickers: pos, faces: fc };
  }

  function getSquare1StickerPos(angle, faceState) {
    const R = 40, BAND = 10, faceGap = 8, DEG = Math.PI / 180, SLOT = 30 * DEG;
    const base = createSquare1State();
    const state = {
      U: (faceState && faceState.U) ? faceState.U : base.U,
      D: (faceState && faceState.D) ? faceState.D : base.D,
      uOff: (faceState && faceState.uOff != null) ? faceState.uOff : 0,
      dOff: (faceState && faceState.dOff != null) ? faceState.dOff : 0,
    };
    const stickers = {}, fc = {};

    function ptR(ocx, ocy, r, a) {
      return [ocx + r * Math.cos(a), ocy + r * Math.sin(a)];
    }

    function addLayer(faceName, face, ocx, ocy, radius, startAngleDeg) {
      let currentAngle = startAngleDeg * DEG;
      const cOuterR = radius * Math.sin(105 * DEG) / Math.sin(45 * DEG);
      let sx = 0, sy = 0;
      for (let i = 0; i < face.length; i++) {
        const isCorner = face[i].type === "C";
        const sweep = isCorner ? 2 * SLOT : SLOT;
        const a1 = currentAngle;
        const a2 = currentAngle + sweep;
        let cx, cy;
        if (isCorner) {
          const aMid = a1 + SLOT;
          const innerP1 = ptR(ocx, ocy, radius, a1);
          const innerTip = ptR(ocx, ocy, cOuterR, aMid);
          const innerP2 = ptR(ocx, ocy, radius, a2);
          cx = (ocx + innerP1[0] + innerTip[0] + innerP2[0]) / 4;
          cy = (ocy + innerP1[1] + innerTip[1] + innerP2[1]) / 4;
        } else {
          const innerP1 = ptR(ocx, ocy, radius, a1);
          const innerP2 = ptR(ocx, ocy, radius, a2);
          cx = (ocx + innerP1[0] + innerP2[0]) / 3;
          cy = (ocy + innerP1[1] + innerP2[1]) / 3;
        }
        stickers[faceName + i] = [cx, cy];
        sx += cx; sy += cy;
        currentAngle = a2;
      }
      fc[faceName] = face.length ? [sx / face.length, sy / face.length] : [ocx, ocy];
    }

    const cornerOuterR = (R + BAND) * Math.sin(105 * DEG) / Math.sin(45 * DEG);
    const maxR = cornerOuterR;
    const W = maxR * 2 + 6;
    const cx = W / 2;
    const uCy = maxR + 3;
    addLayer("U", state.U, cx, uCy, R, -75 + state.uOff * 30);
    if (angle === "net") {
      const dCy = W + faceGap + maxR + 3;
      addLayer("D", state.D, cx, dCy, R, 105 + state.dOff * 30);
    }
    return { stickers: stickers, faces: fc };
  }

  function getStickerPositions(type, angle, n, extra, overlayConfig) {
    const nxn = { "2x2": 2, "3x3": 3, "4x4": 4, "5x5": 5, "6x6": 6, "7x7": 7 };
    if (nxn[type]) return getNxNStickerPos(nxn[type], angle);
    if (type === "skewb") return getSkewbStickerPos(angle);
    if (type === "pyraminx") return getPyraminxStickerPos(angle);
    if (type === "megaminx") return getMegaminxStickerPos(angle, overlayConfig);
    if (type === "fto") return getFTOStickerPos(angle);
    if (type === "square1") return getSquare1StickerPos(angle, extra);
    return { stickers: {}, faces: {} };
  }

  function applyHighlightToState(state, highlightStr, type, n) {
    let pieces = highlightStr.split(',');
    const highlighted = {};

    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i].trim().toUpperCase();
      if (!p) continue;

      const ref = p.match(/^([A-Z]+)(\d+)$/);
      if (ref && state[ref[1]]) { highlighted[ref[1] + ref[2]] = true; continue; }

      if (type === "3x3") {
        const key = p.split('').sort().join('');
        if (_PIECE_3X3[key]) {
          const stks = _PIECE_3X3[key];
          for (let j = 0; j < stks.length; j++) highlighted[stks[j]] = true;
          continue;
        }
      }

      if (state[p]) {
        const fd = state[p];
        if (Array.isArray(fd[0])) {
          for (let r = 0; r < fd.length; r++)
            for (let c = 0; c < fd[r].length; c++)
              highlighted[p + (r * fd[r].length + c)] = true;
        } else if (Array.isArray(fd)) {
          for (let j = 0; j < fd.length; j++) highlighted[p + j] = true;
        }
        continue;
      }
    }

    const keys = Object.keys(highlighted);
    if (!keys.length) return;

    const faces = Object.keys(state);
    for (let fi = 0; fi < faces.length; fi++) {
      let face = faces[fi], fd = state[face];
      if (Array.isArray(fd) && Array.isArray(fd[0])) {
        for (let r = 0; r < fd.length; r++)
          for (let c = 0; c < fd[r].length; c++)
            if (!highlighted[face + (r * fd[r].length + c)]) fd[r][c] = "Gy";
      } else if (Array.isArray(fd) && typeof fd[0] === "string") {
        for (let j = 0; j < fd.length; j++)
          if (!highlighted[face + j]) fd[j] = "Gy";
      }
    }
  }

  function addOverlays(svg, config) {
    let type = config.type, angle = config.angle;
    const nxn = { "2x2": 2, "3x3": 3, "4x4": 4, "5x5": 5, "6x6": 6, "7x7": 7 };
    let n = nxn[type] || 0;
    let posData = getStickerPositions(type, angle, n, config.stateObj || null, config);
    const scale = getOverlayScale(type);
    let extra = '';

    const labelScale = config.labelSize > 0 ? config.labelSize : 1;
    const arrowScale = config.arrowSize > 0 ? config.arrowSize : 1;

    if (config.labels) {
      const faces = posData.faces;
      for (let face in faces) {
        if (!faces.hasOwnProperty(face)) continue;
        let labelFs = scale.fs * labelScale;
        if (type === "megaminx" && megaOverlayUses3d(config, angle)) labelFs = scale.fs * 0.04 * labelScale;
        else if (angle === "top" && face !== "U" && nxn[type]) labelFs = scale.fs * 0.55 * labelScale;
        extra += svgText(faces[face][0], faces[face][1], face, labelFs);
      }
    }

    if (config.arrows) {
      const arrows = parseArrowStr(config.arrows);
      if (arrows.length > 0) {
        let defs = '', lines = '';
        let uid = 'a' + Math.random().toString(36).substr(2, 5);
        const arrowSw = scale.sw * arrowScale;
        const arrowAh = scale.ah * arrowScale;
        for (let i = 0; i < arrows.length; i++) {
          const a = arrows[i];
          const fp = posData.stickers[a.from], tp = posData.stickers[a.to];
          if (!fp || !tp) continue;
          const color = a.color || '#ffdd00';
          const mid = uid + i;
          if (a.style === '->' || a.style === '<->') defs += svgArrowMarker(mid + 'e', color, arrowAh);
          if (a.style === '<->') defs += svgArrowMarker(mid + 's', color, arrowAh);
          const eid = (a.style !== '--') ? mid + 'e' : null;
          const sid = (a.style === '<->') ? mid + 's' : null;
          lines += svgArrowLine(fp[0], fp[1], tp[0], tp[1], color, arrowSw, eid, sid);
        }
        if (defs) extra = '<defs>' + defs + '</defs>' + lines + extra;
        else extra = lines + extra;
      }
    }

    if (extra) {
      if (config.arrows) svg = svg.replace('<svg ', '<svg overflow="visible" ');
      svg = svg.replace('</svg>', extra + '</svg>');
    }
    return svg;
  }

  // ─── Steps, Player & Interactive ───

  function clonePuzzleState(state) {
    if (state == null || typeof state !== "object") return state;
    if (Array.isArray(state)) {
      const arr = [];
      for (let i = 0; i < state.length; i++) arr.push(clonePuzzleState(state[i]));
      return arr;
    }
    const copy = {};
    for (const key in state) {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        copy[key] = clonePuzzleState(state[key]);
      }
    }
    return copy;
  }

  function createInitialState(config) {
    const nxnSizes = { "2x2": 2, "3x3": 3, "4x4": 4, "5x5": 5, "6x6": 6, "7x7": 7 };
    if (nxnSizes[config.type] !== undefined) return createNxNState(nxnSizes[config.type]);
    if (config.type === "skewb") return config.oll ? createSkewbOLLState() : createSkewbState();
    if (config.type === "pyraminx") return createPyraminxState();
    if (config.type === "megaminx") return createMegaminxState();
    if (config.type === "fto") return createFTOState();
    if (config.type === "square1") return resolveSquare1State(config);
    if (config.type === "clock") return createClockState();
    return createNxNState(3);
  }

  function applySingleMove(type, state, move) {
    const nxnSizes = { "2x2": 2, "3x3": 3, "4x4": 4, "5x5": 5, "6x6": 6, "7x7": 7 };
    const rot = parseRotationMove(move);
    if (nxnSizes[type] !== undefined && rot) applyNxNCubeRotation(state, rot.axis, rot.quarters);
    else if (nxnSizes[type] !== undefined) applyNxNMove(state, move);
    else if (type === "skewb") applySkewbMove(state, move);
    else if (type === "pyraminx") applyPyraminxMove(state, move);
    else if (type === "megaminx") applyMegaminxMove(state, move);
    else if (type === "fto") applyFTOMove(state, move);
    else if (type === "square1") {
      const parsed = parseSquare1Moves(move);
      if (parsed.length === 1) applySquare1MoveParsed(state, parsed[0]);
      else if (move === "/") sq1ApplySlash(state);
    }
    else if (type === "clock") applyClockMove(state, move);
  }

  function getAlgorithmSteps(config) {
    const effectiveAlg = getEffectiveAlgorithm(config);
    let moves;
    if (config.type === "square1") {
      moves = parseSquare1Moves(effectiveAlg);
    } else {
      moves = effectiveAlg.trim().split(/\s+/).filter(function (m) { return !!m; });
    }
    let state = createInitialState(config);
    const states = [clonePuzzleState(state)];
    for (let i = 0; i < moves.length; i++) {
      if (config.type === "square1") applySquare1MoveParsed(state, moves[i]);
      else applySingleMove(config.type, state, moves[i]);
      states.push(clonePuzzleState(state));
    }
    return { moves: moves, states: states };
  }

  function getFinalState(config) {
    let state = createInitialState(config);
    const nxnSizes = { "2x2": 2, "3x3": 3, "4x4": 4, "5x5": 5, "6x6": 6, "7x7": 7 };
    const effectiveAlg = getEffectiveAlgorithm(config);
    if (effectiveAlg) {
      if (config.type === "square1") {
        applySquare1Algorithm(state, effectiveAlg);
      } else {
        const moves = effectiveAlg.trim().split(/\s+/).filter(function (m) { return !!m; });
        for (let i = 0; i < moves.length; i++) applySingleMove(config.type, state, moves[i]);
      }
    } else if (config.scrambled) {
      if (nxnSizes[config.type] !== undefined) {
        applyAlgorithm(state, generateNxNScramble(nxnSizes[config.type]), nxnSizes[config.type]);
      } else if (config.type === "skewb") {
        applySkewbAlgorithm(state, generateSkewbScramble());
      } else if (config.type === "pyraminx") {
        applyPyraminxAlgorithm(state, generatePyraminxScramble());
      } else if (config.type === "megaminx") {
        applyMegaminxAlgorithm(state, generateMegaminxScramble());
      } else if (config.type === "fto") {
        state = generateFTOScramble();
      } else if (config.type === "clock") {
        applyClockAlgorithm(state, generateClockScramble());
      } else if (config.type === "square1") {
        state = createSquare1State();
        applySquare1Algorithm(state, generateSquare1ScrambleAlg());
      }
    }
    return state;
  }

  function renderIconWithState(config, stateObj) {
    const cfg = {};
    for (const k in config) {
      if (config.hasOwnProperty(k)) cfg[k] = config[k];
    }
    cfg.alg = null;
    cfg.scrambled = false;
    cfg.stateObj = stateObj;
    cfg.animate = false;
    return renderIcon(cfg);
  }

  function stepArrowHtml(vertical) {
    if (vertical) {
      return '<span class="ci-step-arrow ci-step-arrow-vertical" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M12 5v14M6 15l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
    }
    return '<span class="ci-step-arrow" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  }

  function getSizeClassFromEl(el) {
    const classes = el.className ? el.className.split(/\s+/) : [];
    for (let i = 0; i < classes.length; i++) {
      if (/^ci-\d+x$/.test(classes[i])) return classes[i];
    }
    return "ci-4x";
  }

  function parseStepsConfig(el) {
    const config = parseClasses(el);
    const typeAttr = el.getAttribute("data-ci-type");
    if (typeAttr) config.type = typeAttr;
    const angleAttr = el.getAttribute("data-ci-angle");
    if (angleAttr) config.angle = angleAttr;
    config.alg = el.getAttribute("data-ci-alg") || config.alg;
    config.sizeClass = getSizeClassFromEl(el);
    config.stepsVertical = el.classList && el.classList.contains("ci-steps-vertical");
    return config;
  }

  function processSteps(el) {
    if (el.getAttribute("data-ci-rendered")) return;
    const config = parseStepsConfig(el);
    if (!config.alg) return;
    if (!config.theme) {
      config.theme = detectTheme();
      applyTheme(config.theme);
    }

    const steps = getAlgorithmSteps(config);
    const vertical = config.stepsVertical;
    let html = '<div class="ci-steps-inner' + (vertical ? " ci-steps-inner-vertical" : "") + '">';

    for (let i = 0; i < steps.states.length; i++) {
      if (i > 0) html += stepArrowHtml(vertical);
      const label = i === 0 ? "\u2014" : steps.moves[i - 1];
      const svg = renderIconWithState(config, steps.states[i]);
      html += '<div class="ci-step">' +
        '<span class="ci-step-icon ' + config.sizeClass + '">' + svg + '</span>' +
        '<span class="ci-step-label">' + label + '</span></div>';
    }

    html += "</div>";
    el.innerHTML = html;
    el.setAttribute("data-ci-rendered", "1");
  }

  function initPlayer(el, config) {
    if (!config.alg || el.getAttribute("data-ci-player")) return;

    const steps = getAlgorithmSteps(config);
    const svgs = steps.states.map(function (s) { return renderIconWithState(config, s); });
    const speed = config.speed || 800;
    let current = 0;
    let playing = false;
    let timer = null;

    const wrapper = document.createElement("div");
    wrapper.className = "ci-player";
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);

    const controls = document.createElement("div");
    controls.className = "ci-player-controls";
    controls.innerHTML =
      '<button type="button" class="ci-player-btn" data-action="first" title="Inicio">&#9198;</button>' +
      '<button type="button" class="ci-player-btn" data-action="prev" title="Anterior">&#9664;</button>' +
      '<button type="button" class="ci-player-btn ci-player-play" data-action="play" title="Play/Pause">&#9654;</button>' +
      '<button type="button" class="ci-player-btn" data-action="next" title="Proximo">&#9654;</button>' +
      '<button type="button" class="ci-player-btn" data-action="last" title="Fim">&#9197;</button>';

    const progress = document.createElement("div");
    progress.className = "ci-player-progress";
    progress.innerHTML = '<div class="ci-player-progress-bar"></div>';

    const label = document.createElement("div");
    label.className = "ci-player-label";

    wrapper.appendChild(controls);
    wrapper.appendChild(progress);
    wrapper.appendChild(label);

    const playBtn = controls.querySelector('[data-action="play"]');
    const bar = progress.querySelector(".ci-player-progress-bar");

    function updateUI() {
      const total = svgs.length - 1;
      const pct = total > 0 ? (current / total) * 100 : 0;
      bar.style.width = pct + "%";
      label.textContent = current === 0 ? "\u2014" : steps.moves[current - 1];
      playBtn.innerHTML = playing ? "&#9208;" : "&#9654;";
    }

    function showStep(i) {
      current = Math.max(0, Math.min(i, svgs.length - 1));
      el.innerHTML = svgs[current];
      updateUI();
    }

    function stopPlay() {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      updateUI();
    }

    function startPlay() {
      if (current >= svgs.length - 1) current = 0;
      playing = true;
      updateUI();
      timer = setInterval(function () {
        if (current < svgs.length - 1) {
          showStep(current + 1);
        } else if (config.loop) {
          showStep(0);
        } else {
          stopPlay();
        }
      }, speed);
    }

    controls.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      stopPlay();
      if (action === "first") showStep(0);
      else if (action === "prev") showStep(current - 1);
      else if (action === "next") showStep(current + 1);
      else if (action === "last") showStep(svgs.length - 1);
      else if (action === "play") {
        if (playing) stopPlay();
        else startPlay();
      }
    });

    showStep(0);
    el.setAttribute("data-ci-player", "1");
    if (config.autoplay) startPlay();
  }

  function initInteractive(el, config, storedState) {
    if (!config.rotate || !config.interactive) return;

    let rotX = config.rotate.x;
    let rotY = config.rotate.y;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const puzzleState = storedState || null;

    el.style.cursor = "grab";
    el.setAttribute("data-ci-interactive", "1");

    function rerender() {
      const cfg = {};
      for (const k in config) {
        if (config.hasOwnProperty(k)) cfg[k] = config[k];
      }
      cfg.rotate = { x: rotX, y: rotY };
      cfg.alg = null;
      cfg.scrambled = false;
      cfg.animate = false;
      if (puzzleState) cfg.stateObj = clonePuzzleState(puzzleState);
      const svg = renderIcon(cfg);
      if (svg) el.innerHTML = svg;
    }

    function onDown(clientX, clientY) {
      dragging = true;
      lastX = clientX;
      lastY = clientY;
      el.style.cursor = "grabbing";
    }

    function onMove(clientX, clientY) {
      if (!dragging) return;
      const dx = clientX - lastX;
      const dy = clientY - lastY;
      lastX = clientX;
      lastY = clientY;
      rotY += dx * 0.5;
      rotX += dy * 0.5;
      rotX = Math.max(-85, Math.min(85, rotX));
      rerender();
    }

    function onUp() {
      dragging = false;
      el.style.cursor = "grab";
    }

    el.addEventListener("mousedown", function (e) {
      e.preventDefault();
      onDown(e.clientX, e.clientY);
    });
    window.addEventListener("mousemove", function (e) { onMove(e.clientX, e.clientY); });
    window.addEventListener("mouseup", onUp);

    el.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) onDown(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    el.addEventListener("touchmove", function (e) {
      if (e.touches.length === 1) {
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    el.addEventListener("touchend", onUp);
  }

  // ─── Class Parser ───

  function parseClasses(el) {
    const classes = el.className ? el.className.split(/\s+/) : [];
    let result = {
      type: "3x3",
      angle: "front",
      mono: false,
      outlined: false,
      scrambled: false,
      oll: false,
      labels: false,
      inverse: false,
      animate: false,
      interactive: false,
      loop: false,
      autoplay: false,
      size: null,
      rounded: null,
      alg: el.getAttribute("data-ci-alg") || null,
      state: el.getAttribute("data-ci-state") || null,
    };

    const rawRounded = el.getAttribute("data-ci-rounded");
    if (rawRounded != null) result.rounded = parseFloat(rawRounded);

    result.color = el.getAttribute("data-ci-color") || null;
    result.scheme = el.getAttribute("data-ci-scheme") || null;
    result.theme = el.getAttribute("data-ci-theme") || null;
    result.clockFront = el.getAttribute("data-ci-clock-front") || null;
    result.clockBack = el.getAttribute("data-ci-clock-back") || null;
    result.arrows = el.getAttribute("data-ci-arrows") || null;
    result.highlight = el.getAttribute("data-ci-highlight") || null;
    if (el.hasAttribute("data-ci-inverse")) result.inverse = true;

    const rawLabelSize = el.getAttribute("data-ci-label-size");
    if (rawLabelSize != null) result.labelSize = parseFloat(rawLabelSize) || 1;

    const rawArrowSize = el.getAttribute("data-ci-arrow-size");
    if (rawArrowSize != null) result.arrowSize = parseFloat(rawArrowSize) || 1;

    const rawSpeed = el.getAttribute("data-ci-speed");
    if (rawSpeed != null) result.speed = parseInt(rawSpeed, 10) || 800;

    if (el.hasAttribute("data-ci-loop")) result.loop = true;
    if (el.hasAttribute("data-ci-autoplay")) result.autoplay = true;

    const rawRotate = el.getAttribute("data-ci-rotate");
    if (rawRotate) {
      const rotParts = rawRotate.split(",");
      result.rotate = {
        x: parseFloat(rotParts[0]) || 0,
        y: parseFloat(rotParts[1]) || 0,
      };
    }

    const typeMap = {
      "ci-2x2": "2x2", "ci-3x3": "3x3", "ci-4x4": "4x4",
      "ci-5x5": "5x5", "ci-6x6": "6x6", "ci-7x7": "7x7",
      "ci-skewb": "skewb", "ci-square1": "square1",
      "ci-pyraminx": "pyraminx", "ci-megaminx": "megaminx",
      "ci-fto": "fto", "ci-clock": "clock",
    };

    for (let i = 0; i < classes.length; i++) {
      let c = classes[i];
      if (typeMap[c]) result.type = typeMap[c];
      else if (c === "ci-iso") result.angle = "iso";
      else if (c === "ci-top") result.angle = "top";
      else if (c === "ci-dual") result.angle = "dual";
      else if (c === "ci-net") result.angle = "net";
      else if (c === "ci-front") result.angle = "front";
      else if (c === "ci-back") result.angle = "back";
      else if (c === "ci-mono") result.mono = true;
      else if (c === "ci-colorful") result.mono = false;
      else if (c === "ci-outlined") result.outlined = true;
      else if (c === "ci-scrambled") result.scrambled = true;
      else if (c === "ci-oll") result.oll = true;
      else if (c === "ci-labels") result.labels = true;
      else if (c === "ci-inverse") result.inverse = true;
      else if (c === "ci-animate") result.animate = true;
      else if (c === "ci-interactive") result.interactive = true;
    }

    if (result.oll) result.angle = "top";
    if (result.type === "clock" && (result.alg || result.scrambled) && result.angle === "front") {
      result.angle = "dual";
    }
    if (result.type === "clock") result.inverse = false;
    if (result.type === "square1") {
      if (result.angle === "top" || result.angle === "dual") result.angle = "net";
      if (result.angle === "back") result.angle = "front";
      if ((result.alg || result.scrambled) && result.angle === "front") result.angle = "net";
    }

    if (result.interactive && !result.rotate) {
      if (result.type === "megaminx") {
        if (result.angle !== "net" && result.angle !== "top") {
          // White (U) on top, green (F) in front:
          // rotY=-36 centers F face (horizontal offset = atan2(0.724, 0.996)≈36°)
          // rotX=25 tilts top toward viewer so U face is visible
          result.rotate = { x: 25, y: -36 };
        }
      } else if (result.type === 'square1') {
        result.rotate = { x: 25, y: 30 };
      } else if (result.type === 'skewb') {
        // Matches iso cluster (U, F, R visible) — same as data-ci-rotate="20,40"
        result.rotate = { x: 20, y: 40 };
      } else if (result.type === 'pyraminx') {
        result.rotate = { x: 20, y: 35 };
      } else {
        result.rotate = { x: -25, y: 30 };
      }
    }

    return result;
  }

  // ─── Main Render Dispatcher ───

  function renderIcon(config) {
    const prevColors = COLORS;
    const prevTheme = THEME;
    config.effectiveAlg = getEffectiveAlgorithm(config);
    if (config.type === "square1") {
      if (config.angle === "top" || config.angle === "dual") config.angle = "net";
      if (config.angle === "back") config.angle = "front";
      if ((config.effectiveAlg || config.scrambled) && config.angle === "front") config.angle = "net";
    }
    if (config.scheme && COLOR_SCHEMES[config.scheme]) {
      COLORS = COLOR_SCHEMES[config.scheme];
    }
    if (config.theme) {
      applyTheme(config.theme);
    }

    function _render() {
    const type = config.type;
    const angle = config.angle;
    const mono = config.mono;
    const outlined = config.outlined || false;
    _customColor = config.color || null;

    const nxnSizes = { "2x2": 2, "3x3": 3, "4x4": 4, "5x5": 5, "6x6": 6, "7x7": 7 };

    if (nxnSizes[type] !== undefined) {
      let n = nxnSizes[type];
      let state;
      if (config.oll && !config.state) {
        const ollFaces = ["U", "R", "F", "L", "B", "D"];
        const ollColors = ["Y", "R", "B", "O", "G", "W"];
        state = {};
        for (let fi = 0; fi < 6; fi++) {
          state[ollFaces[fi]] = [];
          for (let ri = 0; ri < n; ri++) {
            state[ollFaces[fi]][ri] = [];
            for (let ci = 0; ci < n; ci++) state[ollFaces[fi]][ri][ci] = ollColors[fi];
          }
        }
      } else {
        state = createNxNState(n);
      }
      if (config.stateObj) {
        state = config.stateObj;
      } else if (config.state) {
        let parsed = parseStateString(config.state, n);
        if (parsed) state = parsed;
      } else if (config.effectiveAlg && !config.animate) {
        applyAlgorithm(state, config.effectiveAlg, n);
      } else if (config.scrambled) {
        const scr = generateNxNScramble(n);
        applyAlgorithm(state, scr, n);
      }
      if (config.highlight) applyHighlightToState(state, config.highlight, type, n);
      if (config.rotate && angle !== "top" && angle !== "net") {
        return renderNxNRotated(n, state, config.rotate.x, config.rotate.y, mono, outlined, config);
      }
      return renderNxNCube(n, angle, state, mono, outlined, config);
    }

    if (type === "skewb") {
      let state = config.oll ? createSkewbOLLState() : createSkewbState();
      if (config.stateObj) {
        state = config.stateObj;
      } else if (config.state) {
        let faces = config.state.split(",");
        if (faces.length === 1 && faces[0].length === 5) {
          for (let i = 0; i < 5; i++) state.U[i] = faces[0][i].toUpperCase();
        } else if (faces.length >= 3) {
          const skNames = ["U", "R", "F", "L", "B", "D"];
          for (let fi = 0; fi < faces.length && fi < 6; fi++) {
            const ch = faces[fi].trim().split("");
            if (ch.length === 5) {
              for (let j = 0; j < 5; j++) state[skNames[fi]][j] = ch[j].toUpperCase();
            }
          }
        }
      } else if (config.effectiveAlg && !config.animate) {
        applySkewbAlgorithm(state, config.effectiveAlg);
      } else if (config.scrambled) {
        applySkewbAlgorithm(state, generateSkewbScramble());
      }
      if (config.highlight) applyHighlightToState(state, config.highlight, "skewb");
      if (angle === "net" && !config.interactive) {
        return renderSkewbNet(state, mono, outlined, config);
      }
      if (config.rotate && angle !== "top") {
        return renderSkewbRotated(state, config.rotate.x, config.rotate.y, mono, outlined, config);
      }
      return renderSkewb(angle, state, mono, outlined, config);
    }

    if (type === "pyraminx") {
      let state = createPyraminxState();
      if (config.stateObj) {
        state = config.stateObj;
      } else if (config.state) {
        let faces = config.state.split(",");
        if (faces.length === 1 && faces[0].trim().length === 9) {
          const ch = faces[0].trim().split("");
          for (let j = 0; j < 9; j++) state.F[j] = ch[j].toUpperCase();
        } else {
          const pyNames = ["U", "F", "R", "L", "D"];
          for (let fi = 0; fi < faces.length && fi < 5; fi++) {
            const ch = faces[fi].trim().split("");
            if (ch.length === 9) {
              for (let j = 0; j < 9; j++) state[pyNames[fi]][j] = ch[j].toUpperCase();
            }
          }
        }
      } else if (config.effectiveAlg && !config.animate) {
        applyPyraminxAlgorithm(state, config.effectiveAlg);
      } else if (config.scrambled) {
        applyPyraminxAlgorithm(state, generatePyraminxScramble());
      }
      if (config.highlight) applyHighlightToState(state, config.highlight, "pyraminx");
      if (config.rotate && angle !== "net") {
        return renderPyraminxRotated(state, config.rotate.x, config.rotate.y, mono, outlined, config);
      }
      return renderPyraminx(angle, state, mono, outlined, config);
    }

    if (type === "megaminx") {
      let state = createMegaminxState();
      if (config.stateObj) {
        state = config.stateObj;
      } else if (config.state) {
        const raw = config.state.trim();
        const tokens = [];
        for (let ci = 0; ci < raw.length; ci++) {
          const ch = raw[ci].toUpperCase();
          const ahead = ci + 1 < raw.length ? raw[ci + 1] : "";
          if (ch >= "A" && ch <= "Z" && ahead >= "a" && ahead <= "z") {
            tokens.push(ch + ahead);
            ci++;
          } else {
            tokens.push(ch);
          }
        }
        if (tokens.length >= 11) {
          for (let si = 0; si < 11 && si < tokens.length; si++) {
            state.U[si] = tokens[si];
          }
          if (tokens.length >= 26) {
            const bandFaces = ["F", "R", "BR", "BL", "L"];
            for (let bi = 0; bi < 5; bi++) {
              state[bandFaces[bi]][1] = tokens[11 + bi * 3];
              state[bandFaces[bi]][2] = tokens[11 + bi * 3 + 1];
              state[bandFaces[bi]][3] = tokens[11 + bi * 3 + 2];
            }
          }
        }
      } else if (config.effectiveAlg && !config.animate) {
        applyMegaminxAlgorithm(state, config.effectiveAlg);
      } else if (config.scrambled) {
        applyMegaminxAlgorithm(state, generateMegaminxScramble());
      }
      if (config.highlight) applyHighlightToState(state, config.highlight, "megaminx");
      if (config.rotate && angle !== "net" && angle !== "top" && !config.oll) {
        return renderMegaminxRotated(state, config.rotate.x, config.rotate.y, mono, outlined, config);
      }
      if (angle === "net") {
        return renderMegaminxNet(state, mono, outlined, config);
      }
      if (angle === "top" || config.oll) {
        return renderMegaminxTop(state, mono, outlined, config);
      }
      const frontConfig = { oll: false, rounded: config.rounded, noBand: true };
      return renderMegaminxTop(state, mono, outlined, frontConfig);
    }

    if (type === "fto") {
      let state = createFTOState();
      if (config.stateObj) {
        state = config.stateObj;
      } else if (config.state) {
        let faces = config.state.split(",");
        const ftoNames = ["U", "R", "F", "L", "D", "B", "BR", "BL"];
        if (faces.length === 1 && faces[0].trim().length === 9) {
          const ch = faces[0].trim().split("");
          for (let j = 0; j < 9; j++) state.U[j] = ch[j].toUpperCase();
        } else {
          for (let fi = 0; fi < faces.length && fi < 8; fi++) {
            const ch = faces[fi].trim().split("");
            if (ch.length === 9) {
              for (let j = 0; j < 9; j++) state[ftoNames[fi]][j] = ch[j].toUpperCase();
            }
          }
        }
      } else if (config.effectiveAlg && !config.animate) {
        applyFTOAlgorithm(state, config.effectiveAlg);
      } else if (config.scrambled) {
        state = generateFTOScramble();
      }
      if (config.highlight) applyHighlightToState(state, config.highlight, "fto");
      if (config.rotate && angle !== "top" && angle !== "dual") {
        return renderFTORotated(state, config.rotate.x, config.rotate.y, mono, outlined, config);
      }
      return renderFTO(angle, state, mono, outlined, config);
    }

    if (type === "square1") {
      let state = resolveSquare1State(config);
      if (config.effectiveAlg && !config.animate) {
        applySquare1Algorithm(state, config.effectiveAlg);
      } else if (config.scrambled && !config.state && !config.stateObj) {
        state = createSquare1State();
        applySquare1Algorithm(state, generateSquare1ScrambleAlg());
      }
      if (config.rotate) {
        return renderSquare1Rotated(state, config.rotate.x, config.rotate.y, mono, outlined, config);
      }
      if (config.arrows || config.labels) config.stateObj = state;
      return renderSquare1(state, mono, outlined, angle, config);
    }

    if (type === "clock") {
      let state = createClockState();
      if (config.stateObj) {
        state = config.stateObj;
      } else if (config.state) {
        const parts = config.state.split("/");
        if (parts[0] && parts[0] !== "_") {
          const fv = parts[0].split(",");
          for (let i = 0; i < 9 && i < fv.length; i++) state.front[i] = clockMod12(parseInt(fv[i], 10) || 0);
        }
        if (parts[1] && parts[1] !== "_") {
          const bv = parts[1].split(",");
          for (let i = 0; i < 9 && i < bv.length; i++) state.back[i] = clockMod12(parseInt(bv[i], 10) || 0);
        }
        if (parts[2]) {
          for (let i = 0; i < 4 && i < parts[2].length; i++) state.pins[i] = parts[2][i] === "1";
        }
      } else if (config.effectiveAlg && !config.animate) {
        applyClockAlgorithm(state, config.effectiveAlg);
      } else if (config.scrambled) {
        applyClockAlgorithm(state, generateClockScramble());
      }
      return renderClock(angle, state, mono, outlined, config);
    }

    return "";
    }

    let result = _render();
    if (result && (config.arrows || config.labels)) {
      result = addOverlays(result, config);
    }
    COLORS = prevColors;
    if (config.theme) applyTheme(prevTheme);
    return result;
  }

  // ─── DOM Processing ───

  function processElement(el) {
    if (el.getAttribute("data-ci-rendered")) return;
    let config = parseClasses(el);
    if (config.color) {
      el.style.color = config.color;
    }
    if (!config.theme) {
      config.theme = detectTheme();
      applyTheme(config.theme);
    }
    let svg = renderIcon(config);
    if (svg) {
      el.innerHTML = svg;
      el.setAttribute("data-ci-rendered", "1");
      if (config.alg) {
        el.setAttribute("title", getEffectiveAlgorithm(config));
      }
      if (config.type === "square1" && config.angle === "net") {
        el.style.height = "auto";
      }
      const nxnNetTypes = { "2x2": 1, "3x3": 1, "4x4": 1, "5x5": 1, "6x6": 1, "7x7": 1 };
      if (config.angle === "net" && nxnNetTypes[config.type]) {
        el.style.width = "";
        el.style.height = "";
        let sizeClass = "";
        const classes = el.className ? el.className.split(/\s+/) : [];
        for (let ci = 0; ci < classes.length; ci++) {
          const m = classes[ci].match(/^ci-(\d+)x$/);
          if (m) { sizeClass = classes[ci]; break; }
        }
        if (sizeClass) {
          const num = parseInt(sizeClass.replace("ci-", "").replace("x", ""), 10);
          el.style.width = (num * (4 / 3)).toFixed(1) + "em";
          el.style.height = num + "em";
        }
      }
      if (config.type === "clock" && (config.angle === "top" || config.angle === "dual")) {
        el.style.width = (parseFloat(el.style.width) || 0) > 0
          ? (parseFloat(el.style.width) * 2) + el.style.width.replace(/[\d.]+/, "")
          : "";
        let sizeClass2 = "";
        const classes2 = el.className ? el.className.split(/\s+/) : [];
        for (let ci = 0; ci < classes2.length; ci++) {
          const m = classes2[ci].match(/^ci-(\d+)x$/);
          if (m) { sizeClass2 = classes2[ci]; break; }
        }
        if (sizeClass2) {
          const num = parseInt(sizeClass2.replace("ci-", "").replace("x", ""), 10);
          el.style.width = (num * 2) + "em";
          el.style.height = (num) + "em";
        }
      }
      if (config.type === "fto" && config.angle === "dual") {
        let sizeClass3 = "";
        const classes3 = el.className ? el.className.split(/\s+/) : [];
        for (let ci = 0; ci < classes3.length; ci++) {
          const m = classes3[ci].match(/^ci-(\d+)x$/);
          if (m) { sizeClass3 = classes3[ci]; break; }
        }
        if (sizeClass3) {
          const num = parseInt(sizeClass3.replace("ci-", "").replace("x", ""), 10);
          el.style.width = (num * 2) + "em";
          el.style.height = num + "em";
        }
      }
      if (config.animate && config.alg) {
        initPlayer(el, config);
      }
      if (config.interactive && config.rotate) {
        let storedState = null;
        if (config.alg || config.scrambled) {
          storedState = getFinalState(config);
        }
        initInteractive(el, config, storedState);
      }
    }
  }

  function processAll(root) {
    const container = root || document;
    const els = container.querySelectorAll("i.ci, span.ci");
    for (let i = 0; i < els.length; i++) {
      try { processElement(els[i]); } catch (e) { console.error("cube-icons error:", e, els[i]); }
    }
    const stepsEls = container.querySelectorAll("div.ci-steps");
    for (let j = 0; j < stepsEls.length; j++) {
      try { processSteps(stepsEls[j]); } catch (e) { console.error("cube-icons steps error:", e, stepsEls[j]); }
    }
  }

  function watch() {
    processAll();

    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(function (mutations) {
        for (let i = 0; i < mutations.length; i++) {
          const added = mutations[i].addedNodes;
          for (let j = 0; j < added.length; j++) {
            const node = added[j];
            if (node.nodeType === 1) {
              if ((node.tagName === "I" || node.tagName === "SPAN") && node.classList.contains("ci")) {
                processElement(node);
              }
              if (node.tagName === "DIV" && node.classList.contains("ci-steps")) {
                processSteps(node);
              }
              const inner = node.querySelectorAll ? node.querySelectorAll("i.ci, span.ci, div.ci-steps") : [];
              for (let k = 0; k < inner.length; k++) {
                if (inner[k].classList.contains("ci-steps")) processSteps(inner[k]);
                else processElement(inner[k]);
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ─── Public API ───

  const CubeIcons = {
    render: renderIcon,
    processAll: processAll,
    watch: watch,
    createState: {
      nxn: createNxNState,
      skewb: createSkewbState,
      pyraminx: createPyraminxState,
      megaminx: createMegaminxState,
      fto: createFTOState,
      square1: createSquare1State,
      clock: createClockState,
    },
    applyAlgorithm: applyAlgorithm,
    getNxNStickerIds: getNxNStickerIds,
    parseNxNStickerId: parseNxNStickerId,
    rescaleNxNStickerId: rescaleNxNStickerId,
    extrapolateNxNStickerMap: extrapolateNxNStickerMap,
    nxnIdentityStickerMap: nxnIdentityStickerMap,
    buildNxNRotationStickerMap: buildNxNRotationStickerMap,
    getNxNRotationStickerMap: getNxNRotationStickerMap,
    applyNxNStickerMap: applyNxNStickerMap,
    applyNxNAlgorithmWithRotMaps: applyNxNAlgorithmWithRotMaps,
    nxnStickerMapToArrows: nxnStickerMapToArrows,
    nxnNetDisplayToStateRC: nxnNetDisplayToStateRC,
    nxnNetStateToDisplayRC: nxnNetStateToDisplayRC,
    nxnNetDisplayFaceToState: nxnNetDisplayFaceToState,
    NXN_ROT_MAP_BASE_N: NXN_ROT_MAP_BASE_N,
    NXN_ROT_STICKER_MAPS: NXN_ROT_STICKER_MAPS,
    applyPyraminxAlgorithm: applyPyraminxAlgorithm,
    applyMegaminxAlgorithm: applyMegaminxAlgorithm,
    applyFTOAlgorithm: applyFTOAlgorithm,
    applySkewbAlgorithm: applySkewbAlgorithm,
    applyClockAlgorithm: applyClockAlgorithm,
    applySquare1Algorithm: applySquare1Algorithm,
    parseSquare1Moves: parseSquare1Moves,
    applySquare1MoveParsed: applySquare1MoveParsed,
    sq1FindSliceIndexAt: sq1FindSliceIndexAt,
    sq1FindStartAt: sq1FindStartAt,
    sq1CanSlash: sq1CanSlash,
    sq1ExtractCircular: sq1ExtractCircular,
    sq1CloneFace: sq1CloneFace,
    sq1ClonePiece: sq1ClonePiece,
    getInvertedAlgorithm: getInvertedAlgorithm,
    getAlgorithmSteps: getAlgorithmSteps,
    get COLORS() { return COLORS; },
    getStickerPositions: getStickerPositions,
    findStickerAt: function (type, angle, n, svgX, svgY, extra) {
      const pos = getStickerPositions(type, angle, n, extra);
      let best = null, bestD = Infinity;
      for (const id in pos.stickers) {
        if (!Object.prototype.hasOwnProperty.call(pos.stickers, id)) continue;
        const p = pos.stickers[id];
        const dx = p[0] - svgX, dy = p[1] - svgY;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = id; }
      }
      return best;
    },
    COLOR_SCHEMES: COLOR_SCHEMES,
    setScheme: function (name) {
      if (COLOR_SCHEMES[name]) COLORS = COLOR_SCHEMES[name];
    },
    setTheme: function (theme) {
      applyTheme(theme === "auto" ? detectTheme() : theme);
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = CubeIcons;
  } else {
    global.CubeIcons = CubeIcons;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", watch);
    } else {
      watch();
    }
  }

})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
