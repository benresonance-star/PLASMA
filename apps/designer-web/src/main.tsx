import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.js';
import { WallWorkbench } from './ui/WallWorkbench.js';
import './index.css';
import './ui/styles.css';

const storedTheme = window.localStorage.getItem('spds-theme');
document.documentElement.classList.toggle('dark', storedTheme !== 'light');
const wallStage = new URLSearchParams(window.location.search).get('stage') === 'walls';
document.documentElement.classList.toggle('wall-stage', wallStage);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(<StrictMode>{wallStage ? <WallWorkbench /> : <App />}</StrictMode>);
