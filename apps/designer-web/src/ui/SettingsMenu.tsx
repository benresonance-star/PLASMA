import { useState } from 'react';
import { Moon, Settings, Sun } from 'lucide-react';

import { Button } from '../components/ui/button.js';
import { ColorPicker } from '../components/ui/color-picker.js';
import { Label } from '../components/ui/label.js';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '../components/ui/popover.js';
import { Separator } from '../components/ui/separator.js';
import { Switch } from '../components/ui/switch.js';
import { HelpTooltip, HelpTooltipScope } from './HelpTooltip.js';

const SETTINGS_TOOLTIP =
  'Appearance settings — theme (light/dark) and per-theme viewport background colour.';

const DARK_MODE_TOOLTIP =
  'Toggle dark mode for the shell chrome, panels, and default viewport theme colours.';

const VIEWPORT_BG_TOOLTIP =
  'Override the viewport clear colour for the active theme. Reset restores the theme default for published/candidate chrome.';

const RESET_BG_TOOLTIP =
  'Clear the custom viewport background for this theme and return to the built-in default.';

export interface SettingsMenuProps {
  readonly dark: boolean;
  readonly onDarkChange: (dark: boolean) => void;
  /** Effective colour for the active theme (custom or theme default). */
  readonly viewportBackgroundHex: string;
  readonly viewportBackgroundCustom: boolean;
  readonly onViewportBackgroundChange: (hex: string) => void;
  readonly onViewportBackgroundReset: () => void;
}

export function SettingsMenu(props: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const modeLabel = props.dark ? 'dark' : 'light';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <HelpTooltip content={SETTINGS_TOOLTIP} disabled={open}>
        <span className="inline-flex">
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Settings"
            >
              <Settings />
            </Button>
          </PopoverTrigger>
        </span>
      </HelpTooltip>
      <PopoverContent align="end" className="w-72 gap-3 p-3">
        <HelpTooltipScope>
          <PopoverHeader>
            <PopoverTitle>Settings</PopoverTitle>
            <PopoverDescription>Appearance and viewport</PopoverDescription>
          </PopoverHeader>

          <Separator />

          <div className="flex items-center justify-between gap-3">
            <HelpTooltip content={DARK_MODE_TOOLTIP} asChild={false}>
              <Label htmlFor="spds-theme-switch" className="text-xs text-muted-foreground">
                Dark mode
              </Label>
            </HelpTooltip>
            <HelpTooltip content={DARK_MODE_TOOLTIP}>
              <div className="spds-theme-toggle spds-theme-toggle--compact">
                <Sun className="size-3.5" aria-hidden />
                <Switch
                  id="spds-theme-switch"
                  checked={props.dark}
                  onCheckedChange={props.onDarkChange}
                  aria-label="Toggle dark mode"
                />
                <Moon className="size-3.5" aria-hidden />
              </div>
            </HelpTooltip>
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <HelpTooltip content={VIEWPORT_BG_TOOLTIP} asChild={false}>
              <div>
                <ColorPicker
                  label={`Viewport background (${modeLabel})`}
                  value={props.viewportBackgroundHex}
                  onChange={props.onViewportBackgroundChange}
                />
              </div>
            </HelpTooltip>
            <HelpTooltip content={RESET_BG_TOOLTIP} disabled={!props.viewportBackgroundCustom}>
              <span
                className={
                  props.viewportBackgroundCustom ? 'inline-flex self-start' : 'inline-flex self-start opacity-50'
                }
              >
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  disabled={!props.viewportBackgroundCustom}
                  onClick={props.onViewportBackgroundReset}
                >
                  Reset {modeLabel} to theme default
                </Button>
              </span>
            </HelpTooltip>
          </div>
        </HelpTooltipScope>
      </PopoverContent>
    </Popover>
  );
}
