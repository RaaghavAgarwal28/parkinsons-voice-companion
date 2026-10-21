/**
 * Parkinson's Voice Companion - Frontend Application Logic
 * Audio Processing, Web Audio Oscilloscope, Chart.js Telemetry, LSVT Coach, Motor Tap Test
 * + Three.js 3D Neural Particle Background
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let mediaRecorder = null;
  let audioChunks = [];
  let audioBlob = null;
  let audioContext = null;
  let analyserNode = null;
  let animFrameId = null;
  let recStartTime = null;
  let recTimerInterval = null;

  // Chart instances
  let radarChart = null;
  let longitudinalChart = null;

  // LSVT State
  let lsvtRecorder = null;
  let lsvtChunks = [];
  let lsvtAudioContext = null;
  let lsvtAnalyser = null;
  let lsvtAnimId = null;

  // Motor Tap Test State
  let tapTimestamps = [];
  let tapTimerInterval = null;
  let tapTestActive = false;
  let lastVoiceRisk = null;
  let lastVoiceUpdrs = null;

  // =========================================================================
  // 0. Three.js 3D Neural Particle Background
  // =========================================================================
  function initThreeBackground() {
    const bgCanvas = document.getElementById('three-bg-canvas');
    if (!bgCanvas || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: bgCanvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    camera.position.z = 30;

    // Particle system - neural nodes
    const particleCount = 600;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    const colorPalette = [
      new THREE.Color(0x4F9A8B), // warm teal
      new THREE.Color(0x8B7EC8), // muted lavender
      new THREE.Color(0x7BAE7F), // sage
      new THREE.Color(0xD4A76A), // warm amber
    ];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = Math.random() * 2.5 + 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Custom shader for soft glowing particles
    const vertexShader = `
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.0, 0.5, d);
        gl_FragColor = vec4(vColor, alpha * 0.6);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Neural connection lines
    const linePositions = [];
    const lineColors = [];
    const connectionDistance = 8;

    for (let i = 0; i < particleCount; i++) {
      for (let j = i + 1; j < particleCount; j++) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < connectionDistance && linePositions.length < 3000) {
          linePositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
          linePositions.push(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);

          const alpha = 1 - (dist / connectionDistance);
          lineColors.push(0.31 * alpha, 0.6 * alpha, 0.55 * alpha);
          lineColors.push(0.55 * alpha, 0.49 * alpha, 0.78 * alpha);
        }
      }
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
    });

    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    // Mouse interaction
    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // Animation
    function animate() {
      requestAnimationFrame(animate);

      const time = Date.now() * 0.0005;

      // Slow rotation
      particles.rotation.y = time * 0.15 + mouseX * 0.1;
      particles.rotation.x = time * 0.08 + mouseY * 0.05;
      lines.rotation.y = particles.rotation.y;
      lines.rotation.x = particles.rotation.x;

      // Float particles gently
      const posArray = geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        posArray[i * 3 + 1] += Math.sin(time * 2 + i * 0.1) * 0.003;
      }
      geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    }
    animate();

    // Resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initThreeBackground();

  // =========================================================================
  // 0b. Interactive 3D Anatomical Brain Viewer (WebGL / Three.js)
  // =========================================================================
  function init3DBrainViewer() {
    const canvas = document.getElementById('three-brain-canvas');
    if (!canvas || typeof THREE === 'undefined') return;

    const container = canvas.parentElement;
    const width = container.clientWidth || 480;
    const height = container.clientHeight || 340;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.2, 18);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Master Brain Group for smooth rotation
    const brainGroup = new THREE.Group();
    scene.add(brainGroup);

    // Anatomical Brain Particle Generation
    const totalCortical = 3200;
    const totalDopamine = 350;
    const totalMotor = 300;
    const totalPoints = totalCortical + totalDopamine + totalMotor;

    const positions = new Float32Array(totalPoints * 3);
    const baseColors = new Float32Array(totalPoints * 3);
    const currentColors = new Float32Array(totalPoints * 3);
    const sizes = new Float32Array(totalPoints);
    const particleTypes = new Uint8Array(totalPoints); // 0 = cortex, 1 = dopamine (substantia nigra), 2 = motor cortex

    let ptr = 0;

    // 1. Smooth Anatomical Cortical Hemispheres (Left & Right)
    for (let i = 0; i < totalCortical; i++) {
      const hemi = Math.random() < 0.5 ? -1 : 1;
      
      // Parametric hemisphere coordinates
      const theta = (Math.random() - 0.5) * Math.PI; // -pi/2 to pi/2
      const phi = 0.08 + Math.random() * (Math.PI - 0.16); // 0 to pi (poles)

      // Multi-scale harmonic gyri and sulci wrinkles
      const gyrus1 = 0.32 * Math.sin(7 * theta) * Math.cos(5 * phi);
      const gyrus2 = 0.16 * Math.sin(13 * theta + phi) * Math.cos(8 * phi);
      const gyrus3 = 0.08 * Math.sin(18 * phi);
      const fold = 1.0 + gyrus1 + gyrus2 + gyrus3;

      // Radial shell with mantle depth
      const rDepth = 0.75 + 0.25 * Math.sqrt(Math.random());
      
      // Anatomical shape dimensions
      const Ax = 2.4 * rDepth * fold;
      const By = 2.6 * rDepth * fold;
      const Cz = 3.6 * rDepth * fold;

      let x = hemi * (0.28 + Math.abs(Math.cos(theta) * Math.sin(phi)) * Ax);
      let y = Math.cos(phi) * By;
      let z = Math.sin(theta) * Math.sin(phi) * Cz;

      // Frontal lobe anterior rounding
      if (z > 0.5) {
        y *= 0.95;
        x *= 0.92;
      }
      // Temporal lobe lateral expansion
      if (y < -0.4 && z > -1.2 && z < 1.4) {
        x *= 1.18;
        y -= 0.25;
      }
      // Occipital lobe posterior curvature
      if (z < -1.5) {
        x *= 0.88;
        y *= 0.92;
      }
      // Cerebellar postero-inferior cluster
      if (Math.random() < 0.15) {
        const cTheta = Math.random() * Math.PI * 2;
        const cRad = 0.4 + Math.random() * 1.3;
        x = hemi * (0.35 + Math.abs(Math.cos(cTheta)) * cRad * 1.1);
        y = -2.1 - Math.random() * 1.1;
        z = -2.0 - Math.abs(Math.sin(cTheta)) * cRad * 1.2;
      }
      // Brainstem descending column
      if (Math.random() < 0.04) {
        const bRad = Math.random() * 0.45;
        const bAng = Math.random() * Math.PI * 2;
        x = Math.cos(bAng) * bRad;
        y = -2.4 - Math.random() * 1.8;
        z = -0.5 + Math.sin(bAng) * bRad * 0.8;
      }

      positions[ptr * 3] = x;
      positions[ptr * 3 + 1] = y;
      positions[ptr * 3 + 2] = z;

      // Bioluminescent palette: glowing electric cyan to lavender
      const t = (y + 3) / 6;
      const rCol = THREE.MathUtils.lerp(0.05, 0.45, t);
      const gCol = THREE.MathUtils.lerp(0.85, 0.40, t);
      const bCol = THREE.MathUtils.lerp(1.0, 0.92, t);

      baseColors[ptr * 3] = rCol;
      baseColors[ptr * 3 + 1] = gCol;
      baseColors[ptr * 3 + 2] = bCol;

      currentColors[ptr * 3] = rCol;
      currentColors[ptr * 3 + 1] = gCol;
      currentColors[ptr * 3 + 2] = bCol;

      sizes[ptr] = Math.random() * 1.6 + 1.2;
      particleTypes[ptr] = 0;
      ptr++;
    }

    // 2. Basal Ganglia & Substantia Nigra (Dopamine Circuit - Key to Parkinson's)
    for (let i = 0; i < totalDopamine; i++) {
      const hemi = Math.random() < 0.5 ? -1 : 1;
      const isSN = Math.random() < 0.45; // Substantia Nigra vs Striatum
      
      let x, y, z;
      if (isSN) {
        // Substantia Nigra: crescent located at ventral midbrain
        const tArc = (Math.random() - 0.5) * 1.2;
        x = hemi * (0.65 + Math.cos(tArc) * 0.4 + (Math.random() - 0.5) * 0.25);
        y = -0.9 + Math.sin(tArc) * 0.3 + (Math.random() - 0.5) * 0.2;
        z = -0.15 + (Math.random() - 0.5) * 0.35;
      } else {
        // Striatum / Putamen: C-shaped structure curving superiorly & anteriorly
        const tArc = Math.random() * Math.PI * 0.8;
        x = hemi * (1.1 + Math.sin(tArc) * 0.45 + (Math.random() - 0.5) * 0.3);
        y = -0.3 + Math.cos(tArc) * 0.7 + (Math.random() - 0.5) * 0.3;
        z = 0.2 + Math.sin(tArc) * 0.6 + (Math.random() - 0.5) * 0.35;
      }

      positions[ptr * 3] = x;
      positions[ptr * 3 + 1] = y;
      positions[ptr * 3 + 2] = z;

      // Radiant Warm Gold/Amber for Dopamine
      const rCol = 0.98;
      const gCol = 0.74 + Math.random() * 0.16;
      const bCol = 0.12;

      baseColors[ptr * 3] = rCol;
      baseColors[ptr * 3 + 1] = gCol;
      baseColors[ptr * 3 + 2] = bCol;

      currentColors[ptr * 3] = rCol;
      currentColors[ptr * 3 + 1] = gCol;
      currentColors[ptr * 3 + 2] = bCol;

      sizes[ptr] = Math.random() * 2.2 + 1.4;
      particleTypes[ptr] = 1;
      ptr++;
    }

    // 3. Laryngeal & Vocal Motor Area (Speech Cortex)
    for (let i = 0; i < totalMotor; i++) {
      const hemi = Math.random() < 0.5 ? -1 : 1;
      const tMotor = Math.random();
      // Precentral gyrus lateral coronal band
      const x = hemi * (1.8 + tMotor * 1.3 + (Math.random() - 0.5) * 0.3);
      const y = 0.6 + (1.0 - tMotor) * 1.6 + (Math.random() - 0.5) * 0.3;
      const z = 0.4 + (Math.random() - 0.5) * 0.6;

      positions[ptr * 3] = x;
      positions[ptr * 3 + 1] = y;
      positions[ptr * 3 + 2] = z;

      // Electric Sky Cyan / Turquoise
      const rCol = 0.0;
      const gCol = 0.92;
      const bCol = 1.0;

      baseColors[ptr * 3] = rCol;
      baseColors[ptr * 3 + 1] = gCol;
      baseColors[ptr * 3 + 2] = bCol;

      currentColors[ptr * 3] = rCol;
      currentColors[ptr * 3 + 1] = gCol;
      currentColors[ptr * 3 + 2] = bCol;

      sizes[ptr] = Math.random() * 2.0 + 1.3;
      particleTypes[ptr] = 2;
      ptr++;
    }

    const brainGeo = new THREE.BufferGeometry();
    brainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    brainGeo.setAttribute('color', new THREE.BufferAttribute(currentColors, 3));

    // Procedural Circular Glow Texture (100% cross-platform, zero square edge artifacts)
    function createGlowDotTexture() {
      const pCanvas = document.createElement('canvas');
      pCanvas.width = 64;
      pCanvas.height = 64;
      const pCtx = pCanvas.getContext('2d');
      const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.7)');
      grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.25)');
      grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      pCtx.fillStyle = grad;
      pCtx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(pCanvas);
      return texture;
    }

    const glowTexture = createGlowDotTexture();

    const brainMaterial = new THREE.PointsMaterial({
      size: 0.28,
      vertexColors: true,
      map: glowTexture,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const brainPoints = new THREE.Points(brainGeo, brainMaterial);
    brainGroup.add(brainPoints);

    // 4. Cortical Synaptic Connection Lines
    const lineIndices = [];
    const lineColors = [];
    const maxLineDist = 1.05;

    for (let i = 0; i < 800; i++) {
      const idxA = Math.floor(Math.random() * totalCortical);
      const ax = positions[idxA * 3];
      const ay = positions[idxA * 3 + 1];
      const az = positions[idxA * 3 + 2];

      for (let j = 0; j < 5; j++) {
        const idxB = Math.floor(Math.random() * totalCortical);
        if (idxA === idxB) continue;
        const bx = positions[idxB * 3];
        const by = positions[idxB * 3 + 1];
        const bz = positions[idxB * 3 + 2];

        const dx = ax - bx;
        const dy = ay - by;
        const dz = az - bz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (d < maxLineDist && lineIndices.length < 2800) {
          lineIndices.push(ax, ay, az, bx, by, bz);
          const alpha = 1.0 - (d / maxLineDist);
          lineColors.push(0.0, 0.6 * alpha, 0.75 * alpha);
          lineColors.push(0.35 * alpha, 0.25 * alpha, 0.65 * alpha);
        }
      }
    }

    // Nigrostriatal Dopamine Pathway Lines (Substantia Nigra to Motor Area)
    for (let k = 0; k < 35; k++) {
      const dopIdx = totalCortical + Math.floor(Math.random() * totalDopamine);
      const motIdx = totalCortical + totalDopamine + Math.floor(Math.random() * totalMotor);

      lineIndices.push(
        positions[dopIdx * 3], positions[dopIdx * 3 + 1], positions[dopIdx * 3 + 2],
        positions[motIdx * 3], positions[motIdx * 3 + 1], positions[motIdx * 3 + 2]
      );
      lineColors.push(0.95, 0.68, 0.1);
      lineColors.push(0.05, 0.8, 0.95);
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineIndices, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
    });

    const brainLines = new THREE.LineSegments(lineGeo, lineMat);
    brainGroup.add(brainLines);

    // 5. Action Potential Synaptic Pulse Sparks
    const sparkCount = 35;
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkSpeeds = [];
    const sparkTracts = [];

    for (let i = 0; i < sparkCount; i++) {
      const startIdx = totalCortical + Math.floor(Math.random() * totalDopamine);
      const endIdx = totalCortical + totalDopamine + Math.floor(Math.random() * totalMotor);
      sparkTracts.push({
        start: new THREE.Vector3(positions[startIdx * 3], positions[startIdx * 3 + 1], positions[startIdx * 3 + 2]),
        end: new THREE.Vector3(positions[endIdx * 3], positions[endIdx * 3 + 1], positions[endIdx * 3 + 2]),
        progress: Math.random()
      });
      sparkSpeeds.push(0.008 + Math.random() * 0.014);
    }

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));

    const sparkMat = new THREE.PointsMaterial({
      color: 0xffe680,
      size: 0.32,
      map: glowTexture,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    brainGroup.add(sparkPoints);

    // Initial slight tilt for optimal anatomical view
    brainGroup.rotation.x = 0.15;
    brainGroup.rotation.y = -0.35;

    // Interactive Mode State: 'all', 'dopamine', 'motor'
    let currentMode = 'all';

    function updateBrainMode(mode) {
      currentMode = mode;
      const tag = document.getElementById('brain-region-tag');

      if (mode === 'all') {
        if (tag) tag.textContent = 'REGIONS: ALL HEMISPHERES';
        lineMat.opacity = 0.28;
      } else if (mode === 'dopamine') {
        if (tag) tag.textContent = 'FOCUS: SUBSTANTIA NIGRA & BASAL GANGLIA (PARKINSONS)';
        lineMat.opacity = 0.12;
      } else if (mode === 'motor') {
        if (tag) tag.textContent = 'FOCUS: LARYNGEAL VOCAL MOTOR CORTEX';
        lineMat.opacity = 0.12;
      }

      document.querySelectorAll('.brain-ctrl-btn').forEach(btn => {
        if (btn.getAttribute('data-mode') === mode) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    }

    document.querySelectorAll('.brain-ctrl-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = btn.getAttribute('data-mode');
        updateBrainMode(mode);
      });
    });

    // Mouse / Touch 3D Orbit Drag Controls
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let rotVelX = 0;
    let rotVelY = 0.0035;

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      brainGroup.rotation.y += deltaX * 0.008;
      brainGroup.rotation.x += deltaY * 0.008;
      rotVelY = deltaX * 0.004;
      rotVelX = deltaY * 0.004;
    });

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
      }
    }, { passive: true });

    window.addEventListener('touchend', () => { isDragging = false; });

    window.addEventListener('touchmove', (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - prevMouseX;
      const deltaY = e.touches[0].clientY - prevMouseY;
      prevMouseX = e.touches[0].clientX;
      prevMouseY = e.touches[0].clientY;

      brainGroup.rotation.y += deltaX * 0.008;
      brainGroup.rotation.x += deltaY * 0.008;
    }, { passive: true });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      camera.position.z += e.deltaY * 0.02;
      camera.position.z = Math.max(12, Math.min(32, camera.position.z));
    }, { passive: false });

    // Animation Loop
    let clock = 0;
    function animateBrain() {
      requestAnimationFrame(animateBrain);
      clock += 0.02;

      // Inertia & Auto-rotation
      if (!isDragging) {
        rotVelY = THREE.MathUtils.lerp(rotVelY, 0.0032, 0.04);
        rotVelX = THREE.MathUtils.lerp(rotVelX, 0.0, 0.04);
        brainGroup.rotation.y += rotVelY;
        brainGroup.rotation.x += rotVelX;
      }

      // Breathing / Synaptic Pulse Oscillation
      const pulse = 1.0 + Math.sin(clock * 2) * 0.015;
      brainGroup.scale.set(pulse, pulse, pulse);

      // Animate Dopamine Action Potential Sparks
      const sparkPosArray = sparkGeo.attributes.position.array;
      for (let i = 0; i < sparkCount; i++) {
        const tract = sparkTracts[i];
        tract.progress += sparkSpeeds[i];
        if (tract.progress > 1.0) tract.progress = 0;

        const currentPos = new THREE.Vector3().lerpVectors(tract.start, tract.end, tract.progress);
        sparkPosArray[i * 3] = currentPos.x;
        sparkPosArray[i * 3 + 1] = currentPos.y;
        sparkPosArray[i * 3 + 2] = currentPos.z;
      }
      sparkGeo.attributes.position.needsUpdate = true;

      // Dynamic Color / Focus Shading based on currentMode
      const colArray = brainGeo.attributes.color.array;
      for (let i = 0; i < totalPoints; i++) {
        const pType = particleTypes[i];
        const baseR = baseColors[i * 3];
        const baseG = baseColors[i * 3 + 1];
        const baseB = baseColors[i * 3 + 2];

        let targetDim = 1.0;

        if (currentMode === 'dopamine') {
          if (pType === 1) {
            const dopPulse = 1.0 + Math.sin(clock * 5 + i * 0.1) * 0.4;
            colArray[i * 3] = Math.min(1.0, baseR * dopPulse);
            colArray[i * 3 + 1] = Math.min(1.0, baseG * dopPulse);
            colArray[i * 3 + 2] = Math.min(1.0, baseB * dopPulse);
            continue;
          } else {
            targetDim = 0.12;
          }
        } else if (currentMode === 'motor') {
          if (pType === 2) {
            const motPulse = 1.0 + Math.sin(clock * 5 + i * 0.1) * 0.35;
            colArray[i * 3] = Math.min(1.0, baseR * motPulse);
            colArray[i * 3 + 1] = Math.min(1.0, baseG * motPulse);
            colArray[i * 3 + 2] = Math.min(1.0, baseB * motPulse);
            continue;
          } else {
            targetDim = 0.14;
          }
        }

        colArray[i * 3] = baseR * targetDim;
        colArray[i * 3 + 1] = baseG * targetDim;
        colArray[i * 3 + 2] = baseB * targetDim;
      }
      brainGeo.attributes.color.needsUpdate = true;

      renderer.render(scene, camera);
    }

    animateBrain();

    function onResize() {
      if (!container) return;
      const newW = container.clientWidth || 480;
      const newH = container.clientHeight || 340;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    }

    window.addEventListener('resize', onResize);
  }

  init3DBrainViewer();

  // =========================================================================
  // 1. Navigation & Tabs
  // =========================================================================
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');

  const tabMeta = {
    'voice-lab': {
      title: 'Voice Biomarker Lab',
      subtitle: 'Extract 22 clinical acoustic biomarkers and classify dysphonia using data-driven ML'
    },
    'longitudinal': {
      title: 'Longitudinal Telemonitoring & BOCPD',
      subtitle: 'Track acoustic progression over time and detect medication state shifts (Tsanas 2010; BOCPD)'
    },
    'lsvt-loud': {
      title: 'LSVT LOUD® Voice Therapy Companion',
      subtitle: 'Clinically validated intensive vocal loudness & duration coaching (Ramig et al. 2001; PD COMM)'
    },
    'motor-tap': {
      title: 'Multimodal Motor Fluctuation Module',
      subtitle: 'MDS-UPDRS finger-tapping test fused with voice biomarkers for ON/OFF state detection (Zhang 2025)'
    },
    'research': {
      title: 'Research Base & Model Provenance',
      subtitle: 'Full transparent provenance of UCI datasets, 5-fold CV metrics, and mathematical formulas'
    }
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      document.getElementById(`tab-${tabId}`).classList.add('active');

      if (tabMeta[tabId]) {
        pageTitle.textContent = tabMeta[tabId].title;
        pageSubtitle.textContent = tabMeta[tabId].subtitle;
      }

      if (tabId === 'longitudinal' && !longitudinalChart) {
        loadLongitudinalData();
      }
    });
  });

  // =========================================================================
  // 2. Audio Waveform Visualizer & Microphone Recording
  // =========================================================================
  const canvas = document.getElementById('waveform-canvas');
  const canvasCtx = canvas.getContext('2d');
  const btnRecord = document.getElementById('btn-record');
  const btnRecordText = document.getElementById('btn-record-text');
  const btnStop = document.getElementById('btn-stop');
  const audioFileInput = document.getElementById('audio-file-input');
  const playbackContainer = document.getElementById('audio-playback-container');
  const audioPlayer = document.getElementById('audio-player');
  const btnAnalyze = document.getElementById('btn-analyze');
  const recTimerText = document.getElementById('recording-timer');
  const micStatusLabel = document.getElementById('mic-status-label');

  function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function drawEmptyWaveform() {
    const grad = canvasCtx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#040710');
    grad.addColorStop(1, '#080d1a');
    canvasCtx.fillStyle = grad;
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    canvasCtx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
    canvasCtx.lineWidth = 1;
    for (let y = 0; y < canvas.height; y += 30) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, y);
      canvasCtx.lineTo(canvas.width, y);
      canvasCtx.stroke();
    }

    // Center line
    canvasCtx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
    canvasCtx.lineWidth = 1.5;
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, canvas.height / 2);
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
  }
  drawEmptyWaveform();

  function startWaveformVisualizer(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyserNode);

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      animFrameId = requestAnimationFrame(draw);
      analyserNode.getByteTimeDomainData(dataArray);

      const grad = canvasCtx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#040710');
      grad.addColorStop(1, '#080d1a');
      canvasCtx.fillStyle = grad;
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      // Neon grid lines
      canvasCtx.strokeStyle = 'rgba(0, 229, 255, 0.04)';
      canvasCtx.lineWidth = 1;
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, canvas.height * 0.25); canvasCtx.lineTo(canvas.width, canvas.height * 0.25);
      canvasCtx.moveTo(0, canvas.height * 0.75); canvasCtx.lineTo(canvas.width, canvas.height * 0.75);
      canvasCtx.stroke();

      // Glowing Waveform with gradient
      const waveGrad = canvasCtx.createLinearGradient(0, 0, canvas.width, 0);
      waveGrad.addColorStop(0, '#00e5ff');
      waveGrad.addColorStop(0.5, '#a855f7');
      waveGrad.addColorStop(1, '#00e5ff');

      canvasCtx.lineWidth = 2.5;
      canvasCtx.strokeStyle = waveGrad;
      canvasCtx.shadowBlur = 12;
      canvasCtx.shadowColor = '#00e5ff';

      canvasCtx.beginPath();
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
      canvasCtx.shadowBlur = 0;
    }
    draw();
  }

  // Recording Controls
  btnRecord.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioPlayer.src = audioUrl;
        playbackContainer.style.display = 'flex';
        micStatusLabel.textContent = 'Audio Captured. Ready for ML analysis.';
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      startWaveformVisualizer(stream);

      btnRecord.disabled = true;
      btnStop.disabled = false;
      btnRecordText.textContent = 'Recording Active...';
      micStatusLabel.textContent = 'Recording microphone stream... Sustain "AHHH"';

      recStartTime = Date.now();
      recTimerInterval = setInterval(() => {
        const elapsed = (Date.now() - recStartTime) / 1000;
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toFixed(1).padStart(4, '0');
        recTimerText.textContent = `${mins}:${secs}`;
      }, 100);
    } catch (err) {
      alert('Microphone access error: ' + err.message + '. You can also test with calibration samples or upload an audio file.');
    }
  });

  btnStop.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      cancelAnimationFrame(animFrameId);
      clearInterval(recTimerInterval);
      if (audioContext) audioContext.close();
      btnRecord.disabled = false;
      btnStop.disabled = true;
      btnRecordText.textContent = 'Record Again';
    }
  });

  // File Upload
  audioFileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) {
      audioBlob = file;
      audioPlayer.src = URL.createObjectURL(file);
      playbackContainer.style.display = 'flex';
      micStatusLabel.textContent = `Loaded file: ${file.name}`;
      btnRecordText.textContent = 'Start Recording';
    }
  });

  // Calibration Sample Buttons
  document.querySelectorAll('.btn-sample').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sampleName = btn.getAttribute('data-sample');
      micStatusLabel.textContent = `Loading research sample: ${sampleName}...`;
      try {
        const res = await fetch(`/api/samples/${sampleName}`);
        if (!res.ok) throw new Error('Could not load sample file.');
        audioBlob = await res.blob();
        audioPlayer.src = URL.createObjectURL(audioBlob);
        playbackContainer.style.display = 'flex';
        micStatusLabel.textContent = `Sample Loaded: ${sampleName}. Running extraction...`;
        // Automatically run analysis on calibration click
        runAudioAnalysis(audioBlob);
      } catch (err) {
        alert('Sample load error: ' + err.message);
      }
    });
  });

  // Analyze Button
  btnAnalyze.addEventListener('click', () => {
    if (audioBlob) {
      runAudioAnalysis(audioBlob);
    }
  });

  // =========================================================================
  // 3. Audio Analysis & Diagnostic Results Rendering
  // =========================================================================
  async function runAudioAnalysis(blob) {
    const placeholder = document.getElementById('results-placeholder');
    const content = document.getElementById('results-content');
    btnAnalyze.disabled = true;
    btnAnalyze.innerHTML = `<span>Extracting Acoustic Biomarkers & Running Models...</span>`;

    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.wav');

      const response = await fetch('/api/analyze-audio', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Analysis request failed.');
      }

      const data = await response.json();
      renderAnalysisResults(data);

      placeholder.style.display = 'none';
      content.style.display = 'block';
    } catch (err) {
      alert('Analysis Error: ' + err.message);
    } finally {
      btnAnalyze.disabled = false;
      btnAnalyze.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg><span>Run Acoustic Extraction & ML Analysis</span>`;
    }
  }

  function renderAnalysisResults(data) {
    const clf = data.classification;
    const updrs = data.updrs_telemonitoring;
    const anomaly = data.anomaly_detection;
    const comparisons = data.biomarker_comparisons;

    // Cache for multimodal fusion
    lastVoiceRisk = clf.ensemble_pd_probability;
    lastVoiceUpdrs = updrs.predicted_total_updrs;

    // 1. Diagnostic Gauge
    const gaugeFill = document.getElementById('gauge-fill');
    const gaugePercent = document.getElementById('gauge-percentage');
    const diagBadge = document.getElementById('diagnostic-badge');
    const diagVerdict = document.getElementById('diagnostic-verdict');
    const diagDesc = document.getElementById('diagnostic-desc');
    const resConfidence = document.getElementById('res-confidence');
    const resAnomalyZ = document.getElementById('res-anomaly-z');

    const pct = clf.ensemble_pd_percent;
    gaugePercent.textContent = `${pct}%`;

    // Circumference = 2 * PI * 42 = 263.89
    const maxDash = 264;
    const offset = maxDash - (pct / 100) * maxDash;
    gaugeFill.style.strokeDashoffset = offset;

    if (clf.is_pd_flagged) {
      gaugeFill.style.stroke = '#C8736B';
      diagBadge.className = 'diag-badge pd';
      diagBadge.textContent = 'Acoustic Dysphonia Detected';
      diagVerdict.textContent = 'Parkinsonian Acoustic Pattern';
      diagDesc.textContent = `Acoustic perturbations (Jitter, Shimmer, PPE) exceed normative healthy bounds.`;
    } else {
      gaugeFill.style.stroke = '#7BAE7F';
      diagBadge.className = 'diag-badge healthy';
      diagBadge.textContent = 'Normative Vocal Pattern';
      diagVerdict.textContent = 'Healthy Control Classification';
      diagDesc.textContent = `Vocal harmonics and pitch stability align with healthy population baselines.`;
    }

    resConfidence.textContent = clf.confidence;
    resAnomalyZ.textContent = anomaly.anomaly_z_score > 0 ? `+${anomaly.anomaly_z_score}` : anomaly.anomaly_z_score;

    // 2. Multi-Model Grid
    document.getElementById('mm-svm-prob').textContent = `${(clf.models.svm.pd_probability * 100).toFixed(1)}%`;
    document.getElementById('mm-rf-prob').textContent = `${(clf.models.random_forest.pd_probability * 100).toFixed(1)}%`;
    document.getElementById('mm-dl-prob').textContent = `${(clf.models.cnn_lstm_deep_learning.pd_probability * 100).toFixed(1)}%`;
    document.getElementById('mm-ae-mse').textContent = anomaly.autoencoder_mse.toFixed(2);

    // 3. UPDRS Telemonitoring
    document.getElementById('res-motor-updrs').textContent = updrs.predicted_motor_updrs.toFixed(1);
    document.getElementById('res-total-updrs').textContent = updrs.predicted_total_updrs.toFixed(1);
    document.getElementById('res-updrs-stage').textContent = `${updrs.severity_stage} Severity`;

    // 4. Radar Chart
    renderRadarChart(comparisons);

    // 5. Comparison Table
    const tbody = document.getElementById('biomarker-table-body');
    tbody.innerHTML = '';
    comparisons.forEach(item => {
      const tr = document.createElement('tr');
      let pillClass = 'normal';
      if (item.clinical_status.includes('Dysphonic') || item.clinical_status.includes('Breathiness')) pillClass = 'elevated';
      else if (item.clinical_status.includes('Atypical')) pillClass = 'atypical';

      tr.innerHTML = `
        <td><strong>${item.feature}</strong></td>
        <td>${item.user_value}</td>
        <td>${item.healthy_mean}</td>
        <td>${item.z_score_vs_healthy > 0 ? '+' : ''}${item.z_score_vs_healthy}σ</td>
        <td><span class="status-pill ${pillClass}">${item.clinical_status}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderRadarChart(comparisons) {
    const ctx = document.getElementById('radar-biomarkers-canvas').getContext('2d');
    const labels = comparisons.map(c => c.feature);
    
    // Normalized scale: healthy = 50, PD = 50 + z_score * 15
    const userVals = comparisons.map(c => Math.max(10, Math.min(100, 50 + c.z_score_vs_healthy * 18)));
    const healthyVals = comparisons.map(() => 50);

    if (radarChart) {
      radarChart.destroy();
    }

    radarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'User Voice Profile',
            data: userVals,
            borderColor: '#4F9A8B',
            backgroundColor: 'rgba(79, 154, 139, 0.15)',
            borderWidth: 2,
            pointBackgroundColor: '#4F9A8B',
            pointBorderColor: '#4F9A8B',
            pointHoverBackgroundColor: '#E8E4DF',
          },
          {
            label: 'Healthy Reference Baseline (Little et al.)',
            data: healthyVals,
            borderColor: '#7BAE7F',
            backgroundColor: 'rgba(123, 174, 127, 0.06)',
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointBackgroundColor: '#7BAE7F',
            pointBorderColor: '#7BAE7F',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: 'rgba(255, 255, 255, 0.05)' },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            pointLabels: {
              color: '#9B958E',
              font: { family: 'Inter', size: 10.5, weight: '500' }
            },
            ticks: { display: false, min: 0, max: 100 }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#f8fafc', font: { family: 'Inter', size: 11 } }
          }
        }
      }
    });
  }

  // =========================================================================
  // 4. Longitudinal Telemonitoring & BOCPD
  // =========================================================================
  const profileSelect = document.getElementById('profile-select');

  async function loadLongitudinalData() {
    try {
      const res = await fetch('/api/longitudinal/profiles');
      const data = await res.json();
      if (!data.success) return;

      const profiles = data.profiles;
      const selectedKey = profileSelect.value;
      renderLongitudinalView(profiles[selectedKey]);

      profileSelect.onchange = () => {
        renderLongitudinalView(profiles[profileSelect.value]);
      };
    } catch (err) {
      console.error('Longitudinal error:', err);
    }
  }

  function renderLongitudinalView(summary) {
    document.getElementById('long-total-sessions').textContent = summary.total_sessions;
    document.getElementById('long-trend-status').textContent = summary.trend_direction;
    document.getElementById('long-trend-slope').textContent = `UPDRS Slope: ${summary.updrs_progression_slope > 0 ? '+' : ''}${summary.updrs_progression_slope} pts/session`;
    document.getElementById('long-flagged-shifts').textContent = summary.flagged_anomaly_count;
    document.getElementById('long-mean-updrs').textContent = summary.recent_updrs_mean ? `${summary.recent_updrs_mean} pts` : '--';

    // Chart
    const sessions = summary.sessions;
    const labels = sessions.map(s => s.date);
    const ppeData = sessions.map(s => s.ppe);
    const updrsData = sessions.map(s => s.predicted_updrs);
    const bocpdData = sessions.map(s => s.bocpd_changepoint_prob * 100);

    const ctx = document.getElementById('longitudinal-chart-canvas').getContext('2d');
    if (longitudinalChart) longitudinalChart.destroy();

    longitudinalChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Predicted Total UPDRS Score',
            data: updrsData,
            borderColor: '#8B7EC8',
            backgroundColor: 'rgba(139, 126, 200, 0.08)',
            yAxisID: 'yUpdrs',
            tension: 0.3,
            borderWidth: 2.5
          },
          {
            label: 'Pitch Period Entropy (PPE)',
            data: ppeData,
            borderColor: '#4F9A8B',
            yAxisID: 'yPpe',
            tension: 0.3,
            borderWidth: 2
          },
          {
            label: 'BOCPD State Shift Probability (%)',
            data: bocpdData,
            borderColor: '#C8736B',
            backgroundColor: 'rgba(200, 115, 107, 0.15)',
            yAxisID: 'yProb',
            type: 'bar',
            barThickness: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#6E6861' }
          },
          yUpdrs: {
            position: 'left',
            title: { display: true, text: 'UPDRS Score', color: '#8B7EC8' },
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#8B7EC8' }
          },
          yPpe: {
            position: 'right',
            title: { display: true, text: 'PPE', color: '#4F9A8B' },
            grid: { display: false },
            ticks: { color: '#4F9A8B' }
          },
          yProb: {
            display: false,
            min: 0,
            max: 100
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#f8fafc', font: { family: 'Inter', size: 11 } }
          }
        }
      }
    });

    // Table
    const tbody = document.getElementById('longitudinal-table-body');
    tbody.innerHTML = '';
    sessions.slice().reverse().forEach(s => {
      const tr = document.createElement('tr');
      const isShift = s.is_shift_flagged;
      tr.innerHTML = `
        <td><strong>${s.date}</strong></td>
        <td>${s.ppe.toFixed(4)}</td>
        <td>${s.jitter_percent.toFixed(3)}%</td>
        <td>${s.hnr.toFixed(1)} dB</td>
        <td><strong>${s.predicted_updrs.toFixed(1)}</strong></td>
        <td><span class="status-pill ${s.med_status.includes('OFF') ? 'elevated' : 'normal'}">${s.med_status}</span></td>
        <td>${isShift ? '<strong style="color: #C8736B;">⚡ SHIFT ' + (s.bocpd_changepoint_prob*100).toFixed(0) + '%</strong>' : (s.bocpd_changepoint_prob*100).toFixed(1) + '%'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // =========================================================================
  // 5. LSVT LOUD Voice Therapy Companion
  // =========================================================================
  const btnLsvtStart = document.getElementById('btn-lsvt-start');
  const btnLsvtStop = document.getElementById('btn-lsvt-stop');
  const lsvtLiveMeter = document.getElementById('lsvt-live-meter');
  const lsvtLiveDb = document.getElementById('lsvt-live-db');

  btnLsvtStart.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      lsvtChunks = [];
      lsvtRecorder = new MediaRecorder(stream);

      lsvtAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      lsvtAnalyser = lsvtAudioContext.createAnalyser();
      lsvtAnalyser.fftSize = 1024;
      const source = lsvtAudioContext.createMediaStreamSource(stream);
      source.connect(lsvtAnalyser);

      const bufferLength = lsvtAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function updateMeter() {
        lsvtAnimId = requestAnimationFrame(updateMeter);
        lsvtAnalyser.getByteTimeDomainData(dataArray);

        let sumSquares = 0.0;
        for (let i = 0; i < bufferLength; i++) {
          const norm = (dataArray[i] - 128) / 128.0;
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        // Map RMS to dB SPL proxy (50 - 90 dB)
        const db = Math.min(95, Math.max(45, 20 * Math.log10(Math.max(1e-4, rms)) + 90));

        lsvtLiveDb.textContent = db.toFixed(1);
        const meterPercent = Math.min(100, Math.max(0, ((db - 50) / 40) * 100));
        lsvtLiveMeter.style.width = `${meterPercent}%`;

        if (db >= 75) {
          lsvtLiveDb.style.color = '#7BAE7F';
        } else {
          lsvtLiveDb.style.color = '#4F9A8B';
        }
      }
      updateMeter();

      lsvtRecorder.ondataavailable = e => {
        if (e.data.size > 0) lsvtChunks.push(e.data);
      };

      lsvtRecorder.onstop = async () => {
        const blob = new Blob(lsvtChunks, { type: 'audio/wav' });
        stream.getTracks().forEach(t => t.stop());
        cancelAnimationFrame(lsvtAnimId);
        if (lsvtAudioContext) lsvtAudioContext.close();

        // Send to LSVT evaluation endpoint
        evaluateLsvtAudio(blob);
      };

      lsvtRecorder.start();
      btnLsvtStart.disabled = true;
      btnLsvtStop.disabled = false;
      document.getElementById('btn-lsvt-text').textContent = 'Recording Vocal Hold...';
    } catch (err) {
      alert('Microphone error: ' + err.message);
    }
  });

  btnLsvtStop.addEventListener('click', () => {
    if (lsvtRecorder && lsvtRecorder.state !== 'inactive') {
      lsvtRecorder.stop();
      btnLsvtStart.disabled = false;
      btnLsvtStop.disabled = true;
      document.getElementById('btn-lsvt-text').textContent = 'Start Vocal Exercise';
    }
  });

  async function evaluateLsvtAudio(blob) {
    document.getElementById('lsvt-feedback-text').textContent = 'Evaluating sustained phonation metrics...';
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'lsvt.wav');
      formData.append('target_db', '72.0');

      const res = await fetch('/api/analyze-lsvt', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!data.success) throw new Error('Evaluation error.');

      const m = data.lsvt_metrics;
      document.getElementById('lsvt-overall-score').textContent = m.overall_score;
      document.getElementById('lsvt-mpt').textContent = `${m.sustained_time_sec} s`;
      document.getElementById('lsvt-mean-db').textContent = `${m.mean_loudness_db} dB`;
      document.getElementById('lsvt-compliance').textContent = `${m.target_compliance_pct}%`;
      document.getElementById('lsvt-pitch-stab').textContent = `${m.f0_stability_score}/100`;
      document.getElementById('lsvt-feedback-text').textContent = m.feedback;
    } catch (err) {
      document.getElementById('lsvt-feedback-text').textContent = 'Evaluation error: ' + err.message;
    }
  }

  // =========================================================================
  // 6. Multimodal Finger-Tapping Test
  // =========================================================================
  const btnStartTap = document.getElementById('btn-start-tap-test');
  const btnResetTap = document.getElementById('btn-reset-tap-test');
  const btnTapLeft = document.getElementById('btn-tap-left');
  const btnTapRight = document.getElementById('btn-tap-right');
  const tapTimerText = document.getElementById('tap-timer-text');
  const tapCounterText = document.getElementById('tap-counter-text');

  function recordTap() {
    if (!tapTestActive) return;
    const now = performance.now();
    tapTimestamps.push(now);
    tapCounterText.textContent = tapTimestamps.length;
  }

  btnTapLeft.addEventListener('click', recordTap);
  btnTapRight.addEventListener('click', recordTap);

  window.addEventListener('keydown', e => {
    if (!tapTestActive) return;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
      btnTapLeft.classList.add('active');
      setTimeout(() => btnTapLeft.classList.remove('active'), 100);
      recordTap();
    } else if (e.key === 'l' || e.key === 'L' || e.key === 'ArrowRight') {
      btnTapRight.classList.add('active');
      setTimeout(() => btnTapRight.classList.remove('active'), 100);
      recordTap();
    }
  });

  btnStartTap.addEventListener('click', () => {
    tapTimestamps = [];
    tapTestActive = true;
    tapCounterText.textContent = '0';
    btnTapLeft.disabled = false;
    btnTapRight.disabled = false;
    btnStartTap.disabled = true;

    let timeLeft = 10.0;
    tapTimerInterval = setInterval(() => {
      timeLeft -= 0.1;
      if (timeLeft <= 0) {
        clearInterval(tapTimerInterval);
        endTapTest();
      } else {
        tapTimerText.textContent = `${timeLeft.toFixed(1)}s`;
      }
    }, 100);
  });

  btnResetTap.addEventListener('click', () => {
    clearInterval(tapTimerInterval);
    tapTestActive = false;
    tapTimestamps = [];
    tapTimerText.textContent = '10.0s';
    tapCounterText.textContent = '0';
    btnTapLeft.disabled = true;
    btnTapRight.disabled = true;
    btnStartTap.disabled = false;
  });

  async function endTapTest() {
    tapTestActive = false;
    btnTapLeft.disabled = true;
    btnTapRight.disabled = true;
    btnStartTap.disabled = false;
    tapTimerText.textContent = 'Done!';

    if (tapTimestamps.length < 4) {
      alert('Too few taps recorded. Try again with alternating rapid taps!');
      return;
    }

    try {
      const res = await fetch('/api/analyze-motor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamps_ms: tapTimestamps,
          voice_pd_prob: lastVoiceRisk,
          voice_updrs: lastVoiceUpdrs
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const m = data.motor_metrics;
      document.getElementById('motor-tap-freq').textContent = `${m.tap_frequency_hz} Hz`;
      document.getElementById('motor-cv-iti').textContent = `${m.cv_iti_percent}%`;
      document.getElementById('motor-rhythm-score').textContent = `${m.rhythmicity_score}/100`;
      document.getElementById('motor-fatigue-slope').textContent = `${m.fatigue_slope_ms_per_tap > 0 ? '+' : ''}${m.fatigue_slope_ms_per_tap} ms/tap`;

      if (data.multimodal_fusion) {
        const mf = data.multimodal_fusion;
        document.getElementById('mc-fused-risk').textContent = `${(mf.composite_pd_risk * 100).toFixed(1)}%`;
        document.getElementById('mc-fused-severity').textContent = `${mf.composite_severity_score} UPDRS Points`;
        document.getElementById('mc-confidence-tag').textContent = mf.modality;
      }
    } catch (err) {
      alert('Motor analysis error: ' + err.message);
    }
  }
});
