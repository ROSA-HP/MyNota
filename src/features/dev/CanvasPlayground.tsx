import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { MapCanvas } from '@/features/workspace/canvas/MapCanvas'
import { NodePanel } from '@/features/workspace/panels/NodePanel'
import { Toolbar } from '@/features/workspace/Toolbar'
import { useWorkspace } from '@/features/workspace/workspaceStore'
import { ThemeToggle } from '@/features/settings/ThemeToggle'
import { LanguageSelect } from '@/features/settings/LanguageSelect'
import { sampleMap } from './sampleMap'

/**
 * Development only (`/dev/canvas`, not in production builds): the real map canvas and details
 * panel with a sample map, no account or database. Edits are not saved anywhere.
 */
export function CanvasPlayground() {
  const selectedId = useWorkspace((s) => s.selectedId)
  const node = useWorkspace((s) => (s.selectedId ? s.nodes[s.selectedId] : undefined))

  useEffect(() => {
    const { map, nodes, relations } = sampleMap()
    useWorkspace.setState({
      mapId: map.id,
      status: 'ready',
      map,
      role: 'owner',
      nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
      relations: Object.fromEntries(relations.map((r) => [r.id, r])),
      sources: [],
    })
    return () => useWorkspace.getState().reset()
  }, [])

  return (
    <ReactFlowProvider>
      <div className="flex h-dvh flex-col bg-paper text-ink">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b-2 border-line bg-surface px-3">
          <strong>Canvas playground</strong>
          <span className="text-sm text-ink-muted">development only, nothing is saved</span>
          <span className="ms-auto flex items-center gap-2">
            <ThemeToggle />
            <LanguageSelect />
          </span>
        </header>
        <div className="relative flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1">
            <MapCanvas />
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center [&>*]:pointer-events-auto">
              <Toolbar />
            </div>
          </main>
          {selectedId && node && (
            <aside className="z-30 w-[360px] shrink-0 border-s-2 border-line bg-surface">
              <NodePanel
                key={node.id}
                node={node}
                onClose={() => useWorkspace.getState().select(null)}
              />
            </aside>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  )
}
