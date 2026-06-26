import React from 'react';
import ReactDOM from 'react-dom/client';
import { initSupabaseClient } from './lib/supabase.js';
import App from './App.jsx';
import './index.css';

initSupabaseClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
