import React from 'react';

function GameSeoInfobox({ title, description }) {
  const text = typeof description === 'string' ? description.trim() : '';
  if (!text) return null;

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <section
      className="relative mb-8 overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#1a1b1c] via-[#161718] to-[#121314] p-6 md:p-8 shadow-xl"
      aria-label="Spielbeschreibung"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, transparent, transparent 8px, #00ff66 8px, #00ff66 9px)',
        }}
      />
      <div className="pointer-events-none absolute -left-24 -top-24 h-48 w-48 rounded-full bg-[#00ff66]/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-40 w-40 rounded-full bg-emerald-500/5 blur-3xl" />

      <div className="relative border-l-2 border-[#00ff66]/40 pl-5 md:pl-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded border border-[#00ff66]/20 bg-[#00ff66]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#00ff66]">
            <span aria-hidden="true">◆</span> Guide-Info
          </span>
          {title && (
            <h3 className="text-sm font-bold tracking-tight text-zinc-200 md:text-base">
              {title}
            </h3>
          )}
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-zinc-300 md:text-[15px]">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

export default GameSeoInfobox;
