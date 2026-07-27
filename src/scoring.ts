import { CommitLintResult, HealthScore, OnboardingItem, ReadmeDriftResult, SecretFinding, StaleTodo } from './types';

// Combines every module's output into one 0-100 score. Weights: commit
// quality 30%, README drift 25%, stale TODOs 15%, leaked secrets 15%,
// onboarding completeness 15%. Tune freely.
export function computeScore(
  commits: CommitLintResult[],
  readmeDrift: ReadmeDriftResult,
  staleTodos: StaleTodo[],
  secrets: SecretFinding[],
  onboarding: OnboardingItem[],
  previousOverall?: number
): HealthScore {
  const commitQualityPct = commits.length
    ? Math.round((commits.filter((c) => !c.isVague).length / commits.length) * 100)
    : 100;

  const docsDriftCount = readmeDrift.undocumented.length + readmeDrift.stale.length;
  const docsScore = Math.max(0, 100 - docsDriftCount * 5);

  const oldTodoCount = staleTodos.filter((t) => t.ageDays >= 180).length;
  const todosScore = Math.max(0, 100 - staleTodos.length * 2 - oldTodoCount * 5);

  const secretsScore = secrets.length === 0 ? 100 : Math.max(0, 100 - secrets.length * 25);

  const onboardingScore = onboarding.length
    ? Math.round((onboarding.filter((i) => i.present).length / onboarding.length) * 100)
    : 100;

  const overall = Math.round(
    commitQualityPct * 0.3 + docsScore * 0.25 + todosScore * 0.15 + secretsScore * 0.15 + onboardingScore * 0.15
  );

  const score: HealthScore = { overall, commitQualityPct, docsDriftCount };
  if (previousOverall !== undefined && previousOverall !== overall) {
    score.trend = { delta: overall - previousOverall, previous: previousOverall };
  }
  return score;
}
