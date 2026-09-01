// Face detection + simple clustering, powered by face-api.js (TensorFlow.js).
// The library and its model weights are vendored locally under vendor/ (not
// fetched from a third-party CDN), so this works offline once installed and
// never depends on an external host being reachable. Everything runs in the
// browser — no photo or face data is ever sent anywhere.
const FACEAPI_SRC = 'vendor/face-api.min.js';
const MODEL_URL = 'vendor/weights';
const CLUSTER_DISTANCE_THRESHOLD = 0.55;

let faceApiLoadPromise = null;

function loadFaceApi() {
  if (window.faceapi) return Promise.resolve();
  if (faceApiLoadPromise) return faceApiLoadPromise;
  faceApiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = FACEAPI_SRC;
    script.onload = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => reject(new Error('face-api.js 로드 실패'));
    document.head.appendChild(script);
  });
  return faceApiLoadPromise;
}

async function detectFaceDescriptors(img) {
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
  const results = await faceapi
    .detectAllFaces(img, options)
    .withFaceLandmarks()
    .withFaceDescriptors();
  return results.map((r) => ({
    descriptor: Array.from(r.descriptor),
    box: { x: r.detection.box.x, y: r.detection.box.y, w: r.detection.box.width, h: r.detection.box.height },
  }));
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// Single-link agglomerative clustering over all face descriptors seen so far.
// faceEntries: [{ photoId, faceIndex, descriptor }]
function clusterFaces(faceEntries) {
  const clusters = []; // { members: [entry,...], centroid: [..] }

  for (const entry of faceEntries) {
    let best = null;
    let bestDist = Infinity;
    for (const cluster of clusters) {
      const dist = euclideanDistance(cluster.centroid, entry.descriptor);
      if (dist < bestDist) {
        bestDist = dist;
        best = cluster;
      }
    }
    if (best && bestDist < CLUSTER_DISTANCE_THRESHOLD) {
      best.members.push(entry);
      // update centroid as running mean
      const n = best.members.length;
      best.centroid = best.centroid.map((v, i) => v + (entry.descriptor[i] - v) / n);
    } else {
      clusters.push({ members: [entry], centroid: entry.descriptor.slice() });
    }
  }
  return clusters;
}
