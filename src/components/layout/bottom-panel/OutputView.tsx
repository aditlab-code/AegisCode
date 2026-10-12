import type { OutputChannel } from "../../../types/workbench"

interface OutputViewProps {
  channel: OutputChannel
  logs: Record<OutputChannel, string[]>
}

export function OutputView({ channel, logs }: OutputViewProps) {
  const currentLogs = logs[channel] || []

  return (
    <div className="lint-output">
      {currentLogs.length === 0 ? (
        <p className="empty-problems text-muted">
          Output channel &quot;{channel}&quot; is currently empty.
        </p>
      ) : (
        currentLogs.map((line, index) => {
          const hasTimestamp = line.startsWith("[") && line.indexOf("]") === 9
          const time = hasTimestamp ? line.slice(1, 9) : null
          const text = hasTimestamp ? line.slice(11) : line

          return (
            <p key={`${line}-${index}`}>
              {time && <span className="event-time">{time}</span>}
              <span>{text}</span>
            </p>
          )
        })
      )}
    </div>
  )
}
