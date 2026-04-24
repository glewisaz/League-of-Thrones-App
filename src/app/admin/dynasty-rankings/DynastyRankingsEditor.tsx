'use client';

import { useState } from 'react';

const PLACEHOLDER = `rank,name,position
1,Ja'Marr Chase,WR
2,Breece Hall,RB
3,Caleb Williams,QB`;

export default function DynastyRankingsEditor({ currentCount }: { currentCount: number }) {
  const [csv, setCsv] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleImport() {
    if (!csv.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/import-dynasty-rankings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ ok: false, message: data.error ?? 'Import failed' });
      } else {
        setStatus({ ok: true, message: `Imported ${data.imported} players successfully.` });
        setCsv('');
      }
    } catch {
      setStatus({ ok: false, message: 'Network error — check the console.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-neutral-500">
        {currentCount > 0 ? (
          <>Currently <span className="text-neutral-300 font-medium">{currentCount}</span> players in the ranking. Importing will replace all existing rows.</>
        ) : (
          'No rankings loaded yet. Paste CSV below to import.'
        )}
      </div>

      <div>
        <label className="block text-xs text-neutral-500 uppercase tracking-widest mb-2">
          CSV — format: <code className="text-cyan-400">rank,name,position</code>
        </label>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={20}
          className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-100 font-mono resize-y focus:outline-none focus:border-cyan-500"
        />
      </div>

      {status && (
        <p
          className={`text-sm px-3 py-2 rounded ${
            status.ok
              ? 'bg-green-900/40 text-green-300 border border-green-800'
              : 'bg-red-900/40 text-red-300 border border-red-800'
          }`}
        >
          {status.message}
        </p>
      )}

      <button
        onClick={handleImport}
        disabled={loading || !csv.trim()}
        className="px-5 py-2 bg-cyan-500 text-neutral-950 font-semibold rounded text-sm hover:bg-cyan-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Importing…' : 'Import Rankings'}
      </button>
    </div>
  );
}
