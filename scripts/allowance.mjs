// Validate a coordinator-supplied allowance declaration; never probe billing.
// This is evidence provenance, not independent account/setting attestation.
const required = (ok, message) => { if (!ok) throw new Error(message); };
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z');
export function checkAllowanceEvidence(value, { provider, info, now = Date.now() } = {}) {
  required(value && typeof value === 'object' && !Array.isArray(value), 'Included-only allowance evidence must be an object');
  const keys = ['version', 'provider', 'auth_method', 'allowance', 'source', 'reference', 'observed_at', 'valid_until'];
  required(Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), 'Unsupported allowance evidence fields');
  required(value.version === 1 && ['codex', 'claude'].includes(value.provider) && value.provider === provider, 'Allowance evidence is for a different provider');
  required(value.allowance === 'included-only' && ['user-confirmed', 'provider-reported'].includes(value.source), 'Allowance evidence must record an actual included-only confirmation');
  required(typeof value.reference === 'string' && value.reference.trim() && value.reference.length <= 500 && !/[\u0000-\u001f]/.test(value.reference), 'Allowance evidence requires a bounded source reference');
  const observed = Date.parse(value.observed_at), until = Date.parse(value.valid_until);
  required(validDate(value.observed_at) && validDate(value.valid_until) && Number.isFinite(now), 'Allowance evidence dates must be valid UTC ISO timestamps');
  required(observed <= now && until > now && until > observed && until - observed <= 86400000, 'Allowance evidence expired, is future-dated, or exceeds 24 hours; preserve the run and use eligible fallback');
  required(info?.authenticated === true && info.auth_route === 'subscription' && Array.isArray(info.route_environment_overrides) && info.route_environment_overrides.length === 0, 'Included-only workers require the confirmed subscription route without credential overrides');
  required(['chatgpt', 'claude.ai'].includes(value.auth_method) && value.auth_method === info.auth_method && value.auth_method === (provider === 'codex' ? 'chatgpt' : 'claude.ai'), 'Allowance evidence does not match the selected authentication method');
  return { ...value, assurance: 'coordinator-recorded; not independent billing attestation' };
}
