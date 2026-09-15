import { useRef } from 'react';
// Native analytics remains disabled; the shared registration UI keeps its lifecycle API.
export function useMedicationRegistrationStep(..._args: unknown[]) { return useRef(null); }
