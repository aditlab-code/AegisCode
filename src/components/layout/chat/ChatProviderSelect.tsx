import { useState, useRef, useEffect } from "react"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { CHAT_PROVIDERS, CHAT_MODELS } from "../../../data/chatConstants"
import { Icon } from "../../ui/Icon"
import type { ChatProvider } from "../../../types/workbench"

export function ChatProviderSelect() {
  const { activeProvider, activeModel, setSessionModel } = useWorkbench()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const providerObj =
    CHAT_PROVIDERS.find((p) => p.id === activeProvider) || CHAT_PROVIDERS[0]

  return (
    <div className="provider-select-container" ref={containerRef}>
      <button
        type="button"
        className="provider-badge-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Select AI provider and model"
        aria-expanded={isOpen}
      >
        <span className={`provider-tag tag-${activeProvider}`}>
          {providerObj.tag}
        </span>
        <span className="provider-model-label">{activeModel}</span>
        <Icon
          name="chevron-down"
          size={11}
          className={`provider-chevron ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="provider-popover" role="menu">
          <div className="provider-popover-header">
            <span>Model Provider</span>
          </div>

          <div className="provider-grouped-list">
            {CHAT_PROVIDERS.map((provider) => {
              const models = CHAT_MODELS[provider.id] || []
              return (
                <div key={provider.id} className="provider-group">
                  <div className="provider-group-title">
                    <span className={`provider-dot dot-${provider.id}`} />
                    <span>{provider.name}</span>
                  </div>

                  <div className="provider-group-models">
                    {models.map((model) => {
                      const isSelected =
                        activeProvider === provider.id &&
                        activeModel === model.id
                      return (
                        <button
                          key={model.id}
                          type="button"
                          className={`model-option-btn ${
                            isSelected ? "selected" : ""
                          }`}
                          onClick={() => {
                            setSessionModel(provider.id, model.id)
                            setIsOpen(false)
                          }}
                          role="menuitem"
                        >
                          <div className="model-option-info">
                            <span className="model-option-name">
                              {model.name}
                            </span>
                            {model.description && (
                              <span className="model-option-desc">
                                {model.description}
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <span className="model-selected-icon">
                              <Icon name="check" size={13} />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
