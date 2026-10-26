import { type ReactElement, useEffect, useRef, useState } from 'react';
import { SettingsSlider } from '../components/SettingsSlider';
import { useSettings } from '../hooks/use-settings';
import { useSettingsPanel } from '../hooks/use-settings-panel';
import type { Translate } from '../locales';
import type { SettingsPanelStore } from '../stores/settings-panel-store';
import {
  type DanmuSettingsStore,
  AREA_MIN,
  SPEED_STEPS,
} from '../stores/settings-store';

const SPEED_LABEL_KEYS = [
  'speedExtremelySlow',
  'speedSlower',
  'speedModerate',
  'speedFaster',
  'speedExtremelyFast',
] as const;
/** B 站显示区域与弹幕速度的五个档位。 */
const FIVE_STOP_TICKS = [0, 25, 50, 75, 100] as const;
/** B 站面板的弹幕密度三档，只在显示区域为 0 或 100 时出现。 */
const DENSITY_OPTIONS = [
  { value: 1, key: 'densityNormal', name: 'normal' },
  { value: 2, key: 'densityMore', name: 'more' },
  { value: 3, key: 'densityOverlap', name: 'most' },
] as const;

function speedIndex(speedPlus: number): number {
  return SPEED_STEPS.findIndex(step => step === speedPlus);
}

/** 把存储的显示区域映射到滑杆位置。B 站把 0 显示在 100 档。 */
function areaPosition(area: number): number {
  return area === 0 ? 100 : area === AREA_MIN ? 0 : area;
}

/** 输入框上方的弹幕设置浮层。 */
export function createSettingsPanel(
  store: DanmuSettingsStore,
  open: SettingsPanelStore,
  t: Translate,
): () => ReactElement | null {
  return function DanmuSettingsPanel(): ReactElement | null {
    const state = useSettingsPanel(open);
    const settings = useSettings(store);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const restoreFocusRef = useRef(false);
    const [, setTick] = useState(0);

    useEffect(() => {
      if (!state.open) {
        return undefined;
      }
      const onResize = (): void => {
        setTick(tick => tick + 1);
      };
      window.addEventListener('resize', onResize);

      return () => window.removeEventListener('resize', onResize);
    }, [state.open]);
    useEffect(() => {
      if (!state.open) {
        return undefined;
      }
      const panel = panelRef.current;
      const anchor = state.anchor;

      restoreFocusRef.current = false;
      panel?.focus();

      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          restoreFocusRef.current = true;
          open.close();
        }
      };
      const onPointerDown = (event: PointerEvent): void => {
        const target = event.target;

        if (!(target instanceof Element)) {
          return;
        }

        if (target.closest('[data-danmu-settings-panel]') !== null) {
          return;
        }

        if (target.closest('[data-danmu-settings-button]') !== null) {
          return;
        }
        restoreFocusRef.current = false;
        open.close();
      };
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('pointerdown', onPointerDown, true);

      return () => {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('pointerdown', onPointerDown, true);

        if (restoreFocusRef.current && anchor?.isConnected === true) {
          anchor.focus();
        }
      };
    }, [state.open, state.anchor, open]);

    if (!state.open) {
      return null;
    }
    const anchor = state.anchor;
    const rect =
      anchor?.isConnected === true ? anchor.getBoundingClientRect() : null;
    const left =
      rect === null
        ? 12
        : Math.max(12, Math.min(rect.left, window.innerWidth - 332));
    const bottom =
      rect === null ? 12 : Math.max(12, window.innerHeight - rect.top + 8);
    const maxHeight =
      rect === null ? 'calc(100vh - 24px)' : `${Math.max(0, rect.top - 20)}px`;
    const index = speedIndex(settings.speedPlus);
    const densityVisible = settings.area === 0 || settings.area === 100;

    return (
      <div
        ref={panelRef}
        className="dsh-danmu-settings-panel"
        data-danmu-settings-panel=""
        role="dialog"
        aria-label={t('open')}
        tabIndex={-1}
        style={{ left: `${left}px`, bottom: `${bottom}px`, maxHeight }}
      >
        <SettingsSlider
          label={t('displayArea')}
          format={value => `${value === 0 ? AREA_MIN : value}%`}
          min={0}
          max={100}
          step={25}
          current={areaPosition(settings.area)}
          ariaMin={AREA_MIN}
          ariaValue={settings.area === 0 ? 100 : settings.area}
          ticks={FIVE_STOP_TICKS}
          rowClassName={
            densityVisible ? 'dsh-danmu-settings-row-density' : undefined
          }
          onChange={value =>
            store.update({ area: value === 0 ? AREA_MIN : value })
          }
        />
        {densityVisible ? (
          <div className="dsh-danmu-settings-density">
            <div className="dsh-danmu-settings-density-label">
              {t('density')}
            </div>
            <div
              className="dsh-danmu-settings-density-options"
              role="group"
              aria-label={t('density')}
            >
              {DENSITY_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  data-density={option.name}
                  className={
                    settings.density === option.value
                      ? 'dsh-danmu-settings-density-option dsh-danmu-settings-density-active'
                      : 'dsh-danmu-settings-density-option'
                  }
                  aria-pressed={settings.density === option.value}
                  onClick={() => store.update({ density: option.value })}
                >
                  {t(option.key)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <SettingsSlider
          label={t('opacity')}
          format={value => `${Math.round(value)}%`}
          min={10}
          max={100}
          step={1}
          current={Math.round(settings.opacity * 100)}
          onChange={value => store.update({ opacity: value / 100 })}
        />
        <SettingsSlider
          label={t('fontSize')}
          format={value => `${Math.round(value)}%`}
          min={50}
          max={170}
          step={1}
          current={Math.round(settings.fontSize * 100)}
          onChange={value => store.update({ fontSize: value / 100 })}
        />
        <SettingsSlider
          label={t('speed')}
          format={value => t(SPEED_LABEL_KEYS[value] ?? SPEED_LABEL_KEYS[2])}
          min={0}
          max={4}
          step={1}
          current={index}
          ariaMin={SPEED_STEPS[0]}
          ariaMax={SPEED_STEPS[4]}
          ariaValue={settings.speedPlus}
          ticks={FIVE_STOP_TICKS}
          onChange={value => {
            const next = SPEED_STEPS[value];

            if (next !== undefined) {
              store.update({ speedPlus: next });
            }
          }}
        />
        <button
          type="button"
          className="dsh-danmu-settings-reset"
          onClick={() => store.reset()}
        >
          {t('reset')}
        </button>
      </div>
    );
  };
}
