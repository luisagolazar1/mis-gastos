export const storage = {
  async get(key) {
    if (window.storage && typeof window.storage.get === "function") {
      return window.storage.get(key);
    }
    const value = localStorage.getItem(key);
    return value ? { value } : null;
  },
  async set(key, value) {
    if (window.storage && typeof window.storage.set === "function") {
      return window.storage.set(key, value);
    }
    localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key) {
    if (window.storage && typeof window.storage.delete === "function") {
      return window.storage.delete(key);
    }
    localStorage.removeItem(key);
    return { key, deleted: true };
  }
};