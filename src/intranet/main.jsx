import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import IntranetApp from './IntranetApp.jsx';

createRoot(document.getElementById('intranet-root')).render(
  <StrictMode>
    <IntranetApp />
  </StrictMode>,
);
