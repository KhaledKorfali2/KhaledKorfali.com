const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
document.body.appendChild(canvas);

let mousePressed = false;
const w = 5;
let cols, rows;
let grid, velocityGrid; 
let hueValue = 200;
let gravity = 0.1;

// Function to resize the canvas and update grid size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / w);
    rows = Math.floor(canvas.height / w);
    grid = make2DArray(cols, rows);
    velocityGrid = make2DArray(cols, rows);
}

// Create a 2D array
function make2DArray(cols, rows) {
    return Array.from({ length: cols }, () => Array(rows).fill(0));
}

// Helper function to get touch/mouse position
function getPointerPos(e) {
    let x, y;
    if (e.touches) {
        x = e.touches[0].clientX - canvas.offsetLeft;
        y = e.touches[0].clientY - canvas.offsetTop;
    } else {
        x = e.offsetX;
        y = e.offsetY;
    }
    return { x, y };
}

// Add sand at the touch/mouse position
function addSand(e) {
    e.preventDefault(); // Prevent scrolling on touch devices
    let { x, y } = getPointerPos(e);
    let mouseCol = Math.floor(x / w);
    let mouseRow = Math.floor(y / w);

    let matrix = 5;
    let extent = Math.floor(matrix / 2);
    for (let i = -extent; i <= extent; i++) {
        for (let j = -extent; j <= extent; j++) {
            if (Math.random() < 0.75) {
                let col = mouseCol + i;
                let row = mouseRow + j;
                if (col >= 0 && col < cols && row >= 0 && row < rows) {
                    grid[col][row] = hueValue;
                    velocityGrid[col][row] = 1;
                }
            }
        }
    }

    hueValue += 0.5;
    if (hueValue > 360) hueValue = 1;
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
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let nextGrid = make2DArray(cols, rows);
    let nextVelocityGrid = make2DArray(cols, rows);

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            let state = grid[i][j];
            let velocity = velocityGrid[i][j];
            let moved = false;

            if (state > 0) {
                let newPos = Math.floor(j + velocity);
                for (let y = newPos; y > j; y--) {
                    let below = grid[i][y];
                    let dir = Math.random() < 0.5 ? -1 : 1;
                    let belowA = (i + dir >= 0 && i + dir < cols) ? grid[i + dir][y] : -1;
                    let belowB = (i - dir >= 0 && i - dir < cols) ? grid[i - dir][y] : -1;

                    if (below === 0) {
                        nextGrid[i][y] = state;
                        nextVelocityGrid[i][y] = velocity + gravity;
                        moved = true;
                        break;
                    } else if (belowA === 0) {
                        nextGrid[i + dir][y] = state;
                        nextVelocityGrid[i + dir][y] = velocity + gravity;
                        moved = true;
                        break;
                    } else if (belowB === 0) {
                        nextGrid[i - dir][y] = state;
                        nextVelocityGrid[i - dir][y] = velocity + gravity;
                        moved = true;
                        break;
                    }
                }
            }

            if (state > 0 && !moved) {
                nextGrid[i][j] = state;
                nextVelocityGrid[i][j] = velocity + gravity;
            }
        }
    }

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            if (nextGrid[i][j] > 0) {
                ctx.fillStyle = `hsl(${nextGrid[i][j]}, 100%, 50%)`;
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
