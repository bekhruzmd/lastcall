// Fair-share draw (CONTRACT §6). Same rule as resolve_lottery() in SQL;
// kept here for the mock backend and for tests.

export interface Entrant {
  id: string;
  winsLast7Days: number;
  priority: boolean;
}

export function weightOf(e: Entrant): number {
  return (1 / (1 + e.winsLast7Days)) * (e.priority ? 2 : 1);
}

/** Weighted random selection without replacement. Returns winner ids. */
export function drawWinners(
  entrants: Entrant[],
  portions: number,
  random: () => number = Math.random,
): string[] {
  const pool = entrants.map((e) => ({ id: e.id, w: weightOf(e) }));
  const winners: string[] = [];
  while (winners.length < portions && pool.length > 0) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r < 0) {
        idx = i;
        break;
      }
    }
    winners.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return winners;
}
