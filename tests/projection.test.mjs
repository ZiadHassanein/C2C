import test from 'node:test';
import assert from 'node:assert/strict';
import { projectVerificationPacket } from '../scripts/projection.mjs';
function fixture() {
  const plan = 'An exact full plan with prerequisite, source, security and acceptance details.\n'.repeat(25);
  return { stage: 'verify', shared_context: { inputs: [{ content: 'Raw evidence must remain.' }] }, final_plan: plan,
    coordinator_proposal: { proposal_markdown: plan, summary: 'Original opinion', findings: [{ id: 'C-D1', claim: 'A rejected concern' }], assumptions: ['Unknown fact'], limitations: ['Missing inspection'] },
    peer_proposal: { proposal_markdown: plan, summary: 'Peer opinion', findings: [{ id: 'P-D1', claim: 'Supported dissent' }] },
    decisions: [{ finding_id: 'C-D1', disposition: 'rejected', rationale: 'Counterevidence' }], security_review: { findings: ['Security concern'] }, previous_verification: { findings: ['Unresolved issue'] },
    plan_map: { version: 1, nodes: [] }, supplementary_evidence: [{ status: 'unavailable', reason: 'Unknown' }] };
}
test('full context and non-verification stages are never projected', () => {
  const original = fixture();
  assert.deepEqual(projectVerificationPacket(original).packet, original);
  for (const stage of ['author-draft', 'draft', 'author-review', 'review']) {
    const value = { ...original, stage };
    assert.deepEqual(projectVerificationPacket(value, 'verify-compact', { status: 'recorded' }).packet, value);
  }
});
test('projection replaces exact full proposal duplicates only, preserving all evidence and disagreement', () => {
  const original = fixture(), before = structuredClone(original);
  const result = projectVerificationPacket(original, 'verify-compact', { status: 'recorded' });
  assert.ok(result.projection.saved_bytes > 0);
  assert.equal(result.projection.applied, 'exact-text-references');
  assert.deepEqual(original, before, 'Do not mutate authoritative reports');
  for (const key of ['coordinator_proposal', 'peer_proposal']) {
    const reconstructed = { ...result.packet[key], proposal_markdown: result.packet.final_plan };
    delete reconstructed.proposal_markdown_reference;
    assert.deepEqual(reconstructed, original[key]);
  }
  for (const key of Object.keys(original).filter(key => !['coordinator_proposal', 'peer_proposal'].includes(key))) assert.deepEqual(result.packet[key], original[key]);
});
test('missing or invalid maps, short text, similar text and partial matches retain full packets', () => {
  for (const quality of [null, { status: 'invalid' }, { status: 'not_recorded' }]) {
    const original = fixture();
    assert.deepEqual(projectVerificationPacket(original, 'verify-compact', quality).packet, original);
  }
  for (const text of ['short', fixture().final_plan + 'A material change', fixture().final_plan.trim()]) {
    const original = fixture(); original.final_plan = text;
    if (text === 'short') { original.coordinator_proposal.proposal_markdown = text; original.peer_proposal.proposal_markdown = text; }
    const result = projectVerificationPacket(original, 'verify-compact', { status: 'recorded' });
    assert.deepEqual(result.packet, original);
    assert.equal(result.projection.saved_bytes, 0);
  }
});
test('final-revision projection preserves the complete changed plan and all prior findings', () => {
  const original = fixture(); original.stage = 'verify-final';
  const result = projectVerificationPacket(original, 'verify-compact', { status: 'recorded' });
  assert.equal(result.packet.final_plan, original.final_plan);
  assert.deepEqual(result.packet.previous_verification, original.previous_verification);
  assert.throws(() => projectVerificationPacket(original, 'lossy'), /Unknown/);
});
