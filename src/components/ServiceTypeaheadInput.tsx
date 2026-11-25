import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import {
  searchServiceDirectory,
  ServiceDirectoryEntry,
} from '../data/serviceDirectory';

interface ServiceTypeaheadInputProps {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  allowAll?: boolean;
  allLabel?: string;
  placeholder?: string;
  variant?: 'light' | 'luxury-dark';
  ariaLabel?: string;
}

export function ServiceTypeaheadInput({
  id,
  value,
  onChange,
  allowAll = true,
  allLabel = 'All Services',
  placeholder = 'Type first letter (e.g., B, C, H, S)...',
  variant = 'light',
  ariaLabel = 'Service type search',
}: ServiceTypeaheadInputProps) {
  const isDark = variant === 'luxury-dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);

  // Sync display text when closed
  const displayValue = isOpen
    ? query
    : value === 'All'
      ? ''
      : value;

  const matchingEntries = useMemo<ServiceDirectoryEntry[]>(
    () => searchServiceDirectory(query, 45),
    [query]
  );

  const selectableItems = useMemo(() => {
    const items: { key: string; name: string; subtitle: string; isGroup: boolean }[] = [];
    if (allowAll && (!query.trim() || allLabel.toLowerCase().includes(query.trim().toLowerCase()))) {
      items.push({
        key: 'all-services',
        name: allLabel,
        subtitle: 'Everything nearby',
        isGroup: true,
      });
    }
    for (const entry of matchingEntries) {
      items.push({
        key: entry.key,
        name: entry.name,
        subtitle: entry.isGroup ? 'Category' : entry.group,
        isGroup: entry.isGroup,
      });
    }
    return items;
  }, [allowAll, allLabel, matchingEntries, query]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [query, isOpen]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const commitSelection = (itemName: string) => {
    const resolved = allowAll && itemName === allLabel ? 'All' : itemName;
    onChange(resolved);
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (selectableItems.length > 0) {
        setHighlightedIdx((prev) => (prev + 1) % selectableItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (selectableItems.length > 0) {
        setHighlightedIdx(
          (prev) => (prev - 1 + selectableItems.length) % selectableItems.length
        );
      }
    } else if (e.key === 'Enter') {
      if (isOpen && selectableItems.length > 0) {
        e.preventDefault();
        const picked = selectableItems[highlightedIdx] ?? selectableItems[0];
        if (picked) {
          commitSelection(picked.name);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  };

  const renderHighlightedName = (name: string) => {
    const q = query.trim();
    if (!q) return name;
    const idx = name.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return name;
    const before = name.slice(0, idx);
    const match = name.slice(idx, idx + q.length);
    const after = name.slice(idx + q.length);
    return (
      <>
        {before}
        <span
          className={`font-bold underline decoration-1 underline-offset-2 ${
            isDark ? 'text-[#e5c47c]' : 'text-blue-700'
          }`}
        >
          {match}
        </span>
        {after}
      </>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Search
          className={`w-3.5 h-3.5 absolute left-3 pointer-events-none ${
            isDark ? 'text-[#c8a45d]' : 'text-slate-400'
          }`}
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          value={displayValue}
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            value !== 'All' && !isOpen
              ? value
              : allowAll && value === 'All' && !isOpen
                ? allLabel
                : placeholder
          }
          className={`w-full pl-8 pr-12 py-2 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 ${
            isDark
              ? 'bg-[#1d1915] border-[#362f24] text-[#f7f4ed] placeholder:text-[#b8afa0] focus:ring-[#c8a45d]/25 focus:border-[#c8a45d]'
              : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-blue-600/20 focus:border-blue-600'
          }`}
        />

        <div className="absolute right-2 flex items-center gap-0.5">
          {((allowAll && value !== 'All') || query.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                if (allowAll) onChange('All');
                inputRef.current?.focus();
                setIsOpen(true);
              }}
              aria-label="Clear selected service"
              className={`p-1 rounded transition-colors ${
                isDark
                  ? 'text-[#9e9484] hover:text-white'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Toggle service directory"
            onClick={() => {
              if (isOpen) {
                setIsOpen(false);
                setQuery('');
              } else {
                setIsOpen(true);
                setQuery('');
                inputRef.current?.focus();
              }
            }}
            className={`p-1 rounded transition-colors ${
              isDark
                ? 'text-[#c8a45d] hover:text-[#f0d596]'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {isOpen && (
        <ul
          role="listbox"
          className={`absolute z-50 mt-1.5 w-full min-w-[260px] rounded-lg shadow-2xl max-h-64 overflow-y-auto border divide-y ${
            isDark
              ? 'bg-[#1a1713] border-[#3d3426] divide-[#2b251d]'
              : 'bg-white border-slate-200 divide-slate-100'
          }`}
        >
          {selectableItems.length === 0 ? (
            <li
              className={`px-3 py-3 text-xs ${
                isDark ? 'text-[#a89f90]' : 'text-slate-500'
              }`}
            >
              No matching service in directory. Try another letter.
            </li>
          ) : (
            selectableItems.map((item, idx) => {
              const active = idx === highlightedIdx;
              const isSelected =
                (item.name === allLabel && value === 'All') || item.name === value;
              return (
                <li key={item.key} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    onClick={() => commitSelection(item.name)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                      active
                        ? isDark
                          ? 'bg-[#2a241b] text-[#f7f4ed]'
                          : 'bg-blue-50 text-blue-900'
                        : isDark
                          ? 'text-[#e5decb] hover:bg-[#241f17]'
                          : 'text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`text-xs truncate ${
                        item.isGroup ? 'font-semibold' : 'font-medium'
                      }`}
                    >
                      {renderHighlightedName(item.name)}
                    </span>
                    <span
                      className={`text-[10px] shrink-0 truncate max-w-[130px] ${
                        isDark ? 'text-[#9b9180]' : 'text-slate-400'
                      }`}
                    >
                      {item.subtitle}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
