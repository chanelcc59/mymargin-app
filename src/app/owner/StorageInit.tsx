'use client';

import { useEffect } from 'react';
import { seedDemoData } from '@/lib/store';

export function StorageInit() {
  useEffect(() => {
    seedDemoData();
  }, []);
  return null;
}
