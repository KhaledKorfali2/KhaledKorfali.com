// script.js
import { Boid } from "./boid/boid.js";

const flock = [];
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const NUM_BOIDS = 100;

// Get references to the sliders and their display values
const alignSlider = document.getElementById("alignSlider");
const cohesionSlider = document.getElementById("cohesionSlider");
const separationSlider = document.getElementById("separationSlider");

const alignValue = document.getElementById("alignValue");
const cohesionValue = document.getElementById("cohesionValue");
const separationValue = document.getElementById("separationValue");

function setup() {
    window.addEventListener("resize", resizeCanvas); // Resize canvas on window resize
    resizeCanvas(); // Initialize full-screen canvas

    for (let i = 0; i <NUM_BOIDS; i++) {
        flock.push(new Boid(canvas.width / 2, canvas.height / 2, 0));
    }

    // Update the value displays for sliders
    updateSliderValues();

    draw(); // Start animation loop
}

// Update slider value displays
function updateSliderValues() {
    alignValue.textContent = alignSlider.value;
    cohesionValue.textContent = cohesionSlider.value;
    separationValue.textContent = separationSlider.value;
}

// Update boid behaviors based on slider value
function updateBoidBehavior() {
    for (let boid of flock) {
        boid.alignFactor= parseFloat(alignSlider.value);
        boid.cohesionFactor= parseFloat(cohesionSlider.value);
        boid.separationFactor= parseFloat(separationSlider.value);
    }
}

function draw() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let boid of flock) {
        boid.edges();
        boid.flock(flock);
        boid.update();
        boid.show(ctx);
    }

    updateSliderValues();
    updateBoidBehavior();

    requestAnimationFrame(draw);
}

// Function to resize the canvas and update grid size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

document.getElementById("resetBtn").addEventListener("click", resetSimulation);
function resetSimulation() {
    flock.length = 0; // clear flock
    for (let i = 0; i < NUM_BOIDS; i++){
        flock.push(new Boid(canvas.width / 2, canvas.height / 2, 0));
    }
}


// Start the setup function on load
setup();