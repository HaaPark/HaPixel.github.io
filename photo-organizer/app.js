// Photo Organizer — everything runs on-device. No server, no upload.
'use strict';

const $main = document.getElementById('main');
const $bottombar = document.getElementById('bottombar');
const $title = document.getElementById('pageTitle');
const $back = document.getElementById('btnBack');
const $info = document.getElementById('btnInfo');
const $fileInput = document.getElementById('fileInput');
const $folderInput = document.getElementById('folderInput');

const nav = { stack: [{ screen: 'home', params: {} }] };
let activeUrls = [];

function trackUrl(blob) {
  const url = URL.createObjectURL(blob);
  activeUrls.push(url);
  return url;
}
function clearTrackedUrls() {
  activeUrls.forEach((u) => URL.revokeObjectURL(u));
  activeUrls = [];
}

function resetSelectionState() {
  yearSelectMode = false;
  yearSelection.clear();
  groupSelectMode = false;
  groupSelection.clear();
}
function goTo(screen, params = {}) {
  resetSelectionState();
  nav.stack.push({ screen, params });
  render();
}
function goBack() {
  resetSelectionState();
  if (nav.stack.length > 1) nav.stack.pop();
  render();
}
function goHome() {
  resetSelectionState();
  nav.stack = [{ screen: 'home', params: {} }];
  render();
}

$back.addEventListener('click', () => {
  if (nav.stack.length > 1) goBack();
});
$info.addEventListener('click', () => showInfo());

function toast(msg, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- helpers ----------

async function sha256Hex(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function drawToBlob(source, maxDim, quality) {
  return new Promise((resolve) => {
    const sw = source.width || source.naturalWidth;
    const sh = source.height || source.naturalHeight;
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, w, h);
    canvas.toBlob((blob) => resolve({ blob, w, h }), 'image/jpeg', quality);
  });
}

async function decodeImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    return bitmap;
  } catch (e) {
    // fallback for formats createImageBitmap can't handle in this browser
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });
  }
}

function fmtBytes(n) {
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + 'KB';
  return (n / 1024 / 1024).toFixed(1) + 'MB';
}

async function getGroups() {
  return (await db.getAll('groups')).sort((a, b) => a.order - b.order);
}
async function getGroupMap() {
  const groups = await getGroups();
  const map = {};
  groups.forEach((g) => (map[g.id] = g));
  return map;
}
async function getTag(photoId) {
  return (await db.get('tags', photoId)) || { photoId, groups: [], favorite: false, trash: false, reviewed: false };
}
async function saveTag(tag) {
  await db.put('tags', tag);
}

// ---------- import pipeline ----------

let importState = { running: false, done: 0, total: 0, skipped: 0, added: 0 };

async function importFiles(fileList) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpg|jpeg|png|webp|gif)$/i.test(f.name));
  if (files.length === 0) return;
  importState = { running: true, done: 0, total: files.length, skipped: 0, added: 0 };
  render();

  for (const file of files) {
    try {
      const buf = await file.arrayBuffer();
      const id = await sha256Hex(buf);
      const existing = await db.get('photos', id);
      if (existing) {
        importState.skipped++;
        importState.done++;
        if (importState.done % 5 === 0) render();
        continue;
      }

      const bitmap = await decodeImage(file);
      const width = bitmap.width || bitmap.naturalWidth;
      const height = bitmap.height || bitmap.naturalHeight;

      const exif = readExifDate(buf);
      const dateMs = (exif && exif.dateMs) || file.lastModified || Date.now();
      const d = new Date(dateMs);

      const sharpness = computeSharpness(bitmap);
      const dhash = computeDHash(bitmap);
      const { blob: thumbBlob } = await drawToBlob(bitmap, 260, 0.7);
      const { blob: dispBlob } = await drawToBlob(bitmap, 1024, 0.78);
      if (bitmap.close) bitmap.close();

      await db.put('photos', {
        id,
        fileName: file.name,
        fileSize: file.size,
        width, height,
        dateMs,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        sharpness,
        dhash,
        thumbBlob, dispBlob,
        addedAt: Date.now(),
      });
      await saveTag({ photoId: id, groups: [], favorite: false, trash: false, reviewed: false });

      importState.added++;
    } catch (e) {
      console.warn('import failed for', file.name, e);
    }
    importState.done++;
    if (importState.done % 3 === 0) render();
  }
  importState.running = false;
  render();
  toast(`가져오기 완료 · 새 사진 ${importState.added}장, 중복 ${importState.skipped}장 건너뜀`);
}

$fileInput.addEventListener('change', (e) => {
  importFiles(e.target.files);
  e.target.value = '';
});
$folderInput.addEventListener('change', (e) => {
  importFiles(e.target.files);
  e.target.value = '';
});

// ---------- face grouping ----------

let faceJob = { running: false, done: 0, total: 0, stage: '' };

async function runFaceGrouping() {
  if (faceJob.running) return;
  faceJob = { running: true, done: 0, total: 0, stage: '모델 불러오는 중…' };
  render();
  try {
    await loadFaceApi();
  } catch (e) {
    faceJob.running = false;
    render();
    toast('얼굴 인식 모델을 불러오지 못했어요 (인터넷 연결 확인)');
    return;
  }

  const photos = await db.getAll('photos');
  const todo = [];
  for (const p of photos) {
    const existing = await db.get('faces', p.id);
    if (!existing) todo.push(p);
  }
  faceJob.total = todo.length;
  faceJob.stage = '얼굴 찾는 중…';
  render();

  for (const p of todo) {
    try {
      const url = URL.createObjectURL(p.dispBlob);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const faces = await detectFaceDescriptors(img);
      URL.revokeObjectURL(url);
      await db.put('faces', { photoId: p.id, faces });
    } catch (e) {
      await db.put('faces', { photoId: p.id, faces: [] });
    }
    faceJob.done++;
    if (faceJob.done % 5 === 0) render();
    await new Promise((r) => setTimeout(r, 0));
  }

  faceJob.stage = '그룹으로 묶는 중…';
  render();
  await rebuildFaceClusters();

  faceJob.running = false;
  render();
  toast('얼굴 그룹 찾기 완료! "얼굴 그룹 이름짓기"에서 확인해보세요');
}

async function rebuildFaceClusters() {
  const allFaces = await db.getAll('faces');
  const flat = [];
  for (const f of allFaces) {
    (f.faces || []).forEach((face, i) => {
      flat.push({ photoId: f.photoId, faceIndex: i, descriptor: face.descriptor, box: face.box });
    });
  }
  if (flat.length === 0) return;

  const oldClusters = await db.getAll('faceClusters');
  const rawClusters = clusterFaces(flat);

  // drop existing clusters, we recompute fresh each time
  for (const c of oldClusters) await db.delete('faceClusters', c.id);

  let idx = 0;
  for (const cluster of rawClusters) {
    if (cluster.members.length < 2) continue; // skip one-off strangers/noise
    idx++;
    const id = 'cluster-' + idx;

    // inherit a previous name if this cluster is close to a previously-named one
    let groupId = null;
    let bestDist = CLUSTER_DISTANCE_THRESHOLD;
    for (const old of oldClusters) {
      if (!old.groupId) continue;
      const dist = euclideanDistance(old.centroid, cluster.centroid);
      if (dist < bestDist) { bestDist = dist; groupId = old.groupId; }
    }

    // representative face thumbnail: crop from one member's photo
    const sample = cluster.members[Math.floor(cluster.members.length / 2)];
    const samplePhoto = await db.get('photos', sample.photoId);
    let thumbDataUrl = null;
    if (samplePhoto) {
      thumbDataUrl = await cropFaceThumb(samplePhoto.dispBlob, sample.box);
    }

    await db.put('faceClusters', {
      id,
      groupId,
      centroid: cluster.centroid,
      memberPhotoIds: [...new Set(cluster.members.map((m) => m.photoId))],
      memberCount: cluster.members.length,
      thumbDataUrl,
    });

    if (groupId) await applyClusterGroup(id);
  }
}

async function cropFaceThumb(blob, box) {
  try {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    URL.revokeObjectURL(url);
    const pad = box.w * 0.3;
    const sx = Math.max(0, box.x - pad);
    const sy = Math.max(0, box.y - pad);
    const sw = Math.min(img.naturalWidth - sx, box.w + pad * 2);
    const sh = Math.min(img.naturalHeight - sy, box.h + pad * 2);
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 96, 96);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (e) {
    return null;
  }
}

async function applyClusterGroup(clusterId) {
  const cluster = await db.get('faceClusters', clusterId);
  if (!cluster || !cluster.groupId) return;
  for (const photoId of cluster.memberPhotoIds) {
    const tag = await getTag(photoId);
    if (!tag.groups.includes(cluster.groupId)) {
      tag.groups.push(cluster.groupId);
      await saveTag(tag);
    }
  }
}

// ---------- screens ----------

function current() { return nav.stack[nav.stack.length - 1]; }

async function render() {
  clearTrackedUrls();
  const { screen, params } = current();
  $back.classList.toggle('hidden', nav.stack.length <= 1);
  $bottombar.classList.add('hidden');
  $bottombar.innerHTML = '';
  $main.innerHTML = '';

  const renderers = {
    home: renderHome,
    quicktag: renderQuickTag,
    blur: renderBlur,
    dupes: renderDupes,
    trash: renderTrash,
    year: renderYear,
    groups: renderGroups,
    favorites: renderFavorites,
    faceNaming: renderFaceNaming,
    backup: renderBackup,
  };
  $title.textContent = ({
    home: '사진 정리',
    quicktag: '빠른 분류',
    blur: '흔들림 정리',
    dupes: '겹치는 사진 정리',
    trash: '휴지통',
    year: '연도별 보기',
    groups: '그룹별 보기',
    favorites: '즐겨찾기',
    faceNaming: '얼굴 그룹 이름짓기',
    backup: '백업 · 내보내기',
  })[screen] || '사진 정리';

  await (renderers[screen] || renderHome)(params);
}

async function renderHome() {
  const [totalPhotos, tags, photos] = await Promise.all([
    db.count('photos'), db.getAll('tags'), db.getAll('photos'),
  ]);
  const tagMap = {};
  tags.forEach((t) => (tagMap[t.photoId] = t));
  const untagged = tags.filter((t) => t.groups.length === 0 && !t.trash).length;
  const favCount = tags.filter((t) => t.favorite).length;
  const trashCount = tags.filter((t) => t.trash).length;
  const threshold = blurThreshold(photos);
  const blurCandidates = photos.filter((p) => {
    const t = tagMap[p.id];
    return p.sharpness <= threshold && !t?.trash && !t?.reviewed;
  }).length;
  const eligibleForDup = photos.filter((p) => { const t = tagMap[p.id]; return !t?.trash && !t?.reviewed; });
  const dupClusterCount = clusterDuplicates(eligibleForDup).length;
  const clusters = await db.getAll('faceClusters');
  const unnamed = clusters.filter((c) => !c.groupId).length;

  $main.innerHTML = `
    <div class="stat-grid">
      <div class="card"><div class="num">${totalPhotos}</div><div class="label">전체 사진</div></div>
      <div class="card"><div class="num">${untagged}</div><div class="label">미분류</div></div>
      <div class="card"><div class="num">${favCount}</div><div class="label">즐겨찾기 ⭐</div></div>
      <div class="card"><div class="num">${blurCandidates}</div><div class="label">흔들림 후보</div></div>
    </div>

    ${totalPhotos === 0 ? `
      <div class="card">
        <p style="margin-top:0">아직 가져온 사진이 없어요. 아이클라우드에서 내보낸 사진 폴더를 선택해서 시작하세요.</p>
        <button class="primary-btn" id="btnImportFolder">📁 폴더 통째로 가져오기</button>
        <button class="secondary-btn" id="btnImport" style="width:100%;margin-top:8px">📥 사진 여러 장 선택해서 가져오기</button>
        <p class="info-box" style="margin-top:10px">맥에서는 "폴더 통째로"로 한 번에, 폰에서는 사진 앱에서 여러 장을 골라 선택하면 돼요 — 한 장씩 보낼 필요 없어요.</p>
      </div>
    ` : `
      <div class="nav-grid">
        <button class="nav-btn" id="btnImportFolder"><span class="emoji">📁</span>폴더 통째로 가져오기</button>
        <button class="nav-btn" id="btnImport"><span class="emoji">📥</span>사진 여러 장 가져오기</button>
        <button class="nav-btn" data-go="quicktag"><span class="emoji">⚡</span>빠른 분류<span class="badge">${untagged}장 남음</span></button>
        <button class="nav-btn" data-go="blur"><span class="emoji">🌫️</span>흔들림 정리<span class="badge">${blurCandidates}장 후보</span></button>
        <button class="nav-btn" data-go="dupes"><span class="emoji">🧩</span>겹치는 사진 정리${dupClusterCount ? `<span class="badge">${dupClusterCount}묶음</span>` : ''}</button>
        <button class="nav-btn" data-go="trash"><span class="emoji">🗑️</span>휴지통${trashCount ? `<span class="badge">${trashCount}장</span>` : ''}</button>
        <button class="nav-btn" data-go="year"><span class="emoji">📅</span>연도별 보기</button>
        <button class="nav-btn" data-go="groups"><span class="emoji">🗂️</span>그룹별 보기</button>
        <button class="nav-btn" data-go="favorites"><span class="emoji">⭐</span>즐겨찾기</button>
        <button class="nav-btn" id="btnFaceGroup"><span class="emoji">🧠</span>자동 얼굴 그룹 찾기${unnamed ? `<span class="badge">이름 짓기 ${unnamed}개</span>` : ''}</button>
        <button class="nav-btn" data-go="backup"><span class="emoji">💾</span>백업 · 내보내기</button>
      </div>
    `}

    ${importState.running ? `
      <div class="card">
        <div>사진 가져오는 중… (${importState.done}/${importState.total})</div>
        <div class="progress-bar"><div style="width:${(importState.done / importState.total) * 100}%"></div></div>
      </div>
    ` : ''}
    ${faceJob.running ? `
      <div class="card">
        <div>${faceJob.stage} ${faceJob.total ? `(${faceJob.done}/${faceJob.total})` : ''}</div>
        <div class="progress-bar"><div style="width:${faceJob.total ? (faceJob.done / faceJob.total) * 100 : 20}%"></div></div>
      </div>
    ` : ''}

    <div class="info-box" style="margin-top:16px">
      🔒 모든 사진과 정리 데이터는 이 기기의 브라우저 안에만 저장돼요. 서버로 전송되지 않아요.<br>
      이 앱에서 "삭제"해도 원본 사진(폰 갤러리·아이클라우드)은 지워지지 않아요 — 여기서 확인 후 원본은 직접 지워주세요.
    </div>
  `;
  $main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => goTo(b.dataset.go)));
  const btnImport = document.getElementById('btnImport');
  if (btnImport) btnImport.addEventListener('click', () => $fileInput.click());
  const btnImportFolder = document.getElementById('btnImportFolder');
  if (btnImportFolder) btnImportFolder.addEventListener('click', () => $folderInput.click());
  const btnFace = document.getElementById('btnFaceGroup');
  if (btnFace) btnFace.addEventListener('click', () => { if (unnamed > 0) goTo('faceNaming'); else runFaceGrouping(); });
}

function blurThreshold(photos) {
  if (photos.length === 0) return -1;
  const sorted = [...photos].map((p) => p.sharpness).sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * 0.15) - 1); // bottom ~15% = candidates
  return sorted[idx] ?? sorted[0];
}

// Groups visually-identical/near-identical photos (re-exports, HEIC+JPEG
// pairs of the same shot, etc). Bucketing by the dHash prefix keeps this
// fast even for tens of thousands of photos — true duplicates share almost
// all of their hash bits, so they always land in the same bucket.
const DUP_DISTANCE_THRESHOLD = 8; // out of 64 bits
function clusterDuplicates(photos) {
  const buckets = {};
  photos.forEach((p) => {
    if (!p.dhash) return;
    const key = p.dhash.slice(0, 3);
    (buckets[key] = buckets[key] || []).push(p);
  });
  const clusters = [];
  Object.values(buckets).forEach((group) => {
    if (group.length < 2) return;
    const used = new Set();
    for (let i = 0; i < group.length; i++) {
      if (used.has(group[i].id)) continue;
      const cluster = [group[i]];
      used.add(group[i].id);
      for (let j = i + 1; j < group.length; j++) {
        if (used.has(group[j].id)) continue;
        if (hammingDistanceHex(group[i].dhash, group[j].dhash) <= DUP_DISTANCE_THRESHOLD) {
          cluster.push(group[j]);
          used.add(group[j].id);
        }
      }
      if (cluster.length >= 2) clusters.push(cluster);
    }
  });
  return clusters;
}

// ---- Quick tag (swipe classify) ----

let quickQueue = [];
let quickIdx = 0;
let quickHistory = [];

async function renderQuickTag() {
  const tags = await db.getAll('tags');
  const untaggedIds = new Set(tags.filter((t) => t.groups.length === 0 && !t.trash).map((t) => t.photoId));
  if (quickQueue.length === 0 || quickIdx >= quickQueue.length) {
    const photos = await db.getAll('photos');
    quickQueue = photos.filter((p) => untaggedIds.has(p.id)).sort((a, b) => a.dateMs - b.dateMs);
    quickIdx = 0;
  }

  const groups = await getGroups();

  if (quickQueue.length === 0) {
    $main.innerHTML = `<div class="empty-state">🎉 분류할 사진이 없어요!<br>모두 정리되었습니다.</div>`;
    return;
  }
  const photo = quickQueue[quickIdx];
  const tag = await getTag(photo.id);
  const url = trackUrl(photo.dispBlob);

  $main.innerHTML = `
    <div style="color:var(--text-dim);font-size:13px;margin-bottom:8px">${quickIdx + 1} / ${quickQueue.length}</div>
    <div class="swipe-stage">
      <div class="swipe-card">
        <img src="${url}" alt="">
        <div class="info">${photo.year}.${String(photo.month).padStart(2, '0')} · ${fmtBytes(photo.fileSize)}</div>
        ${tag.favorite ? '<div class="fav-indicator">⭐</div>' : ''}
      </div>
    </div>
    <div class="tag-btn-row" id="tagBtns">
      ${groups.map((g) => `<button class="tag-btn" data-group="${g.id}"><span>${g.icon}</span><small>${g.name}</small></button>`).join('')}
    </div>
    <div class="control-row">
      <button class="secondary-btn" id="btnUndo">⌫ 실행취소</button>
      <button class="secondary-btn" id="btnFav">${tag.favorite ? '⭐ 즐겨찾기 해제' : '☆ 즐겨찾기'}</button>
      <button class="secondary-btn" id="btnTrash">🗑️ 삭제</button>
      <button class="secondary-btn" id="btnSkip">건너뛰기 ⏭</button>
    </div>
  `;

  $main.querySelectorAll('#tagBtns .tag-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const groupId = btn.dataset.group;
      const t = await getTag(photo.id);
      if (!t.groups.includes(groupId)) t.groups.push(groupId);
      await saveTag(t);
      quickHistory.push({ photoId: photo.id, prevGroups: tag.groups, prevTrash: tag.trash });
      quickIdx++;
      render();
    });
  });
  document.getElementById('btnFav').addEventListener('click', async () => {
    const t = await getTag(photo.id);
    t.favorite = !t.favorite;
    await saveTag(t);
    render();
  });
  document.getElementById('btnTrash').addEventListener('click', async () => {
    const t = await getTag(photo.id);
    t.trash = true;
    await saveTag(t);
    quickHistory.push({ photoId: photo.id, prevGroups: tag.groups, prevTrash: tag.trash });
    quickIdx++;
    render();
  });
  document.getElementById('btnSkip').addEventListener('click', () => {
    const [moved] = quickQueue.splice(quickIdx, 1);
    quickQueue.push(moved);
    render();
  });
  document.getElementById('btnUndo').addEventListener('click', async () => {
    const last = quickHistory.pop();
    if (!last) { toast('취소할 작업이 없어요'); return; }
    const t = await getTag(last.photoId);
    t.groups = last.prevGroups;
    t.trash = last.prevTrash;
    await saveTag(t);
    quickIdx = Math.max(0, quickIdx - 1);
    render();
  });
}

// ---- Blur cleanup ----

let blurSelection = new Set();

async function renderBlur() {
  const [photos, tags] = await Promise.all([db.getAll('photos'), db.getAll('tags')]);
  const tagMap = {};
  tags.forEach((t) => (tagMap[t.photoId] = t));
  const threshold = blurThreshold(photos);
  const candidates = photos
    .filter((p) => { const t = tagMap[p.id]; return p.sharpness <= threshold && !t?.trash && !t?.reviewed; })
    .sort((a, b) => a.sharpness - b.sharpness);

  if (candidates.length === 0) {
    $main.innerHTML = `<div class="empty-state">✅ 흔들림 후보가 없어요.</div>`;
    return;
  }

  $main.innerHTML = `
    <div class="info-box" style="margin-bottom:12px">선명도가 낮은 사진 후보예요. 지울 사진을 눌러서 표시한 뒤, 아래에서 한번에 휴지통으로 보내세요. 최종 삭제는 휴지통에서 한 번 더 확인해요.</div>
    <div class="grid" id="blurGrid"></div>
  `;
  const grid = document.getElementById('blurGrid');
  candidates.forEach((p) => {
    const url = trackUrl(p.thumbBlob);
    const div = document.createElement('div');
    div.className = 'thumb blur-grid-item';
    div.innerHTML = `<img src="${url}"><div class="score">선명도 ${p.sharpness}</div>${blurSelection.has(p.id) ? '<div class="sel-mark">🗑️</div>' : ''}`;
    div.addEventListener('click', () => {
      if (blurSelection.has(p.id)) blurSelection.delete(p.id); else blurSelection.add(p.id);
      render();
    });
    grid.appendChild(div);
  });

  $bottombar.classList.remove('hidden');
  $bottombar.innerHTML = `
    <div class="row">
      <button class="secondary-btn" id="btnKeepAll" style="flex:1">전부 보관</button>
      <button class="primary-btn" id="btnDeleteSel" style="flex:2" ${blurSelection.size === 0 ? 'disabled' : ''}>선택 ${blurSelection.size}장 삭제</button>
    </div>
  `;
  document.getElementById('btnKeepAll').addEventListener('click', async () => {
    for (const p of candidates) {
      const t = await getTag(p.id);
      t.reviewed = true;
      await saveTag(t);
    }
    toast('모두 보관 처리했어요');
    render();
  });
  document.getElementById('btnDeleteSel').addEventListener('click', async () => {
    if (blurSelection.size === 0) return;
    if (!confirm(`${blurSelection.size}장을 휴지통으로 보낼까요? 휴지통에서 한 번 더 확인하고 완전히 지울 수 있어요.`)) return;
    for (const p of candidates) {
      const t = await getTag(p.id);
      if (blurSelection.has(p.id)) t.trash = true;
      else t.reviewed = true; // don't keep re-flagging the ones the user chose to keep
      await saveTag(t);
    }
    toast(`${blurSelection.size}장 휴지통으로 이동했어요`);
    blurSelection = new Set();
    render();
  });
}

// ---- Duplicate cleanup ----

let dupClusters = null;
let dupIdx = 0;
let dupSelection = new Set(); // photoIds marked for trash within the current cluster

async function renderDupes() {
  if (dupClusters === null) {
    const [photos, tags] = await Promise.all([db.getAll('photos'), db.getAll('tags')]);
    const tagMap = {};
    tags.forEach((t) => (tagMap[t.photoId] = t));
    const eligible = photos.filter((p) => { const t = tagMap[p.id]; return !t?.trash && !t?.reviewed; });
    dupClusters = clusterDuplicates(eligible);
    dupIdx = 0;
  }

  if (dupIdx >= dupClusters.length) {
    $main.innerHTML = `<div class="empty-state">🎉 겹치는 사진이 없어요!</div>`;
    dupClusters = null; // recompute fresh next visit (picks up newly-imported photos)
    return;
  }

  const cluster = [...dupClusters[dupIdx]].sort((a, b) => b.sharpness - a.sharpness);
  const keepId = cluster[0].id;
  if (dupSelection.size === 0) {
    // default: keep the sharpest, stage the rest for trash
    cluster.slice(1).forEach((p) => dupSelection.add(p.id));
  }

  $main.innerHTML = `
    <div style="color:var(--text-dim);font-size:13px;margin-bottom:8px">묶음 ${dupIdx + 1} / ${dupClusters.length} · ${cluster.length}장이 서로 비슷해요</div>
    <div class="info-box" style="margin-bottom:12px">가장 선명한 사진을 "보관"으로 추천했어요. 남길 사진을 눌러 바꿀 수 있어요. 나머지는 휴지통으로 이동해요.</div>
    <div class="grid" id="dupGrid"></div>
  `;
  const grid = document.getElementById('dupGrid');
  cluster.forEach((p) => {
    const url = trackUrl(p.thumbBlob);
    const marked = dupSelection.has(p.id);
    const div = document.createElement('div');
    div.className = 'thumb blur-grid-item';
    div.innerHTML = `
      <img src="${url}">
      <div class="score">${p.width}×${p.height}</div>
      ${!marked ? '<div class="fav-mark">✅ 보관</div>' : '<div class="sel-mark">🗑️</div>'}
    `;
    div.addEventListener('click', () => {
      if (dupSelection.has(p.id)) dupSelection.delete(p.id);
      else dupSelection.add(p.id);
      render();
    });
    grid.appendChild(div);
  });

  $bottombar.classList.remove('hidden');
  $bottombar.innerHTML = `
    <div class="row">
      <button class="secondary-btn" id="btnDupSkip" style="flex:1">건너뛰기</button>
      <button class="primary-btn" id="btnDupConfirm" style="flex:2">확정하고 다음 (${dupSelection.size}장 삭제)</button>
    </div>
  `;
  document.getElementById('btnDupSkip').addEventListener('click', () => {
    dupIdx++;
    dupSelection = new Set();
    render();
  });
  document.getElementById('btnDupConfirm').addEventListener('click', async () => {
    for (const p of cluster) {
      const t = await getTag(p.id);
      if (dupSelection.has(p.id)) t.trash = true;
      else t.reviewed = true;
      await saveTag(t);
    }
    dupIdx++;
    dupSelection = new Set();
    render();
  });
}

// ---- Trash ----

async function renderTrash() {
  const [photos, tags] = await Promise.all([db.getAll('photos'), db.getAll('tags')]);
  const tagMap = {};
  tags.forEach((t) => (tagMap[t.photoId] = t));
  const trashed = photos.filter((p) => tagMap[p.id]?.trash).sort((a, b) => b.dateMs - a.dateMs);

  if (trashed.length === 0) {
    $main.innerHTML = `<div class="empty-state">휴지통이 비어있어요.</div>`;
    return;
  }

  $main.innerHTML = `
    <div class="info-box" style="margin-bottom:12px">여기 있는 사진은 이 앱의 정리 목록에서만 빠진 상태예요, 아직 완전히 지워지지 않았어요. 사진을 눌러 복원하거나, 아래에서 완전히 삭제하세요. 원본 사진(폰·아이클라우드)은 이 작업과 상관없이 항상 안전해요.</div>
    <div class="grid" id="trashGrid"></div>
  `;
  const grid = document.getElementById('trashGrid');
  trashed.forEach((p) => {
    const url = trackUrl(p.thumbBlob);
    const div = document.createElement('div');
    div.className = 'thumb';
    div.innerHTML = `<img src="${url}"><div class="sel-mark" style="background:rgba(0,0,0,.5);font-size:13px">↩️ 복원</div>`;
    div.addEventListener('click', async () => {
      const t = await getTag(p.id);
      t.trash = false;
      await saveTag(t);
      toast('복원했어요');
      render();
    });
    grid.appendChild(div);
  });

  $bottombar.classList.remove('hidden');
  $bottombar.innerHTML = `
    <div class="row">
      <button class="primary-btn" id="btnEmptyTrash" style="width:100%;background:var(--danger)">🗑️ 휴지통 비우기 (${trashed.length}장 완전 삭제)</button>
    </div>
  `;
  document.getElementById('btnEmptyTrash').addEventListener('click', async () => {
    if (!confirm(`${trashed.length}장을 이 앱에서 완전히 삭제할까요? 되돌릴 수 없어요. (원본 사진과는 무관해요)`)) return;
    for (const p of trashed) {
      await db.delete('photos', p.id);
      await db.delete('tags', p.id);
    }
    toast(`${trashed.length}장 완전 삭제했어요`);
    render();
  });
}

// ---- Bulk selection (shared by year/group grid views) ----

async function bulkApplyGroup(selection, groupId) {
  for (const id of selection) {
    const t = await getTag(id);
    if (!t.groups.includes(groupId)) t.groups.push(groupId);
    await saveTag(t);
  }
}
async function bulkTrash(selection) {
  for (const id of selection) {
    const t = await getTag(id);
    t.trash = true;
    await saveTag(t);
  }
}
async function bulkFavorite(selection) {
  for (const id of selection) {
    const t = await getTag(id);
    t.favorite = true;
    await saveTag(t);
  }
}

async function renderBulkBar(selection, afterAction) {
  if (selection.size === 0) {
    $bottombar.classList.add('hidden');
    return;
  }
  const groups = await getGroups();
  $bottombar.classList.remove('hidden');
  $bottombar.innerHTML = `
    <div style="width:100%">
      <div style="color:var(--text-dim);font-size:12px;margin-bottom:6px;text-align:center">${selection.size}장 선택됨</div>
      <div class="tag-btn-row" id="bulkGroupBtns">
        ${groups.map((g) => `<button class="tag-btn" data-group="${g.id}"><span>${g.icon}</span><small>${g.name}</small></button>`).join('')}
      </div>
      <div class="control-row">
        <button class="secondary-btn" id="bulkFav">⭐ 즐겨찾기</button>
        <button class="secondary-btn" id="bulkTrash">🗑️ 휴지통</button>
        <button class="secondary-btn" id="bulkClear">선택 해제</button>
      </div>
    </div>
  `;
  $bottombar.querySelectorAll('#bulkGroupBtns .tag-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await bulkApplyGroup(selection, btn.dataset.group);
      toast(`${selection.size}장에 태그를 추가했어요`);
      selection.clear();
      afterAction();
    });
  });
  document.getElementById('bulkFav').addEventListener('click', async () => {
    await bulkFavorite(selection);
    toast(`${selection.size}장 즐겨찾기에 추가했어요`);
    selection.clear();
    afterAction();
  });
  document.getElementById('bulkTrash').addEventListener('click', async () => {
    const n = selection.size;
    if (!confirm(`${n}장을 휴지통으로 보낼까요?`)) return;
    await bulkTrash(selection);
    toast(`${n}장 휴지통으로 이동했어요`);
    selection.clear();
    afterAction();
  });
  document.getElementById('bulkClear').addEventListener('click', () => {
    selection.clear();
    afterAction();
  });
}

// ---- Year view ----

let yearSelectMode = false;
let yearSelection = new Set();

async function renderYear() {
  const [photos, tags] = await Promise.all([db.getAll('photos'), db.getAll('tags')]);
  const tagMap = {};
  tags.forEach((t) => (tagMap[t.photoId] = t));
  const visible = photos.filter((p) => !tagMap[p.id]?.trash);
  const byYear = {};
  visible.forEach((p) => { (byYear[p.year] = byYear[p.year] || []).push(p); });
  const years = Object.keys(byYear).sort((a, b) => b - a);

  if (years.length === 0) {
    $main.innerHTML = `<div class="empty-state">아직 사진이 없어요.</div>`;
    return;
  }

  $main.innerHTML = `
    <button class="secondary-btn" id="btnToggleSelect" style="margin-bottom:12px">${yearSelectMode ? '✓ 선택 모드 끄기' : '☐ 여러 장 선택해서 분류/삭제'}</button>
  ` + years.map((y) => `
    <details class="year-accordion" ${y === years[0] ? 'open' : ''}>
      <summary>${y}년 <span class="count">${byYear[y].length}장</span></summary>
      <div class="grid" data-year="${y}"></div>
    </details>
  `).join('');

  document.getElementById('btnToggleSelect').addEventListener('click', () => {
    yearSelectMode = !yearSelectMode;
    yearSelection.clear();
    render();
  });

  years.forEach((y) => {
    const grid = $main.querySelector(`.grid[data-year="${y}"]`);
    byYear[y].sort((a, b) => a.dateMs - b.dateMs).forEach((p) => {
      const url = trackUrl(p.thumbBlob);
      const selected = yearSelection.has(p.id);
      const div = document.createElement('div');
      div.className = 'thumb';
      div.innerHTML = `<img src="${url}">${selected ? '<div class="sel-mark">✓</div>' : ''}`;
      if (yearSelectMode) {
        div.addEventListener('click', () => {
          if (yearSelection.has(p.id)) yearSelection.delete(p.id); else yearSelection.add(p.id);
          render();
        });
      }
      grid.appendChild(div);
    });
  });

  if (yearSelectMode) await renderBulkBar(yearSelection, render);
}

// ---- Group view ----

let activeGroupTab = null;
let groupSelectMode = false;
let groupSelection = new Set();

async function renderGroups() {
  const groups = await getGroups();
  if (!activeGroupTab) activeGroupTab = groups[0]?.id;
  const [photos, tags] = await Promise.all([db.getAll('photos'), db.getAll('tags')]);
  const tagMap = {};
  tags.forEach((t) => (tagMap[t.photoId] = t));

  $main.innerHTML = `
    <div class="tabs" id="groupTabs">
      ${groups.map((g) => `<button data-id="${g.id}" class="${g.id === activeGroupTab ? 'active' : ''}">${g.icon} ${g.name}</button>`).join('')}
    </div>
    <button class="secondary-btn" id="btnToggleSelect" style="margin-bottom:12px">${groupSelectMode ? '✓ 선택 모드 끄기' : '☐ 여러 장 선택해서 분류/삭제'}</button>
    <div class="grid" id="groupGrid"></div>
  `;
  $main.querySelectorAll('#groupTabs button').forEach((b) => {
    b.addEventListener('click', () => { activeGroupTab = b.dataset.id; groupSelection.clear(); render(); });
  });
  document.getElementById('btnToggleSelect').addEventListener('click', () => {
    groupSelectMode = !groupSelectMode;
    groupSelection.clear();
    render();
  });

  const grid = document.getElementById('groupGrid');
  const list = photos
    .filter((p) => !tagMap[p.id]?.trash && (tagMap[p.id]?.groups || []).includes(activeGroupTab))
    .sort((a, b) => b.dateMs - a.dateMs);
  if (list.length === 0) {
    grid.outerHTML = `<div class="empty-state">이 그룹에는 아직 사진이 없어요.<br>‘빠른 분류’나 ‘자동 얼굴 그룹 찾기’로 채워보세요.</div>`;
    if (groupSelectMode) await renderBulkBar(groupSelection, render);
    return;
  }
  list.forEach((p) => {
    const url = trackUrl(p.thumbBlob);
    const selected = groupSelection.has(p.id);
    const div = document.createElement('div');
    div.className = 'thumb';
    div.innerHTML = `<img src="${url}">${tagMap[p.id]?.favorite ? '<div class="fav-mark">⭐</div>' : ''}${selected ? '<div class="sel-mark">✓</div>' : ''}`;
    if (groupSelectMode) {
      div.addEventListener('click', () => {
        if (groupSelection.has(p.id)) groupSelection.delete(p.id); else groupSelection.add(p.id);
        render();
      });
    }
    grid.appendChild(div);
  });

  if (groupSelectMode) await renderBulkBar(groupSelection, render);
}

// ---- Favorites ----

async function renderFavorites() {
  const [photos, tags] = await Promise.all([db.getAll('photos'), db.getAll('tags')]);
  const favIds = new Set(tags.filter((t) => t.favorite && !t.trash).map((t) => t.photoId));
  const list = photos.filter((p) => favIds.has(p.id)).sort((a, b) => b.dateMs - a.dateMs);
  if (list.length === 0) {
    $main.innerHTML = `<div class="empty-state">아직 즐겨찾기한 사진이 없어요.<br>‘빠른 분류’ 화면에서 ⭐ 눌러 골라보세요.</div>`;
    return;
  }
  const byYear = {};
  list.forEach((p) => (byYear[p.year] = byYear[p.year] || []).push(p));
  const years = Object.keys(byYear).sort((a, b) => b - a);
  $main.innerHTML = years.map((y) => `
    <div class="section-title">${y}년 (${byYear[y].length}장)</div>
    <div class="grid" data-year="${y}"></div>
  `).join('');
  years.forEach((y) => {
    const grid = $main.querySelector(`.grid[data-year="${y}"]`);
    byYear[y].forEach((p) => {
      const url = trackUrl(p.thumbBlob);
      const div = document.createElement('div');
      div.className = 'thumb';
      div.innerHTML = `<img src="${url}"><div class="fav-mark">⭐</div>`;
      grid.appendChild(div);
    });
  });
}

// ---- Face naming ----

async function renderFaceNaming() {
  const clusters = (await db.getAll('faceClusters')).sort((a, b) => b.memberCount - a.memberCount);
  const groups = await getGroups();

  if (clusters.length === 0) {
    $main.innerHTML = `
      <div class="empty-state">아직 찾은 얼굴 그룹이 없어요.</div>
      <button class="primary-btn" id="btnRun">🧠 얼굴 찾기 시작</button>
    `;
    document.getElementById('btnRun').addEventListener('click', runFaceGrouping);
    return;
  }

  $main.innerHTML = `
    <div class="info-box" style="margin-bottom:12px">비슷한 얼굴끼리 자동으로 묶었어요. 그룹을 지정하면 해당 인물이 나온 사진이 전부 자동으로 태그돼요.</div>
    <div id="clusterList"></div>
    <button class="secondary-btn" id="btnRerun" style="width:100%;margin-top:10px">🔄 새 사진으로 다시 찾기</button>
  `;
  const listEl = document.getElementById('clusterList');
  clusters.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'cluster-card';
    div.innerHTML = `
      <img src="${c.thumbDataUrl || ''}" alt="">
      <div class="meta">${c.memberCount}장의 사진</div>
      <select data-cluster="${c.id}">
        <option value="">— 지정 안 함 —</option>
        ${groups.map((g) => `<option value="${g.id}" ${g.id === c.groupId ? 'selected' : ''}>${g.icon} ${g.name}</option>`).join('')}
      </select>
    `;
    listEl.appendChild(div);
    div.querySelector('select').addEventListener('change', async (e) => {
      const cluster = await db.get('faceClusters', c.id);
      cluster.groupId = e.target.value || null;
      await db.put('faceClusters', cluster);
      if (cluster.groupId) await applyClusterGroup(cluster.id);
      toast('적용했어요');
      render();
    });
  });
  document.getElementById('btnRerun').addEventListener('click', runFaceGrouping);
}

// ---- Backup / export (metadata only — tags, groups, face cluster names) ----

async function renderBackup() {
  const [photos, tags, groups, clusters] = await Promise.all([
    db.getAll('photos'), db.getAll('tags'), db.getAll('groups'), db.getAll('faceClusters'),
  ]);
  $main.innerHTML = `
    <div class="card">
      <p style="margin-top:0">사진 파일이 아니라 <b>정리 정보</b>(즐겨찾기, 그룹 태그, 얼굴 그룹 이름)만 작은 파일로 내보내요.
      다른 기기(맥/폰)에서 <b>같은 사진들을 먼저 가져온 뒤</b> 이 파일을 불러오면, 내용이 같은 사진끼리 자동으로 매칭돼서 정리 상태가 맞춰져요.</p>
      <button class="primary-btn" id="btnExport">📤 정리 정보 내보내기</button>
    </div>
    <div class="card">
      <p style="margin-top:0">다른 기기에서 내보낸 정리 정보 파일을 불러오세요.</p>
      <input type="file" id="importBackupFile" accept="application/json" class="hidden">
      <button class="secondary-btn" id="btnImportBackup" style="width:100%">📥 정리 정보 불러오기</button>
    </div>
    <div class="info-box">현재 사진 ${photos.length}장 · 그룹 ${groups.length}개 · 얼굴 그룹 ${clusters.length}개</div>
  `;
  document.getElementById('btnExport').addEventListener('click', async () => {
    const payload = {
      version: 1,
      exportedAt: Date.now(),
      groups,
      tags,
      faceClusters: clusters.map((c) => ({ id: c.id, groupId: c.groupId, centroid: c.centroid, memberPhotoIds: c.memberPhotoIds, memberCount: c.memberCount })),
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `photo-organizer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  const importInput = document.getElementById('importBackupFile');
  document.getElementById('btnImportBackup').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      for (const g of data.groups || []) await db.put('groups', g);
      let matched = 0;
      for (const t of data.tags || []) {
        const localPhoto = await db.get('photos', t.photoId);
        if (localPhoto) { await db.put('tags', t); matched++; }
      }
      for (const c of data.faceClusters || []) {
        const existing = await db.get('faceClusters', c.id);
        if (existing) { existing.groupId = c.groupId; await db.put('faceClusters', existing); }
      }
      toast(`불러오기 완료 · ${matched}장 매칭됨`);
      render();
    } catch (err) {
      toast('파일을 읽을 수 없어요');
    }
  });
}

function showInfo() {
  alert(
    '사진 정리 앱 안내\n\n' +
    '• 모든 데이터는 이 기기 브라우저 안에만 저장돼요 (서버 전송 없음)\n' +
    '• 여기서의 "삭제"는 이 앱의 정리 목록에서만 빠지는 거예요. 아이클라우드/폰 원본은 직접 지워야 해요\n' +
    '• 홈 화면에 추가하면 앱처럼 쓸 수 있어요 (공유 → 홈 화면에 추가)\n' +
    '• 얼굴 그룹 찾기는 처음에 모델(수 MB)을 한 번 내려받아요. 이후엔 오프라인에서도 동작해요'
  );
}

// ---------- boot ----------

async function boot() {
  await db.init();
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

if (document.getElementById('app').classList.contains('hidden')) {
  window.addEventListener('app-unlocked', boot, { once: true });
} else {
  boot();
}
