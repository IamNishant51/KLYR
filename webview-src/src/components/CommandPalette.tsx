import React, { memo, useState, useEffect, useRef, useMemo } from 'react';

export interface Command {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  action: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (command: Command) => void;
  searchQuery: string;
  commands: Command[];
  position: { top: number; left: number };
}

function CommandPalette({ isOpen, onClose, onSelect, searchQuery, commands, position }: CommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) return commands;
    const query = searchQuery.toLowerCase().slice(1);
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query)
    );
  }, [commands, searchQuery]);
  
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);
  
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onSelect, onClose]);
  
  useEffect(() => {
    if (menuRef.current) {
      const selectedEl = menuRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);
  
  if (!isOpen || filteredCommands.length === 0) {
    return null;
  }
  
  return (
    <div
      ref={menuRef}
      className="fixed z-50 overflow-hidden rounded-lg border shadow-xl animate-klyr-popup"
      style={{
        top: position.top,
        left: position.left,
        minWidth: '280px',
        maxWidth: '400px',
        maxHeight: '320px',
        background: 'var(--k-surface)',
        borderColor: 'var(--k-input-border)',
      }}
    >
      <div className="overflow-y-auto p-1 klyr-scrollbar" style={{ maxHeight: '320px' }}>
        {filteredCommands.map((command, index) => (
          <button
            key={command.id}
            type="button"
            data-index={index}
            className={`flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
              index === selectedIndex ? 'bg-[var(--k-selection)]' : 'hover:bg-color-mix(in srgb, var(--k-surface) 80%, transparent)'
            }`}
            onClick={() => onSelect(command)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div
              className="flex-shrink-0 rounded-md p-1.5"
              style={{ background: 'color-mix(in srgb, var(--k-accent) 15%, transparent)' }}
            >
              {command.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium" style={{ color: 'var(--k-fg)' }}>
                {command.name}
              </div>
              <div className="truncate text-xs" style={{ color: 'var(--k-muted)' }}>
                {command.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export const defaultCommands: Command[] = [
  {
    id: 'explain',
    name: 'Explain',
    description: 'Explain the selected code or current file',
    icon: <ExplainIcon />,
    action: '/explain',
  },
  {
    id: 'fix',
    name: 'Fix',
    description: 'Fix errors in current file or selection',
    icon: <FixIcon />,
    action: '/fix',
  },
  {
    id: 'refactor',
    name: 'Refactor',
    description: 'Refactor the selected code',
    icon: <RefactorIcon />,
    action: '/refactor',
  },
  {
    id: 'test',
    name: 'Test',
    description: 'Generate tests for the selected code',
    icon: <TestIcon />,
    action: '/test',
  },
  {
    id: 'search',
    name: 'Search',
    description: 'Search the codebase for patterns',
    icon: <SearchIcon />,
    action: '/search',
  },
  {
    id: 'document',
    name: 'Document',
    description: 'Add documentation to the selected code',
    icon: <DocumentIcon />,
    action: '/document',
  },
  {
    id: 'review',
    name: 'Review',
    description: 'Review code for issues and improvements',
    icon: <ReviewIcon />,
    action: '/review',
  },
];

function ExplainIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" strokeLinecap="round" />
    </svg>
  );
}

function FixIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function RefactorIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    </svg>
  );
}

function TestIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default memo(CommandPalette);