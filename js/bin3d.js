/* ===== bin3d.js — Single Smart Bin with embedded screen & trash slot ===== */
(function () {
  const canvas = document.getElementById('binCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let rotY = 0.5, rotX = 0.18;
  let isDragging = false, lastX = 0, lastY = 0;
  let zoom = 1;
  let t = 0;

  // Trash drop animation
  let trashItems = [];
  let nextDrop = 120;
  const TRASH_TYPES = [
    { emoji: '🍌', label: 'เปลือกกล้วย', type: 'อินทรีย์', color: '#4caf50' },
    { emoji: '🥤', label: 'ขวดน้ำ',      type: 'รีไซเคิล', color: '#30d5ff' },
    { emoji: '🍱', label: 'กล่องข้าว',   type: 'ทั่วไป',   color: '#ffb830' },
    { emoji: '📄', label: 'กระดาษ',      type: 'รีไซเคิล', color: '#30d5ff' },
    { emoji: '🥛', label: 'กล่องนม',     type: 'รีไซเคิล', color: '#30d5ff' },
    { emoji: '🌿', label: 'ใบไม้',       type: 'อินทรีย์', color: '#4caf50' },
  ];
  let lastSortedItem = null;
  let sortedFadeTimer = 0;

  // Input
  canvas.addEventListener('mousedown', e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; canvas.style.cursor = 'grabbing'; });
  window.addEventListener('mouseup',   () => { isDragging = false; canvas.style.cursor = 'grab'; });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    rotY += (e.clientX - lastX) * 0.012;
    rotX  = Math.max(-0.3, Math.min(0.45, rotX + (e.clientY - lastY) * 0.006));
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('wheel', e => {
    zoom = Math.max(0.6, Math.min(1.7, zoom - e.deltaY * 0.001));
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchstart', e => { isDragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; e.preventDefault(); }, { passive: false });
  window.addEventListener('touchend',   () => { isDragging = false; });
  window.addEventListener('touchmove',  e => {
    if (!isDragging) return;
    rotY += (e.touches[0].clientX - lastX) * 0.012;
    rotX  = Math.max(-0.3, Math.min(0.45, rotX + (e.touches[0].clientY - lastY) * 0.006));
    lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
  });
  canvas.style.cursor = 'grab';

  // 3D projection
  function project(x, y, z) {
    const fov = 440;
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const rx  =  x * cosY - z * sinY;
    const rz0 =  x * sinY + z * cosY;
    const ry2 =  y * cosX - rz0 * sinX;
    const rz  =  y * sinX + rz0 * cosX;
    const d   = fov / (fov + rz + 380);
    const cx  = canvas.width  / 2;
    const cy  = canvas.height / 2 + 25;
    return { sx: cx + rx * d * zoom, sy: cy + ry2 * d * zoom, z: rz };
  }

  // Face queue for depth sorting
  let faceQueue = [];

  function queueFace(pts, color, alpha, stroke) {
    if (alpha === undefined) alpha = 1;
    if (stroke === undefined) stroke = true;
    const z = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    faceQueue.push({ pts, color, alpha, stroke, z });
  }

  function flushFaces() {
    faceQueue.sort((a, b) => b.z - a.z);
    faceQueue.forEach(f => {
      if (!f.pts.length) return;
      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.moveTo(f.pts[0].sx, f.pts[0].sy);
      for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].sx, f.pts[i].sy);
      ctx.closePath();
      ctx.fillStyle = f.color;
      ctx.fill();
      if (f.stroke) {
        ctx.strokeStyle = 'rgba(0,255,136,0.09)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      ctx.restore();
    });
    faceQueue = [];
  }

  // Queue a box (6 faces)
  function box(x, y, z, w, h, d, cols, alpha) {
    if (alpha === undefined) alpha = 1;
    const p = (px, py, pz) => project(px, py, pz);
    const v = [
      p(x,   y,   z),   p(x+w, y,   z),   p(x+w, y+h, z),   p(x,   y+h, z),
      p(x,   y,   z+d), p(x+w, y,   z+d), p(x+w, y+h, z+d), p(x,   y+h, z+d),
    ];
    queueFace([v[4],v[5],v[6],v[7]], cols[0], alpha); // front
    queueFace([v[0],v[1],v[2],v[3]], cols[1], alpha); // back
    queueFace([v[0],v[4],v[7],v[3]], cols[2], alpha); // left
    queueFace([v[1],v[5],v[6],v[2]], cols[3], alpha); // right
    queueFace([v[0],v[1],v[5],v[4]], cols[4], alpha); // top
    queueFace([v[3],v[2],v[6],v[7]], cols[5], alpha); // bottom
  }

  // Bin dimensions - single large bin, centered at origin
  const BW = 160, BH = 220, BD = 120;
  const BX = -BW/2, BY = -BH/2, BZ = -BD/2;

  // Lid
  const LW = BW+12, LH = 30, LD = BD+12;
  const LX = BX-6,  LY = BY-LH, LZ = BZ-6;

  // Screen embedded on front face
  const SW = 88, SH = 68;
  const SX = -SW/2, SY = BY + 22, SZ = BZ - 2;

  // Trash slot on top of lid (centered, front half)
  const SLOT_W = 58, SLOT_D = 14, SLOT_H = 10;
  const SLOT_X = -SLOT_W/2, SLOT_Y = LY - SLOT_H, SLOT_Z = -SLOT_D * 0.8;

  // Colors
  const C = {
    bF: '#1b3d20', bB: '#0f2412', bS: '#162e1a', bT: '#0e1f11', bBot: '#080d08',
    lF: '#22582a', lB: '#172f1d', lS: '#1b4422', lT: '#2a6832',
    bezF: '#091609', bezS: '#060e07',
    sF: '#020905',
    slotT: '#010603', slotS: '#020a05',
  };

  function buildScene() {
    // ── Base slab ──
    box(BX-12, BY+BH, BZ-12, BW+24, 12, BD+24,
      ['#142618','#0a1a0e','#0e2014','#0e2014','#1a3020','#080d09']);

    // ── Body ──
    box(BX, BY, BZ, BW, BH, BD,
      [C.bF, C.bB, C.bS, C.bS, C.bT, C.bBot]);

    // ── Green accent stripe ──
    box(BX+12, BY+BH-20, BZ-0.5, BW-24, 7, 1,
      ['#00ff8826','#00ff8810','#00ff8810','#00ff8810','#00ff8810','#00ff8810']);

    // ── Screen bezel (inset panel on front) ──
    box(SX-6, SY-6, BZ-3.5, SW+12, SH+12, 5,
      [C.bezF, C.bezS, C.bezS, C.bezS, C.bezS, C.bezS]);

    // ── Slot housing on lid (raised ring around slot) ──
    box(SLOT_X-7, SLOT_Y-5, SLOT_Z-6, SLOT_W+14, 8, SLOT_D+12,
      ['#1f3d24','#142a18','#192f1e','#192f1e','#244a2a','#0e1f12']);

    // ── Slot opening (dark hole) ──
    box(SLOT_X, SLOT_Y, SLOT_Z, SLOT_W, SLOT_H, SLOT_D,
      [C.slotT, C.slotT, C.slotS, C.slotS, '#010402', C.slotT]);

    // ── Lid ──
    box(LX, LY, LZ, LW, LH, LD,
      [C.lF, C.lB, C.lS, C.lS, C.lT, C.bBot]);

    // ── Lid handle (small bar on top) ──
    box(-18, LY-10, -10, 36, 10, 20,
      ['#2a6832','#1a4422','#22572a','#22572a','#30783a','#152d1a']);
  }

  // Screen content rendered as canvas 2D overlay after depth sort
  function drawScreenOverlay() {
    const p1 = project(SX,      SY,      SZ);
    const p2 = project(SX + SW, SY,      SZ);
    const p3 = project(SX + SW, SY + SH, SZ);
    const p4 = project(SX,      SY + SH, SZ);

    const mx = (p1.sx + p2.sx + p3.sx + p4.sx) / 4;
    const my = (p1.sy + p2.sy + p3.sy + p4.sy) / 4;
    const sc = Math.abs((p2.sx - p1.sx) / SW);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy);
    ctx.lineTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy);
    ctx.closePath();
    ctx.clip();

    // BG
    ctx.fillStyle = '#020d04';
    ctx.fill();

    // Glow
    const grd = ctx.createRadialGradient(mx, my-4*sc, 0, mx, my, 55*sc);
    grd.addColorStop(0,   'rgba(0,255,136,0.18)');
    grd.addColorStop(0.7, 'rgba(0,255,136,0.04)');
    grd.addColorStop(1,   'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(p1.sx, p1.sy, p2.sx - p1.sx, p4.sy - p1.sy);

    // QR pattern - positioned left of screen, upper area
    const qpat = [
      [1,1,1,0,0,1,1,1],[1,0,1,0,0,1,0,1],[1,0,1,1,1,1,0,1],
      [1,1,1,0,0,1,1,1],[0,0,0,1,1,0,0,0],[1,1,0,1,0,1,0,1],
      [0,1,1,0,1,0,1,1],[1,0,0,1,0,1,1,0],
    ];
    const cs    = 3.5 * sc;
    const qLeft = p1.sx + 7 * sc;
    const qTop  = p1.sy + 7 * sc;
    const pulse = 0.65 + 0.35 * Math.sin(t * 0.07);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#00ff88';
    qpat.forEach((row, ry) => row.forEach((cell, rx) => {
      if (cell) ctx.fillRect(qLeft + rx*cs, qTop + ry*cs, cs-0.4, cs-0.4);
    }));
    ctx.globalAlpha = 1;

    // SCAN ME label under QR
    const qrBottom = qTop + 8 * cs + 3 * sc;
    ctx.font = `bold ${Math.max(6, 6.5 * sc * 6)}px Space Mono`;
    ctx.fillStyle = 'rgba(0,255,136,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText('SCAN ME', qLeft + 4 * cs, qrBottom);

    // Sorted item label (right side of screen)
    if (lastSortedItem && sortedFadeTimer > 0) {
      const fa = Math.min(1, sortedFadeTimer / 35);
      const rX = p2.sx - 14 * sc;
      const rY = p1.sy + 14 * sc;
      ctx.globalAlpha = fa;

      // Type badge
      ctx.fillStyle = lastSortedItem.color + '33';
      const bW = 38 * sc, bH = 13 * sc;
      ctx.beginPath();
      ctx.roundRect(rX - bW/2, rY, bW, bH, 4);
      ctx.fill();

      ctx.fillStyle = lastSortedItem.color;
      ctx.font = `bold ${Math.max(6, 6 * sc * 5)}px Kanit`;
      ctx.textAlign = 'center';
      ctx.fillText(lastSortedItem.emoji, rX, rY + bH * 1.8);
      ctx.font = `bold ${Math.max(5, 5 * sc * 5)}px Kanit`;
      ctx.fillText(lastSortedItem.type, rX, rY + bH * 0.75);

      // Divider bar
      ctx.fillStyle = lastSortedItem.color;
      ctx.globalAlpha = fa * 0.5;
      ctx.fillRect(p1.sx + (p2.sx-p1.sx)*0.55, p1.sy+5*sc, 1, SH*sc*0.7);

      ctx.globalAlpha = 1;
    }

    // Screen border glow
    ctx.strokeStyle = `rgba(0,255,136,${0.28 + 0.18 * Math.sin(t * 0.055)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy);
    ctx.lineTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  // Slot glow ring
  function drawSlotGlow() {
    const s1 = project(SLOT_X-1,          SLOT_Y, SLOT_Z-1);
    const s2 = project(SLOT_X+SLOT_W+1,   SLOT_Y, SLOT_Z-1);
    const s3 = project(SLOT_X+SLOT_W+1,   SLOT_Y, SLOT_Z+SLOT_D+1);
    const s4 = project(SLOT_X-1,          SLOT_Y, SLOT_Z+SLOT_D+1);
    ctx.save();
    ctx.strokeStyle = `rgba(0,255,136,${0.22 + 0.15 * Math.sin(t*0.05)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s1.sx, s1.sy); ctx.lineTo(s2.sx, s2.sy);
    ctx.lineTo(s3.sx, s3.sy); ctx.lineTo(s4.sx, s4.sy);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Trash particles
  function spawnTrash() {
    const item = TRASH_TYPES[Math.floor(Math.random() * TRASH_TYPES.length)];
    const slotPt = project(0, SLOT_Y - 4, (SLOT_Z + SLOT_D/2));
    trashItems.push({
      ...item,
      x:    slotPt.sx + (Math.random() - 0.5) * 18,
      y:    slotPt.sy - 70,
      vy:   1.6 + Math.random() * 0.8,
      vx:   (Math.random() - 0.5) * 1.0,
      rot:  Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.16,
      size: 20 + Math.random() * 8,
      phase: 'falling',
      alpha: 1,
      targetY: slotPt.sy,
    });
    lastSortedItem = item;
    sortedFadeTimer = 95;
  }

  function updateTrash() {
    nextDrop--;
    if (nextDrop <= 0) {
      spawnTrash();
      nextDrop = 130 + Math.floor(Math.random() * 70);
    }
    if (sortedFadeTimer > 0) sortedFadeTimer--;

    trashItems = trashItems.filter(tr => tr.alpha > 0.02);
    trashItems.forEach(tr => {
      if (tr.phase === 'falling') {
        tr.x   += tr.vx;
        tr.y   += tr.vy;
        tr.vy  *= 1.10;
        tr.rot += tr.rotV;
        if (tr.y >= tr.targetY) {
          tr.phase = 'dissolving';
        }
      } else {
        tr.alpha -= 0.045;
        tr.y     += 2.5;
        tr.size  *= 0.95;
      }
    });
  }

  function drawTrash() {
    trashItems.forEach(tr => {
      ctx.save();
      ctx.globalAlpha = tr.alpha;
      ctx.translate(tr.x, tr.y);
      ctx.rotate(tr.rot);
      ctx.font = `${tr.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tr.emoji, 0, 0);
      ctx.restore();
    });
  }

  // Shadow
  function drawShadow() {
    const bc = project(0, BY + BH + 14, 0);
    ctx.save();
    const el = ctx.createRadialGradient(bc.sx, bc.sy, 0, bc.sx, bc.sy, 110*zoom);
    el.addColorStop(0,   'rgba(0,255,136,0.10)');
    el.addColorStop(0.5, 'rgba(0,255,136,0.03)');
    el.addColorStop(1,   'transparent');
    ctx.fillStyle = el;
    ctx.beginPath();
    ctx.ellipse(bc.sx, bc.sy, 130*zoom, 26*zoom, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function render() {
    t++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ambient bg glow
    const bg = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, 230);
    bg.addColorStop(0, 'rgba(0,255,136,0.025)');
    bg.addColorStop(1, 'transparent');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawShadow();

    faceQueue = [];
    buildScene();
    flushFaces();

    // Overlays (not depth-sorted, drawn on top)
    drawScreenOverlay();
    drawSlotGlow();

    updateTrash();
    drawTrash();

    if (!isDragging) rotY += 0.005;
    requestAnimationFrame(render);
  }

  render();
})();
