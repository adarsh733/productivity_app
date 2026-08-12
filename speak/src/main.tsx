import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ensureSeeded } from './db/seedLoader';
import './styles/tokens.css';
import './styles/components.css';

async function boot() {
  // Seeding must never be able to stop the app opening. A content problem
  // shows an emptier feed; it does not show a white screen.
  try {
    await ensureSeeded();
  } catch (e) {
    console.error('[boot] seeding failed', e);
  }

  const el = document.getElementById('root');
  if (!el) throw new Error('#root missing');
  createRoot(el).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
