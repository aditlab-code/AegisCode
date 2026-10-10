import { Icon } from "../../ui/Icon"

export function WindowControls() {
  return (
    <div className="brand-zone">
      <div className="traffic-lights" aria-label="Window controls">
        <span className="traffic-close" />
        <span className="traffic-minimize" />
        <span className="traffic-expand" />
      </div>
      <div className="brand">
        <span className="brand-mark">
          <Icon name="aegis" size={19} />
        </span>
        <span>
          AEGIS<span className="brand-code">CODE</span>
        </span>
      </div>
    </div>
  )
}
