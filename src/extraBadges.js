// Extra badges: groups of badges that aren't for anyone in the WCIF (e.g. 5
// for a sponsor). They use the template's design with their own backgrounds,
// texts and, if wanted, without some of its elements. Shared by the editor
// preview and the PDF.

export const MAX_EXTRA_COUNT = 500;

export function newExtraGroup(n) {
  return inflateExtraGroup({ title: `Group ${n}` });
}

export function inflateExtraGroup(g) {
  return {
    id: `extra_${Math.random().toString(36).slice(2, 10)}`,
    title: g.title || "",
    count: Math.min(MAX_EXTRA_COUNT, Math.max(0, Math.round(g.count ?? 5) || 0)),
    role: g.role || "",
    names: g.names || "",
    // null: the template's own background.
    front: g.front_background || null,
    back: g.back_background || null,
    hiddenFieldIds: g.hidden_fields || [],
  };
}

export function exportExtraGroup(g) {
  return {
    title: g.title,
    count: g.count,
    role: g.role,
    names: g.names,
    front_background: g.front,
    back_background: g.back,
    hidden_fields: g.hiddenFieldIds,
  };
}

// The name on the group's badge number i: a single name goes on all of them,
// several go one on each and the rest are left blank to write on.
export function extraBadgeName(group, i) {
  const names = group.names.split("\n").map((s) => s.trim());
  while (names.length && !names[names.length - 1]) names.pop();
  return (names.length === 1 ? names[0] : names[i]) || "";
}

// The data an extra badge fills the template with: no person, so anything
// about one is blank, and so are template fallbacks (see resolveTemplate).
export function extraBadgeData(group, i, sampleData, schedules, stages) {
  return {
    ...sampleData,
    name: extraBadgeName(group, i),
    role: group.role,
    wcaId: "",
    registrantId: "",
    countryIso2: "",
    gender: "",
    schedules,
    stages,
    blankFallbacks: true,
  };
}

// Whether a template text has nothing to say on an extra badge: all of its
// placeholders are empty, so only the text around them would be left (e.g.
// " - ID " from "{wcaId} - ID {registrantId}").
export function isBlankTemplate(template, data) {
  if (!data.blankFallbacks) return false;
  const keys = [...(template || "").matchAll(/\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]);
  return keys.length > 0 && keys.every((k) => k in data && (data[k] ?? "") === "");
}

// A side of the template as the group prints it.
export function extraBadgeSide(sideTpl, sideKey, group) {
  const hidden = new Set(group.hiddenFieldIds);
  const side = { ...sideTpl, fields: sideTpl.fields.filter((f) => !hidden.has(f.id)) };
  if (!group[sideKey]) return side;
  return {
    ...side,
    background: group[sideKey],
    tint: { ...sideTpl.tint, enabled: false },
    backgroundMap: { ...sideTpl.backgroundMap, enabled: false },
  };
}
