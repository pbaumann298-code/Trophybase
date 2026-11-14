import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminMicroAppShell from '../AdminMicroAppShell';
import IntranetDrafts from '../../components/intranet/IntranetDrafts';
import { readDraftReturnContext } from '../../lib/adminAccess';

const searchParams = new URLSearchParams(window.location.search);
const urlSource = searchParams.get('source');
const urlGameId = searchParams.get('gameId');
const draftCtx = readDraftReturnContext();
const initialSource =
  urlSource === 'fertig_review'
    ? 'fertig_review'
    : urlSource === 'rohmaterial'
      ? 'rohmaterial'
      : draftCtx?.activeDataSource === 'rohmaterial'
        ? 'rohmaterial'
        : 'staging';
const initialGameId = urlGameId || draftCtx?.gameId || null;

createRoot(document.getElementById('micro-app-root')).render(
  <StrictMode>
    <AdminMicroAppShell appId="drafts">
      <IntranetDrafts initialDataSource={initialSource} initialGameId={initialGameId} />
    </AdminMicroAppShell>
  </StrictMode>,
);
