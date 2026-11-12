export interface DiffLine {
  type: 'equal' | 'add' | 'remove';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
  unchanged: number;
  truncated: boolean;
}

const MAX_DP_CELLS = 4_000_000; // Bounds memory for huge pastes (e.g. 2000 x 2000 lines)

export function computeLineDiff(
  leftText: string,
  rightText: string,
  options: { ignoreWhitespace?: boolean } = {}
): DiffResult {
  const leftRaw = leftText === '' ? [] : leftText.replace(/\r\n/g, '\n').split('\n');
  const rightRaw = rightText === '' ? [] : rightText.replace(/\r\n/g, '\n').split('\n');

  const norm = (s: string) => (options.ignoreWhitespace ? s.trim().replace(/\s+/g, ' ') : s);

  const n = leftRaw.length;
  const m = rightRaw.length;

  // Trim identical prefix and suffix to shrink DP table significantly
  let prefix = 0;
  while (prefix < n && prefix < m && norm(leftRaw[prefix]) === norm(rightRaw[prefix])) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < n - prefix &&
    suffix < m - prefix &&
    norm(leftRaw[n - 1 - suffix]) === norm(rightRaw[m - 1 - suffix])
  ) {
    suffix++;
  }

  const midN = n - prefix - suffix;
  const midM = m - prefix - suffix;

  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  for (let i = 0; i < prefix; i++) {
    lines.push({ type: 'equal', text: rightRaw[i], oldLine: i + 1, newLine: i + 1 });
    unchanged++;
  }

  let truncated = false;
  if (midN * midM > MAX_DP_CELLS) {
    truncated = true;
    for (let i = 0; i < midN; i++) {
      lines.push({ type: 'remove', text: leftRaw[prefix + i], oldLine: prefix + i + 1 });
      removed++;
    }
    for (let j = 0; j < midM; j++) {
      lines.push({ type: 'add', text: rightRaw[prefix + j], newLine: prefix + j + 1 });
      added++;
    }
  } else if (midN === 0) {
    for (let j = 0; j < midM; j++) {
      lines.push({ type: 'add', text: rightRaw[prefix + j], newLine: prefix + j + 1 });
      added++;
    }
  } else if (midM === 0) {
    for (let i = 0; i < midN; i++) {
      lines.push({ type: 'remove', text: leftRaw[prefix + i], oldLine: prefix + i + 1 });
      removed++;
    }
  } else {
    // Classic LCS DP matrix over mid slice
    const cols = midM + 1;
    const dp = new Int32Array((midN + 1) * cols);

    for (let i = midN - 1; i >= 0; i--) {
      const leftNorm = norm(leftRaw[prefix + i]);
      const rowOffset = i * cols;
      const nextRowOffset = (i + 1) * cols;
      for (let j = midM - 1; j >= 0; j--) {
        if (leftNorm === norm(rightRaw[prefix + j])) {
          dp[rowOffset + j] = dp[nextRowOffset + j + 1] + 1;
        } else {
          const down = dp[nextRowOffset + j];
          const right = dp[rowOffset + j + 1];
          dp[rowOffset + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < midN && j < midM) {
      if (norm(leftRaw[prefix + i]) === norm(rightRaw[prefix + j])) {
        lines.push({
          type: 'equal',
          text: rightRaw[prefix + j],
          oldLine: prefix + i + 1,
          newLine: prefix + j + 1,
        });
        unchanged++;
        i++;
        j++;
      } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
        lines.push({
          type: 'remove',
          text: leftRaw[prefix + i],
          oldLine: prefix + i + 1,
        });
        removed++;
        i++;
      } else {
        lines.push({
          type: 'add',
          text: rightRaw[prefix + j],
          newLine: prefix + j + 1,
        });
        added++;
        j++;
      }
    }
    while (i < midN) {
      lines.push({ type: 'remove', text: leftRaw[prefix + i], oldLine: prefix + i + 1 });
      removed++;
      i++;
    }
    while (j < midM) {
      lines.push({ type: 'add', text: rightRaw[prefix + j], newLine: prefix + j + 1 });
      added++;
      j++;
    }
  }

  for (let k = 0; k < suffix; k++) {
    const oldIdx = n - suffix + k;
    const newIdx = m - suffix + k;
    lines.push({ type: 'equal', text: rightRaw[newIdx], oldLine: oldIdx + 1, newLine: newIdx + 1 });
    unchanged++;
  }

  return { lines, added, removed, unchanged, truncated };
}

