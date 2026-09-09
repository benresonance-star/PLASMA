/**
 * Center Schema workspace — exclusive RF mount (plan S08).
 */

import type { SchemaViewModel } from '../schema-view.js';
import { SchemaCanvas } from './SchemaCanvas.js';

export interface SchemaWorkspaceProps {
  readonly schema: SchemaViewModel | null;
  readonly selectedSemanticId: string | null;
  readonly provisionalSemanticIds?: ReadonlySet<string>;
  readonly onSelectSchemaNode: (semanticId: string | null) => void;
  readonly statusLine?: string;
}

export function SchemaWorkspace(props: SchemaWorkspaceProps) {
  return (
    <section className="spds-schema-workspace" data-testid="schema-workspace" aria-label="Schema workspace">
      {props.statusLine ? (
        <p className="schema-workspace-status" role="status">
          {props.statusLine}
        </p>
      ) : null}
      <SchemaCanvas
        schema={props.schema}
        selectedSemanticId={props.selectedSemanticId}
        {...(props.provisionalSemanticIds
          ? { provisionalSemanticIds: props.provisionalSemanticIds }
          : {})}
        onSelectSchemaNode={props.onSelectSchemaNode}
      />
    </section>
  );
}
