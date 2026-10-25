import React from 'react';
import { createRoot } from 'react-dom/client';
import './modules/pix/implementation/index.css';
import './styles/app.css';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
