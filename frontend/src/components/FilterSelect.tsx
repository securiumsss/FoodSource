import { useId } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

interface Props<Value extends string> {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  compactSuffix?: string;
  hideLabel?: boolean;
}

export function FilterSelect<Value extends string>({ label, value, options, onChange, compactSuffix, hideLabel }: Props<Value>) {
  const id = useId();

  return (
    <div className="min-w-0">
      <label id={id + '-label'} htmlFor={id} className={compactSuffix || hideLabel ? 'sr-only' : 'filter-label block'}>{label}</label>
      <Select.Root value={value} onValueChange={next => {
        const option = options.find(item => item.value === next);
        if (option) onChange(option.value);
      }}>
        <Select.Trigger
          id={id}
          aria-labelledby={id + '-label'}
          className={compactSuffix
            ? 'flex min-h-9 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-ink hover:bg-soft sm:gap-2 sm:px-2'
            : 'mt-1 flex min-h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-line bg-white px-2.5 py-1.5 text-left text-[13px]! text-ink hover:border-line-strong hover:bg-soft data-[state=open]:border-brand-hover'}
        >
          <span className="min-w-0 truncate"><Select.Value /></span>
          {compactSuffix && <span aria-hidden="true" className="hidden whitespace-nowrap text-secondary @min-[22rem]:inline">{compactSuffix}</span>}
          <Select.Icon asChild><ChevronDown size={14} className="shrink-0 text-muted" aria-hidden="true" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            align={compactSuffix ? 'end' : 'start'}
            side={compactSuffix ? 'top' : 'bottom'}
            sideOffset={4}
            collisionPadding={12}
            className={`flex max-h-[min(17rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] flex-col overflow-hidden rounded-lg border border-line bg-white text-[13px] text-ink shadow-lg ${compactSuffix ? 'z-[60] min-w-20' : 'z-[45]'}`}
          >
            <Select.ScrollUpButton className="flex h-6 shrink-0 items-center justify-center text-muted"><ChevronUp size={14} /></Select.ScrollUpButton>
            <Select.Viewport className="min-h-0 p-1">
              {options.map(option => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="relative flex min-h-8 cursor-pointer select-none items-center rounded-md px-2.5 py-1.5 pr-8 outline-none data-[highlighted]:bg-canvas data-[state=checked]:font-semibold data-[state=checked]:text-brand-ink-strong"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-2.5 inline-flex"><Check size={14} aria-hidden="true" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="flex h-6 shrink-0 items-center justify-center text-muted"><ChevronDown size={14} /></Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
