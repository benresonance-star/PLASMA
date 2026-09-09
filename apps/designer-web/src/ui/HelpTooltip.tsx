import type { ReactNode } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip.js';

export interface HelpTooltipProps {
  readonly content: ReactNode;
  readonly children: ReactNode;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  readonly align?: 'start' | 'center' | 'end';
  /** When false, wraps children in a span trigger (for plain text/labels). */
  readonly asChild?: boolean;
  /** Force the tooltip closed (e.g. while a sibling popover menu is open). */
  readonly disabled?: boolean;
}

/** Detailed hover help for panel controls. Prefer one TooltipProvider per panel. */
export function HelpTooltip(props: HelpTooltipProps) {
  const asChild = props.asChild !== false;
  return (
    <Tooltip {...(props.disabled ? { open: false as const } : {})}>
      {asChild ? (
        <TooltipTrigger asChild>{props.children}</TooltipTrigger>
      ) : (
        <TooltipTrigger asChild>
          <span className="sdi-help-target" tabIndex={0}>
            {props.children}
          </span>
        </TooltipTrigger>
      )}
      <TooltipContent
        side={props.side ?? 'bottom'}
        align={props.align ?? 'start'}
        className="max-w-72 text-left leading-snug"
      >
        {props.content}
      </TooltipContent>
    </Tooltip>
  );
}

/** Hover dwell before any app help tooltip reveals. */
export const HELP_TOOLTIP_DELAY_MS = 3000;

export interface HelpTooltipScopeProps {
  readonly children: ReactNode;
  readonly delayDuration?: number;
}

export function HelpTooltipScope(props: HelpTooltipScopeProps) {
  return (
    <TooltipProvider delayDuration={props.delayDuration ?? HELP_TOOLTIP_DELAY_MS}>
      {props.children}
    </TooltipProvider>
  );
}
