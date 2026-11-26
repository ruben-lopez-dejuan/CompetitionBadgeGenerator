// Role mapping: turns a person's WCIF roles into the single "role" value
// templates use (text, colors, backgrounds…). Rules are checked top to
// bottom and the first match wins. A rule's wcaRole is one WCIF role
// ("delegate") or several joined with "+" ("delegate+organizer"), which
// matches people who have all of them — that's how someone with more than
// one role gets a value of their own. "team:<name>" matches the
// person's team instead of a role (see personTeamRole).
//
// mapping.overrides gives some people a role value of their own, before any
// rule: [{ registrantId, name, role }]. The name is only for showing it.

// Order used when listing roles and building combination names: the
// "most important" role first.
const ROLE_ORDER = ["delegate", "trainee-delegate", "organizer", "staff-dataentry", "staff-announcer", "staff-scrambler", "staff-runner", "staff-judge"];

function roleRank(role) {
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? ROLE_ORDER.length : i;
}

function sortRoles(roles) {
  return [...roles].sort((a, b) => roleRank(a) - roleRank(b) || a.localeCompare(b));
}

// "organizer + delegate" -> ["delegate", "organizer"]
export function ruleRoles(wcaRole) {
  return sortRoles(
    (wcaRole || "")
      .split("+")
      .map((r) => r.trim())
      .filter(Boolean)
  );
}

function ruleKey(wcaRole) {
  return ruleRoles(wcaRole).join("+");
}

const TEAM_PREFIX = "team:";

// The team a person is in, from CubingUSA's natshelper extension, written as
// a rule would ("team:Streaming"), or null. "+" joins roles in a rule, so
// it's taken out of the name.
function personTeamRole(person) {
  const ext = (person.extensions || []).find(
    (e) => typeof e.id === "string" && e.id.startsWith("org.cubingusa.natshelper.") && e.id.endsWith(".Person")
  );
  const team = ext?.data?.properties?.team;
  const name = typeof team === "string" ? team.replace(/\+/g, " ").replace(/\s+/g, " ").trim() : "";
  return name ? TEAM_PREFIX + name : null;
}

// Everything a rule can match: the person's roles, plus their team.
function matchableRoles(person) {
  const team = personTeamRole(person);
  return team ? [...(person.roles || []), team] : person.roles || [];
}

function isTeamRule(rule) {
  return ruleRoles(rule.wcaRole).some((r) => r.startsWith(TEAM_PREFIX));
}

// The role value given to this person by hand, or null.
export function overriddenRole(person, mapping) {
  const id = person.registrantId;
  if (id === undefined || id === null) return null;
  const o = (mapping.overrides || []).find((x) => String(x.registrantId) === String(id));
  return o ? o.role : null;
}

/**
 * Teams of the people no rule matches, to offer rules for them:
 * [{ wcaRole: "team:Streaming", name, count }], biggest first. Not added on
 * their own: it would change the role of badges already designed.
 */
export function teamsWithoutRule(mapping, persons) {
  const counts = {};
  for (const p of persons) {
    const team = personTeamRole(p);
    const roles = matchableRoles(p);
    if (team && overriddenRole(p, mapping) === null && !(mapping.rules || []).some((rule) => ruleMatches(rule, roles))) counts[team] = (counts[team] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([wcaRole, count]) => ({ wcaRole, name: wcaRole.slice(TEAM_PREFIX.length), count }));
}

export function ruleMatches(rule, personRoles) {
  const needed = ruleRoles(rule.wcaRole);
  return needed.length > 0 && needed.every((r) => personRoles.includes(r));
}

export function personRole(person, mapping) {
  const own = overriddenRole(person, mapping);
  if (own !== null) return own;
  const roles = matchableRoles(person);
  for (const rule of mapping.rules || []) {
    if (ruleMatches(rule, roles)) return rule.label || rule.wcaRole;
  }
  return mapping.fallback || "competitor";
}

/**
 * Adds a rule for every role and every combination of roles that `persons`
 * actually have and the mapping doesn't cover yet (label = the role(s)
 * themselves, to rename as needed). Rules are then ordered most specific
 * first — combinations above single roles — so a combination is never
 * shadowed by one of its parts; rules of the same size keep their order.
 * Team rules go after the ones for roles alone.
 */
export function addRolesFromPersons(mapping, persons) {
  const existing = new Set((mapping.rules || []).map((r) => ruleKey(r.wcaRole)).filter(Boolean));
  const found = new Set();
  for (const p of persons) {
    const roles = sortRoles(new Set(p.roles || []));
    roles.forEach((r) => found.add(r));
    if (roles.length > 1) found.add(roles.join("+"));
  }
  const added = [...found]
    .filter((key) => !existing.has(key))
    .sort((a, b) => ruleRoles(b).length - ruleRoles(a).length || roleRank(ruleRoles(a)[0]) - roleRank(ruleRoles(b)[0]) || a.localeCompare(b))
    .map((key) => ({ wcaRole: key, label: key }));
  if (added.length === 0) return mapping;

  const rules = [...(mapping.rules || []), ...added]
    .map((rule, i) => ({ rule, i, size: ruleRoles(rule.wcaRole).length }))
    // Blank rules (size 0) stay at the end; otherwise bigger combinations first.
    .sort((a, b) => (a.size === 0) - (b.size === 0) || isTeamRule(a.rule) - isTeamRule(b.rule) || b.size - a.size || a.i - b.i)
    .map(({ rule }) => rule);
  return { ...mapping, rules };
}

// How many of `persons` each rule catches (first match wins), plus how
// many fall through to the fallback. People with a role of their own
// (overrides) count in neither.
export function countByRule(mapping, persons) {
  const counts = (mapping.rules || []).map(() => 0);
  let fallback = 0;
  for (const p of persons) {
    if (overriddenRole(p, mapping) !== null) continue;
    const i = (mapping.rules || []).findIndex((rule) => ruleMatches(rule, matchableRoles(p)));
    if (i === -1) fallback++;
    else counts[i]++;
  }
  return { counts, fallback };
}
