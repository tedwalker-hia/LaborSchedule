'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface SelectedHotelContextType {
  hotelName: string | null;
  setHotelName: (name: string | null) => void;
}

const SelectedHotelContext = createContext<SelectedHotelContextType | undefined>(undefined);

const STORAGE_KEY = 'selectedHotel';

export function SelectedHotelProvider({ children }: { children: ReactNode }) {
  const [hotelName, setHotelNameState] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setHotelNameState(saved);
  }, []);

  const setHotelName = useCallback((name: string | null) => {
    setHotelNameState(name);
    if (name) {
      localStorage.setItem(STORAGE_KEY, name);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <SelectedHotelContext.Provider value={{ hotelName, setHotelName }}>
      {children}
    </SelectedHotelContext.Provider>
  );
}

export function useSelectedHotel() {
  const ctx = useContext(SelectedHotelContext);
  if (ctx === undefined) {
    throw new Error('useSelectedHotel must be used within a SelectedHotelProvider');
  }
  return ctx;
}
