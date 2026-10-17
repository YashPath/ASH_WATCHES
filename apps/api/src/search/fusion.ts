/** Reciprocal Rank Fusion: merges ranked id lists without needing comparable scores. */
export type RankedList = { ids: string[]; weight?: number };
export function reciprocalRankFusion(lists: RankedList[], k = 60): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    const weight = list.weight ?? 1;
    const seen = new Set<string>();
    list.ids.forEach((id, index) => {
      if (seen.has(id)) return;
      seen.add(id);
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + index + 1));
    });
  }
  return [...scores.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
