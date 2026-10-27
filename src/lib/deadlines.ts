export type ProgressState = "not-started" | "in-progress" | "submitted";

export type DeadlineStatus = {
  id: string;
  projectId: string;
  companyId: string;
  targetType: "vendor" | "scorer";
  targetName: string;
  dueAt: string;
  status: ProgressState;
  submittedAt?: string;
  lastReminderAt?: string;
};

export function calculateProgressState(
  started: boolean,
  submitted: boolean,
): ProgressState {
  if (submitted) return "submitted";
  if (started) return "in-progress";
  return "not-started";
}

export function buildDeadlineStatus(
  projectId: string,
  companyId: string,
  targetType: "vendor" | "scorer",
  targetName: string,
  dueAt: string,
  started = false,
  submitted = false,
): DeadlineStatus {
  return {
    id: `${projectId}-${targetType}-${targetName.toLowerCase().replace(/\s+/g, "-")}`,
    projectId,
    companyId,
    targetType,
    targetName,
    dueAt,
    status: calculateProgressState(started, submitted),
    submittedAt: submitted ? new Date().toISOString() : undefined,
  };
}

export function getReminderMessage(status: DeadlineStatus, now = Date.now()): string {
  if (status.status === "submitted") {
    return `${status.targetName} has submitted their work.`;
  }

  if (new Date(status.dueAt).getTime() < now) {
    return `${status.targetName} is past due and needs attention.`;
  }

  return `${status.targetName} still needs action before the deadline.`;
}
