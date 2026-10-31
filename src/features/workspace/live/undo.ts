import * as Y from 'yjs'
import { LOCAL, type DocKey } from './mapDoc'

/** Changes made within this time count as one step (typing a word, dragging a block). */
export const UNDO_GROUP_MS = 600

/** One undo step: how many changes it made in each document. */
type Step = Map<DocKey, number>

/**
 * Undo and redo of this person's own changes (Phase 6.4).
 *
 * Each live document gets a Y.UndoManager that tracks only LOCAL changes, so changes from other
 * people (REMOTE), conversions (SEED) and clean-ups are never undone. If someone else changed a
 * field afterwards, undoing does not overwrite their value. One edit can touch several documents
 * (deleting a chapter changes the book and the chapter), so the steps are kept here and each
 * step undoes the matching changes in every document it touched.
 */
export class MapUndo {
  private managers = new Map<DocKey, Y.UndoManager>()
  private undoStack: Step[] = []
  private redoStack: Step[] = []
  private lastAt = 0
  /** True while this class itself undoes or redoes (the managers' own events are ignored). */
  private busy = false

  constructor(
    private onChange: (canUndo: boolean, canRedo: boolean) => void = () => undefined,
    private now: () => number = () => Date.now(),
  ) {}

  /** Starts tracking a document (call once per document, when it is opened). */
  track(key: DocKey, doc: Y.Doc): void {
    if (this.managers.has(key)) return
    // captureTimeout 0: every change is its own item; grouping happens across documents here.
    const um = new Y.UndoManager(doc, { trackedOrigins: new Set([LOCAL]), captureTimeout: 0 })
    um.on('stack-item-added', (e: { type: 'undo' | 'redo' }) => {
      if (this.busy || e.type !== 'undo') return
      this.recorded(key)
    })
    this.managers.set(key, um)
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** The next change starts a new step (after a pause, selecting another block, …). */
  stopCapturing(): void {
    this.lastAt = 0
  }

  undo(): boolean {
    return this.move(this.undoStack, this.redoStack, (um) => um.undo())
  }

  redo(): boolean {
    return this.move(this.redoStack, this.undoStack, (um) => um.redo())
  }

  clear(): void {
    for (const um of this.managers.values()) um.destroy()
    this.managers.clear()
    this.undoStack = []
    this.redoStack = []
    this.lastAt = 0
    this.notify()
  }

  // -------------------------------------------------------------------------

  private recorded(key: DocKey) {
    const at = this.now()
    let step = this.undoStack.at(-1)
    if (!step || at - this.lastAt > UNDO_GROUP_MS) {
      step = new Map()
      this.undoStack.push(step)
    }
    step.set(key, (step.get(key) ?? 0) + 1)
    this.lastAt = at
    // A new change of one's own: what was undone before cannot be redone any more.
    if (this.redoStack.length) {
      this.redoStack = []
      for (const [k, um] of this.managers) if (k !== key) um.clear(false, true)
    }
    this.notify()
  }

  private move(from: Step[], to: Step[], run: (um: Y.UndoManager) => unknown): boolean {
    const step = from.pop()
    if (!step) return false
    this.busy = true
    try {
      for (const [key, count] of step) {
        const um = this.managers.get(key)
        if (um) for (let i = 0; i < count; i++) run(um)
      }
    } finally {
      this.busy = false
    }
    to.push(step)
    this.lastAt = 0
    this.notify()
    return true
  }

  private notify() {
    this.onChange(this.canUndo, this.canRedo)
  }
}
