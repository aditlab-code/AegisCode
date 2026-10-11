import { useState, useRef, useEffect, useMemo } from "react"
import { useWorkbench } from "../../../context/WorkbenchContext"
import {
  CHAT_PROVIDERS,
  getMergedProviderModels,
} from "../../../data/chatConstants"
import { Icon } from "../../ui/Icon"
import type { ChatProvider } from "../../../types/workbench"

export function ChatProviderSelect() {
  const {
    activeProvider,
    activeModel,
    setSessionModel,
    settings,
    updateAgentSettings,
    antigravityModels,
  } = useWorkbench()

  const [isOpen, setIsOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<"all" | ChatProvider>("all")
  const containerRef = useRef<HTMLDivElement>(null)

  // Close popover when clicking outside
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

  const displayedProviders = useMemo(() => {
    if (activeFilter === "all") {
      return CHAT_PROVIDERS
    }
    return CHAT_PROVIDERS.filter((p) => p.id === activeFilter)
  }, [activeFilter])

  function handleSelect(providerId: ChatProvider, modelId: string) {
    setSessionModel(providerId, modelId)
    updateAgentSettings?.({
      defaultProvider: providerId,
      model: modelId,
    })
    setIsOpen(false)
  }

  return (
    <div className="provider-select-container relative" ref={containerRef}>
      <button
        type="button"
        className="provider-badge-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Select AI provider and model"
        aria-expanded={isOpen}
        title="Ganti AI Provider & Model"
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
          {/* Popover Header */}
          <div className="provider-popover-header">
            <div className="flex items-center justify-between w-full">
              <span className="font-semibold text-xs text-ink">
                AI Provider & Model
              </span>
              <span className="text-[10px] text-ink-muted">
                Aktif:{" "}
                <strong className="text-ink">
                  {providerObj.tag} · {activeModel}
                </strong>
              </span>
            </div>
          </div>

          {/* Provider Filter Tabs (All | AGY | CLD | OC | OR) */}
          <div className="provider-filter-tabs">
            <button
              type="button"
              className={`provider-filter-tab ${
                activeFilter === "all" ? "active" : ""
              }`}
              onClick={() => setActiveFilter("all")}
            >
              Semua
            </button>
            {CHAT_PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`provider-filter-tab ${
                  activeFilter === p.id ? "active" : ""
                }`}
                onClick={() => setActiveFilter(p.id)}
              >
                <span className={`provider-dot dot-${p.id}`} />
                <span>{p.tag}</span>
              </button>
            ))}
          </div>

          {/* Grouped List of All Providers & Models */}
          <div className="provider-popover-body">
            {displayedProviders.map((provider) => {
              const models =
                provider.id === "antigravity" &&
                antigravityModels &&
                antigravityModels.length > 0
                  ? antigravityModels
                  : getMergedProviderModels(
                      provider.id,
                      settings?.agent?.customModels,
                    )
              return (
                <div key={provider.id} className="provider-section">
                  {/* Provider Section Header */}
                  <div className="provider-section-header">
                    <div className="flex items-center gap-1.5">
                      <span className={`provider-tag tag-${provider.id}`}>
                        {provider.tag}
                      </span>
                      <span className="provider-section-title">
                        {provider.name}
                      </span>
                    </div>
                    <span className="provider-model-count">
                      ({models.length} model)
                    </span>
                  </div>

                  {/* Model Items */}
                  <div className="provider-section-models">
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
                          onClick={() => handleSelect(provider.id, model.id)}
                          role="menuitem"
                        >
                          <div className="model-option-info">
                            <div className="flex items-center gap-1.5">
                              <span className="model-option-name">
                                {model.name}
                              </span>
                              {model.isCustom && (
                                <span className="custom-model-badge">
                                  Custom
                                </span>
                              )}
                            </div>
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
