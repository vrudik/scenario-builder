/**
 * Единая модель статуса выполнения для in-memory и Temporal (API / UI).
 */

import type {
  ScenarioWorkflowStatusSnapshot,
  TemporalWorkflowStatusName
} from './temporal-workflow-status';

/** Минимальный срез состояния оркестратора (избегаем циклического импорта с orchestrator). */
export interface WorkflowExecutionStateSlice {
  currentNodeId: string;
  completed: boolean;
  failed: boolean;
  temporalAsync?: boolean;
  temporalRunId?: string;
  temporalTaskQueue?: string;
}

export type ExecutionRuntimeKind = 'in_memory' | 'temporal';

/** Сводный жизненный цикл, сопоставимый для обоих рантаймов */
export type UnifiedLifecycleStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'unknown';

export interface UnifiedExecutionStatus {
  executionId: string;
  runtimeKind: ExecutionRuntimeKind;
  lifecycleStatus: UnifiedLifecycleStatus;
  currentNodeId?: string;
  /** Снимок Temporal describe(); только при runtimeKind === temporal */
  temporal?: ScenarioWorkflowStatusSnapshot | null;
  /** Фрагмент in-memory состояния (если есть в процессе оркестратора) */
  inMemory?: {
    completed: boolean;
    failed: boolean;
    temporalAsync?: boolean;
    temporalRunId?: string;
    temporalTaskQueue?: string;
  };
  /**
   * memory — состояние из процесса оркестратора;
   * database — из Prisma (+ опционально live describe при temporal).
   */
  source?: 'memory' | 'database';
}

/** Строка выборки из БД для холодного статуса */
export interface ExecutionDbStatusRow {
  executionId: string;
  status: string;
  currentNodeId: string | null;
  runtimeKind: string;
  temporalRunId: string | null;
  temporalTaskQueue: string | null;
  temporalStatusName: string | null;
  temporalHistoryLength: number | null;
  startedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
}

const TEMPORAL_NAMES: ReadonlySet<string> = new Set<TemporalWorkflowStatusName>([
  'UNSPECIFIED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TERMINATED',
  'CONTINUED_AS_NEW',
  'TIMED_OUT',
  'PAUSED',
  'UNKNOWN'
]);

function coerceTemporalStatusName(raw: string | null | undefined): TemporalWorkflowStatusName {
  if (raw && TEMPORAL_NAMES.has(raw)) {
    return raw as TemporalWorkflowStatusName;
  }
  return 'UNKNOWN';
}

/**
 * Снимок Temporal из кэшированных полей БД (без вызова describe).
 */
export function temporalSnapshotFromDbRow(row: ExecutionDbStatusRow): ScenarioWorkflowStatusSnapshot | null {
  if (row.runtimeKind !== 'temporal') {
    return null;
  }
  if (!row.temporalRunId && !row.temporalStatusName) {
    return null;
  }
  return {
    workflowId: row.executionId,
    runId: row.temporalRunId ?? '',
    statusName: coerceTemporalStatusName(row.temporalStatusName),
    taskQueue: row.temporalTaskQueue ?? 'scenario-execution',
    historyLength: row.temporalHistoryLength ?? 0,
    startTime: row.startedAt.toISOString(),
    closeTime: row.completedAt?.toISOString() ?? row.failedAt?.toISOString()
  };
}

function dbRowToStateSlice(row: ExecutionDbStatusRow): WorkflowExecutionStateSlice {
  const completed = row.status === 'completed';
  const failed = row.status === 'failed' || row.status === 'compensated';
  const temporalAsync =
    row.runtimeKind === 'temporal' &&
    row.status === 'running' &&
    (row.temporalStatusName === 'RUNNING' || row.temporalStatusName == null);
  return {
    currentNodeId: row.currentNodeId ?? 'unknown',
    completed,
    failed,
    temporalAsync,
    temporalRunId: row.temporalRunId ?? undefined,
    temporalTaskQueue: row.temporalTaskQueue ?? undefined
  };
}

/**
 * Единый статус по строке БД; при переданном live describe (Temporal) он имеет приоритет над снимком из БД.
 */
export function toUnifiedExecutionStatusFromDb(
  row: ExecutionDbStatusRow,
  liveTemporalDescribe: ScenarioWorkflowStatusSnapshot | null | undefined
): UnifiedExecutionStatus {
  const runtimeKind: ExecutionRuntimeKind =
    row.runtimeKind === 'temporal' ? 'temporal' : 'in_memory';
  const slice = dbRowToStateSlice(row);
  const fromDb = temporalSnapshotFromDbRow(row);
  const temporal =
    runtimeKind === 'temporal' ? (liveTemporalDescribe ?? fromDb) : undefined;
  const base = toUnifiedExecutionStatus(row.executionId, slice, temporal, runtimeKind);
  let lifecycleStatus = base.lifecycleStatus;
  if (row.status === 'pending') {
    lifecycleStatus = 'pending';
  }
  if (liveTemporalDescribe) {
    const fromLive = temporalNameToLifecycle(liveTemporalDescribe.statusName);
    if (fromLive === 'completed' || fromLive === 'failed' || fromLive === 'cancelled') {
      lifecycleStatus = fromLive;
    }
  }
  return {
    ...base,
    lifecycleStatus,
    currentNodeId: base.currentNodeId ?? row.currentNodeId ?? undefined,
    source: 'database'
  };
}

function temporalNameToLifecycle(name: string | undefined): UnifiedLifecycleStatus {
  switch (name) {
    case 'RUNNING':
      return 'running';
    case 'COMPLETED':
      return 'completed';
    case 'FAILED':
    case 'TERMINATED':
    case 'TIMED_OUT':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/**
 * Слияние in-memory `WorkflowExecutionState` и опционального `describe()` Temporal.
 * Приоритет: явные completed/failed в памяти → затем temporalAsync → затем статус Temporal.
 */
export function toUnifiedExecutionStatus(
  executionId: string,
  state: WorkflowExecutionStateSlice | undefined,
  temporalDescribe: ScenarioWorkflowStatusSnapshot | null | undefined,
  runtimeKind: ExecutionRuntimeKind
): UnifiedExecutionStatus {
  let lifecycleStatus: UnifiedLifecycleStatus = 'unknown';

  if (state?.completed) {
    lifecycleStatus = 'completed';
  } else if (state?.failed) {
    lifecycleStatus = 'failed';
  } else if (state?.temporalAsync) {
    lifecycleStatus = 'running';
  } else if (runtimeKind === 'temporal' && temporalDescribe) {
    lifecycleStatus = temporalNameToLifecycle(temporalDescribe.statusName);
  } else if (state && !state.completed && !state.failed) {
    lifecycleStatus = 'running';
  } else if (!state && runtimeKind === 'temporal' && !temporalDescribe) {
    lifecycleStatus = 'pending';
  }

  return {
    executionId,
    runtimeKind,
    lifecycleStatus,
    currentNodeId: state?.currentNodeId,
    temporal: runtimeKind === 'temporal' ? (temporalDescribe ?? null) : undefined,
    inMemory: state
      ? {
          completed: state.completed,
          failed: state.failed,
          temporalAsync: state.temporalAsync,
          temporalRunId: state.temporalRunId,
          temporalTaskQueue: state.temporalTaskQueue
        }
      : undefined
  };
}
