import type { ReactNode } from 'react';
import { ScrollArea } from '../components/ui/scroll-area.js';

export interface PanelChromeProps {
  readonly panel: string;
  readonly title: string;
  readonly status?: string;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}

export function PanelChrome(props: PanelChromeProps) {
  return (
    <aside className="spds-inspector" data-panel={props.panel}>
      <div className="spds-panel-head">
        {props.icon}
        <h2>{props.title}</h2>
      </div>
      {props.status ? <p className="spds-panel-status">{props.status}</p> : null}
      <ScrollArea className="spds-inspector-scroll h-full min-w-0">
        <div className="spds-inspector-body">{props.children}</div>
      </ScrollArea>
    </aside>
  );
}
