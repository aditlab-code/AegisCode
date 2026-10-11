package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

// RunLegacyMigration checks for legacy v1 artifacts and non-destructively imports
// them into config.json if config.json does not yet exist.
func RunLegacyMigration(baseDir string) (*Config, error) {
	configPath := filepath.Join(baseDir, "config.json")
	if _, err := os.Stat(configPath); err == nil {
		// config.json already exists; skip migration
		return nil, nil
	}

	migrated := false
	cfg := &Config{
		BypassTokens: make(map[string]string),
		ProviderKeys: make(map[string]string),
		Settings:     make(map[string]any),
		UpdatedAt:    time.Now().UnixMilli(),
	}

	// 1. Check legacy settings.json
	possibleSettingsPaths := []string{
		filepath.Join("data", "settings.json"),
		filepath.Join(baseDir, "data", "settings.json"),
	}

	for _, p := range possibleSettingsPaths {
		if b, err := os.ReadFile(p); err == nil {
			var rawSettings map[string]any
			if err := json.Unmarshal(b, &rawSettings); err == nil {
				cfg.Settings = rawSettings
				if theme, ok := rawSettings["theme"].(string); ok && theme != "" {
					cfg.Theme = theme
				}
				migrated = true
				break
			}
		}
	}

	// 2. Check legacy auth.json
	possibleAuthPaths := []string{
		filepath.Join(".aegis", "auth.json"),
		filepath.Join(baseDir, "auth.json"),
	}

	for _, p := range possibleAuthPaths {
		if b, err := os.ReadFile(p); err == nil {
			var authMap map[string]any
			if err := json.Unmarshal(b, &authMap); err == nil {
				for k, v := range authMap {
					if strVal, ok := v.(string); ok && strVal != "" {
						cfg.BypassTokens[k] = strVal
					}
				}
				migrated = true
				break
			}
		}
	}

	if !migrated {
		return nil, errors.New("no legacy artifacts found")
	}

	return cfg, nil
}
