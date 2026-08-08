import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

interface PrettySelectOption {
  readonly label: string;
  readonly value: string;
}

export function PrettySelect({
  ariaLabel,
  defaultValue,
  name,
  options,
}: {
  ariaLabel: string;
  defaultValue: string;
  name?: string;
  options: readonly PrettySelectOption[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const focusOption = (index: number) => {
    const nextIndex = Math.max(0, Math.min(options.length - 1, index));
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  const openAndFocus = (index = selectedIndex) => {
    setActiveIndex(index);
    setOpen(true);
    queueMicrotask(() => focusOption(index));
  };

  const selectOption = (nextValue: string, index: number) => {
    setValue(nextValue);
    setActiveIndex(index);
    setOpen(false);
    queueMicrotask(() => rootRef.current?.querySelector<HTMLButtonElement>(".pretty-select-button")?.focus());
  };

  const onOptionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>(".pretty-select-button")?.focus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (event.key === "Home") focusOption(0);
      else if (event.key === "End") focusOption(options.length - 1);
      else focusOption(event.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1);
    }
  };

  return (
    <div className={`pretty-select${open ? " is-open" : ""}`} ref={rootRef}>
      <select
        className="pretty-select-native"
        name={name}
        aria-hidden="true"
        tabIndex={-1}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      >
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
      <button
        className="pretty-select-button"
        type="button"
        aria-label={`${ariaLabel}: ${selected?.label ?? ""}`}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={open}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Tab" && open) setOpen(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openAndFocus(event.key === "ArrowDown" ? selectedIndex : Math.max(0, selectedIndex - 1));
          }
        }}
      ><span className="pretty-select-value">{selected?.label}</span><i aria-hidden="true"></i></button>
      <div className="pretty-select-menu" id={menuId} role="listbox" aria-label={ariaLabel} onKeyDown={onOptionKeyDown}>
        {options.map((option, index) => {
          const isSelected = option.value === value;
          return (
            <button
              className={`pretty-select-option${isSelected ? " is-selected" : ""}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-value={option.value}
              tabIndex={index === activeIndex ? 0 : -1}
              ref={(element) => { optionRefs.current[index] = element; }}
              onClick={() => selectOption(option.value, index)}
              onFocus={() => setActiveIndex(index)}
              key={option.value}
            >{option.label}</button>
          );
        })}
      </div>
    </div>
  );
}
