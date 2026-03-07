// SM-2 Spaced Repetition Algorithm
// Based on: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2

export interface SM2Result {
  interval: number;
  easeFactor: number;
  repetitions: number;
}

/**
 * Calculate the next review interval using the SM-2 algorithm.
 *
 * @param quality - Quality of the response (0-4)
 *   0 = complete blackout
 *   1 = incorrect, but remembered upon seeing answer
 *   2 = incorrect, but answer seemed easy to recall
 *   3 = correct with difficulty
 *   4 = perfect response
 * @param repetitions - Number of consecutive correct responses
 * @param easeFactor - Current ease factor (minimum 1.3)
 * @param interval - Current interval in days
 */
export function sm2(
  quality: number,
  repetitions: number,
  easeFactor: number,
  interval: number
): SM2Result {
  // Clamp quality to 0-4
  const q = Math.max(0, Math.min(4, Math.round(quality)));

  // Map our 0-4 scale to SM-2's 0-5 scale
  // 0->0, 1->1, 2->3, 3->4, 4->5
  const sm2Quality = [0, 1, 3, 4, 5][q]!;

  let newInterval: number;
  let newRepetitions: number;
  let newEaseFactor: number;

  if (sm2Quality < 3) {
    // Failed: reset repetitions, short interval
    newRepetitions = 0;
    newInterval = 1;
    newEaseFactor = easeFactor;
  } else {
    // Successful recall
    newRepetitions = repetitions + 1;

    if (newRepetitions === 1) {
      newInterval = 1;
    } else if (newRepetitions === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }

    // Update ease factor
    newEaseFactor =
      easeFactor + (0.1 - (5 - sm2Quality) * (0.08 + (5 - sm2Quality) * 0.02));
  }

  // Ease factor minimum is 1.3
  newEaseFactor = Math.max(1.3, newEaseFactor);

  // Cap interval at 365 days
  newInterval = Math.min(365, Math.max(1, newInterval));

  return {
    interval: newInterval,
    easeFactor: newEaseFactor,
    repetitions: newRepetitions,
  };
}

/**
 * Get the due date string given an interval from today.
 */
export function getDueDate(intervalDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + intervalDays);
  return date.toISOString().split("T")[0]!;
}

/**
 * Check if a note is due for review.
 */
export function isDue(dueDate: string): boolean {
  const today = new Date().toISOString().split("T")[0]!;
  return dueDate <= today;
}

/**
 * Create default review data for a new note.
 */
export function createDefaultReview(): {
  interval: number;
  easeFactor: number;
  repetitions: number;
  dueDate: string;
  lastReview: null;
} {
  return {
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    dueDate: new Date().toISOString().split("T")[0]!,
    lastReview: null,
  };
}
