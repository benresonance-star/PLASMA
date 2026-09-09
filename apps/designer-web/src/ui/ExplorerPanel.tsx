import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Box,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Folder,
  FolderOpen,
  Import,
  Package,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  EXPLORER_ROOT_ID,
  explorerChildren,
  type ExplorerNode,
  type ExplorerNodeKind,
} from '../explorer-tree.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { cn } from '../lib/utils.js';
import { HelpTooltip, HelpTooltipScope } from './HelpTooltip.js';

const EXPLORER_TITLE_TOOLTIP =
  'Model browser — navigate assemblies, folders, bodies, and imports. Selection syncs with the viewport, inspector, and causal lens.';

const NEW_FOLDER_TOOLTIP =
  'Create an organisation folder under the model root. Folders group components without adding geometry.';

const NEW_COMPONENT_TOOLTIP =
  'Create a new component under the model root. The new node becomes selectable in the tree and viewport when geometry is bound.';

const EXPAND_TOOLTIP = 'Expand this branch to show nested children.';
const COLLAPSE_TOOLTIP = 'Collapse this branch to hide nested children.';

const SELECT_NODE_TOOLTIP =
  'Select this object. Selection syncs across the viewport, inspector parameters, and causal lens.';

const ADD_CHILD_TOOLTIP =
  'Add a child component under this node. The parent expands so the new item is visible.';

const RENAME_TOOLTIP =
  'Rename this node. Double-click the label for the same action. Enter commits; Escape cancels.';

const MOVE_UP_TOOLTIP =
  'Move this node one place earlier among its siblings. Order is preserved in the explorer tree.';

const MOVE_DOWN_TOOLTIP =
  'Move this node one place later among its siblings. Order is preserved in the explorer tree.';

const INDENT_TOOLTIP =
  'Indent — nest this node under the previous sibling to build hierarchy (folder/assembly structure).';

const OUTDENT_TOOLTIP =
  'Outdent — lift this node up one level in the hierarchy, next to its current parent.';

const DELETE_TOOLTIP =
  'Delete this node from the explorer tree. Live substrate folders may also update through the API when connected.';

export interface ExplorerPanelProps {
  readonly nodes: readonly ExplorerNode[];
  readonly selectedSemanticId: string | null;
  /** When provided with onExpandedIdsChange, expand state is controlled by the parent. */
  readonly expandedIds?: readonly string[];
  readonly onExpandedIdsChange?: (ids: readonly string[]) => void;
  readonly onSelect: (nodeId: string) => void;
  readonly onCreate: (parentId: string | null) => void;
  /** Create organisation folder (semantic `ui.folder` when API available). */
  readonly onCreateFolder?: (parentId: string | null) => void;
  readonly onRename: (nodeId: string, label: string) => void;
  readonly onDelete: (nodeId: string) => void;
  readonly onReorder: (nodeId: string, delta: -1 | 1) => void;
  readonly onReparent: (nodeId: string, newParentId: string | null) => void;
}

function kindIcon(kind: ExplorerNodeKind, open: boolean) {
  switch (kind) {
    case 'assembly':
      return open ? (
        <FolderOpen className="size-3.5 shrink-0 opacity-80" aria-hidden />
      ) : (
        <Folder className="size-3.5 shrink-0 opacity-80" aria-hidden />
      );
    case 'folder':
      return <Folder className="size-3.5 shrink-0 opacity-80" aria-hidden />;
    case 'body':
      return <Box className="size-3.5 shrink-0 opacity-80" aria-hidden />;
    case 'import':
      return <Import className="size-3.5 shrink-0 opacity-80" aria-hidden />;
    default:
      return <Package className="size-3.5 shrink-0 opacity-80" aria-hidden />;
  }
}

function ExplorerRow(props: {
  readonly node: ExplorerNode;
  readonly depth: number;
  readonly nodes: readonly ExplorerNode[];
  readonly expanded: ReadonlySet<string>;
  readonly selectedSemanticId: string | null;
  readonly renamingId: string | null;
  readonly renameDraft: string;
  readonly onToggle: (id: string) => void;
  readonly onSelect: (nodeId: string) => void;
  readonly onStartRename: (node: ExplorerNode) => void;
  readonly onRenameDraft: (value: string) => void;
  readonly onCommitRename: () => void;
  readonly onCancelRename: () => void;
  readonly onCreate: (parentId: string | null) => void;
  readonly onDelete: (nodeId: string) => void;
  readonly onReorder: (nodeId: string, delta: -1 | 1) => void;
  readonly onReparent: (nodeId: string, newParentId: string | null) => void;
}) {
  const kids = explorerChildren(props.nodes, props.node.id);
  const hasKids = kids.length > 0;
  const open = props.expanded.has(props.node.id);
  const selected =
    props.node.semanticId === props.selectedSemanticId &&
    props.node.semanticId !== EXPLORER_ROOT_ID;
  const isRoot = props.node.id === EXPLORER_ROOT_ID;
  const renaming = props.renamingId === props.node.id;

  return (
    <li>
      <div
        className={cn('spds-explorer-row', selected && 'is-selected')}
        style={{ paddingLeft: `${0.35 + props.depth * 0.85}rem` }}
      >
        <div className="spds-explorer-main">
          <HelpTooltip
            content={open ? COLLAPSE_TOOLTIP : EXPAND_TOOLTIP}
            disabled={!hasKids}
          >
            <span className={hasKids ? 'inline-flex' : 'inline-flex opacity-40'}>
              <button
                type="button"
                className="spds-explorer-twist"
                aria-label={open ? 'Collapse' : 'Expand'}
                disabled={!hasKids}
                onClick={() => props.onToggle(props.node.id)}
              >
                {hasKids ? (
                  open ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )
                ) : (
                  <span className="size-3.5" />
                )}
              </button>
            </span>
          </HelpTooltip>

          <HelpTooltip content={SELECT_NODE_TOOLTIP}>
            <button
              type="button"
              className="spds-explorer-label"
              onClick={() => props.onSelect(props.node.id)}
              onDoubleClick={() => {
                if (!isRoot) props.onStartRename(props.node);
              }}
            >
              {kindIcon(props.node.kind, open)}
              {renaming ? (
                <Input
                  autoFocus
                  value={props.renameDraft}
                  className="h-6 px-1.5 text-xs"
                  onClick={(ev) => ev.stopPropagation()}
                  onChange={(ev) => props.onRenameDraft(ev.target.value)}
                  onBlur={() => props.onCommitRename()}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') props.onCommitRename();
                    if (ev.key === 'Escape') props.onCancelRename();
                  }}
                />
              ) : (
                <span className="truncate">{props.node.label}</span>
              )}
            </button>
          </HelpTooltip>
        </div>

        {selected ? (
          <div className="spds-explorer-actions">
            <HelpTooltip content={ADD_CHILD_TOOLTIP}>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Add child"
                onClick={() => props.onCreate(props.node.id)}
              >
                <Plus />
              </Button>
            </HelpTooltip>
            {!isRoot ? (
              <>
                <HelpTooltip content={RENAME_TOOLTIP}>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Rename"
                    onClick={() => props.onStartRename(props.node)}
                  >
                    <Pencil />
                  </Button>
                </HelpTooltip>
                <HelpTooltip content={MOVE_UP_TOOLTIP}>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Move up"
                    onClick={() => props.onReorder(props.node.id, -1)}
                  >
                    <ArrowUp />
                  </Button>
                </HelpTooltip>
                <HelpTooltip content={MOVE_DOWN_TOOLTIP}>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Move down"
                    onClick={() => props.onReorder(props.node.id, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </HelpTooltip>
                <HelpTooltip content={INDENT_TOOLTIP}>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Indent"
                    onClick={() => {
                      const siblings = explorerChildren(props.nodes, props.node.parentId);
                      const idx = siblings.findIndex((s) => s.id === props.node.id);
                      const prev = idx > 0 ? siblings[idx - 1] : null;
                      if (prev) props.onReparent(props.node.id, prev.id);
                    }}
                  >
                    <CornerDownRight />
                  </Button>
                </HelpTooltip>
                <HelpTooltip content={OUTDENT_TOOLTIP}>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Outdent"
                    onClick={() => {
                      const parent = props.nodes.find((n) => n.id === props.node.parentId);
                      if (parent && parent.id !== EXPLORER_ROOT_ID) {
                        props.onReparent(props.node.id, parent.parentId);
                      } else if (parent) {
                        props.onReparent(props.node.id, EXPLORER_ROOT_ID);
                      }
                    }}
                  >
                    <CornerDownRight className="-scale-x-100" />
                  </Button>
                </HelpTooltip>
                <HelpTooltip content={DELETE_TOOLTIP}>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Delete"
                    onClick={() => props.onDelete(props.node.id)}
                  >
                    <Trash2 />
                  </Button>
                </HelpTooltip>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {hasKids && open ? (
        <ul className="spds-explorer-branch">
          {kids.map((child) => (
            <ExplorerRow
              key={child.id}
              node={child}
              depth={props.depth + 1}
              nodes={props.nodes}
              expanded={props.expanded}
              selectedSemanticId={props.selectedSemanticId}
              renamingId={props.renamingId}
              renameDraft={props.renameDraft}
              onToggle={props.onToggle}
              onSelect={props.onSelect}
              onStartRename={props.onStartRename}
              onRenameDraft={props.onRenameDraft}
              onCommitRename={props.onCommitRename}
              onCancelRename={props.onCancelRename}
              onCreate={props.onCreate}
              onDelete={props.onDelete}
              onReorder={props.onReorder}
              onReparent={props.onReparent}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ExplorerPanel(props: ExplorerPanelProps) {
  const roots = useMemo(() => explorerChildren(props.nodes, null), [props.nodes]);
  const controlled = props.expandedIds !== undefined && props.onExpandedIdsChange !== undefined;
  const [expandedLocal, setExpandedLocal] = useState<Set<string>>(
    () =>
      new Set(
        props.expandedIds && props.expandedIds.length > 0
          ? props.expandedIds
          : props.nodes.map((n) => n.id),
      ),
  );
  const expanded = controlled ? new Set(props.expandedIds) : expandedLocal;
  const setExpanded = (updater: (prev: Set<string>) => Set<string>) => {
    if (controlled) {
      const next = updater(new Set(props.expandedIds));
      props.onExpandedIdsChange!([...next]);
      return;
    }
    setExpandedLocal((prev) => updater(prev));
  };
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="spds-explorer">
      <HelpTooltipScope>
        <div className="spds-panel-head">
          <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden />
          <HelpTooltip content={EXPLORER_TITLE_TOOLTIP}>
            <h2>Explorer</h2>
          </HelpTooltip>
          <div className="ml-auto flex gap-0.5">
            {props.onCreateFolder ? (
              <HelpTooltip content={NEW_FOLDER_TOOLTIP}>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="New folder"
                  onClick={() => props.onCreateFolder?.(EXPLORER_ROOT_ID)}
                >
                  <Folder />
                </Button>
              </HelpTooltip>
            ) : null}
            <HelpTooltip content={NEW_COMPONENT_TOOLTIP}>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="New component"
                onClick={() => props.onCreate(EXPLORER_ROOT_ID)}
              >
                <Plus />
              </Button>
            </HelpTooltip>
          </div>
        </div>
        <div className="spds-explorer-body">
          <ul className="spds-explorer-tree">
            {roots.map((node) => (
              <ExplorerRow
                key={node.id}
                node={node}
                depth={0}
                nodes={props.nodes}
                expanded={expanded}
                selectedSemanticId={props.selectedSemanticId}
                renamingId={renamingId}
                renameDraft={renameDraft}
                onToggle={toggle}
                onSelect={props.onSelect}
                onStartRename={(n) => {
                  setRenamingId(n.id);
                  setRenameDraft(n.label);
                }}
                onRenameDraft={setRenameDraft}
                onCommitRename={() => {
                  if (renamingId) props.onRename(renamingId, renameDraft);
                  setRenamingId(null);
                }}
                onCancelRename={() => setRenamingId(null)}
                onCreate={(parentId) => {
                  props.onCreate(parentId);
                  if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
                }}
                onDelete={props.onDelete}
                onReorder={props.onReorder}
                onReparent={(id, parentId) => {
                  props.onReparent(id, parentId);
                  if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
                }}
              />
            ))}
          </ul>
        </div>
      </HelpTooltipScope>
    </aside>
  );
}
