function make2DArray(cols, rows) {
    let arr = new Array(cols);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = new Array(rows).fill(0);
    }
    return arr;
}

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
canvas.width = 600;
canvas.height = 500;
document.body.appendChild(canvas);

const w = 5;
let cols = Math.floor(canvas.width/w);
let rows = Math.floor(canvas.height/ w);
let grid = make2DArray(cols, rows);
let velocityGrid = make2DArray(cols, rows);
let hueValue = 200;
let gravity = 0.1;
let mousePressed = false;

canvas.addEventListener("mousedown", () => (mousePressed = true));
canvas.addEventListener("mouseup", () => (mousePressed = false));
canvas.addEventListener("mousemove", (e) => {
    if (!mousePressed) return;
    let mouseCol = Math.floor(e.offsetX / w);
    let mouseRow = Math.floor(e.offsetY / w);
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
    hueValue = (hueValue + 0.5) % 360;
});

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
                    if (y >= rows) continue;
                    let below = grid[i][y];
                    let dir = Math.random() < 0.5 ? -1 : 1;
                    let belowA = i + dir >= 0 && i + dir < cols ? grid[i + dir][y] : -1;
                    let belowB = i - dir >= 0 && i - dir < cols ? grid[i - dir][y] : -1;

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

draw();