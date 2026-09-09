/**
 * Schema detail rail — unused catalog browser + purpose/Draft actions (plan S09–S10).
 */

import { useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { GOLDBERG_PATTERN_PUBLISHED_ID, PARAM_D01_LENGTH_ID } from '@spds/ai-interface';
import { buildPatternCard, type PatternInspectorView } from '@spds/graph-projection';
import { lookupSchemaItemDoc } from '../schema-item-docs.js';
import {
  draftApplyGoldbergPattern,
  draftCreateFolder,
  draftUpdateParam,
  draftUpdatePatternParam,
  type SchemaDraftContext,
  type SchemaDraftResult,
} from '../schema-draft.js';
import {
  countUnusedCatalogItems,
  filterUnusedCatalogGroups,
  listUnusedSchemaCatalog,
  type UnusedCatalogItem,
} from '../schema-unused-catalog.js';
import type { SchemaViewModel } from '../schema-view.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { HelpTooltip, HelpTooltipScope } from './HelpTooltip.js';
import { PatternCardView } from './PatternCardView.js';
import { PanelChrome } from './PanelChrome.js';

export interface SchemaPanelProps {
  readonly schema: SchemaViewModel | null;
  readonly statusLine: string;
  readonly selectedSchemaId: string | null;
  readonly draftContext: SchemaDraftContext;
  readonly pattern?: PatternInspectorView | null;
  readonly onRefresh: () => void;
  readonly onSelectSemanticId: (semanticId: string) => void;
  readonly onDraftPending: (result: SchemaDraftResult) => void;
  readonly onClearSelection?: () => void;
}

function isParamId(id: string): boolean {
  return id.startsWith('param:') || id === 'Parameter' || id === 'parameter.number';
}

function isPatternId(id: string): boolean {
  return id.startsWith('pattern:') || id === 'Pattern' || id === 'geodesic';
}

function isFolderKind(id: string): boolean {
  return id === 'ui.folder' || id.startsWith('folder:');
}

function UnusedCatalogList(props: {
  readonly schema: SchemaViewModel;
  readonly selectedSchemaId: string | null;
  readonly onSelectSemanticId: (semanticId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => listUnusedSchemaCatalog(props.schema), [props.schema]);
  const filtered = useMemo(() => filterUnusedCatalogGroups(groups, query), [groups, query]);
  const total = countUnusedCatalogItems(groups);
  const shown = countUnusedCatalogItems(filtered);

  return (
    <div className="schema-unused-catalog" data-testid="schema-unused-catalog">
      <div className="schema-unused-catalog-head">
        <h3 className="mb-1 font-medium">Unused catalog</h3>
        <p className="spds-muted mb-2 text-xs">
          Not on the Schema canvas ({shown}
          {query.trim() ? ` of ${total}` : ''} items). Canvas keeps the active/mutable graph.
        </p>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search unused kinds, patterns…"
          aria-label="Search unused catalog"
          className="schema-unused-catalog-search"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="spds-muted mt-3 text-sm">
          {total === 0 ? 'No unused catalog entries.' : 'No matches for this search.'}
        </p>
      ) : (
        <HelpTooltipScope>
          <div className="schema-unused-catalog-groups">
            {filtered.map((group) => (
              <section key={group.kind} className="schema-unused-catalog-group">
                <h4 className="schema-unused-catalog-group-title">
                  {group.kind}
                  <span className="schema-unused-catalog-count">{group.items.length}</span>
                </h4>
                <ul className="schema-unused-catalog-list">
                  {group.items.map((item) => (
                    <li key={`${group.kind}:${item.id}`}>
                      <UnusedCatalogRow
                        item={item}
                        selected={props.selectedSchemaId === item.id}
                        onSelect={() => props.onSelectSemanticId(item.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </HelpTooltipScope>
      )}
    </div>
  );
}

function UnusedCatalogRow(props: {
  readonly item: UnusedCatalogItem;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const { item } = props;
  return (
    <HelpTooltip
      content={
        <div className="schema-rf-hover-copy">
          <strong>{item.label}</strong>
          <p>{item.purpose}</p>
          <p className="schema-rf-hover-copy-muted">How to use: {item.howToUse}</p>
        </div>
      }
      side="left"
      align="start"
    >
      <button
        type="button"
        className={['schema-unused-catalog-item', props.selected ? 'is-selected' : '']
          .filter(Boolean)
          .join(' ')}
        onClick={props.onSelect}
      >
        <span className="schema-unused-catalog-item-label">{item.label}</span>
        {item.summary ? (
          <span className="schema-unused-catalog-item-summary">{item.summary}</span>
        ) : null}
      </button>
    </HelpTooltip>
  );
}

export function SchemaPanel(props: SchemaPanelProps) {
  const schema = props.schema;
  const selected = props.selectedSchemaId;
  const mutate = schema?.mutate ?? null;
  const [draftValue, setDraftValue] = useState('2100');

  const paramMeta = useMemo(() => {
    if (!mutate || !selected) return null;
    return mutate.parameters.find((p) => p.id === selected) ?? null;
  }, [mutate, selected]);

  const doc = useMemo(() => {
    if (!selected) return null;
    return lookupSchemaItemDoc(selected);
  }, [selected]);

  const patternCard = useMemo(() => {
    if (!props.pattern || !selected || !isPatternId(selected)) return null;
    return buildPatternCard({
      inspector: props.pattern,
      depth: 'intent',
    });
  }, [props.pattern, selected]);

  const runDraft = (result: SchemaDraftResult) => {
    props.onDraftPending(result);
  };

  return (
    <PanelChrome
      panel="schema"
      title="Schema"
      icon={<BookOpen className="size-3.5 text-muted-foreground" aria-hidden />}
      status={props.statusLine}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={props.onRefresh}>
          Refresh
        </Button>
        {selected && props.onClearSelection ? (
          <Button type="button" size="sm" variant="ghost" onClick={props.onClearSelection}>
            Unused catalog
          </Button>
        ) : null}
      </div>

      {!schema ? (
        <p className="spds-muted">No schema loaded — seed live substrate, then Refresh.</p>
      ) : !selected ? (
        <div className="flex flex-col gap-3 text-sm" data-testid="schema-capabilities">
          <section>
            <h3 className="mb-1 font-medium">On canvas</h3>
            <p className="spds-muted mb-1">
              Accept ops: {(mutate?.acceptOps ?? ['update', 'create', 'apply_pattern']).join(', ')}
            </p>
            <p className="spds-muted">
              {schema.kinds.length} kinds · {schema.patterns.length} patterns ·{' '}
              {schema.liveTypes.length} live types
              {schema.contextMissing ? ' · context missing' : ''}
            </p>
          </section>
          <UnusedCatalogList
            schema={schema}
            selectedSchemaId={selected}
            onSelectSemanticId={props.onSelectSemanticId}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm" data-testid="schema-detail-rail">
          <section>
            <h3 className="mb-1 font-medium">{selected}</h3>
            {doc ? (
              <>
                <p>{doc.purpose}</p>
                <p className="spds-muted mt-1">How to use: {doc.howToUse}</p>
              </>
            ) : null}
          </section>

          {paramMeta ? (
            <section>
              <h3 className="mb-1 font-medium">Domain</h3>
              <p className="spds-muted">
                {paramMeta.path}: {paramMeta.domain.min}–{paramMeta.domain.max}{' '}
                {paramMeta.quantity?.unit ?? 'mm'}
                {paramMeta.quantity ? ` · current ${paramMeta.quantity.value}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="spds-muted text-xs">Draft value</span>
                  <Input
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    aria-label="Draft parameter value"
                    className="w-28"
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const value = Number(draftValue);
                    if (paramMeta.path.startsWith('params.')) {
                      runDraft(
                        draftUpdatePatternParam(props.draftContext, {
                          path: paramMeta.path,
                          value,
                        }),
                      );
                      return;
                    }
                    if (
                      paramMeta.path !== 'lengthMm' &&
                      paramMeta.path !== 'armWidthMm' &&
                      paramMeta.path !== 'structuralDepthMm'
                    ) {
                      runDraft({
                        ok: false,
                        code: 'UNSUPPORTED',
                        reason: `No mutation binding for ${paramMeta.path}`,
                      });
                      return;
                    }
                    runDraft(
                      draftUpdateParam(props.draftContext, {
                        paramId: paramMeta.id,
                        path: paramMeta.path,
                        value,
                      }),
                    );
                  }}
                >
                  Draft update
                </Button>
              </div>
            </section>
          ) : null}

          {isParamId(selected) && !paramMeta && selected === PARAM_D01_LENGTH_ID ? (
            <section>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  runDraft(
                    draftUpdateParam(props.draftContext, {
                      paramId: PARAM_D01_LENGTH_ID,
                      path: 'lengthMm',
                      value: Number(draftValue) || 2100,
                    }),
                  )
                }
              >
                Draft length update
              </Button>
            </section>
          ) : null}

          {patternCard ? (
            <section>
              <h3 className="mb-1 font-medium">Pattern</h3>
              <PatternCardView card={patternCard} />
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={() =>
                  runDraft(
                    draftApplyGoldbergPattern(props.draftContext, {
                      patternId: selected.startsWith('pattern:')
                        ? selected
                        : GOLDBERG_PATTERN_PUBLISHED_ID,
                    }),
                  )
                }
              >
                Draft apply_pattern
              </Button>
            </section>
          ) : isPatternId(selected) ? (
            <section>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  runDraft(
                    draftApplyGoldbergPattern(props.draftContext, {
                      patternId: selected.startsWith('pattern:')
                        ? selected
                        : GOLDBERG_PATTERN_PUBLISHED_ID,
                    }),
                  )
                }
              >
                Draft apply_pattern
              </Button>
            </section>
          ) : null}

          {isFolderKind(selected) ? (
            <section>
              <Button
                type="button"
                size="sm"
                onClick={() => runDraft(draftCreateFolder(props.draftContext))}
              >
                Draft create folder
              </Button>
            </section>
          ) : null}

          {mutate ? (
            <section>
              <h3 className="mb-1 font-medium">Accept ops</h3>
              <p className="spds-muted">{mutate.acceptOps.join(', ')}</p>
            </section>
          ) : null}
        </div>
      )}
    </PanelChrome>
  );
}
