import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClaimPage } from '../../src/claim-intake/ClaimPage';
import './claim.css';

// Standalone entry for /claim: no tabs, no policy API, no shared app state.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClaimPage />
  </StrictMode>,
);
