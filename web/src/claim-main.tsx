import { AuthProvider } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { configureClaimsClient } from '../../src/claim-intake/adapter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClaimPage } from '../../src/claim-intake/ClaimPage';
import './claim.css';

configureClaimsClient(supabase);

// Standalone entry for /claim: no tabs, no policy API, no shared app state.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider><ClaimPage /></AuthProvider>
  </StrictMode>,
);
