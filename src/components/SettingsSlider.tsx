import {
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

/** 滑杆的可调项。 */
export interface SliderProps {
  readonly label: string;
  readonly format: (value: number) => string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly current: number;
  readonly ticks?: readonly number[];
  readonly onChange: (value: number) => void;
}

/** 设置面板里的滑杆。 */
export function SettingsSlider(props: SliderProps): ReactElement {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const draftRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const displayValue = draft ?? props.current;

  useEffect(() => {
    if (draftRef.current !== null && props.current === draftRef.current) {
      draftRef.current = null;
      setDraft(null);
    }
  }, [props.current]);

  const percent = Math.round(
    ((displayValue - props.min) / (props.max - props.min)) * 100,
  );
  const setFromClientX = (clientX: number): void => {
    const track = trackRef.current;

    if (track === null) {
      return;
    }
    const rect = track.getBoundingClientRect();

    if (rect.width <= 0) {
      return;
    }
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = props.min + ratio * (props.max - props.min);
    const next = Math.max(
      props.min,
      Math.min(props.max, Math.round(raw / props.step) * props.step),
    );

    if (next !== draftRef.current) {
      draftRef.current = next;
      setDraft(next);
    }
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromClientX(event.clientX);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (draggingRef.current) {
      setFromClientX(event.clientX);
    }
  };
  const release = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    release(event);

    const next = draftRef.current;

    if (next === null) {
      return;
    }

    if (next === props.current) {
      draftRef.current = null;
      setDraft(null);

      return;
    }
    props.onChange(next);
  };
  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    release(event);
    draftRef.current = null;
    setDraft(null);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    let next: number | null = null;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      next = props.current - props.step;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      next = props.current + props.step;
    }

    if (next === null) {
      return;
    }
    event.preventDefault();
    props.onChange(Math.max(props.min, Math.min(props.max, next)));
  };
  return (
    <div className="dsh-danmu-settings-row">
      <span className="dsh-danmu-settings-label">{props.label}</span>
      <div className="dsh-danmu-settings-area">
        <div
          ref={trackRef}
          className="dsh-danmu-settings-track"
          role="slider"
          tabIndex={0}
          aria-label={props.label}
          aria-valuemin={props.min}
          aria-valuemax={props.max}
          aria-valuenow={displayValue}
          aria-valuetext={props.format(displayValue)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          onKeyDown={onKeyDown}
        >
          <div
            className="dsh-danmu-settings-bar"
            style={{ width: `${percent}%` }}
          >
            <span className="dsh-danmu-settings-dot" />
          </div>
          {props.ticks === undefined ? null : (
            <div className="dsh-danmu-settings-steps" aria-hidden>
              {props.ticks.map(tick => (
                <span
                  key={tick}
                  className="dsh-danmu-settings-step"
                  style={{
                    left: `${tick}%`,
                    marginLeft:
                      tick === 0 ? '-4px' : tick === 100 ? '0' : '-1px',
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <span className="dsh-danmu-settings-value">
          {props.format(displayValue)}
        </span>
      </div>
    </div>
  );
}
