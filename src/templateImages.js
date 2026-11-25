// Images (and other files) inside a template are data URLs, often megabytes
// each, and the same one can be used in several places.

const REF_PREFIX = "@shared:";

// The same JSON value with `fn` applied to every string in it.
function mapStrings(value, fn) {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}

/**
 * Saves each repeated file of an exported template once, in `shared_files`,
 * leaving a reference where it's used. Undone by unpackSharedFiles.
 */
export function packSharedFiles(template) {
  const uses = new Map();
  mapStrings(template, (s) => {
    if (s.startsWith("data:")) uses.set(s, (uses.get(s) || 0) + 1);
    return s;
  });
  const ids = new Map();
  for (const [src, n] of uses) if (n > 1) ids.set(src, `file${ids.size + 1}`);
  if (ids.size === 0) return template;
  const packed = mapStrings(template, (s) => (ids.has(s) ? REF_PREFIX + ids.get(s) : s));
  return { ...packed, shared_files: Object.fromEntries([...ids].map(([src, id]) => [id, src])) };
}

export function unpackSharedFiles(data) {
  const { shared_files: files, ...template } = data;
  if (!files) return data;
  return mapStrings(template, (s) => (s.startsWith(REF_PREFIX) ? (files[s.slice(REF_PREFIX.length)] ?? s) : s));
}

/**
 * Background images already in the document, to use them again:
 * [{ src, label }], each once, labelled by the first place it's used in.
 */
export function loadedBackgrounds(state) {
  const images = new Map();
  const add = (src, label) => {
    if (src && !images.has(src)) images.set(src, label);
  };
  for (const [key, name] of [["front", "Front"], ["back", "Back"]]) {
    const side = state[key];
    add(side.background, `${name} background`);
    for (const m of side.backgroundMap?.mappings || []) add(m.preview, `${name}: ${m.value}`);
    add(side.backgroundMap?.fallbackPreview, `${name}: fallback`);
  }
  for (const g of state.extraGroups) {
    add(g.front, `${g.title}: front`);
    add(g.back, `${g.title}: back`);
  }
  return [...images].map(([src, label]) => ({ src, label }));
}
