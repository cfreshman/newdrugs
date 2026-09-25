import { createContext } from 'react';
import type { Destination } from '../shared/navigation';
export const NavigationContext = createContext<((destination: Destination) => void) | null>(null);
