import { Badge, Button } from "@boardly/ui";
import { LayoutGrid, Plus, Search, Settings } from "lucide-react";

// Placeholder board list — replaced by the real workspace-doc-backed rail in
// Unit 1.3. Static content here just establishes the shell layout.
const placeholderBoards = [
  { id: "product", name: "Product", count: 24 },
  { id: "engineering", name: "Engineering", count: 58 },
  { id: "design", name: "Design", count: 12 },
];

export default function HomePage() {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Board-list rail */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-line-subtle bg-surface">
        <div className="flex h-12 items-center gap-2 px-3">
          <div className="grid size-6 place-items-center rounded-[var(--radius-sm)] bg-primary text-primary-foreground">
            <LayoutGrid className="size-3.5" />
          </div>
          <span className="text-md font-semibold tracking-[-0.01em] text-fg">Boardly</span>
          <Badge variant="outline" className="ml-auto">
            beta
          </Badge>
        </div>

        <div className="px-2 pb-1">
          <Button variant="ghost" size="sm" className="w-full justify-start text-fg-muted">
            <Search className="size-4" />
            <span>Search</span>
            <kbd className="ml-auto font-mono text-xs text-fg-faint">⌘K</kbd>
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2">
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-faint">
              Boards
            </span>
            <button
              type="button"
              aria-label="New board"
              className="grid size-5 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <ul className="flex flex-col gap-0.5">
            {placeholderBoards.map((board) => (
              <li key={board.id}>
                <button
                  type="button"
                  className="flex h-7 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 text-base text-fg-muted transition-colors duration-[var(--dur-fast)] hover:bg-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <span className="size-1.5 rounded-full bg-[var(--text-tertiary)]" />
                  <span className="truncate">{board.name}</span>
                  <span className="ml-auto text-xs text-fg-faint">{board.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-line-subtle p-2">
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-overlay text-xs text-fg-muted">
              HD
            </span>
            <span className="truncate text-sm text-fg-muted">hung@moonbase.vn</span>
            <Settings className="ml-auto size-3.5 shrink-0 text-fg-faint" />
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line-subtle px-4">
          <h1 className="text-md font-semibold tracking-[-0.01em] text-fg">Welcome</h1>
          <div className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-line px-1.5 py-0.5 text-xs text-fg-faint">
            <span className="font-mono">⌘</span>
            <span className="font-mono">K</span>
          </div>
        </header>

        <main className="grid flex-1 place-items-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-elevated text-fg-faint">
              <LayoutGrid className="size-5" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-fg">
                No board selected
              </h2>
              <p className="text-base text-fg-muted">
                Create a board to start organizing your work. Everything stays local and syncs
                across your devices.
              </p>
            </div>
            <Button className="mt-1">
              <Plus className="size-4" />
              Create board
            </Button>
          </div>
        </main>
      </div>
    </div>
  );
}
