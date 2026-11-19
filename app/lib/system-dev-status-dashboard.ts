import type { SystemDevStatusItem } from "@/app/shared/system-dev-status-types";

export type DevStatusGroupRow = {
  label: string;
  count: number;
  sharePct: number;
  completed: number;
  completedPct: number;
  avgProgressPct: number | null;
};

export type DevStatusProgressBucketRow = {
  label: string;
  count: number;
  sharePct: number;
};

export type SystemDevStatusDashboardSummary = {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  avgProgressPct: number | null;
  bySystem: DevStatusGroupRow[];
  byWorkArea: DevStatusGroupRow[];
  byFeatureType: DevStatusGroupRow[];
  byProgress: DevStatusProgressBucketRow[];
};

export function progressRatio(progress: number | null | undefined): number | null {
  if (progress === null || progress === undefined || Number.isNaN(progress)) {
    return null;
  }
  if (progress <= 1) return Math.max(0, progress);
  return Math.max(0, Math.min(1, progress / 100));
}

export function isProgressComplete(progress: number | null | undefined): boolean {
  const r = progressRatio(progress);
  return r !== null && r >= 0.999;
}

function progressBucketLabel(progress: number | null | undefined): string {
  const r = progressRatio(progress);
  if (r === null) return "미입력";
  if (r >= 0.999) return "100% (완료)";
  if (r >= 0.5) return "50~99%";
  if (r > 0) return "1~49%";
  return "0%";
}

function groupField(
  items: SystemDevStatusItem[],
  pick: (item: SystemDevStatusItem) => string,
): DevStatusGroupRow[] {
  const total = items.length;
  const map = new Map<
    string,
    { count: number; completed: number; progressSum: number; progressN: number }
  >();

  for (const item of items) {
    const raw = pick(item).trim();
    const label = raw || "(미입력)";
    const cur = map.get(label) ?? {
      count: 0,
      completed: 0,
      progressSum: 0,
      progressN: 0,
    };
    cur.count += 1;
    if (isProgressComplete(item.progress)) cur.completed += 1;
    const r = progressRatio(item.progress);
    if (r !== null) {
      cur.progressSum += r;
      cur.progressN += 1;
    }
    map.set(label, cur);
  }

  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      count: v.count,
      sharePct: total > 0 ? (v.count / total) * 100 : 0,
      completed: v.completed,
      completedPct: v.count > 0 ? (v.completed / v.count) * 100 : 0,
      avgProgressPct:
        v.progressN > 0 ? (v.progressSum / v.progressN) * 100 : null,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));
}

function groupProgress(items: SystemDevStatusItem[]): DevStatusProgressBucketRow[] {
  const order = ["100% (완료)", "50~99%", "1~49%", "0%", "미입력"];
  const total = items.length;
  const map = new Map<string, number>();
  for (const label of order) map.set(label, 0);
  for (const item of items) {
    const label = progressBucketLabel(item.progress);
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return order.map((label) => {
    const count = map.get(label) ?? 0;
    return {
      label,
      count,
      sharePct: total > 0 ? (count / total) * 100 : 0,
    };
  });
}

export function buildSystemDevStatusDashboard(
  items: SystemDevStatusItem[],
): SystemDevStatusDashboardSummary {
  const total = items.length;
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  let progressSum = 0;
  let progressN = 0;

  for (const item of items) {
    const r = progressRatio(item.progress);
    if (isProgressComplete(item.progress)) completed += 1;
    else if (r !== null && r > 0) inProgress += 1;
    else notStarted += 1;
    if (r !== null) {
      progressSum += r;
      progressN += 1;
    }
  }

  return {
    total,
    completed,
    inProgress,
    notStarted,
    avgProgressPct: progressN > 0 ? (progressSum / progressN) * 100 : null,
    bySystem: groupField(items, (i) => i.systemName),
    byWorkArea: groupField(items, (i) => i.workArea),
    byFeatureType: groupField(items, (i) => i.featureType),
    byProgress: groupProgress(items),
  };
}
