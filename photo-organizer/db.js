// IndexedDB wrapper for the photo organizer.
// Everything lives on-device only. Nothing here ever leaves the browser.
const DB_NAME = 'photo-organizer';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tags')) {
        db.createObjectStore('tags', { keyPath: 'photoId' });
      }
      if (!db.objectStoreNames.contains('groups')) {
        db.createObjectStore('groups', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('faces')) {
        db.createObjectStore('faces', { keyPath: 'photoId' });
      }
      if (!db.objectStoreNames.contains('faceClusters')) {
        db.createObjectStore('faceClusters', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class PhotoDB {
  async init() {
    this.db = await openDB();
    await this.ensureDefaultGroups();
    return this;
  }

  tx(storeNames, mode = 'readonly') {
    return this.db.transaction(storeNames, mode);
  }

  put(storeName, value) {
    return new Promise((resolve, reject) => {
      const t = this.tx([storeName], 'readwrite');
      const req = t.objectStore(storeName).put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  get(storeName, key) {
    return new Promise((resolve, reject) => {
      const t = this.tx([storeName], 'readonly');
      const req = t.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const t = this.tx([storeName], 'readwrite');
      const req = t.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  getAll(storeName) {
    return new Promise((resolve, reject) => {
      const t = this.tx([storeName], 'readonly');
      const req = t.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  count(storeName) {
    return new Promise((resolve, reject) => {
      const t = this.tx([storeName], 'readonly');
      const req = t.objectStore(storeName).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async ensureDefaultGroups() {
    const existing = await this.getAll('groups');
    if (existing.length > 0) return;
    const defaults = [
      { id: 'boyfriend', name: '남자친구', icon: '💜', color: '#7c3aed', isAuto: true, order: 0 },
      { id: 'family', name: '가족', icon: '👪', color: '#059669', isAuto: true, order: 1 },
      { id: 'dog', name: '강아지', icon: '🐶', color: '#d97706', isAuto: false, order: 2 },
      { id: 'friends', name: '친구', icon: '👥', color: '#2563eb', isAuto: true, order: 3 },
      { id: 'etc', name: '기타', icon: '✨', color: '#64748b', isAuto: false, order: 4 },
    ];
    for (const g of defaults) await this.put('groups', g);
  }
}

const db = new PhotoDB();
