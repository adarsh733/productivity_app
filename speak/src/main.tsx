import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ensureSeeded } from './db/seedLoader';
import './styles/index.css';

async function boot() {
  if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }
    } catch (e) {
      console.warn('[boot] dev sw unregister failed', e);
    }
  }

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
