// boid.js
import { Vector } from "../vector/vector.js";

export class Boid {
    constructor(x = 0, y = 0, z = 0) {
        this.position = new Vector(x, y, z);
        this.velocity = Vector.random();  
        this.acceleration = new Vector();
        this.maxForce = 0.2;
        this.maxSpeed = 5;

        this.alignFactor = 1;
        this.cohesionFactor = 1;
        this.separationFactor = 1;
    }

    edges() {
        let width = window.innerWidth;
        let height = window.innerHeight;
        if (this.position.x > width) {
            this.position.x = 0;
        } else if (this.position.x < 0) {
            this.position.x = width;
        }
        
        
        if (this.position.y > height) {
            this.position.y = 0;
        } else if (this.position.y < 0) {
            this.position.y = height;
        }
    }

    // Helper function to handle common behviors for align, seperation, and adhesion
    calculateSteering(boids, perceptionRadius, type) {
        let steering = new Vector();
        let total = 0;
        
        for (let other of boids) {
            let d = Vector.dist(this.position, other.position);
            if (other != this && d < perceptionRadius) {
                if (type === 'align') {
                    steering.add(other.velocity);
                } else if (type === 'separation') {
                    let diff = Vector.sub(this.position, other.position);
                    diff.div(d * d);
                    steering.add(diff);
                } else if (type === 'cohere') {
                    steering.add(other.position);
                }
                total += 1;
            }
        }

        if (total > 0) {
            steering.div(total);
            if (type === 'cohere') {
                steering.sub(this.position);
            }
            steering.setMag(this.maxSpeed);
            steering.sub(this.velocity);
            steering.limit(this.maxForce);
        }

        return steering;
    }

    align(boids) {
        return this.calculateSteering(boids, 75, 'align');
    }
    separation(boids) {
        return this.calculateSteering(boids, 30, 'separation');
    }
    cohesion(boids) {
        return this.calculateSteering(boids, 75, 'cohere');
    }


    flock(boids) {
        let alignment = this.align(boids);
        let cohesion = this.cohesion(boids);
        let separation = this.separation(boids);

        alignment.mult(this.alignFactor);
        cohesion.mult(this.cohesionFactor);
        separation.mult(this.separationFactor);

        this.acceleration.add(alignment);
        this.acceleration.add(cohesion)
        this.acceleration.add(separation);
    }

    update() {
        this.position.add(this.velocity);
        this.velocity.add(this.acceleration);
        this.velocity.limit(this.maxSpeed);
        this.acceleration.mult(0);
    }
    show(ctx) {
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    let angle = Math.atan2(this.velocity.y, this.velocity.x);
    ctx.rotate(angle);
    ctx.moveTo(0, -5);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    }

}