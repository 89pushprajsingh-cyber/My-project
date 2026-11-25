/// <reference types="google.maps" />
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Search, X } from 'lucide-react';
import { LatLngPoint } from '../types';

interface PlacesSearchInputProps {
  placeholder?: string;
  initialValue?: string;
  onLocationSelected: (result: {
    address: string;
    location: LatLngPoint;
  }) => void;
  className?: string;
}

export function PlacesSearchInput({
  placeholder = 'Search area, street, or city',
  initialValue = '',
  onLocationSelected,
  className = '',
}: PlacesSearchInputProps) {
  const placesLib = useMapsLibrary('places');
  const [inputValue, setInputValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = inputValue.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        setIsLoading(true);
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
        });
        setSuggestions(res.suggestions ?? []);
        setIsOpen((res.suggestions ?? []).length > 0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT') || msg.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 240);

    return () => window.clearTimeout(timer);
  }, [placesLib, inputValue]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        });
        const loc = place.location;
        if (loc) {
          const resolvedAddress =
            place.formattedAddress ||
            place.displayName ||
            suggestion.placePrediction.text.text;
          setInputValue(resolvedAddress);
          setIsOpen(false);
          setSuggestions([]);
          onLocationSelected({
            address: resolvedAddress,
            location: { lat: loc.lat(), lng: loc.lng() },
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT') || msg.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      } finally {
        sessionTokenRef.current = null;
      }
    },
    [placesLib, onLocationSelected]
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
        />
        {inputValue && (
          <button
            type="button"
            onClick={() => {
              setInputValue('');
              setSuggestions([]);
              setIsOpen(false);
            }}
            aria-label="Clear location search"
            className="absolute right-2.5 text-slate-400 hover:text-slate-700 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-40 mt-1.5 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
          {suggestions.map((suggestion, idx) => {
            const label = suggestion.placePrediction?.text.text || '';
            if (!label) return null;
            return (
              <li key={`${label}-${idx}`}>
                <button
                  type="button"
                  onClick={() => void handleSelectSuggestion(suggestion)}
                  className="w-full text-left px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-start gap-2.5 transition-colors"
                >
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{label}</span>
                </button>
              </li>
            );
          })}
          {isLoading && (
            <li className="px-3 py-2 text-xs text-slate-400">Searching places...</li>
          )}
        </ul>
      )}
    </div>
  );
}
