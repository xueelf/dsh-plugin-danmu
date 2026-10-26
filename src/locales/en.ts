/** 弹幕设置面板的英文文案。 */
export const en = {
  open: 'Danmu settings',
  displayArea: 'Display area',
  density: 'Density',
  densityNormal: 'Normal',
  densityMore: 'More',
  densityOverlap: 'Overlap',
  opacity: 'Opacity',
  fontSize: 'Font size',
  speed: 'Speed',
  speedExtremelySlow: 'Very slow',
  speedSlower: 'Slow',
  speedModerate: 'Medium',
  speedFaster: 'Fast',
  speedExtremelyFast: 'Very fast',
  reset: 'Restore default settings',
} as const;

export type SettingsKey = keyof typeof en;
