// "Variance of Laplacian" sharpness score, computed on a small grayscale
// canvas. Lower score = more likely blurry/shaky.
function computeSharpness(img) {
  const SIZE = 256;
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, SIZE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 3x3 Laplacian convolution
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap =
        4 * gray[idx] -
        gray[idx - 1] -
        gray[idx + 1] -
        gray[idx - w] -
        gray[idx + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return Math.round(variance);
}

// dHash (difference hash): a small perceptual fingerprint used to spot
// visually-identical/near-identical photos (re-exports, HEIC+JPEG pairs of
// the same shot, burst duplicates) even when their file bytes differ.
function computeDHash(img) {
  const w = 9, h = 8;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  let bits = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      bits += gray[y * w + x] > gray[y * w + x + 1] ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

const POPCOUNT4 = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
function hammingDistanceHex(a, b) {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    dist += POPCOUNT4[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  }
  return dist;
}
