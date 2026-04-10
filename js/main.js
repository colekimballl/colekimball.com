import * as THREE from 'three';

/* ============================================================
   Cole Kimball — Milky Way
   + twinkling stars
   + procedural nebula sprites
   + shooting stars
   Zero external requests.
   ============================================================ */

const canvas = document.getElementById('bg');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.025);

const camera = new THREE.PerspectiveCamera(
    58,
    window.innerWidth / window.innerHeight,
    0.1,
    300
);
camera.position.set(0, 5, 15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

/* ============================================================
   Procedural soft radial texture (used for nebula sprites
   and shooting-star glow)
   ============================================================ */
function makeRadialTexture(inner = 'rgba(255,255,255,0.9)', mid = 'rgba(255,255,255,0.25)') {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, inner);
    g.addColorStop(0.45, mid);
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/* ============================================================
   Galaxy parameters
   ============================================================ */
const PARAMS = {
    count:           240000,
    radius:          11,
    branches:        4,
    spin:            1.35,
    randomness:      0.32,
    randomnessPower: 2.6,
    coreHot:   '#fff4d0',
    coreWarm:  '#ffcd70',
    midArm:    '#a8c4ff',
    outerArm:  '#4a6db8',
    nebula:    '#ff6b9e'
};

const cCoreHot  = new THREE.Color(PARAMS.coreHot);
const cCoreWarm = new THREE.Color(PARAMS.coreWarm);
const cMid      = new THREE.Color(PARAMS.midArm);
const cOuter    = new THREE.Color(PARAMS.outerArm);
const cNebula   = new THREE.Color(PARAMS.nebula);

const positions = new Float32Array(PARAMS.count * 3);
const colors    = new Float32Array(PARAMS.count * 3);
const scales    = new Float32Array(PARAMS.count);
const twinkles  = new Float32Array(PARAMS.count); // per-star phase

for (let i = 0; i < PARAMS.count; i++) {
    const i3 = i * 3;

    const r = Math.pow(Math.random(), 2.0) * PARAMS.radius;
    const branchAngle = ((i % PARAMS.branches) / PARAMS.branches) * Math.PI * 2;
    const spinAngle = Math.log(1 + r) * PARAMS.spin;

    const thickness = 0.28 + (1.0 - r / PARAMS.radius) * 0.35;
    const randX = Math.pow(Math.random(), PARAMS.randomnessPower) *
        (Math.random() < 0.5 ? 1 : -1) * PARAMS.randomness * r;
    const randY = Math.pow(Math.random(), PARAMS.randomnessPower) *
        (Math.random() < 0.5 ? 1 : -1) * thickness;
    const randZ = Math.pow(Math.random(), PARAMS.randomnessPower) *
        (Math.random() < 0.5 ? 1 : -1) * PARAMS.randomness * r;

    const finalAngle = branchAngle + spinAngle;
    positions[i3    ] = Math.cos(finalAngle) * r + randX;
    positions[i3 + 1] = randY;
    positions[i3 + 2] = Math.sin(finalAngle) * r + randZ;

    const t = r / PARAMS.radius;
    const mixed = new THREE.Color();
    if (t < 0.18) {
        mixed.copy(cCoreHot).lerp(cCoreWarm, t / 0.18);
    } else if (t < 0.5) {
        mixed.copy(cCoreWarm).lerp(cMid, (t - 0.18) / 0.32);
    } else {
        mixed.copy(cMid).lerp(cOuter, (t - 0.5) / 0.5);
    }
    if (t > 0.25 && t < 0.75 && Math.random() < 0.045) {
        mixed.lerp(cNebula, 0.7);
    }
    colors[i3    ] = mixed.r;
    colors[i3 + 1] = mixed.g;
    colors[i3 + 2] = mixed.b;

    let s = Math.random();
    if (Math.random() < 0.015) s = 1.0 + Math.random() * 1.5;
    scales[i] = s;

    twinkles[i] = Math.random() * Math.PI * 2;
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('aScale',   new THREE.BufferAttribute(scales, 1));
geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1));

const material = new THREE.ShaderMaterial({
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    transparent: true,
    uniforms: {
        uTime: { value: 0.0 },
        uSize: { value: 28.0 * renderer.getPixelRatio() }
    },
    vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uSize;

        attribute float aScale;
        attribute float aTwinkle;

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
            vec3 pos = position;

            // Differential rotation
            float r = length(pos.xz);
            float angle = atan(pos.z, pos.x);
            float spin = uTime * (1.0 / (r + 0.8)) * 0.18;
            angle += spin;
            pos.x = cos(angle) * r;
            pos.z = sin(angle) * r;

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            gl_PointSize = uSize * aScale;
            gl_PointSize *= (1.0 / -mvPosition.z);

            // Twinkle: each star has its own phase
            float tw = 0.7 + 0.3 * sin(uTime * 2.2 + aTwinkle * 6.0);
            vAlpha = tw;

            vColor = color;
        }
    `,
    fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
            float d = distance(gl_PointCoord, vec2(0.5));
            if (d > 0.5) discard;
            float alpha = 1.0 - smoothstep(0.0, 0.5, d);
            alpha = pow(alpha, 2.8);
            gl_FragColor = vec4(vColor, alpha * vAlpha);
        }
    `
});

const galaxy = new THREE.Points(geometry, material);
galaxy.rotation.x = 0.22;
scene.add(galaxy);

/* ============================================================
   Nebula gas clouds (procedural sprites)
   ============================================================ */
const nebulaTex = makeRadialTexture(
    'rgba(255,255,255,0.85)',
    'rgba(255,255,255,0.2)'
);

const nebulaConfigs = [
    { pos: [ 5.2,  0.6, -3.5], scale: 11, color: 0xff4e88, opacity: 0.55 }, // pink
    { pos: [-6.0,  0.2,  4.0], scale: 12, color: 0x4f7dff, opacity: 0.5  }, // blue
    { pos: [ 3.4, -0.8,  6.1], scale:  9, color: 0x8a4fff, opacity: 0.45 }, // purple
    { pos: [-4.5,  0.4, -5.8], scale: 10, color: 0xff8844, opacity: 0.4  }, // orange
    { pos: [ 0.0,  1.2,  0.0], scale: 14, color: 0xffd280, opacity: 0.35 }  // core haze
];

const nebulae = [];
for (const cfg of nebulaConfigs) {
    const mat = new THREE.SpriteMaterial({
        map: nebulaTex,
        color: cfg.color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: cfg.opacity
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(...cfg.pos);
    sprite.scale.set(cfg.scale, cfg.scale, 1);
    scene.add(sprite);
    nebulae.push(sprite);
}

/* ============================================================
   Far-field background stars
   ============================================================ */
const bgStarCount = 1500;
const bgPositions = new Float32Array(bgStarCount * 3);
const bgColors    = new Float32Array(bgStarCount * 3);
for (let i = 0; i < bgStarCount; i++) {
    const i3 = i * 3;
    const r = 45 + Math.random() * 70;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    bgPositions[i3    ] = r * Math.sin(phi) * Math.cos(theta);
    bgPositions[i3 + 1] = r * Math.cos(phi);
    bgPositions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const warm = Math.random() < 0.22;
    bgColors[i3    ] = warm ? 1.0  : 0.85;
    bgColors[i3 + 1] = warm ? 0.88 : 0.92;
    bgColors[i3 + 2] = warm ? 0.72 : 1.0;
}
const bgStarGeo = new THREE.BufferGeometry();
bgStarGeo.setAttribute('position', new THREE.BufferAttribute(bgPositions, 3));
bgStarGeo.setAttribute('color',    new THREE.BufferAttribute(bgColors, 3));
const bgStarMat = new THREE.PointsMaterial({
    size: 0.07,
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
});
const bgStars = new THREE.Points(bgStarGeo, bgStarMat);
scene.add(bgStars);

/* ============================================================
   Shooting stars — a single reusable line that respawns
   ============================================================ */
const SHOOT_SEG = 12;
const shootPositions = new Float32Array(SHOOT_SEG * 3);
const shootColors    = new Float32Array(SHOOT_SEG * 3);
const shootGeo = new THREE.BufferGeometry();
shootGeo.setAttribute('position', new THREE.BufferAttribute(shootPositions, 3));
shootGeo.setAttribute('color',    new THREE.BufferAttribute(shootColors, 3));
const shootMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});
const shootingStar = new THREE.Line(shootGeo, shootMat);
scene.add(shootingStar);

const shoot = {
    active: false,
    spawnAt: 3.0,
    duration: 1.6,
    start: new THREE.Vector3(),
    end:   new THREE.Vector3(),
    t: 0
};

function spawnShootingStar(now) {
    // Random point on a large sphere as start + end nearby but offset
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r = 22 + Math.random() * 14;
    shoot.start.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) * 0.4 + (Math.random() - 0.5) * 10,
        r * Math.sin(phi) * Math.sin(theta)
    );
    // End: offset by a random direction
    const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.3) * 0.8,
        (Math.random() - 0.5) * 2
    ).normalize().multiplyScalar(10 + Math.random() * 8);
    shoot.end.copy(shoot.start).add(dir);
    shoot.t = 0;
    shoot.active = true;
    shoot.duration = 1.2 + Math.random() * 1.0;
    shoot.spawnAt = now + 4 + Math.random() * 6;
}

function updateShootingStar(now, dt) {
    if (!shoot.active) {
        if (now >= shoot.spawnAt) spawnShootingStar(now);
        shootMat.opacity = 0;
        return;
    }
    shoot.t += dt;
    const k = shoot.t / shoot.duration;
    if (k >= 1.0) {
        shoot.active = false;
        shootMat.opacity = 0;
        return;
    }

    // Head position along the path
    const head = new THREE.Vector3().lerpVectors(shoot.start, shoot.end, k);
    // Tail trails behind
    const tailDir = new THREE.Vector3().subVectors(shoot.end, shoot.start).normalize();
    const tailLen = 2.8;

    for (let i = 0; i < SHOOT_SEG; i++) {
        const f = i / (SHOOT_SEG - 1);
        const p = new THREE.Vector3()
            .copy(head)
            .addScaledVector(tailDir, -f * tailLen);
        shootPositions[i * 3    ] = p.x;
        shootPositions[i * 3 + 1] = p.y;
        shootPositions[i * 3 + 2] = p.z;

        // Colour: hot white head → cool blue fade → transparent tail
        const a = (1.0 - f);
        shootColors[i * 3    ] = 1.0;
        shootColors[i * 3 + 1] = 0.95 * a + 0.6 * (1 - a);
        shootColors[i * 3 + 2] = 0.9  * a + 1.0 * (1 - a);
    }
    shootGeo.attributes.position.needsUpdate = true;
    shootGeo.attributes.color.needsUpdate = true;

    // Fade in/out envelope: sharp rise, slow fall
    const envelope = Math.sin(k * Math.PI);
    shootMat.opacity = Math.pow(envelope, 0.6) * 0.95;
}

/* ============================================================
   Scroll state
   ============================================================ */
let scrollProgress = 0;
let targetScroll = 0;

function updateScroll() {
    const max = document.body.scrollHeight - window.innerHeight;
    targetScroll = max > 0 ? window.scrollY / max : 0;
}
window.addEventListener('scroll', updateScroll, { passive: true });
updateScroll();

/* ============================================================
   IntersectionObserver — fade sections in
   ============================================================ */
const sections = document.querySelectorAll('section.section');
const io = new IntersectionObserver(
    (entries) => {
        for (const e of entries) {
            if (e.isIntersecting) e.target.classList.add('visible');
        }
    },
    { threshold: 0.28 }
);
sections.forEach((s) => io.observe(s));
requestAnimationFrame(() => {
    const hero = document.querySelector('.hero');
    if (hero) hero.classList.add('visible');
});

/* ============================================================
   Resize
   ============================================================ */
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    material.uniforms.uSize.value = 28.0 * renderer.getPixelRatio();
    updateScroll();
});

/* ============================================================
   Animation loop
   ============================================================ */
const clock = new THREE.Clock();
let prevTime = 0;

function tick() {
    const t = clock.getElapsedTime();
    const dt = t - prevTime;
    prevTime = t;

    material.uniforms.uTime.value = t;

    scrollProgress += (targetScroll - scrollProgress) * 0.055;

    // Camera orbit
    const angle = scrollProgress * Math.PI * 2.4 + t * 0.012;
    const radius = 15 - scrollProgress * 5.5;
    camera.position.x = Math.sin(angle) * radius;
    camera.position.z = Math.cos(angle) * radius;
    camera.position.y = 5.5 + Math.sin(scrollProgress * Math.PI) * 4.0 - scrollProgress * 2.0;
    camera.lookAt(0, scrollProgress * 0.4, 0);

    // Ambient rotation
    galaxy.rotation.y = t * 0.008;
    bgStars.rotation.y = t * 0.002;

    // Nebulae drift with the galaxy rotation for coherence
    for (const n of nebulae) {
        const px = n.position.x;
        const pz = n.position.z;
        const theta = 0.0008; // tiny rotation per frame around Y
        n.position.x = px * Math.cos(theta) - pz * Math.sin(theta);
        n.position.z = px * Math.sin(theta) + pz * Math.cos(theta);
        // subtle breathing scale
        const base = n.userData.baseScale || n.scale.x;
        if (!n.userData.baseScale) n.userData.baseScale = n.scale.x;
        const breath = 1.0 + Math.sin(t * 0.25 + base) * 0.03;
        n.scale.set(base * breath, base * breath, 1);
    }

    updateShootingStar(t, dt);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
}
tick();
