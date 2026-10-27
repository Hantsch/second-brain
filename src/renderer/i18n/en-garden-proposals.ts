/* English texts for the agent's proposals in maintenance. Same key set as
   `de-garden-proposals.ts` — a test checks that. */

export const enGardenProposals = {
  'garden.proposal.title': 'Proposals from the agent',
  'garden.proposal.kind.edit': 'Edit',
  'garden.proposal.kind.filing': 'Filing',
  'garden.proposal.filing': 'File {target} into {fileInto}',
  'garden.proposal.accept': 'Accept',
  'garden.proposal.reject': 'Reject',
  'garden.proposal.conflict': 'Changed since the agent read it. Nothing was written.',
  'garden.proposal.invalidBadge': 'Cannot be accepted',
  'garden.proposal.invalid.unreadable': 'The file could not be read as a proposal.',
  'garden.proposal.invalid.missing-field': 'The proposal is missing the field {detail}.',
  'garden.proposal.invalid.unknown-kind': 'The kind of this proposal is not known.',
  'garden.proposal.invalid.bad-hash': 'The base hash is not a SHA-256 value.',
  'garden.proposal.invalid.forbidden-target': 'Proposals cannot change {detail}.',
  'garden.proposal.invalid.outside-vault': '{detail} is outside the vault.',
  'garden.proposal.invalid.target-missing': 'The target {detail} does not exist.',
  'garden.proposal.invalid.filing-invalid': 'The filing is not valid: {detail}',
} as const;
