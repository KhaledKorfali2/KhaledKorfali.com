const START_VELOCITY = 1;
const MAX_VELOCITY = 6;
const GRAVITY = 0.25; // a touch stronger feels nicer than 0.1

// Select settings element
const resetBtn = document.getElementById("resetBtn");
const colorPicker = document.getElementById("colorPicker");
const autoHueToggle = document.getElementById("autoHueToggle");
const brushModeSelect = document.getElementById("brushMode");

// State Varibles
let autoHueShift = true; // Default: Auto hue shifting ON
let brushMode = brushModeSelect ? brushModeSelect.value : "surface";

if (brushModeSelect) {
  brushModeSelect.addEventListener("change", () => {
    brushMode = brushModeSelect.value; // "surface" | "deposit" | "paint"
  });
}


// Reset Canvas
resetBtn.addEventListener("click", () => {
    grid = make2DArray(cols, rows);
    velocityGrid = make2DArray(cols, rows);
});

// Toggle Auto Hue Shift
autoHueToggle.addEventListener("change", () => {
    autoHueShift = autoHueToggle.checked;
});

// Change sand color based on selected color
colorPicker.addEventListener("input", () => {
  const hex = colorPicker.value;
  baseColorHSL = hexToHSL(hex); // {h,s,l} with s/l as percentages
});



// Convert hex color to HSL for consistent color blending
function hexToHSL(hex) {
  let r = parseInt(hex.substring(1, 3), 16) / 255;
  let g = parseInt(hex.substring(3, 5), 16) / 255;
  let b = parseInt(hex.substring(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}


const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
document.body.appendChild(canvas);

let mousePressed = false;
const w = 5;
let cols, rows;
let grid, velocityGrid;
// base color used when painting new grains
let baseColorHSL = { h: 200, s: 100, l: 50 }; // percentages for s & l


// Function to resize the canvas and update grid size
function resizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  // buffer size (device pixels)
  canvas.width  = Math.floor(window.innerWidth  * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);

  // Use visual viewport for height if available
  const vw = window.innerWidth;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  // **CSS size** (CSS pixels) -> prevents visual/coord mismatch
  canvas.width  = Math.floor(vw * dpr);
  canvas.height = Math.floor(vh * dpr);

  canvas.style.width  = vw + "px";
  canvas.style.height = vh + "px";

  // draw in CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  cols = Math.floor(vw / w);
  rows = Math.floor(vh / w);

  grid = make2DArray(cols, rows);
  velocityGrid = make2DArray(cols, rows);
}



// Create a 2D array
function make2DArray(cols, rows) {
  return Array.from({ length: cols }, () => Array(rows).fill(null));
}


// Helper function to get touch/mouse position
function getPointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  const x = point.clientX - rect.left; // CSS pixels
  const y = point.clientY - rect.top;  // CSS pixels
  return { x, y };
}


// Add sand at the touch/mouse position
function addSand(e) {
  e.preventDefault();
  const { x, y } = getPointerPos(e);
  const mouseCol = Math.floor(x / w);
  const mouseRow = Math.min(Math.floor(y / w), rows - 1);

  const matrix = 5;
  const extent = Math.floor(matrix / 2);
  const color = { h: baseColorHSL.h, s: baseColorHSL.s, l: baseColorHSL.l };

  // track which columns we've already placed into (surface mode)
  const placedCols = new Set();

  for (let i = -extent; i <= extent; i++) {
    for (let j = -extent; j <= extent; j++) {
      if (Math.random() >= 0.75) continue;

      const col = mouseCol + i;
      const row = mouseRow + j;
      if (col < 0 || col >= cols || row < 0 || row >= rows) continue;

      if (brushMode === "deposit") {
        if (!grid[col][row]) {
          grid[col][row] = { ...color };
          velocityGrid[col][row] = START_VELOCITY;
        }
      } else if (brushMode === "surface") {
        // only once per column per call
        if (placedCols.has(col)) continue;

        // climb upward to first empty
        let yTop = Math.min(row, rows - 1);
        while (yTop >= 0 && grid[col][yTop]) yTop--;
        if (yTop >= 0) {
          grid[col][yTop] = { ...color };
          velocityGrid[col][yTop] = START_VELOCITY;
          placedCols.add(col);
        }
      } else { // paint
        if (grid[col][row]) {
          grid[col][row] = { ...color };
        } else {
          grid[col][row] = { ...color };
          velocityGrid[col][row] = START_VELOCITY;
        }
      }
    }
  }

  if (autoHueShift) {
    baseColorHSL.h = (baseColorHSL.h + 0.5) % 360;
  }
}


// Mouse Events
canvas.addEventListener("mousedown", (e) => {
    mousePressed = true;
    addSand(e);
});
canvas.addEventListener("mouseup", () => (mousePressed = false));
canvas.addEventListener("mousemove", (e) => {
    if (mousePressed) addSand(e);
});

// Touch Events (for mobile support)
canvas.addEventListener("touchstart", (e) => {
    mousePressed = true;
    addSand(e);
});
canvas.addEventListener("touchend", () => (mousePressed = false));
canvas.addEventListener("touchmove", (e) => {
    if (mousePressed) addSand(e);
});

// Animation Loop
function draw() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);


  const nextGrid = make2DArray(cols, rows);
  const nextVelocityGrid = make2DArray(cols, rows);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const state = grid[i][j];           // null or {h,s,l}
      let v = velocityGrid[i][j];
      let moved = false;

      if (state) {
        v = Math.min(MAX_VELOCITY, v + GRAVITY);
        const targetY = Math.min(rows - 1, Math.floor(j + v));

        for (let y = j + 1; y <= targetY; y++) {
          if (!grid[i][y] && !nextGrid[i][y]) {
            nextGrid[i][y] = state;
            nextVelocityGrid[i][y] = v;
            moved = true;
            break;
          }
          const dirFirst = Math.random() < 0.5 ? -1 : 1;
          const tryDirs = [dirFirst, -dirFirst];
          for (const dir of tryDirs) {
            const nx = i + dir;
            if (nx >= 0 && nx < cols && !grid[nx][y] && !nextGrid[nx][y]) {
              nextGrid[nx][y] = state;
              nextVelocityGrid[nx][y] = v;
              moved = true;
              break;
            }
          }
          if (moved) break;
        }
      }

      if (state && !moved) {
        nextGrid[i][j] = state;
        nextVelocityGrid[i][j] = START_VELOCITY;
      }
    }
  }

  // draw using full HSL
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const c = nextGrid[i][j];
      if (c) {
        ctx.fillStyle = `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
        ctx.fillRect(i * w, j * w, w, w);
      }
    }
  }

  grid = nextGrid;
  velocityGrid = nextVelocityGrid;
  requestAnimationFrame(draw);
}



// Resize canvas on widnow resize
window.addEventListener("resize", resizeCanvas);

// Initialize full-screen canvas
resizeCanvas();

draw();
