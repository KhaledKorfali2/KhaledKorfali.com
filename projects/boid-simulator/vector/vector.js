// vector.js
export class Vector {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;

        return this
    }

    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;

        return this
    }

    mult(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;

        return this
    }

    div(scalar) {
        if (scalar !== 0) {
            this.x /= scalar;
            this.y /= scalar;
            this.z /= scalar;
        }
        return this
    }


    mag() {
        return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
    }

    length() {
        return this.mag();
    }

    static sub(v1, v2) {
        return new Vector(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z);
    }

    static length(vectors) {
        let sumX = 0, sumY = 0, sumZ = 0;
        for (let v of vectors) {
            sumX += v.x;
            sumY += v.y;
            sumZ += v.z;
        }
 
        return Math.sqrt(sumX ** 2 + sumY ** 2 + sumZ ** 2);
    }

    normalize() {
        let m = this.mag();
        if (m !== 0) this.div(m);
        return this;
    }

    setMag(m) {
        return this.normalize().mult(m);
    }

    // Limit the mag of the vector
    limit(max) {
        if (this.mag() > max) {
            this.normalize().mult(max);
        }
        return this;
    }

    toString() {
        return `Vector(${this.x}, ${this.y}, ${this.z})`;
    }

    // Compute the Euclidean distance between two vectors
    static dist(v1, v2) {
        return Math.sqrt(
            (v1.x - v2.x) ** 2 +
            (v1.y - v2.y) ** 2 +
            (v1.z - v2.z) ** 2 
        );
    }

    // Generate a random vector with componetns between -1 and 1
    static random() {
        let angle = Math.random() * Math.PI * 2 // Random angle in radians
        let x = Math.cos(angle);
        let y = Math.sin(angle);
        return new Vector(x, y);
    }

    static from(v) {
        return new Vector(v.x, v.y, v.z);
    }


}