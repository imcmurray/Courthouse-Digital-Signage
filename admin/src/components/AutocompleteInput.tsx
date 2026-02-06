import { useState, useRef, useEffect, InputHTMLAttributes } from 'react';

interface AutocompleteInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  suggestions: string[];
  value: string;
  onChange: (value: string) => void;
  inputClassName?: string;
}

export default function AutocompleteInput({
  suggestions,
  value,
  onChange,
  inputClassName,
  ...inputProps
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(value.toLowerCase()) &&
      s.toLowerCase() !== value.toLowerCase()
  );

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [value]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const select = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filtered.length === 0) {
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          select(filtered[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        {...inputProps}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (filtered.length > 0) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className={inputClassName}
        autoComplete="off"
      />
      {isOpen && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg"
        >
          {filtered.map((item, index) => (
            <li
              key={item}
              onMouseDown={(e) => {
                e.preventDefault();
                select(item);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-3 py-2 cursor-pointer text-sm text-gray-900 dark:text-white ${
                index === highlightedIndex
                  ? 'bg-primary/10 dark:bg-primary/20'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
