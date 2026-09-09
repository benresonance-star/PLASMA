import { GitBranch } from 'lucide-react';
import type { PipelineViewModel } from '../pipeline-view.js';
import { Button } from '../components/ui/button.js';
import { PanelChrome } from './PanelChrome.js';

export interface PipelinePanelProps {
  readonly pipeline: PipelineViewModel;
  readonly pipelineHash?: string;
  readonly live: boolean;
  readonly onFocusStage: (semanticOwner: string | null) => void;
}

export function PipelinePanel(props: PipelinePanelProps) {
  const status = props.live
    ? `Live run · ${props.pipelineHash?.slice(0, 12) ?? props.pipeline.dagId}`
    : `Offline demo · ${props.pipeline.dagId}`;

  return (
    <PanelChrome
      panel="pipeline"
      title="Pipeline"
      icon={<GitBranch className="size-3.5 text-muted-foreground" aria-hidden />}
      status={status}
    >
      <ul className="spds-list">
        {props.pipeline.stages.map((st) => {
          const hasMesh = Boolean(st.semanticOwner);
          return (
            <li key={st.id}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-start whitespace-normal text-left h-auto py-2"
                disabled={!hasMesh}
                onClick={() => props.onFocusStage(hasMesh ? st.semanticOwner : null)}
              >
                {st.operator} · {st.status} · {st.timingMs ?? '—'}ms
                {!hasMesh ? ' · no mesh' : ` · ${st.semanticOwner}`}
              </Button>
            </li>
          );
        })}
      </ul>
    </PanelChrome>
  );
}
