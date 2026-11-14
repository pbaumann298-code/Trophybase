import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminMicroAppShell from '../AdminMicroAppShell';
import WorkflowsView from './WorkflowsView';

createRoot(document.getElementById('micro-app-root')).render(
  <StrictMode>
    <AdminMicroAppShell appId="workflows">
      <WorkflowsView />
    </AdminMicroAppShell>
  </StrictMode>,
);
