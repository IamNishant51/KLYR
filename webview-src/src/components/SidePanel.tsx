import React, { memo } from 'react';
import DiffViewer from './DiffViewer';
import type {
  ContextReference,
  DiffChange,
  GhostSuggestion,
  InspectorTab,
  Plan,
} from '../types';

interface SidePanelProps {
  plan: Plan | null;
  contextRefs: ContextReference[];
  diffPreview: DiffChange[];
  ghostSuggestion: GhostSuggestion | null;
  onApplyDiff: () => void;
  onRejectDiff: () => void;
  onAcceptSuggestion: () => void;
  onModifySuggestion: (seedText: string) => void;
  onRejectSuggestion: () => void;
  compact: boolean;
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
}

function SidePanel({
  plan,
  contextRefs,
  diffPreview,
  ghostSuggestion,
  onApplyDiff,
  onRejectDiff,
  onAcceptSuggestion,
  onModifySuggestion,
  onRejectSuggestion,
  compact,
  activeTab,
  onTabChange,
}: SidePanelProps) {
  const contentLossFiles = diffPreview.filter((change) => {
    if (change.operation !== 'update' || !change.diff) {
      return false;
    }

    const lines = change.diff.split(/\r?\n/);
    let removedLines = 0;
    let addedLines = 0;
    for (const line of lines) {
      if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
        continue;
      }
      if (line.startsWith('-')) {
        removedLines += 1;
      }
      if (line.startsWith('+')) {
        addedLines += 1;
      }
    }

    return removedLines > addedLines + 5;
  });

  if (compact) {
    return (
      <aside className="border-t border-white/5 bg-[#0f141a]/90 px-3 pb-3 pt-3 backdrop-blur-xl sm:px-4">
        <ContentLossWarning files={contentLossFiles} />
        <div className="klyr-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
          {INSPECTOR_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onTabChange(tab.value)}
              className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                activeTab === tab.value
                  ? 'bg-emerald-400/[0.12] text-emerald-200 shadow-[0_8px_20px_rgba(16,185,129,0.16)]'
                  : 'bg-white/[0.03] text-slate-500 hover:bg-white/[0.06] hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="max-h-[21rem] overflow-hidden rounded-[28px] border border-white/7 bg-[#11161c] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.24)]">
          <div className="klyr-scrollbar h-full overflow-y-auto pr-1">
            {renderActiveTab(
              activeTab,
              plan,
              contextRefs,
              diffPreview,
              ghostSuggestion,
              onApplyDiff,
              onRejectDiff,
              onAcceptSuggestion,
              onModifySuggestion,
              onRejectSuggestion,
              true
            )}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="klyr-scrollbar overflow-y-auto border-l border-white/5 bg-[#0f141a]/78 p-4">
      <div className="space-y-4">
        <ContentLossWarning files={contentLossFiles} />
        <SectionCard eyebrow="Inline Assist" title="Ghost Suggestion">
          <GhostSuggestionPanel
            ghostSuggestion={ghostSuggestion}
            onAcceptSuggestion={onAcceptSuggestion}
            onModifySuggestion={onModifySuggestion}
            onRejectSuggestion={onRejectSuggestion}
          />
        </SectionCard>

        <SectionCard eyebrow="Execution" title="Plan">
          {plan ? (
            <div className="space-y-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Intent</div>
                <div className="mt-1 text-sm font-medium text-slate-100">{plan.intent}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Summary</div>
                <div className="mt-1 text-sm leading-7 text-slate-300">{plan.summary}</div>
              </div>
              {plan.steps.length > 0 ? (
                <ol className="space-y-2">
                  {plan.steps.map((step, index) => (
                    <li key={`${step}-${index}`} className="flex gap-3 rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-3">
                      <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-emerald-400/[0.12] text-center text-xs font-medium leading-6 text-emerald-200">
                        {index + 1}
                      </span>
                      <span className="text-sm leading-7 text-slate-300">{step}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : (
            <Placeholder copy="A structured plan appears here once Klyr starts reasoning about your request." />
          )}
        </SectionCard>

        <SectionCard eyebrow="Workspace" title="Context">
          {contextRefs.length > 0 ? (
            <div className="space-y-2">
              {contextRefs.map((reference) => (
                <div
                  key={`${reference.path}-${reference.source}`}
                  className="rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-3"
                >
                  <div className="truncate font-mono text-[12px] text-slate-200">{reference.path}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {reference.source}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Placeholder copy="Relevant files and retrieval reasons show up here after Klyr scans the workspace." />
          )}
        </SectionCard>

        <SectionCard eyebrow="Review" title="Diff Preview">
          <DiffViewer changes={diffPreview} onApply={onApplyDiff} onReject={onRejectDiff} />
        </SectionCard>
      </div>
    </aside>
  );
}

function renderActiveTab(
  activeTab: InspectorTab,
  plan: Plan | null,
  contextRefs: ContextReference[],
  diffPreview: DiffChange[],
  ghostSuggestion: GhostSuggestion | null,
  onApplyDiff: () => void,
  onRejectDiff: () => void,
  onAcceptSuggestion: () => void,
  onModifySuggestion: (seedText: string) => void,
  onRejectSuggestion: () => void,
  compact: boolean
) {
  switch (activeTab) {
    case 'plan':
      return plan ? (
        <div className="space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Intent</div>
            <div className="mt-1 text-sm font-medium text-slate-100">{plan.intent}</div>
          </div>
          <div className="text-sm leading-7 text-slate-300">{plan.summary}</div>
          <div className="space-y-2">
            {plan.steps.map((step, index) => (
              <div key={`${step}-${index}`} className="rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-3 text-sm leading-7 text-slate-300">
                <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/[0.12] text-xs text-emerald-200">
                  {index + 1}
                </span>
                {step}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Placeholder copy="No plan yet. Send a prompt and Klyr will outline the next steps." />
      );
    case 'context':
      return contextRefs.length > 0 ? (
        <div className="space-y-2">
          {contextRefs.map((reference) => (
            <div
              key={`${reference.path}-${reference.source}`}
              className="rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-3"
            >
              <div className="truncate font-mono text-[12px] text-slate-200">{reference.path}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                {reference.source}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Placeholder copy="Relevant files will show up here once Klyr retrieves workspace context." />
      );
    case 'diff':
      return <DiffViewer changes={diffPreview} onApply={onApplyDiff} onReject={onRejectDiff} compact={compact} />;
    case 'ghost':
    default:
      return (
        <GhostSuggestionPanel
          ghostSuggestion={ghostSuggestion}
          onAcceptSuggestion={onAcceptSuggestion}
          onModifySuggestion={onModifySuggestion}
          onRejectSuggestion={onRejectSuggestion}
        />
      );
  }
}

function GhostSuggestionPanel({
  ghostSuggestion,
  onAcceptSuggestion,
  onModifySuggestion,
  onRejectSuggestion,
}: {
  ghostSuggestion: GhostSuggestion | null;
  onAcceptSuggestion: () => void;
  onModifySuggestion: (seedText: string) => void;
  onRejectSuggestion: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-white/7 bg-[#0d1218] px-4 py-4 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
              {ghostSuggestion?.title || 'Ghost Text'}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-100">
              {ghostSuggestion?.source || 'Inline editor completions stay available while you work.'}
            </div>
          </div>
          <span className="rounded-full bg-emerald-400/[0.12] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-200">
            Inline
          </span>
        </div>

        <div className="mt-4 rounded-[20px] border border-white/6 bg-white/[0.03] px-3 py-3 font-mono text-[12px] italic leading-6 text-slate-400">
          {ghostSuggestion?.preview || 'Inline suggestions appear as dim ghost text in the editor. Press Tab there to accept, or refine the idea from this panel.'}
        </div>

        <div className="mt-4 text-xs leading-6 text-slate-500">
          {ghostSuggestion?.hint || 'Typing dismisses an inline suggestion. Klyr keeps the panel and editor aligned so you can review before applying larger drafts.'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="klyr-action-button rounded-full px-3 py-2.5 text-sm font-medium text-white" onClick={onAcceptSuggestion}>
          Accept
        </button>
        <button
          type="button"
          className="klyr-secondary-button rounded-full px-3 py-2.5 text-sm font-medium text-slate-200"
          onClick={() => onModifySuggestion(ghostSuggestion?.preview || '')}
        >
          Modify
        </button>
        <button
          type="button"
          className="klyr-secondary-button rounded-full px-3 py-2.5 text-sm font-medium text-slate-200"
          onClick={onRejectSuggestion}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/7 bg-[#11161c] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.24)]">
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.28em] text-slate-600">{eyebrow}</div>
        <h3 className="mt-1 text-sm font-semibold text-slate-100">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Placeholder({ copy }: { copy: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/8 bg-white/[0.02] px-4 py-5 text-sm leading-7 text-slate-500">
      {copy}
    </div>
  );
}

function ContentLossWarning({ files }: { files: DiffChange[] }) {
  if (files.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[24px] border border-red-700/70 bg-red-900/25 px-4 py-4 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
      <div className="text-[10px] uppercase tracking-[0.28em] text-red-200">Warning</div>
      <h3 className="mt-1 text-sm font-semibold text-red-100">Potential Content Loss Detected</h3>
      <p className="mt-2 text-sm leading-7 text-red-100/90">
        These update diffs remove substantially more lines than they add. Review carefully before applying.
      </p>
      <ul className="mt-3 space-y-1 text-xs text-red-100/90">
        {files.map((file, index) => (
          <li key={`${file.path}-${index}`} className="truncate font-mono">
            {file.path}
          </li>
        ))}
      </ul>
    </section>
  );
}

const INSPECTOR_TABS: Array<{ label: string; value: InspectorTab }> = [
  { label: 'Ghost', value: 'ghost' },
  { label: 'Plan', value: 'plan' },
  { label: 'Context', value: 'context' },
  { label: 'Diff', value: 'diff' },
];

export default memo(SidePanel);
