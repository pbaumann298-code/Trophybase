import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../pages/supabaseClient';
import { fetchCommunityReports, setReportStatus } from '../../lib/communityReportAdmin';
import { parseReportImageUrls } from '../../lib/errorReport';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('de-DE');
  } catch {
    return iso;
  }
}

function ReportEvidenceLinks({ imageUrl }) {
  const urls = parseReportImageUrls(imageUrl);
  if (urls.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url, idx) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block relative group"
        >
          <img
            src={url}
            alt={`Beleg ${idx + 1}`}
            className="h-16 w-16 object-cover rounded-lg border border-zinc-800 hover:border-sky-500/50 transition-colors"
          />
          <span className="absolute inset-0 flex items-end justify-center pb-0.5 text-[8px] font-mono text-white bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
            #{idx + 1}
          </span>
        </a>
      ))}
    </div>
  );
}

function ReportCard({ report, onAction, busyId }) {
  const isBusy = busyId === report.id;

  return (
    <article className="rounded-xl border border-zinc-800 bg-[#121314] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-mono text-zinc-500 uppercase">
            #{report.id} · {report.content_type} · {report.field_name}
          </p>
          <p className="text-xs font-mono text-zinc-400 mt-0.5">
            {report.source_identifier} / key {report.content_key}
          </p>
        </div>
        <span className="text-[10px] font-mono text-zinc-600">{formatDate(report.created_at)}</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-3">
          <p className="text-zinc-500 mb-1 uppercase text-[10px] font-mono">original_text</p>
          <p className="text-zinc-300 break-words">{report.original_text}</p>
        </div>
        <div className="rounded-lg bg-[#00ff66]/5 border border-[#00ff66]/20 p-3">
          <p className="text-[#00ff66]/70 mb-1 uppercase text-[10px] font-mono">suggested_text</p>
          <p className="text-zinc-200 break-words">{report.suggested_text}</p>
        </div>
      </div>

      {report.image_url && <ReportEvidenceLinks imageUrl={report.image_url} />}

      {report.status === 'pending' && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onAction(report, 'approved')}
            className="px-4 py-2 rounded-lg bg-[#00ff66] text-[#121314] text-xs font-bold hover:bg-[#00dd55] disabled:opacity-50"
          >
            {isBusy ? '…' : 'Approve & DB updaten'}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onAction(report, 'rejected')}
            className="px-4 py-2 rounded-lg border border-red-900/50 text-red-400 text-xs font-bold hover:bg-red-500/10 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </article>
  );
}

function LogRow({ report }) {
  const statusColor =
    report.status === 'approved'
      ? 'text-[#00ff66] border-[#00ff66]/30 bg-[#00ff66]/5'
      : 'text-red-400 border-red-500/30 bg-red-500/5';

  return (
    <tr className="border-b border-zinc-800/80 hover:bg-zinc-900/30">
      <td className="py-2.5 px-3 text-xs font-mono text-zinc-500">#{report.id}</td>
      <td className="py-2.5 px-3 text-xs">
        <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-mono uppercase ${statusColor}`}>
          {report.status}
        </span>
      </td>
      <td className="py-2.5 px-3 text-xs font-mono text-zinc-400">{report.source_identifier}</td>
      <td className="py-2.5 px-3 text-xs text-zinc-300 max-w-[200px] truncate" title={report.original_text}>
        {report.original_text}
      </td>
      <td className="py-2.5 px-3 text-xs text-zinc-200 max-w-[200px] truncate" title={report.suggested_text}>
        {report.suggested_text}
      </td>
      <td className="py-2.5 px-3 text-[10px] font-mono text-zinc-600 whitespace-nowrap">
        {formatDate(report.created_at)}
      </td>
    </tr>
  );
}

function CommunityReportsPanel() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { reports: rows, error: fetchError } = await fetchCommunityReports(supabase);
    if (fetchError) {
      setError(fetchError.message);
      setReports([]);
    } else {
      setReports(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = useMemo(
    () => reports.filter((r) => r.status === 'pending'),
    [reports],
  );
  const processed = useMemo(
    () => reports.filter((r) => r.status === 'approved' || r.status === 'rejected'),
    [reports],
  );

  const handleAction = async (report, status) => {
    setBusyId(report.id);
    setActionMsg('');
    const { error: actionError } = await setReportStatus(supabase, report.id, status, report);
    setBusyId(null);

    if (actionError) {
      setActionMsg(`Fehler: ${actionError.message}`);
      return;
    }

    setActionMsg(
      status === 'approved'
        ? `Meldung #${report.id} approved – DB aktualisiert.`
        : `Meldung #${report.id} rejected.`,
    );
    await load();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Community Reports</h2>
          <p className="text-sm text-zinc-500">
            Pending manuell prüfen · Approved/Rejected als Log (inkl. Gemini-Läufe)
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-xs font-mono uppercase px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:border-[#00ff66]/40 hover:text-[#00ff66]"
        >
          Aktualisieren
        </button>
      </div>

      {actionMsg && (
        <p className="text-xs text-[#00ff66] bg-[#00ff66]/10 border border-[#00ff66]/25 rounded-lg px-3 py-2">
          {actionMsg}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <section>
        <h3 className="text-sm font-bold text-amber-400 font-mono uppercase tracking-wider mb-3">
          Pending ({pending.length})
        </h3>
        {loading ? (
          <p className="text-sm text-zinc-500">Lade Meldungen…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">Keine offenen Meldungen.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <ReportCard key={r.id} report={r} onAction={handleAction} busyId={busyId} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-bold text-zinc-400 font-mono uppercase tracking-wider mb-3">
          Log · Approved / Rejected ({processed.length})
        </h3>
        {processed.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">Noch keine bearbeiteten Meldungen.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left min-w-[640px]">
              <thead className="bg-[#121314] text-[10px] font-mono uppercase text-zinc-500">
                <tr>
                  <th className="py-2 px-3">ID</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Spiel</th>
                  <th className="py-2 px-3">Original</th>
                  <th className="py-2 px-3">Vorschlag</th>
                  <th className="py-2 px-3">Datum</th>
                </tr>
              </thead>
              <tbody>
                {processed.map((r) => (
                  <LogRow key={r.id} report={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default CommunityReportsPanel;
