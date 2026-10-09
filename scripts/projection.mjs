// Experimental, exact-text deduplication only. Never replace the current plan,
// source excerpts, finding records, dissent, security or previous verification.
export function projectVerificationPacket(packet, profile = 'full', quality = null) {
  if (!['full', 'verify-compact'].includes(profile)) throw new Error('Unknown context profile');
  const baseBytes = Buffer.byteLength(JSON.stringify(packet));
  const result = (selected, reason, removed = []) => ({ packet: selected, projection: {
    requested: profile, applied: removed.length ? 'exact-text-references' : 'full', reason,
    removed_fields: removed, full_bytes: baseBytes, sent_bytes: Buffer.byteLength(JSON.stringify(selected)),
    saved_bytes: baseBytes - Buffer.byteLength(JSON.stringify(selected)),
    metric: 'Serialized packet bytes only; not provider tokens, quality or whole-task savings.',
  } });
  if (profile === 'full') return result(packet, 'Full context is the default.');
  if (!['verify', 'verify-final'].includes(packet.stage)) return result(packet, 'Independent drafting and critique remain unchanged.');
  if (quality?.status !== 'recorded') return result(packet, 'A valid recorded plan map is required; incomplete mapping uses full context.');
  if (typeof packet.final_plan !== 'string' || !packet.final_plan.trim()) return result(packet, 'The complete current plan is unavailable.');
  const candidate = structuredClone(packet), removed = [];
  for (const key of ['coordinator_proposal', 'peer_proposal']) {
    const value = candidate[key]?.proposal_markdown;
    // Equality is deliberately stronger than similarity, substring matching or
    // an asserted semantic mapping. All other report fields remain exact.
    if (typeof value === 'string' && value === packet.final_plan) {
      delete candidate[key].proposal_markdown;
      candidate[key].proposal_markdown_reference = 'final_plan';
      removed.push(`${key}.proposal_markdown`);
    }
  }
  if (!removed.length) return result(packet, 'No entire proposal is byte-identical to the current plan.');
  candidate.context_projection = {
    schema: 1, rule: 'An omitted proposal_markdown equals final_plan exactly; read final_plan as that original proposal. All other report fields are retained.',
    references: removed.map(field => ({ field, reference: 'final_plan' })),
  };
  if (Buffer.byteLength(JSON.stringify(candidate)) >= baseBytes) return result(packet, 'References would not make this packet smaller.');
  return result(candidate, 'Only byte-identical full proposal text was replaced with an explicit reference.', removed);
}
