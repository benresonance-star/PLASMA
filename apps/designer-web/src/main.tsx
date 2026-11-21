import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.js';
import { NorthstarVisualQA } from './ui/NorthstarVisualQA.js';
import './index.css';
import './ui/styles.css';

const storedTheme = window.localStorage.getItem('spds-theme');
document.documentElement.classList.toggle('dark', storedTheme !== 'light');

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    {import.meta.env.DEV && new URLSearchParams(window.location.search).get('northstar-qa') === '1'
      ? <NorthstarVisualQA /> : <App />}
  </StrictMode>,
);
