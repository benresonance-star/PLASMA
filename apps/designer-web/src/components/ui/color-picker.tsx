import * as React from 'react';

import { Button } from './button.js';
import { Input } from './input.js';
import { Label } from './label.js';
import { Popover, PopoverContent, PopoverTrigger } from './popover.js';
import { cn } from '../../lib/utils.js';

const DEFAULT_PRESETS = [
  '#5a5a5a',
  '#5c636a',
  '#eef2f6',
  '#e2e8f0',
  '#1e293b',
  '#0f172a',
  '#334155',
  '#64748b',
  '#f8fafc',
  '#dbeafe',
  '#fef3c7',
  '#ecfccb',
] as const;

function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return null;
  return withHash.toLowerCase();
}

export type ColorPickerProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly presets?: readonly string[];
  readonly disabled?: boolean;
  readonly className?: string;
  readonly label?: string;
};

/** Shadcn-style colour selector: swatch trigger, native picker, hex input, presets. */
function ColorPicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  disabled = false,
  className,
  label = 'Colour',
}: ColorPickerProps) {
  const [draft, setDraft] = React.useState(value);
  const hex = normalizeHex(value) ?? '#5a5a5a';

  React.useEffect(() => {
    setDraft(hex);
  }, [hex]);

  const commit = (next: string) => {
    const normalized = normalizeHex(next);
    if (!normalized) return;
    onChange(normalized);
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <Label className="text-xs text-muted-foreground">{label}</Label>
      ) : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="justify-start gap-2 font-mono text-xs"
            aria-label={label}
          >
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-sm border border-border"
              style={{ backgroundColor: hex }}
            />
            <span className="uppercase">{hex}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 gap-3">
          <input
            type="color"
            value={hex}
            disabled={disabled}
            aria-label={`${label} picker`}
            className="h-32 w-full cursor-pointer rounded-md border border-border bg-transparent p-1"
            onChange={(event) => commit(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              disabled={disabled}
              spellCheck={false}
              aria-label={`${label} hex`}
              className="font-mono uppercase"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                const normalized = normalizeHex(draft);
                if (normalized) commit(normalized);
                else setDraft(hex);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <div className="grid grid-cols-6 gap-1.5" role="list" aria-label="Preset colours">
            {presets.map((preset) => {
              const p = normalizeHex(preset) ?? preset;
              const selected = p.toLowerCase() === hex;
              return (
                <button
                  key={p}
                  type="button"
                  role="listitem"
                  disabled={disabled}
                  title={p}
                  aria-label={p}
                  aria-pressed={selected}
                  className={cn(
                    'size-7 rounded-md border border-border transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected && 'ring-2 ring-ring',
                  )}
                  style={{ backgroundColor: p }}
                  onClick={() => commit(p)}
                />
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { ColorPicker, normalizeHex, DEFAULT_PRESETS };
