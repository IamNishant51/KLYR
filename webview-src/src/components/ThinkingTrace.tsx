import React, { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PanelLayoutMode } from '../App';
import type { ExtensionStatus, ThinkingTraceEntry } from '../types';

interface ThinkingTraceProps {
  currentDetail: string;
  entries: ThinkingTraceEntry[];
  expanded: boolean;
  layoutMode: PanelLayoutMode;
  onToggle: () => void;
}

function ThinkingTrace({
  currentDetail,
  entries,
  expanded,
  layoutMode,
  onToggle,
}: ThinkingTraceProps) {
  const compact = layoutMode !== 'regular';
  const narrow = layoutMode === 'narrow';
  const visibleEntries = entries.slice(-6);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (entries.length === 0) {
      setElapsed(0);
      return;
    }
    
    const startTime = entries[0].createdAt;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [entries]);

  const formatElapsed = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full px-1"
    >
      <div className="surface-elevated rounded-lg overflow-hidden">
        {/* Collapsed State - Pulsing indicator with timer */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={`w-full text-left flex items-center gap-3 ${narrow ? 'py-2.5 px-3' : 'py-3 px-4'} surface-hover transition-colors`}
        >
          <div className="flex items-center gap-2 shrink-0">
            <motion.div
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.6, 1, 0.6]
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="w-2 h-2 rounded-full ai-gradient"
            />
            <span className={`font-medium ai-glow-text ${compact ? 'text-[13px]' : 'text-sm'}`}>
              Thinking
            </span>
            {entries.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-[var(--k-muted)] font-mono">
                {formatElapsed(elapsed)}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <motion.div 
              className={`text-[12px] truncate ${expanded ? '' : ''}`}
              style={{ color: 'var(--k-muted)' }}
            >
              {currentDetail || 'Processing your request...'}
            </motion.div>
          </div>

          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronIcon />
          </motion.div>
        </button>

        {/* Open State - Terminal-style streaming log */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="border-t"
              style={{ borderColor: 'var(--k-border)' }}
            >
              <div className={`${narrow ? 'p-3' : 'p-4'} space-y-2 thought-terminal`}>
                {visibleEntries.length > 0 ? (
                  visibleEntries.map((entry, index) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-start gap-2"
                    >
                      <span 
                        className="text-[10px] font-medium uppercase tracking-wider shrink-0 mt-0.5"
                        style={{ color: getStatusColor(entry.status) }}
                      >
                        {labelForStatus(entry.status)}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--k-muted)' }}>•</span>
                      <span className="text-[11px] flex-1" style={{ color: 'var(--k-fg)' }}>
                        {entry.detail}
                      </span>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--k-muted)', opacity: 0.6 }}>
                        {formatRelativeTime(entry.createdAt)}
                      </span>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-[12px] flex items-center gap-2" style={{ color: 'var(--k-muted)' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-klyr-pulse" />
                    <span>Waiting for execution update...</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

function getStatusColor(status: ExtensionStatus | undefined): string {
  switch (status) {
    case 'planning': return '#3B82F6';
    case 'retrieving': return '#8B5CF6';
    case 'thinking': return '#F59E0B';
    case 'validating': return '#06B6D4';
    case 'executing': return '#10B981';
    case 'review': return '#22C55E';
    default: return '#6B7280';
  }
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ color: 'var(--k-muted)' }}
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function labelForStatus(status: ExtensionStatus | undefined): string {
  switch (status) {
    case 'planning': return 'PLAN';
    case 'retrieving': return 'FETCH';
    case 'thinking': return 'GEN';
    case 'validating': return 'CHECK';
    case 'executing': return 'RUN';
    case 'review': return 'DONE';
    case 'idle': default: return 'WAIT';
  }
}

function formatRelativeTime(createdAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - createdAt) / 1000));
  if (seconds < 2) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

export default memo(ThinkingTrace);