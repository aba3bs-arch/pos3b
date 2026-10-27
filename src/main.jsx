import React from 'react';
import ReactDOM from 'react-dom/client';
import { initSupabaseClient } from './lib/supabase.js';
import { aplicarTemaInterfaz } from './lib/temasInterfaz.js';
import App from './App.jsx';
import ErrorBoundaryApp from './components/ErrorBoundaryApp.jsx';
import './index.css';

initSupabaseClient();
aplicarTemaInterfaz();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundaryApp>
      <App />
    </ErrorBoundaryApp>
  </React.StrictMode>
);
