import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { Button } from '../components/ui/button.js';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '../components/ui/popover.js';
import { Separator } from '../components/ui/separator.js';
import { HelpTooltip, HelpTooltipScope } from './HelpTooltip.js';

export type ModelKind = 'd01' | 'f01' | 'a01';
export type PublicationStatus = 'candidate' | 'published' | 'offline';

const MODEL_MENU_TOOLTIP =
  'Switch the active reference model and whether you are editing the working Candidate revision or viewing/publishing the Published revision.';

const MODEL_OPTION_TOOLTIPS: Record<ModelKind, string> = {
  d01: 'D01 Dome — primary parametric dome reference with live tessellation, length preview, and substrate seeding.',
  f01: 'F01 Panel — freeform panel reference model for panel-centric exploration without the dome path.',
  a01: 'A01 Assembly — assembly reference with mates/parts for multi-body organisation demos.',
};

const CANDIDATE_TOOLTIP =
  'Candidate — work on the editable revision. Viewport chrome and publish state reflect the in-progress candidate.';

const PUBLISHED_TOOLTIP =
  'Published — publish the current candidate revision (or show published chrome when already published). Use Candidate to return to editing.';

const MODEL_OPTIONS: readonly {
  readonly kind: ModelKind;
  readonly label: string;
  readonly hint: string;
}[] = [
  { kind: 'd01', label: 'D01', hint: 'Dome' },
  { kind: 'f01', label: 'F01', hint: 'Panel' },
  { kind: 'a01', label: 'A01', hint: 'Assembly' },
];

function modelLabel(kind: ModelKind): string {
  switch (kind) {
    case 'd01':
      return 'D01';
    case 'f01':
      return 'F01';
    case 'a01':
      return 'A01';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function revisionLabel(status: PublicationStatus): string {
  switch (status) {
    case 'candidate':
      return 'Candidate';
    case 'published':
      return 'Published';
    case 'offline':
      return 'Offline';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export interface ModelMenuProps {
  readonly modelKind: ModelKind;
  readonly publicationStatus: PublicationStatus;
  readonly onModelKindChange: (kind: ModelKind) => void;
  /** Soft chrome switch back to the working candidate. */
  readonly onSelectCandidate: () => void;
  /** Publish (or show published) — caller owns the API side-effect. */
  readonly onSelectPublished: () => void;
  readonly publishBusy?: boolean;
}

export function ModelMenu(props: ModelMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerLabel = `${modelLabel(props.modelKind)} · ${revisionLabel(props.publicationStatus)}`;
  const revisionActive =
    props.publicationStatus === 'published' ? 'published' : 'candidate';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <HelpTooltip content={MODEL_MENU_TOOLTIP} disabled={open}>
        <span className="inline-flex min-w-0">
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-w-[9.5rem] justify-between gap-1.5"
              aria-label={`Model and revision: ${triggerLabel}`}
            >
              <span className="truncate">{triggerLabel}</span>
              <ChevronDown className="size-3.5 opacity-70" />
            </Button>
          </PopoverTrigger>
        </span>
      </HelpTooltip>
      <PopoverContent align="start" className="w-64 gap-3 p-3">
        <HelpTooltipScope>
          <PopoverHeader>
            <PopoverTitle>Model</PopoverTitle>
            <PopoverDescription>Choose model and revision</PopoverDescription>
          </PopoverHeader>

          <div className="flex flex-col gap-0.5" role="listbox" aria-label="Models">
            {MODEL_OPTIONS.map((option) => {
              const selected = props.modelKind === option.kind;
              return (
                <HelpTooltip
                  key={option.kind}
                  content={MODEL_OPTION_TOOLTIPS[option.kind]}
                  side="right"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'ghost'}
                    className="justify-between"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      props.onModelKindChange(option.kind);
                      setOpen(false);
                    }}
                  >
                    <span className="flex items-baseline gap-2">
                      <span>{option.label}</span>
                      <span
                        className={
                          selected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                        }
                      >
                        {option.hint}
                      </span>
                    </span>
                    {selected ? <Check className="size-3.5" aria-hidden /> : null}
                  </Button>
                </HelpTooltip>
              );
            })}
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Revision</span>
            <div
              className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1"
              role="group"
              aria-label="Revision"
            >
              <HelpTooltip content={CANDIDATE_TOOLTIP} side="bottom">
                <Button
                  type="button"
                  size="sm"
                  variant={revisionActive === 'candidate' ? 'default' : 'ghost'}
                  aria-pressed={revisionActive === 'candidate'}
                  onClick={() => {
                    props.onSelectCandidate();
                  }}
                >
                  Candidate
                </Button>
              </HelpTooltip>
              <HelpTooltip content={PUBLISHED_TOOLTIP} side="bottom">
                <Button
                  type="button"
                  size="sm"
                  variant={revisionActive === 'published' ? 'default' : 'ghost'}
                  aria-pressed={revisionActive === 'published'}
                  disabled={props.publishBusy}
                  onClick={() => {
                    void props.onSelectPublished();
                  }}
                >
                  Published
                </Button>
              </HelpTooltip>
            </div>
            <p className="text-[0.7rem] leading-snug text-muted-foreground">
              {revisionActive === 'published'
                ? 'Viewing the published revision. Switch to Candidate to keep editing.'
                : 'Working candidate. Choose Published to publish the current revision.'}
            </p>
          </div>
        </HelpTooltipScope>
      </PopoverContent>
    </Popover>
  );
}
