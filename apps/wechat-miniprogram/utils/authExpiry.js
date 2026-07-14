const listeners = new Set();
let pending = false;

function subscribeAuthExpired(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  if (pending) listener();
  return () => listeners.delete(listener);
}

function notifyAuthExpired() {
  if (pending) return;
  pending = true;
  listeners.forEach((listener) => listener());
}

function resolveAuthExpired() {
  pending = false;
}

module.exports = {
  subscribeAuthExpired,
  notifyAuthExpired,
  resolveAuthExpired
};
