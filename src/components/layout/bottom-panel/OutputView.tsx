export function OutputView() {
  return (
    <div className="lint-output">
      <p>
        <span className="event-time">10:42:08</span> Starting incremental lint
        across 5 language profiles
      </p>
      <p>
        <span className="event-time">10:42:08</span> TypeScript · ESLint adapter
        ready
      </p>
      <p>
        <span className="event-time">10:42:08</span> JavaScript · ESLint adapter
        ready
      </p>
      <p>
        <span className="event-time">10:42:08</span> Python · Ruff adapter ready
      </p>
      <p>
        <span className="event-time">10:42:08</span> JSON · parser ready
      </p>
      <p>
        <span className="event-time">10:42:08</span> C++ · clang-tidy adapter
        ready
      </p>
    </div>
  )
}
