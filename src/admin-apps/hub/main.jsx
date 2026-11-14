import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminMicroAppShell from '../AdminMicroAppShell';
import HubView from './HubView';

createRoot(document.getElementById('micro-app-root')).render(
  <StrictMode>
    <AdminMicroAppShell appId="hub" title="TB App-Zentrale" iconSrc="/icons/apps/hub-192.png">
      <HubView />
    </AdminMicroAppShell>
  </StrictMode>,
);
