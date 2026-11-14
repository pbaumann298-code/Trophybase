import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminMicroAppShell from '../AdminMicroAppShell';
import IntranetDrafts from '../../components/intranet/IntranetDrafts';
import { readDraftReturnContext } from '../../lib/adminAccess';

const draftCtx = readDraftReturnContext();
const urlSource = new URLSearchParams(window.location.search).get('source');
const initialSource = urlSource === 'fertig_review' ? 'fertig_review' : 'staging';
const initialGameId = draftCtx?.gameId || null;

createRoot(document.getElementById('micro-app-root')).render(
  <StrictMode>
    <AdminMicroAppShell appId="drafts">
      <IntranetDrafts initialDataSource={initialSource} initialGameId={initialGameId} />
    </AdminMicroAppShell>
  </StrictMode>,
);
