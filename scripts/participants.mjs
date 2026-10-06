// Participant routes are explicit declarations, not model identity attestation.
const required = (ok, message) => { if (!ok) throw new Error(message); };
const providers = ['codex', 'claude'];
const validName = value => typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,120}$/.test(value);
const effort = /(?:[-_:/.](?:none|minimal|low|medium|high|xhigh|max|ultra))$/i;

function exactModel(value, provider, role) {
  required(validName(value), `Same-provider pairing requires --${role}-model with an exact full model ID supplied by the host or user`);
  required(!/(?:^|[-_:/.])(?:default|latest|auto|opusplan)(?:$|[-_:/.])/i.test(value), 'Same-provider pairing does not accept moving model aliases');
  required(!effort.test(value), 'Reasoning effort is not a different model; provide exact model IDs without effort suffixes');
  const format = provider === 'claude'
    ? /^claude-[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value) && /\d/.test(value)
    : /^(?:gpt-\d|o\d)(?:[a-z0-9.-]*)$/i.test(value);
  required(format, `Same-provider ${provider} pairing requires full versioned model IDs, not family aliases or provider prefixes`);
  return value;
}

// Dated snapshots and their undated family name can resolve to the same model.
// Conservatively reject that pair instead of claiming diversity from spelling.
function identityFamily(value) {
  return value.toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-\d{8}$/, '');
}

export function validateParticipants(state) {
  const pairing = state.pairing ?? 'cross';
  required(['cross', 'same'].includes(pairing), 'Pairing must be cross or same');
  required(providers.includes(state.coordinator) && providers.includes(state.peer), 'Coordinator and peer must be codex or claude');
  required(state.peer === (pairing === 'same' ? state.coordinator : state.coordinator === 'codex' ? 'claude' : 'codex'), 'Participant providers do not match the pairing');
  for (const role of ['coordinator', 'peer']) {
    const value = state[`${role}_model`];
    required(value === null || value === undefined || validName(value), `Invalid ${role} model name`);
  }
  if (pairing === 'same') {
    exactModel(state.coordinator_model, state.coordinator, 'coordinator');
    exactModel(state.peer_model, state.peer, 'peer');
    required(identityFamily(state.coordinator_model) !== identityFamily(state.peer_model), 'Same-provider pairing requires two different model IDs; aliases, dated variants or reasoning effort do not establish different models');
  }
  return { pairing, coordinator: state.coordinator, peer: state.peer, coordinator_model: state.coordinator_model ?? null, peer_model: state.peer_model ?? null };
}

export function participantsFromOptions(options) {
  const coordinator = options.coordinator;
  required(providers.includes(coordinator), 'prepare requires --coordinator codex or --coordinator claude; specify the product running this chat');
  const pairing = options.pairing || 'cross';
  return validateParticipants({ pairing, coordinator, peer: pairing === 'same' ? coordinator : coordinator === 'codex' ? 'claude' : 'codex', coordinator_model: options['coordinator-model'] ?? null, peer_model: options['peer-model'] ?? null });
}

export function participantLabel(state, role) {
  required(['coordinator', 'peer'].includes(role), 'Unknown participant role');
  const provider = state[role] === 'claude' ? 'Claude Code' : 'Codex';
  const model = state[`${role}_model`];
  return `${provider}${model ? ` · ${model}` : ''} (${role})`;
}

export function participantSummary(state) {
  const route = validateParticipants(state);
  return { ...route, coordinator_identity: route.coordinator_model ? 'declared' : 'unknown', peer_identity: route.peer_model ? 'requested' : 'provider_default', identity_note: 'Coordinator identity is declared by the host or user. Peer identity is requested via --model; CLI-reported metadata is recorded separately and is not independent attestation.' };
}

export function validateReportedModels(state, models) {
  if (state.pairing !== 'same') return;
  for (const model of models) {
    required(identityFamily(model) !== identityFamily(state.coordinator_model), `Peer CLI reported the coordinator model ${model}; different-model review was not established`);
    const requested = state.peer_model.toLowerCase();
    const requestedFamily = identityFamily(requested);
    const matches = requestedFamily === requested
      ? identityFamily(model) === requestedFamily
      : model.toLowerCase() === requested;
    required(matches, `Peer CLI reported unexpected model ${model}; requested ${state.peer_model}. No fallback to another model family or explicitly pinned snapshot is accepted`);
  }
}
