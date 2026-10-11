// Pure projection of finish's validated return value. No filesystem or model calls.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const hasItems = value => Array.isArray(value) && value.length > 0;

function assessmentReceipt(assessment) {
  if (!object(assessment)) return assessment ?? null;
  // The full assessment is already frozen and persisted. Keep all gaps/unknowns:
  // a formatter cannot safely decide which authored uncertainty is actionable.
  // Unknown future fields survive; only named background fields are omitted.
  const { summary, evidence, assessed_at, project_type, ...kept } = assessment;
  if (object(assessment.deployment)) {
    const { evidence: references, ...deployment } = assessment.deployment;
    kept.deployment = deployment;
  }
  if (object(assessment.readiness)) {
    const { evidence: references, ...readiness } = assessment.readiness;
    kept.readiness = readiness;
  }
  if (object(assessment.direction)) {
    const { route, goal, scope, success_criteria, constraints, ...direction } = assessment.direction;
    kept.direction = direction;
  }
  return kept;
}

/**
 * Inputs are the validated object returned by finish, including its supplied
 * artifact paths. This is a display projection, never another completion gate.
 * All non-assessment completion fields remain intact, including future fields.
 * Long material risks are deliberately not excerpted or capped.
 */
export function completionReceipt(finished) {
  if (!object(finished)) throw new Error('Completion receipt requires the finish result object');
  const receipt = structuredClone(finished);
  receipt.receipt_version = 1;
  for (const artifact of ['plan', 'discussion', 'result']) {
    if (receipt[artifact] === undefined) receipt[artifact] = null;
  }
  receipt.project_assessment = assessmentReceipt(receipt.project_assessment);

  const actions = [];
  const missing = ['plan', 'discussion', 'result'].filter(artifact => !nonempty(receipt[artifact]));
  if (missing.length) actions.push({ action: 'report_missing_artifact_paths', artifacts: missing,
    note: 'A missing path is not evidence that an artifact exists; do not invent a replacement.' });
  actions.push({ action: 'deliver_available_artifact_paths',
    artifacts: ['plan', 'discussion', 'result'].filter(artifact => nonempty(receipt[artifact])),
    note: 'Use the supplied paths and recorded limits; this receipt requires no additional artifact rereads.' });
  if (receipt.outcome === 'complete_with_unreviewed_revision' || receipt.delivered_plan_reviewed === false) {
    actions.push({ action: 'disclose_unreviewed_revision',
      note: 'Retain the recorded review boundary and reason. This receipt does not authorize another stage or change the completed run.' });
  }
  if (hasItems(receipt.unresolved)) actions.push({ action: 'retain_unresolved_gates',
    note: 'Deliver every recorded unresolved finding and rationale; completion does not adjudicate them.' });
  const security = receipt.security_review;
  const assurance = receipt.assurance;
  const quality = receipt.plan_quality;
  if (hasItems(receipt.questions_raised_during_review) || hasItems(receipt.source_changes)
    || hasItems(receipt.unavailable_sources) || hasItems(receipt.evidence_requests)
    || hasItems(security?.limitations) || hasItems(security?.open_questions)
    || security?.required === false || (security?.verdict && security.verdict !== 'ready')
    || hasItems(quality?.issues) || hasItems(quality?.warnings) || quality?.issues_truncated === true
    || hasItems(quality?.gated_steps) || quality?.status === 'invalid'
    || hasItems(assurance?.issues) || hasItems(assurance?.warnings) || assurance?.issues_truncated === true
    || assurance?.readiness === 'needs_changes' || assurance?.readiness === 'incomplete'
    || hasItems(receipt.warnings) || hasItems(receipt.errors)) {
    actions.push({ action: 'disclose_recorded_limits',
      note: 'Keep source, evidence, security, assurance and structural-check limits explicit; completion does not certify execution or readiness.' });
  }
  if (receipt.resource_usage?.counters?.total_tokens?.complete !== true) {
    actions.push({ action: 'disclose_incomplete_usage',
      note: 'Report the preserved observed subtotal and unknown coverage; do not substitute zero for missing counters or claim whole-task usage.' });
  }
  // Preserve an upstream next-actions field if a future finish version supplies
  // one; these receipt-only delivery actions must not replace its instructions.
  if (Object.hasOwn(receipt, 'next_actions')) receipt.receipt_delivery_actions = actions;
  else receipt.next_actions = actions;
  receipt.receipt_note = 'Display-only completion receipt. The full completion remains authoritative. Assessment fields describe frozen pre-planning readiness and direction, not a new execution instruction. No token, cost, model-identity or readiness claim is inferred.';
  return receipt;
}
