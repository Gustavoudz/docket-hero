import { useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Input } from "@/components/ui/input";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  ariaLabel?: string;
};

/** Campo de texto livre com sugestões vindas da base (autocomplete não bloqueante). */
export function ComboboxInput({ id, value, onChange, options, placeholder, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedValue = useDebouncedValue(value, 300);

  const matches = useMemo(() => {
    const q = debouncedValue.trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.filter((o) => o.toLowerCase() !== q).slice(0, 8);
  }, [options, debouncedValue]);

  return (
    <div className="relative">
      <Input
        id={id}
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          closeTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg">
          {matches.map((option) => (
            <li key={option}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (closeTimer.current) clearTimeout(closeTimer.current);
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
