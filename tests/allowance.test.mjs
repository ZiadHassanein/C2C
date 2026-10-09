import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAllowanceEvidence } from '../scripts/allowance.mjs';
const now = Date.parse('2026-10-10T10:00:00Z');
const evidence = { version: 1, provider: 'claude', auth_method: 'claude.ai', allowance: 'included-only', source: 'user-confirmed', reference: 'User confirmed extra usage disabled for the currently selected CLI account.', observed_at: '2026-10-10T09:00:00Z', valid_until: '2026-10-10T11:00:00Z' };
const context = { provider: 'claude', now, info: { authenticated: true, auth_route: 'subscription', auth_method: 'claude.ai', route_environment_overrides: [] } };
test('included-only evidence records its declaration boundary without billing probes', () => {
  assert.match(checkAllowanceEvidence(evidence, context).assurance, /not independent/);
  assert.equal(checkAllowanceEvidence({ ...evidence, provider: 'codex', auth_method: 'chatgpt' }, { ...context, provider: 'codex', info: { ...context.info, auth_method: 'chatgpt' } }).provider, 'codex');
});
test('stale, wrong-route, unsupported and absent evidence never authorizes included-only launch', () => {
  for (const change of [null, {}, { ...evidence, source: 'inferred' }, { ...evidence, provider: 'codex' }, { ...evidence, allowance: 'subscription' }, { ...evidence, observed_at: '2026-10-10T12:00:00Z' }, { ...evidence, valid_until: '2026-10-10T10:00:00Z' }, { ...evidence, valid_until: '2026-10-12T10:00:00Z' }, { ...evidence, reference: '' }, { ...evidence, paid: true }]) assert.throws(() => checkAllowanceEvidence(change, context));
  for (const info of [undefined, { ...context.info, auth_route: 'api' }, { ...context.info, authenticated: false }, { ...context.info, auth_method: 'chatgpt' }, { ...context.info, route_environment_overrides: ['ANTHROPIC_API_KEY'] }]) assert.throws(() => checkAllowanceEvidence(evidence, { ...context, info }));
});

test('ambiguous local dates and normalized impossible dates are not allowance evidence', () => {
  for (const date of ['10/10/2026', '2026-10-10T09:00:00', '2026-02-30T09:00:00Z', '2026-10-10T09:00:00+00:00']) {
    assert.throws(() => checkAllowanceEvidence({ ...evidence, observed_at: date }, context), /valid UTC ISO/);
  }
  assert.equal(checkAllowanceEvidence({ ...evidence, observed_at: '2026-10-10T09:00:00.123Z' }, context).source, 'user-confirmed');
});
