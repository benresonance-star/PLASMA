import { ShieldAlert } from 'lucide-react';
import type { ValidationNavigatorView } from '../validation-navigator.js';
import { validationSourceLabel } from '../validation-source.js';
import { Button } from '../components/ui/button.js';
import { PanelChrome } from './PanelChrome.js';

export interface ValidationPanelProps {
  readonly validation: ValidationNavigatorView;
  readonly validationFromCompile: boolean;
  readonly onNavigateIssue: (issueId: string) => void;
}

export function ValidationPanel(props: ValidationPanelProps) {
  return (
    <PanelChrome
      panel="validation"
      title="Validation"
      icon={<ShieldAlert className="size-3.5 text-muted-foreground" aria-hidden />}
      status={validationSourceLabel({ validationFromCompile: props.validationFromCompile })}
    >
      <ul className="spds-list">
        {props.validation.issues.map((iss) => {
          const hasGeom = iss.affectedSemanticIds.length > 0;
          return (
            <li key={iss.id}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-start whitespace-normal text-left h-auto py-2"
                disabled={!hasGeom}
                onClick={() => props.onNavigateIssue(iss.id)}
              >
                {iss.code}: {iss.summary}
                {!hasGeom ? ' · no mesh' : ''}
              </Button>
            </li>
          );
        })}
      </ul>
    </PanelChrome>
  );
}
