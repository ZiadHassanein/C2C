// Validate factual planning inputs; this does not establish the truth of their claims.
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const text = { type: 'string', minLength: 1, maxLength: 80000 };
const list = { type: 'array', maxItems: 150, items: text };
const choice = values => ({ ...text, enum: values });
export const ASSESSMENT_SCHEMA = object({
  assessed_at: text,
  summary: text,
  project_type: choice(['software', 'content', 'mixed', 'non_software']),
  deployment: object({ status: choice(['production', 'non_production', 'unknown', 'not_applicable']), evidence: list }),
  readiness: object({ status: choice(['not_assessed', 'gaps_found', 'checks_passed_for_scope', 'not_applicable']), scope: text, gaps: list, evidence: list }),
  evidence: { type: 'array', maxItems: 150, items: object({ id: text, source: text, observation: text, kind: choice(['observed', 'user_reported', 'inferred']) }) },
  direction: object({
    route: choice(['new_build', 'extend_existing', 'harden_existing', 'discovery', 'non_software']),
    clarity: choice(['ready', 'discovery_needed', 'needs_user_input']),
    goal: text, scope: { ...list, minItems: 1 }, success_criteria: { ...list, minItems: 1 }, constraints: list, next_step: text,
  }),
  unknowns: list,
});
const requireThat = (condition, message) => { if (!condition) throw new Error(`Project assessment: ${message}`); };
function validateShape(value, schema, label) {
  if (schema.type === 'object') {
    requireThat(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
    for (const key of schema.required) requireThat(Object.hasOwn(value, key), `${label}.${key} is required`);
    for (const key of Object.keys(value)) {
      requireThat(Object.hasOwn(schema.properties, key), `${label}.${key} is not supported`);
      validateShape(value[key], schema.properties[key], `${label}.${key}`);
    }
  } else if (schema.type === 'array') {
    requireThat(Array.isArray(value) && value.length >= (schema.minItems || 0) && value.length <= schema.maxItems, `${label} must contain ${schema.minItems || 0}–${schema.maxItems} items`);
    value.forEach((item, i) => validateShape(item, schema.items, `${label}[${i}]`));
  } else {
    requireThat(typeof value === 'string' && value.trim().length > 0 && value.length <= schema.maxLength, `${label} must be a nonempty bounded string`);
    if (schema.enum) requireThat(schema.enum.includes(value), `${label} has an invalid value`);
  }
}
export function validateAssessment(value) {
  validateShape(value, ASSESSMENT_SCHEMA, 'assessment');
  const date = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value.assessed_at);
  requireThat(date, 'assessed_at must be an ISO date/time with timezone');
  const [year, month, day, hour, minute, second, zoneHour, zoneMinute] = date.slice(1).map(part => Number(part ?? 0));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireThat(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && hour <= 23 && minute <= 59 && second <= 59 && zoneHour <= 23 && zoneMinute <= 59 && Number.isFinite(Date.parse(value.assessed_at)), 'assessed_at must be a valid calendar date/time with timezone');
  const evidence = new Map();
  for (const item of value.evidence) {
    requireThat(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(item.id) && !evidence.has(item.id), `invalid or duplicate evidence ID: ${item.id}`);
    evidence.set(item.id, item);
  }
  for (const group of [value.deployment, value.readiness]) {
    requireThat(new Set(group.evidence).size === group.evidence.length, 'evidence references must be unique');
    for (const id of group.evidence) requireThat(evidence.has(id), `unknown evidence reference: ${id}`);
  }
  const supports = (ids, kinds) => ids.some(id => kinds.includes(evidence.get(id).kind));
  if (['production', 'non_production'].includes(value.deployment.status)) {
    requireThat(supports(value.deployment.evidence, ['observed', 'user_reported']), 'known deployment status needs observed or user_reported evidence; inference alone is insufficient');
  }
  if (value.deployment.status === 'unknown') requireThat(value.unknowns.length, 'unknown deployment must identify missing evidence in unknowns');
  if (value.readiness.status === 'checks_passed_for_scope') {
    requireThat(supports(value.readiness.evidence, ['observed']), 'passed readiness checks require observed evidence');
    requireThat(value.readiness.gaps.length === 0, 'passed readiness scope cannot also have unresolved gaps');
  }
  if (value.readiness.status === 'gaps_found') requireThat(value.readiness.gaps.length, 'gaps_found must describe the gaps');
  if (value.project_type === 'content') {
    requireThat(value.deployment.status === 'not_applicable' && value.direction.route === 'non_software', 'content work must use not_applicable deployment and the non_software route; record publication status in evidence');
  } else if (value.project_type === 'non_software') {
    requireThat(value.deployment.status === 'not_applicable' && value.readiness.status === 'not_applicable' && value.direction.route === 'non_software', 'non-software work must use not_applicable deployment/readiness and the non_software route');
  } else {
    requireThat(value.direction.route !== 'non_software', 'software or mixed work cannot use the non_software route');
    requireThat(value.deployment.status !== 'not_applicable' && value.readiness.status !== 'not_applicable', 'software or mixed deployment/readiness must be assessed or explicitly unknown/not_assessed');
  }
  if (value.direction.clarity !== 'ready') requireThat(value.unknowns.length, 'unclear direction must identify missing information in unknowns');
  return value;
}
const escape = value => value.replace(/([\\`*_{}\[\]()<>#!|])/g, '\\$1');
const bullets = values => values.length ? values.map(value => `- ${escape(value)}`) : ['- None recorded.'];
export function assessmentMarkdown(assessment) {
  const a = validateAssessment(assessment);
  return [
    '# Project context and planning direction', '', `Assessed: ${escape(a.assessed_at)}.`, '', escape(a.summary), '',
    `Project type: **${a.project_type}**. Deployment: **${a.deployment.status}**. Readiness: **${a.readiness.status}**.`,
    `Readiness scope: ${escape(a.readiness.scope)}`, '',
    a.project_type === 'content'
      ? 'Software deployment is not applicable to this content task; publication status belongs in the evidence. Readiness covers only the stated editorial checks, not publication, approval or factual certification.'
      : 'Deployment describes where the project is used. Readiness describes the stated evidence scope; neither a production label nor plan completion certifies the project.', '',
    '## Direction', '', `Route: **${a.direction.route}**. Clarity: **${a.direction.clarity}**.`, '',
    `Goal: ${escape(a.direction.goal)}`, '', '### Scope', '', ...bullets(a.direction.scope), '',
    '### Success criteria', '', ...bullets(a.direction.success_criteria), '',
    '### Constraints', '', ...bullets(a.direction.constraints), '',
    `Next step: ${escape(a.direction.next_step)}`, '', '## Readiness gaps', '', ...bullets(a.readiness.gaps), '',
    '## Unknowns', '', ...bullets(a.unknowns), '', '## Evidence', '',
    ...a.evidence.map(item => `- **${escape(item.id)} (${item.kind})** — ${escape(item.source)}: ${escape(item.observation)}`),
    a.evidence.length ? '' : 'No evidence supplied; see the stated assessment limits.', '',
    `Deployment evidence: ${a.deployment.evidence.join(', ') || 'none'}. Readiness evidence: ${a.readiness.evidence.join(', ') || 'none'}.`, '',
    'This is a frozen pre-planning assessment supplied by the coordinator. The runner checks its structure, not the truth of the claims. See the final plan and decisions for later findings.', '',
  ].join('\n');
}
