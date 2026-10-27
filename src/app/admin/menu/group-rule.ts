/** Describes a group's selection rule for staff, e.g. "required, choose 1" or "optional, up to 3". */
export function groupRule(minSelect: number, maxSelect: number): string {
  if (minSelect === 0) return `optional, up to ${maxSelect}`;
  if (minSelect === maxSelect) return `required, choose ${minSelect}`;
  return `required, choose ${minSelect} to ${maxSelect}`;
}
