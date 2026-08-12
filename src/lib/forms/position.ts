// Fractional-index helper shared by the server actions (real insert/reorder)
// and the editor's optimistic client-side preview — see AGENTS.md §5 on
// reordering as a single-row position write, never a renumbering pass.
const POSITION_GAP = 1;

export function midpointPosition(before: number | null, after: number | null): number {
  if (before == null && after == null) return POSITION_GAP;
  if (before == null) return after! - POSITION_GAP;
  if (after == null) return before + POSITION_GAP;
  return (before + after) / 2;
}
