/** Honest labeling for validation navigator source. */

export function validationSourceLabel(liveBinding: {
  readonly validationFromCompile: boolean;
}): string {
  return liveBinding.validationFromCompile
    ? 'Live compile validation'
    : 'Demo fixture validation (not compile authority)';
}
