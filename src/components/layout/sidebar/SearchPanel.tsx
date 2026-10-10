import { useState } from "react"
import { Icon } from "../../ui/Icon"

export function SearchPanel() {
  const [search, setSearch] = useState("")
  const [replace, setReplace] = useState("")

  return (
    <div className="tool-panel">
      <label className="panel-input">
        <Icon name="search" size={13} />
        <input
          aria-label="Search repository"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search"
          value={search}
        />
        <span className="regex-mark">.*</span>
      </label>
      <label className="panel-input">
        <Icon name="chevron" size={12} />
        <input
          aria-label="Replace repository matches"
          onChange={(event) => setReplace(event.target.value)}
          placeholder="Replace"
          value={replace}
        />
      </label>
      <div className="panel-options">
        <span>files to include</span>
        <span>src/**</span>
      </div>
      {search ? (
        <div className="search-results">
          <div className="result-summary">2 results in 1 file</div>
          <button type="button">
            <Icon name="chevron" size={11} />
            <Icon name="file" size={13} />
            <span>App.tsx</span>
            <small>2</small>
          </button>
          <p>
            <span>383</span> text: “{search}”
          </p>
          <p>
            <span>416</span> setMessage(“{search}”)
          </p>
        </div>
      ) : (
        <p className="panel-hint">
          Search across the active repository. Regular expressions are
          supported.
        </p>
      )}
    </div>
  )
}
