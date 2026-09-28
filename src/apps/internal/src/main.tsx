import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyBranding } from './branding';
import './styles.css';

applyBranding();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
