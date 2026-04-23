import React, { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, FileCode, Plus, Minus } from 'lucide-react';
import type { DiffChange } from '../types';

interface DiffViewerProps {
  changes: DiffChange[];
  onApply: () => void;
  onReject: () => void;
  compact?: boolean;
}

interface DiffBlock {
  id: string;
  type: 'addition' | 'deletion' | 'context';
  lines: string[];
}

function DiffViewer({ changes, onApply, onReject, compact = false }: DiffViewerProps) {
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  
  if (changes.length === 0) {
    return (
      <div 
        className={`border border-dashed rounded-xl p-6 text-center ${compact ? 'text-[13px]' : 'text-sm'}`}
        style={{ 
          borderColor: 'var(--k-border)', 
          background: 'rgba(255,255,255,0.02)',
          color: 'var(--k-muted)' 
        }}
      >
        No changes pending. Your draft edits will appear here.
      </div>
    );
  }

  const toggleBlock = (id: string) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {changes.map((change, changeIndex) => {
        const stats = getDiffStats(change.diff);
        const blocks = parseDiffIntoBlocks(change.diff, change.path);
        
        return (
          <motion.section
            key={`${change.path}-${change.summary}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: changeIndex * 0.1 }}
            className="surface-elevated rounded-xl overflow-hidden"
          >
            {/* Header - Bento style */}
            <div 
              className={`flex items-start justify-between gap-3 px-4 py-3 border-b bento-hover cursor-pointer`}
              style={{ borderColor: 'var(--k-border)' }}
              onClick={() => toggleBlock(change.path)}
            >
              <div className="min-w-0 flex items-center gap-3">
                <div 
                  className="p-1.5 rounded-lg shrink-0"
                  style={{ background: 'rgba(59, 130, 246, 0.1)' }}
                >
                  <FileCode size={14} style={{ color: 'var(--k-accent)' }} />
                </div>
                <div>
                  <div 
                    className="font-mono text-[13px] truncate"
                    style={{ color: 'var(--k-fg)' }}
                  >
                    {change.path}
                  </div>
                  <div 
                    className="text-[11px] mt-0.5 truncate max-w-[280px]"
                    style={{ color: 'var(--k-muted)' }}
                  >
                    {change.summary}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Operation badge */}
                <span 
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider"
                  style={{ 
                    background: getOperationBg(change.operation),
                    color: getOperationColor(change.operation)
                  }}
                >
                  {change.operation}
                </span>
                
                {/* Stats */}
                <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--k-success)' }}>
                  <Plus size={10} />
                  {stats.additions}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--k-danger)' }}>
                  <Minus size={10} />
                  {stats.deletions}
                </span>

                {/* Expand indicator */}
                <motion.div
                  animate={{ rotate: expandedBlocks.has(change.path) ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--k-muted)' }}>
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.div>
              </div>
            </div>

            {/* Diff content with high-fidelity colors */}
            <AnimatePresence>
              {expandedBlocks.has(change.path) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="klyr-scrollbar max-h-[400px] overflow-auto"
                  style={{ background: 'rgba(0,0,0,0.2)' }}
                >
                  {blocks.map((block, blockIndex) => (
                    <DiffBlockView key={`${change.path}-block-${blockIndex}`} block={block} compact={compact} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        );
      })}

      {/* Action buttons */}
      <div className={`flex gap-3 ${compact ? 'flex-col' : 'flex-row'}`}>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white ai-gradient ai-glow"
          onClick={onApply}
        >
          <Check size={16} />
          Accept Changes
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium surface-elevated border"
          style={{ borderColor: 'var(--k-border)', color: 'var(--k-muted)' }}
          onClick={onReject}
        >
          <X size={16} />
          Reject All
        </motion.button>
      </div>
    </div>
  );
}

function DiffBlockView({ block, compact }: { block: DiffBlock; compact: boolean }) {
  const isAdd = block.type === 'addition';
  const isDel = block.type === 'deletion';
  
  return (
    <div 
      className={`py-1 ${isAdd ? 'diff-addition' : isDel ? 'diff-deletion' : ''}`}
    >
      {block.lines.map((line, lineIndex) => {
        const lineKind = line.startsWith('@@') ? 'meta' : 
                         line.startsWith('+') ? 'add' : 
                         line.startsWith('-') ? 'remove' : 'context';
        
        return (
          <div
            key={`${block.id}-${lineIndex}`}
            className={`grid grid-cols-[auto_1fr] font-mono ${compact ? 'gap-2 px-3 py-0.5 text-[11px]' : 'gap-3 px-4 py-0.5 text-[12px]'}`}
            style={{ 
              color: lineKind === 'add' ? 'var(--k-success)' : 
                     lineKind === 'remove' ? 'var(--k-danger)' : 
                     lineKind === 'meta' ? 'var(--k-accent)' : 'var(--k-muted)'
            }}
          >
            <span className="select-none opacity-60 w-4 text-center">
              {lineKind === 'meta' ? '@' : line[0] || ' '}
            </span>
            <span className="whitespace-pre-wrap break-all">
              {lineKind === 'meta' ? line : line.slice(1) || ' '}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function parseDiffIntoBlocks(diff: string, path: string): DiffBlock[] {
  const lines = diff.split(/\r?\n/);
  const blocks: DiffBlock[] = [];
  let currentBlock: DiffBlock | null = null;
  
  lines.forEach((line, index) => {
    const kind = line.startsWith('@@') ? 'meta' :
                 line.startsWith('+') ? 'addition' :
                 line.startsWith('-') ? 'deletion' : 'context';
    
    if (!currentBlock || currentBlock.type !== kind) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        id: `${path}-block-${index}`,
        type: kind as DiffBlock['type'],
        lines: [line]
      };
    } else {
      currentBlock.lines.push(line);
    }
  });
  
  if (currentBlock) blocks.push(currentBlock);
  return blocks;
}

function getDiffStats(diff: string) {
  const lines = diff.split(/\r?\n/);
  return {
    additions: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
    deletions: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
  };
}

function getOperationBg(operation: string): string {
  switch (operation) {
    case 'create': return 'rgba(34, 197, 94, 0.15)';
    case 'update': return 'rgba(59, 130, 246, 0.15)';
    case 'delete': return 'rgba(239, 68, 68, 0.15)';
    default: return 'rgba(107, 114, 128, 0.15)';
  }
}

function getOperationColor(operation: string): string {
  switch (operation) {
    case 'create': return '#22C55E';
    case 'update': return '#3B82F6';
    case 'delete': return '#EF4444';
    default: return '#6B7280';
  }
}

export default memo(DiffViewer);