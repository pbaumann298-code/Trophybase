import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminMicroAppShell from '../AdminMicroAppShell';
import DatabaseView from './DatabaseView';

createRoot(document.getElementById('micro-app-root')).render(
  <StrictMode>
    <AdminMicroAppShell appId="db">
      {({ sessionUser, openInDrafts }) => (
        <DatabaseView sessionUser={sessionUser} onOpenInDrafts={openInDrafts} />
      )}
    </AdminMicroAppShell>
  </StrictMode>,
);
