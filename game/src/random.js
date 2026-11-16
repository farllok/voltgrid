// VOLTGRID — deterministic pseudo random numbers (mulberry32).
// The whole game draws from this generator, so a seed replays the same match.

/** Build a mulberry32 generator from a 32-bit unsigned seed. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable numeric seed from an arbitrary string (used for URL seeds). */
export function seedFromText(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A float in [min, max). */
export function range(rng, min, max) {
  return min + (max - min) * rng();
}

/** An integer in [min, max] (both ends included). */
export function int(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of a non-empty array. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}
