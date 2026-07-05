import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensors,
  useSensor,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ModalPortal from './ModalPortal';
import { displayTemplatesApi, DisplayTypeTemplate } from '../api/displayTemplates';
import { DISPLAY_COMPONENTS, ComponentType, COMPONENT_TYPE_LIST } from '../constants/displayComponents';

// --- Types ---

interface OrientationLayout {
  columns?: string;
  rows?: string;
  gap?: string;
  areas: string[][];
}

interface LayoutConfig {
  landscape: OrientationLayout;
  portrait: OrientationLayout;
}

interface TemplateComponent {
  id: string;
  type: ComponentType;
  config: Record<string, unknown>;
  gridArea?: {
    landscape?: string;
    portrait?: string;
  };
}

type Orientation = 'landscape' | 'portrait';

// --- Presets ---

const DEFAULT_LAYOUT: LayoutConfig = {
  landscape: { areas: [['main']] },
  portrait: { areas: [['main']] },
};

interface LayoutPreset {
  label: string;
  layout: LayoutConfig;
}

const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    label: 'Single Column',
    layout: {
      landscape: { areas: [['main']] },
      portrait: { areas: [['main']] },
    },
  },
  {
    label: 'Two Column',
    layout: {
      landscape: { columns: '1fr 1fr', areas: [['left', 'right']] },
      portrait: { rows: '1fr 1fr', areas: [['top'], ['bottom']] },
    },
  },
  {
    label: 'Two Column (40/60)',
    layout: {
      landscape: { columns: '40% 60%', areas: [['left', 'right']] },
      portrait: { rows: '45% 55%', areas: [['top'], ['bottom']] },
    },
  },
  {
    label: 'Two Column (60/40)',
    layout: {
      landscape: { columns: '60% 40%', areas: [['left', 'right']] },
      portrait: { rows: '55% 45%', areas: [['top'], ['bottom']] },
    },
  },
  {
    label: '2x2 Grid',
    layout: {
      landscape: { columns: '1fr 1fr', rows: '1fr 1fr', areas: [['tl', 'tr'], ['bl', 'br']] },
      portrait: { columns: '1fr 1fr', rows: '1fr 1fr', areas: [['tl', 'tr'], ['bl', 'br']] },
    },
  },
];

// --- Helpers ---

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// Parse stored template content. `failed` is true when a non-empty value could
// not be parsed — in that case the editor falls back to empty/default, and saving
// would silently overwrite the real stored data, so callers must guard on it.
function parseComponents(json: string): { components: TemplateComponent[]; failed: boolean } {
  if (!json || json.trim() === '') return { components: [], failed: false };
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return { components: [], failed: true };
    const components = arr.map((c: { type: string; config?: Record<string, unknown>; gridArea?: { landscape?: string; portrait?: string } | string }) => ({
      id: generateId(),
      type: c.type as ComponentType,
      config: c.config || {},
      ...(c.gridArea && {
        gridArea: typeof c.gridArea === 'string'
          ? { landscape: c.gridArea, portrait: c.gridArea }
          : c.gridArea,
      }),
    }));
    return { components, failed: false };
  } catch { return { components: [], failed: true }; }
}

function parseLayout(json: string | null): { layout: LayoutConfig; failed: boolean } {
  if (!json) return { layout: DEFAULT_LAYOUT, failed: false };
  try {
    const parsed = JSON.parse(json);
    // New format: has landscape key
    if (parsed.landscape) return { layout: parsed as LayoutConfig, failed: false };
    // Old format: { type, columns?, rows? } — normalized to default (not a failure)
    return { layout: DEFAULT_LAYOUT, failed: false };
  } catch { return { layout: DEFAULT_LAYOUT, failed: true }; }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Extract unique area names from an OrientationLayout */
function getAreaNames(ol: OrientationLayout): string[] {
  const names = new Set<string>();
  for (const row of ol.areas) {
    for (const cell of row) {
      names.add(cell);
    }
  }
  return Array.from(names);
}

/** Build CSS grid-template-areas string from 2D areas array */
function buildGridTemplateAreas(areas: string[][]): string {
  return areas.map(row => `"${row.join(' ')}"`).join(' ');
}

/** Check if a layout matches a preset */
function isPresetActive(layout: LayoutConfig, preset: LayoutConfig): boolean {
  return JSON.stringify(layout) === JSON.stringify(preset);
}

/** Check if the layout is the default single-column layout */
function isDefaultLayout(layout: LayoutConfig): boolean {
  const l = layout.landscape;
  const p = layout.portrait;
  return (
    l.areas.length === 1 && l.areas[0].length === 1 && l.areas[0][0] === 'main' &&
    p.areas.length === 1 && p.areas[0].length === 1 && p.areas[0][0] === 'main' &&
    !l.columns && !l.rows && !p.columns && !p.rows
  );
}

// --- Track sizing helpers ---

interface TrackSize {
  value: number;
  unit: '%' | 'fr' | 'px';
  raw: string;
  resizable: boolean;
}

function parseTrackSizes(trackString: string): TrackSize[] {
  return trackString.trim().split(/\s+/).map(token => {
    const pctMatch = token.match(/^([\d.]+)%$/);
    if (pctMatch) return { value: parseFloat(pctMatch[1]), unit: '%' as const, raw: token, resizable: true };
    const frMatch = token.match(/^([\d.]+)fr$/);
    if (frMatch) return { value: parseFloat(frMatch[1]), unit: 'fr' as const, raw: token, resizable: true };
    const pxMatch = token.match(/^([\d.]+)px$/);
    if (pxMatch) return { value: parseFloat(pxMatch[1]), unit: 'px' as const, raw: token, resizable: true };
    return { value: 0, unit: '%' as const, raw: token, resizable: false };
  });
}

function serializeTrackSizes(tracks: TrackSize[]): string {
  return tracks.map(t => {
    if (!t.resizable) return t.raw;
    if (t.unit === '%') return `${Math.round(t.value * 10) / 10}%`;
    if (t.unit === 'fr') return `${Math.round(t.value * 100) / 100}fr`;
    return `${Math.round(t.value)}px`;
  }).join(' ');
}

function ensureTrackSizes(trackString: string | undefined, count: number): string {
  if (trackString) return trackString;
  return Array(count).fill('1fr').join(' ');
}

// --- Cell split helper ---

function splitAreaInGrid(layout: OrientationLayout, areaName: string, direction: 'horizontal' | 'vertical'): OrientationLayout {
  const areas = layout.areas.map(row => [...row]);

  const areaRows: number[] = [];
  const areaCols: number[] = [];
  for (let r = 0; r < areas.length; r++) {
    for (let c = 0; c < areas[r].length; c++) {
      if (areas[r][c] === areaName) {
        if (!areaRows.includes(r)) areaRows.push(r);
        if (!areaCols.includes(c)) areaCols.push(c);
      }
    }
  }

  if (areaRows.length === 0) return layout;

  const allNames = new Set<string>();
  for (const row of areas) for (const cell of row) allNames.add(cell);

  function uniqueName(base: string): string {
    if (!allNames.has(base)) { allNames.add(base); return base; }
    let i = 2;
    while (allNames.has(`${base}${i}`)) i++;
    allNames.add(`${base}${i}`);
    return `${base}${i}`;
  }

  if (direction === 'vertical') {
    const topName = uniqueName(`${areaName}-top`);
    const bottomName = uniqueName(`${areaName}-bottom`);
    const rowTracks = parseTrackSizes(ensureTrackSizes(layout.rows, areas.length));

    if (areaRows.length === 1) {
      const rowIdx = areaRows[0];
      const topRow = areas[rowIdx].map(cell => cell === areaName ? topName : cell);
      const bottomRow = areas[rowIdx].map(cell => cell === areaName ? bottomName : cell);
      const newAreas = [...areas.slice(0, rowIdx), topRow, bottomRow, ...areas.slice(rowIdx + 1)];

      const newRowTracks = [...rowTracks];
      const orig = newRowTracks[rowIdx];
      if (orig.resizable) {
        const half = orig.value / 2;
        newRowTracks.splice(rowIdx, 1, { ...orig, value: half }, { ...orig, value: half });
      } else {
        newRowTracks.splice(rowIdx, 1,
          { value: 1, unit: 'fr' as const, raw: '1fr', resizable: true },
          { value: 1, unit: 'fr' as const, raw: '1fr', resizable: true });
      }
      return { ...layout, rows: serializeTrackSizes(newRowTracks), areas: newAreas };
    }

    // Multi-row: partition at midpoint
    const mid = Math.ceil(areaRows.length / 2);
    const topSet = new Set(areaRows.slice(0, mid));
    const bottomSet = new Set(areaRows.slice(mid));
    const newAreas = areas.map((row, r) =>
      row.map(cell => {
        if (cell !== areaName) return cell;
        if (topSet.has(r)) return topName;
        if (bottomSet.has(r)) return bottomName;
        return cell;
      })
    );
    return { ...layout, areas: newAreas };
  }

  // Horizontal split (left/right — adds a column)
  const leftName = uniqueName(`${areaName}-left`);
  const rightName = uniqueName(`${areaName}-right`);
  const colTracks = parseTrackSizes(ensureTrackSizes(layout.columns, areas[0]?.length || 1));

  if (areaCols.length === 1) {
    const colIdx = areaCols[0];
    const newAreas = areas.map(row => {
      const newRow = [...row];
      const cell = newRow[colIdx];
      if (cell === areaName) {
        newRow.splice(colIdx, 1, leftName, rightName);
      } else {
        newRow.splice(colIdx, 1, cell, cell);
      }
      return newRow;
    });

    const newColTracks = [...colTracks];
    const orig = newColTracks[colIdx];
    if (orig.resizable) {
      const half = orig.value / 2;
      newColTracks.splice(colIdx, 1, { ...orig, value: half }, { ...orig, value: half });
    } else {
      newColTracks.splice(colIdx, 1,
        { value: 1, unit: 'fr' as const, raw: '1fr', resizable: true },
        { value: 1, unit: 'fr' as const, raw: '1fr', resizable: true });
    }
    return { ...layout, columns: serializeTrackSizes(newColTracks), areas: newAreas };
  }

  // Multi-column: partition at midpoint
  const mid = Math.ceil(areaCols.length / 2);
  const leftSet = new Set(areaCols.slice(0, mid));
  const rightSet = new Set(areaCols.slice(mid));
  const newAreas = areas.map(row =>
    row.map((cell, c) => {
      if (cell !== areaName) return cell;
      if (leftSet.has(c)) return leftName;
      if (rightSet.has(c)) return rightName;
      return cell;
    })
  );
  return { ...layout, areas: newAreas };
}

// --- GridPreview Component ---

interface GridPreviewProps {
  orientation: Orientation;
  orientationLayout: OrientationLayout;
  components: TemplateComponent[];
  onAssignComponent: (areaName: string, componentId: string) => void;
  onUnassignComponent: (areaName: string, componentId: string) => void;
  onUpdateColumns: (columns: string) => void;
  onUpdateRows: (rows: string) => void;
  onSplitArea: (areaName: string, direction: 'horizontal' | 'vertical') => void;
}

interface BoundaryInfo {
  position: number;
  trackIndex: number;
  axis: 'column' | 'row';
}

function GridPreview({ orientation, orientationLayout, components, onAssignComponent, onUnassignComponent, onUpdateColumns, onUpdateRows, onSplitArea }: GridPreviewProps) {
  const [dropdownArea, setDropdownArea] = useState<string | null>(null);
  const [boundaries, setBoundaries] = useState<BoundaryInfo[]>([]);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const areaNames = getAreaNames(orientationLayout);

  // Map area name -> assigned components
  const areaAssignments: Record<string, TemplateComponent[]> = {};
  for (const name of areaNames) {
    areaAssignments[name] = [];
  }
  for (const comp of components) {
    const assignedArea = comp.gridArea?.[orientation];
    if (assignedArea && areaAssignments[assignedArea]) {
      areaAssignments[assignedArea].push(comp);
    }
  }

  // Components not assigned to any area in this orientation (and have gridArea capability — i.e., no behavioral overlays)
  const unassigned = components.filter(comp => {
    if (comp.type === 'content-cards' && comp.config.mode === 'replace-panel') return false;
    const area = comp.gridArea?.[orientation];
    return !area || !areaNames.includes(area);
  });

  // Compute boundary positions from rendered cells
  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const computeBoundaries = () => {
      const next: BoundaryInfo[] = [];
      const cr = container.getBoundingClientRect();
      const numCols = orientationLayout.areas[0]?.length || 1;
      const numRows = orientationLayout.areas.length;

      const cellRects: Record<string, DOMRect> = {};
      container.querySelectorAll('[data-area]').forEach(el => {
        const a = el.getAttribute('data-area');
        if (a) cellRects[a] = el.getBoundingClientRect();
      });

      for (let c = 0; c < numCols - 1; c++) {
        for (let r = 0; r < numRows; r++) {
          const la = orientationLayout.areas[r][c];
          const ra = orientationLayout.areas[r][c + 1];
          if (la !== ra && cellRects[la] && cellRects[ra]) {
            next.push({ position: (cellRects[la].right - cr.left + cellRects[ra].left - cr.left) / 2, trackIndex: c, axis: 'column' });
            break;
          }
        }
      }

      for (let r = 0; r < numRows - 1; r++) {
        for (let c = 0; c < numCols; c++) {
          const ta = orientationLayout.areas[r][c];
          const ba = orientationLayout.areas[r + 1][c];
          if (ta !== ba && cellRects[ta] && cellRects[ba]) {
            next.push({ position: (cellRects[ta].bottom - cr.top + cellRects[ba].top - cr.top) / 2, trackIndex: r, axis: 'row' });
            break;
          }
        }
      }

      setBoundaries(next);
    };

    const rafId = requestAnimationFrame(computeBoundaries);
    const observer = new ResizeObserver(computeBoundaries);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [orientationLayout, orientation]);

  const handlePointerDown = (e: React.PointerEvent, boundary: BoundaryInfo) => {
    e.preventDefault();
    const container = gridContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const trackString = boundary.axis === 'column'
      ? ensureTrackSizes(orientationLayout.columns, orientationLayout.areas[0]?.length || 1)
      : ensureTrackSizes(orientationLayout.rows, orientationLayout.areas.length);
    const tracks = parseTrackSizes(trackString);
    const containerDim = boundary.axis === 'column' ? containerRect.width : containerRect.height;
    const startPos = boundary.axis === 'column' ? e.clientX : e.clientY;
    const idx = boundary.trackIndex;

    if (!tracks[idx].resizable || !tracks[idx + 1].resizable || tracks[idx].unit !== tracks[idx + 1].unit) return;

    const startVal = tracks[idx].value;
    const startNext = tracks[idx + 1].value;
    const unit = tracks[idx].unit;
    const updateFn = boundary.axis === 'column' ? onUpdateColumns : onUpdateRows;

    const onMove = (ev: PointerEvent) => {
      const delta = (boundary.axis === 'column' ? ev.clientX : ev.clientY) - startPos;
      let deltaUnits: number;
      if (unit === '%') {
        deltaUnits = (delta / containerDim) * 100;
      } else if (unit === 'fr') {
        const totalFr = tracks.reduce((s, t) => s + (t.unit === 'fr' && t.resizable ? t.value : 0), 0);
        deltaUnits = (delta / containerDim) * totalFr;
      } else {
        deltaUnits = delta;
      }

      const min = unit === '%' ? 5 : unit === 'fr' ? 0.1 : 20;
      let newI = startVal + deltaUnits;
      let newN = startNext - deltaUnits;
      if (newI < min) { newI = min; newN = startVal + startNext - min; }
      if (newN < min) { newN = min; newI = startVal + startNext - min; }

      const newTracks = tracks.map((t, ti) => {
        if (ti === idx) return { ...t, value: newI };
        if (ti === idx + 1) return { ...t, value: newN };
        return t;
      });
      updateFn(serializeTrackSizes(newTracks));
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const isBoundaryResizable = (b: BoundaryInfo): boolean => {
    const ts = b.axis === 'column'
      ? ensureTrackSizes(orientationLayout.columns, orientationLayout.areas[0]?.length || 1)
      : ensureTrackSizes(orientationLayout.rows, orientationLayout.areas.length);
    const tracks = parseTrackSizes(ts);
    return tracks[b.trackIndex].resizable && tracks[b.trackIndex + 1].resizable
      && tracks[b.trackIndex].unit === tracks[b.trackIndex + 1].unit;
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateAreas: buildGridTemplateAreas(orientationLayout.areas),
    ...(orientationLayout.columns && { gridTemplateColumns: orientationLayout.columns }),
    ...(orientationLayout.rows && { gridTemplateRows: orientationLayout.rows }),
    gap: orientationLayout.gap || '4px',
    width: '100%',
    height: '100%',
  };

  return (
    <div className={`border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-900 p-2 ${
      orientation === 'landscape' ? 'aspect-video max-h-[280px]' : 'aspect-[9/16] max-h-[400px]'
    }`}>
      <div ref={gridContainerRef} style={gridStyle} className="h-full relative">
        {areaNames.map(areaName => {
          const assigned = areaAssignments[areaName];
          return (
            <div
              key={areaName}
              data-area={areaName}
              style={{ gridArea: areaName }}
              className="group/cell relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md p-2 flex flex-col items-center justify-center min-h-[40px] bg-white/50 dark:bg-gray-800/50"
            >
              <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 absolute top-1 left-2">{areaName}</span>
              {assigned.length > 0 ? (
                <div className="flex flex-col items-center gap-1 mt-3">
                  {assigned.map(comp => (
                    <div key={comp.id} className="flex items-center gap-1 bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-light text-xs px-2 py-0.5 rounded-full">
                      <span>{DISPLAY_COMPONENTS[comp.type]?.name || comp.type}</span>
                      <button
                        type="button"
                        onClick={() => onUnassignComponent(areaName, comp.id)}
                        className="text-primary/60 hover:text-red-500 ml-0.5"
                        title="Unassign"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 relative">
                  <button
                    type="button"
                    onClick={() => setDropdownArea(dropdownArea === areaName ? null : areaName)}
                    className="text-[11px] text-gray-400 hover:text-primary dark:hover:text-primary-light italic"
                  >
                    Click to assign
                  </button>
                  {dropdownArea === areaName && unassigned.length > 0 && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-30 min-w-[160px] py-1">
                      {unassigned.map(comp => (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => {
                            onAssignComponent(areaName, comp.id);
                            setDropdownArea(null);
                          }}
                          className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-primary/10 dark:hover:bg-primary/20"
                        >
                          {DISPLAY_COMPONENTS[comp.type]?.name || comp.type}
                        </button>
                      ))}
                    </div>
                  )}
                  {dropdownArea === areaName && unassigned.length === 0 && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-30 min-w-[160px] py-2 px-3">
                      <span className="text-xs text-gray-400 italic">No unassigned components</span>
                    </div>
                  )}
                </div>
              )}
              {/* Split buttons */}
              <div className="absolute bottom-1 right-1 flex gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity z-10">
                <button
                  type="button"
                  onClick={() => onSplitArea(areaName, 'vertical')}
                  className="w-5 h-5 flex items-center justify-center bg-gray-200 dark:bg-gray-600 rounded text-[10px] text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-600 dark:hover:text-blue-400"
                  title="Split this cell into two stacked areas (top and bottom)"
                >
                  ↕
                </button>
                <button
                  type="button"
                  onClick={() => onSplitArea(areaName, 'horizontal')}
                  className="w-5 h-5 flex items-center justify-center bg-gray-200 dark:bg-gray-600 rounded text-[10px] text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:text-blue-600 dark:hover:text-blue-400"
                  title="Split this cell into two side-by-side areas (left and right)"
                >
                  ↔
                </button>
              </div>
            </div>
          );
        })}
        {/* Resize handles */}
        {boundaries.filter(isBoundaryResizable).map(b => (
          <div
            key={`handle-${b.axis}-${b.trackIndex}`}
            className="group/handle"
            style={{
              position: 'absolute',
              ...(b.axis === 'column'
                ? { left: b.position - 6, top: 0, width: 12, height: '100%', cursor: 'col-resize' }
                : { top: b.position - 6, left: 0, height: 12, width: '100%', cursor: 'row-resize' }),
              zIndex: 20,
            }}
            onPointerDown={e => handlePointerDown(e, b)}
          >
            <div
              className="opacity-0 group-hover/handle:opacity-100 transition-opacity"
              style={{
                position: 'absolute',
                ...(b.axis === 'column'
                  ? { left: 5, top: 0, width: 2, height: '100%' }
                  : { top: 5, left: 0, height: 2, width: '100%' }),
                backgroundColor: 'rgb(59 130 246 / 0.5)',
                borderRadius: 1,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Sortable component row ---

interface SortableComponentProps {
  component: TemplateComponent;
  onRemove: () => void;
  onUpdateConfig: (config: Record<string, unknown>) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  assignedComponentTypes: { type: string; name: string }[];
}

function SortableComponent({ component, onRemove, onUpdateConfig, isExpanded, onToggleExpand, assignedComponentTypes }: SortableComponentProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: component.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const info = DISPLAY_COMPONENTS[component.type];
  const cardMode = component.type === 'content-cards' ? (component.config.mode as string) || 'interleave-pagination' : null;
  const cardBadgeLabel = cardMode === 'replace-panel' ? 'Replace' : cardMode ? 'Interleave' : null;

  // Placement badges
  const lArea = component.gridArea?.landscape;
  const pArea = component.gridArea?.portrait;

  return (
    <div ref={setNodeRef} style={style} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
      <div className="flex items-center px-3 py-2">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab active:cursor-grabbing p-1 mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="Drag to reorder"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{info?.name || component.type}</span>
          {cardBadgeLabel ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">{cardBadgeLabel}</span>
          ) : (lArea || pArea) ? (
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
              {lArea && `L:${lArea}`}{lArea && pArea && ' '}{pArea && `P:${pArea}`}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mr-2 px-2 py-1"
        >
          {isExpanded ? 'Collapse' : 'Config'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
        >
          Remove
        </button>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-gray-600">
          <ComponentConfigEditor type={component.type} config={component.config} onChange={onUpdateConfig} assignedComponentTypes={assignedComponentTypes} />
        </div>
      )}
    </div>
  );
}

// --- Per-component config editor ---

function ComponentConfigEditor({ type, config, onChange, assignedComponentTypes }: {
  type: ComponentType;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  assignedComponentTypes: { type: string; name: string }[];
}) {
  switch (type) {
    case 'hearing-table':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">View Mode</label>
            <select
              value={(config.viewMode as string) || 'smart'}
              onChange={e => onChange({ ...config, viewMode: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
            >
              <option value="smart">Smart (time-filtered)</option>
              <option value="all">All Hearings</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Hide Columns (comma-separated)</label>
            <input
              type="text"
              value={Array.isArray(config.hideColumns) ? (config.hideColumns as string[]).join(', ') : ''}
              onChange={e => {
                const val = e.target.value.trim();
                onChange({ ...config, hideColumns: val ? val.split(',').map(s => s.trim()) : [] });
              }}
              placeholder="e.g., judge, room"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
      );
    case 'content-cards':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Mode</label>
            <select
              value={(config.mode as string) || 'interleave-pagination'}
              onChange={e => {
                const newMode = e.target.value;
                // Clear target when switching to interleave (it doesn't use a target)
                if (newMode === 'interleave-pagination') {
                  onChange({ ...config, mode: newMode, target: undefined });
                } else {
                  onChange({ ...config, mode: newMode });
                }
              }}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
            >
              <option value="interleave-pagination">Interleave with Pagination</option>
              <option value="replace-panel">Replace Panel</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {(config.mode || 'interleave-pagination') === 'replace-panel'
                ? 'Replaces the target panel with content cards when no hearings are scheduled.'
                : 'Content cards are added as extra pages in the hearing table\u2019s pagination cycle.'}
            </p>
          </div>
          {(config.mode || 'interleave-pagination') === 'replace-panel' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Target Panel</label>
            <select
              value={(config.target as string) || ''}
              onChange={e => onChange({ ...config, target: e.target.value || undefined })}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select a component...</option>
              {assignedComponentTypes
                .filter(c => c.type !== 'content-cards')
                .map(c => <option key={c.type} value={c.type}>{c.name}</option>)}
            </select>
          </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Show When</label>
            <select
              value={(config.showWhen as string) || 'when-idle'}
              onChange={e => onChange({ ...config, showWhen: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
            >
              <option value="when-idle">When no hearings</option>
              <option value="always">Always</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {(config.showWhen || 'when-idle') === 'always'
                ? 'Content cards display regardless of hearing schedule.'
                : 'Content cards only appear when the target panel has no hearings to show.'}
            </p>
          </div>
        </div>
      );
    default:
      return (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">No configurable options for this component.</p>
      );
  }
}

// --- Main Modal ---

interface TemplateEditModalProps {
  template: DisplayTypeTemplate | null;
  onClose: () => void;
}

export default function TemplateEditModal({ template, onClose }: TemplateEditModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!template;
  const isBuiltIn = template?.isBuiltIn ?? false;

  const [name, setName] = useState(template?.name || '');
  const [slug, setSlug] = useState(template?.slug || '');
  const [description, setDescription] = useState(template?.description || '');
  const initialComponents = template ? parseComponents(template.components) : { components: [], failed: false };
  const initialLayout = template ? parseLayout(template.layout) : { layout: DEFAULT_LAYOUT, failed: false };
  const [components, setComponents] = useState<TemplateComponent[]>(initialComponents.components);
  const [layout, setLayout] = useState<LayoutConfig>(initialLayout.layout);
  // True when the template's stored content couldn't be parsed — saving would
  // overwrite the (unreadable) original, so we block it and steer to Reset.
  const [contentParseFailed, setContentParseFailed] = useState(initialComponents.failed || initialLayout.failed);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoSlug, setAutoSlug] = useState(!isEditing);
  const [activeTab, setActiveTab] = useState<Orientation>('landscape');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    if (autoSlug && !isEditing) {
      setSlug(slugify(name));
    }
  }, [name, autoSlug, isEditing]);

  // Warn once on open if the stored content couldn't be read.
  useEffect(() => {
    if (contentParseFailed) {
      toast.error(
        "This template's saved layout could not be read. Use “Reset to defaults” before editing — saving now would overwrite it.",
        { duration: 8000 }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMutation = useMutation({
    mutationFn: displayTemplatesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['display-templates'] });
      toast.success('Template created');
      onClose();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create template');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof displayTemplatesApi.update>[1] }) =>
      displayTemplatesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['display-templates'] });
      toast.success('Template updated');
      onClose();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update template');
    },
  });

  const resetMutation = useMutation({
    mutationFn: displayTemplatesApi.reset,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['display-templates'] });
      toast.success('Template reset to defaults');
      setName(data.name);
      setDescription(data.description || '');
      const resetComponents = parseComponents(data.components);
      const resetLayout = parseLayout(data.layout);
      setComponents(resetComponents.components);
      setLayout(resetLayout.layout);
      setContentParseFailed(resetComponents.failed || resetLayout.failed);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to reset template');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Never let an editor session that loaded from unreadable content overwrite it.
    if (contentParseFailed) {
      toast.error('Cannot save: the original layout could not be read. Use “Reset to defaults” first, then re-edit.');
      return;
    }
    const componentData = components.map(c => ({
      type: c.type,
      config: c.config,
      ...(c.gridArea && Object.keys(c.gridArea).length > 0 && { gridArea: c.gridArea }),
    }));

    const layoutData = isDefaultLayout(layout) ? null : layout;

    if (isEditing && template) {
      updateMutation.mutate({
        id: template.id,
        data: {
          name,
          description: description || null,
          components: componentData,
          layout: layoutData,
          ...(!isBuiltIn && { slug }),
        },
      });
    } else {
      createMutation.mutate({
        slug,
        name,
        description: description || null,
        components: componentData,
        layout: layoutData,
      });
    }
  };

  const addComponent = (type: ComponentType) => {
    setComponents([...components, { id: generateId(), type, config: {} }]);
  };

  const removeComponent = (id: string) => {
    setComponents(components.filter(c => c.id !== id));
  };

  const updateComponentConfig = (id: string, config: Record<string, unknown>) => {
    setComponents(components.map(c => c.id === id ? { ...c, config } : c));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = components.findIndex(c => c.id === active.id);
    const newIndex = components.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setComponents(arrayMove(components, oldIndex, newIndex));
  };

  const handleAssignComponent = (areaName: string, componentId: string) => {
    setComponents(components.map(c => {
      if (c.id !== componentId) return c;
      return { ...c, gridArea: { ...c.gridArea, [activeTab]: areaName } };
    }));
  };

  const handleUnassignComponent = (_areaName: string, componentId: string) => {
    setComponents(components.map(c => {
      if (c.id !== componentId) return c;
      const updated = { ...c.gridArea };
      delete updated[activeTab];
      return { ...c, gridArea: Object.keys(updated).length > 0 ? updated : undefined };
    }));
  };

  const handleSplitArea = (areaName: string, direction: 'horizontal' | 'vertical') => {
    const newOrientationLayout = splitAreaInGrid(layout[activeTab], areaName, direction);

    // Find newly-added area names to reassign components
    const oldNames = new Set(getAreaNames(layout[activeTab]));
    const newNames = getAreaNames(newOrientationLayout);
    const added = newNames.filter(n => !oldNames.has(n));

    const firstSub = direction === 'vertical'
      ? added.find(n => n.includes('-top')) || added[0]
      : added.find(n => n.includes('-left')) || added[0];

    if (firstSub) {
      setComponents(prev => prev.map(c => {
        if (c.gridArea?.[activeTab] !== areaName) return c;
        return { ...c, gridArea: { ...c.gridArea, [activeTab]: firstSub } };
      }));
    }

    setLayout(prev => ({ ...prev, [activeTab]: newOrientationLayout }));
  };

  const updateOrientationLayout = (field: 'columns' | 'rows', value: string) => {
    setLayout(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [field]: value || undefined,
      },
    }));
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const assignedComponentTypes = components
    .filter(c => c.gridArea?.[activeTab])
    .map(c => ({ type: c.type, name: DISPLAY_COMPONENTS[c.type]?.name || c.type }));

  const availableComponents = COMPONENT_TYPE_LIST.filter(
    c => !components.some(existing => existing.type === c.type)
  );

  const activeOrientationLayout = layout[activeTab];

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? (isBuiltIn ? 'Edit Built-in Template' : 'Edit Template') : 'Create Template'}
          </h3>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* A) Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="e.g., Lobby Info Board"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Slug {!isEditing && <span className="text-xs text-gray-400">(auto)</span>}
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={e => { setAutoSlug(false); setSlug(e.target.value); }}
                  required
                  disabled={isBuiltIn}
                  placeholder="e.g., lobby-info"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-700"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {isBuiltIn ? 'Cannot change slug of built-in template' : 'Used as the display type value'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Brief description of this template's purpose..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* B) Layout Editor */}
            <div className="border-t dark:border-gray-700 pt-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Layout</h4>

              {/* Preset buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {LAYOUT_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setLayout(preset.layout);
                      // Clear component gridArea assignments when changing layout
                      setComponents(prev => prev.map(c => ({ ...c, gridArea: undefined })));
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      isPresetActive(layout, preset.layout)
                        ? 'border-primary bg-primary/10 text-primary dark:text-primary-light'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Orientation tabs */}
              <div className="flex gap-1 mb-3">
                {(['landscape', 'portrait'] as Orientation[]).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs rounded-t-lg border border-b-0 transition-colors ${
                      activeTab === tab
                        ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-medium'
                        : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab === 'landscape' ? 'Landscape' : 'Portrait'}
                  </button>
                ))}
              </div>

              {/* Per-orientation controls */}
              <div className="border border-gray-300 dark:border-gray-600 rounded-lg rounded-tl-none p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Columns</label>
                    <input
                      type="text"
                      value={activeOrientationLayout.columns || ''}
                      onChange={e => updateOrientationLayout('columns', e.target.value)}
                      placeholder="e.g., 40% 60% or 1fr 1fr"
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Rows</label>
                    <input
                      type="text"
                      value={activeOrientationLayout.rows || ''}
                      onChange={e => updateOrientationLayout('rows', e.target.value)}
                      placeholder="e.g., 1fr auto or 45% 55%"
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white font-mono"
                    />
                  </div>
                </div>

                {/* Grid preview */}
                <GridPreview
                  orientation={activeTab}
                  orientationLayout={activeOrientationLayout}
                  components={components}
                  onAssignComponent={handleAssignComponent}
                  onUnassignComponent={handleUnassignComponent}
                  onUpdateColumns={v => updateOrientationLayout('columns', v)}
                  onUpdateRows={v => updateOrientationLayout('rows', v)}
                  onSplitArea={handleSplitArea}
                />
              </div>
            </div>

            {/* C) Component List */}
            <div className="border-t dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">Components</h4>
                {availableComponents.length > 0 && (
                  <select
                    value=""
                    onChange={e => { if (e.target.value) addComponent(e.target.value as ComponentType); }}
                    className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">+ Add Component</option>
                    {availableComponents.map(c => (
                      <option key={c.type} value={c.type}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={components.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {components.map(comp => (
                      <SortableComponent
                        key={comp.id}
                        component={comp}
                        onRemove={() => removeComponent(comp.id)}
                        onUpdateConfig={config => updateComponentConfig(comp.id, config)}
                        isExpanded={expandedId === comp.id}
                        onToggleExpand={() => setExpandedId(expandedId === comp.id ? null : comp.id)}
                        assignedComponentTypes={assignedComponentTypes}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {components.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-4">
                  No components added. Use the dropdown above to add components.
                </p>
              )}
            </div>

            {/* D) Reset button for built-in */}
            {isBuiltIn && template && (
              <div className="border-t dark:border-gray-700 pt-4">
                <button
                  type="button"
                  onClick={() => resetMutation.mutate(template.id)}
                  disabled={resetMutation.isPending}
                  className="text-sm px-3 py-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
                >
                  {resetMutation.isPending ? 'Resetting...' : 'Reset to Defaults'}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Restore this template's components and layout to factory defaults.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || components.length === 0}
                className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
