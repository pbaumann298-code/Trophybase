import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminMicroAppShell from '../AdminMicroAppShell';
import CommunityReportsPanel from '../../components/admin/CommunityReportsPanel';

createRoot(document.getElementById('micro-app-root')).render(
  <StrictMode>
    <AdminMicroAppShell appId="reports">
      <CommunityReportsPanel />
    </AdminMicroAppShell>
  </StrictMode>,
);
