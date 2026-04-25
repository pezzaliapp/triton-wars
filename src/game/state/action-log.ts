import type { UnitTypeId } from '../units/definitions';

export type LogEntry =
  | { kind: 'place'; player: 'human' | 'ai'; typeId: UnitTypeId }
  | { kind: 'shot'; shooter: 'human' | 'ai'; x: number; z: number; layer: number; result: 'miss' | 'hit' | 'sunk'; sunkType?: UnitTypeId }
  | { kind: 'mine-explode'; shooter: 'human' | 'ai'; impacts: Array<{ x: number; z: number; layer: number; result: 'miss' | 'hit' | 'sunk'; sunkType?: UnitTypeId }> }
  | { kind: 'turn'; player: 'human' | 'ai' }
  | { kind: 'game-over'; winner: 'human' | 'ai' };

export class ActionLog {
  private readonly entries: LogEntry[] = [];
  private readonly listeners = new Set<(e: LogEntry) => void>();

  push(entry: LogEntry): void {
    this.entries.push(entry);
    for (const l of this.listeners) l(entry);
  }

  all(): readonly LogEntry[] {
    return this.entries;
  }

  subscribe(listener: (e: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
