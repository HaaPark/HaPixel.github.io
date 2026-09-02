// Lightweight lock screen — keeps casual visitors from opening the app.
// Not real security (the password hash is visible in this file, and anyone
// with devtools can bypass it): its only job is to stop someone from
// stumbling onto the URL and poking around. The photos themselves are never
// at risk from this — they live only in IndexedDB on whichever device
// imported them, so a stranger unlocking this on their own browser still
// sees an empty app.
const LOCK_STORAGE_KEY = 'photo-organizer-unlocked';
const LOCK_PASSWORD_HASH = '67349afba5f41907196677b1b8f27f85cf5aed9725ee26f0aa6e501db6d699e9';

async function lockSha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function showApp() {
  document.getElementById('lockScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  window.dispatchEvent(new Event('app-unlocked'));
}

(function initLock() {
  if (localStorage.getItem(LOCK_STORAGE_KEY) === '1') {
    showApp();
    return;
  }
  const form = document.getElementById('lockForm');
  const input = document.getElementById('lockInput');
  const error = document.getElementById('lockError');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hash = await lockSha256Hex(input.value);
    if (hash === LOCK_PASSWORD_HASH) {
      localStorage.setItem(LOCK_STORAGE_KEY, '1');
      showApp();
    } else {
      error.classList.remove('hidden');
      input.value = '';
      input.focus();
    }
  });
})();
