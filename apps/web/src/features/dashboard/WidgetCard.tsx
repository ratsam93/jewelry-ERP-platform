'use client';

import * as React from 'react';
import { EyeOff, GripVertical } from 'lucide-react';
import { cn } from '@caratflow/ui';
import { SPAN_CLASSES, type WidgetId, type WidgetSpan } from './layout';

interface WidgetCardProps {
  id: WidgetId;
  span: WidgetSpan;
  title: string;
  editMode: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onHide: (id: WidgetId) => void;
  onDragStart: (id: WidgetId) => void;
  onDragOver: (id: WidgetId) => void;
  onDrop: (id: WidgetId) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}

/**
 * Grid cell for one dashboard widget. In edit mode the cell is draggable
 * (native HTML5 DnD) and shows a grip + hide control. The widget body renders
 * its own card chrome.
 */
export function WidgetCard({
  id,
  span,
  title,
  editMode,
  isDragging,
  isDropTarget,
  onHide,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  children,
}: WidgetCardProps) {
  return (
    <div
      role="group"
      aria-label={title}
      draggable={editMode}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        // Firefox requires data to be set for the drag to start.
        e.dataTransfer.setData('text/plain', id);
        onDragStart(id);
      }}
      onDragOver={(e) => {
        if (!editMode) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(id);
      }}
      onDrop={(e) => {
        if (!editMode) return;
        e.preventDefault();
        onDrop(id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        SPAN_CLASSES[span],
        'relative min-w-0',
        // pt-12 reserves a row for the toolbar so it never covers KPI icons / card headers.
        editMode && 'cursor-move rounded-lg pt-12 ring-2 ring-dashed ring-primary/40',
        isDragging && 'opacity-40',
        isDropTarget && !isDragging && 'ring-primary',
      )}
    >
      {editMode && (
        <div className="absolute right-2 top-1 z-10 flex items-center gap-1 rounded-md border bg-background/95 px-1 py-0.5 shadow-sm">
          <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onHide(id)}
            draggable={false}
            className="inline-flex h-10 w-10 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Hide ${title}`}
            title={`Hide ${title}`}
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
