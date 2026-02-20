export const DISPLAY_COMPONENTS = {
  'hearing-table':   { name: 'Hearing Table', description: 'Full docket table with columns' },
  'hearing-pills':   { name: 'Schedule Pills', description: 'Compact judge/room/time pill layout' },
  'idle-cards':      { name: 'Idle Content Cards', description: 'Info cards, news, statistics slideshow' },
  'direction-cards': { name: 'Wayfinding Directions', description: 'Direction card grid' },
  'camera-grid':     { name: 'Camera Grid', description: 'RTSP camera tile grid' },
  'system-status':   { name: 'System Status', description: 'Database, uptime, display status' },
} as const;

export type ComponentType = keyof typeof DISPLAY_COMPONENTS;

export const COMPONENT_TYPE_LIST = Object.entries(DISPLAY_COMPONENTS).map(([type, info]) => ({
  type: type as ComponentType,
  ...info,
}));
