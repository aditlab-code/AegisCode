package vault

import (
	"time"
)

// Policy governs intrusion defense, soft deadlock timeouts, quarantine, and panic shutdown.
type Policy interface {
	// Name returns the identifier of the active policy ("community" or "enterprise").
	Name() string

	// HandleFailedAttempt processes an incorrect passphrase attempt and determines
	// the lockout timestamp, quarantine activation, and panic shutdown trigger.
	HandleFailedAttempt(failedAttempts int, now time.Time) (lockoutUntil int64, quarantine bool, panicKill bool, err error)

	// IsQuarantined checks whether quarantine mode blocks normal passphrase authentication.
	IsQuarantined(quarantineFlag bool) bool

	// AllowsRecoveryKey indicates whether emergency recovery tokens are generated and accepted.
	AllowsRecoveryKey() bool
}

// defaultPolicy is populated by policy_community.go or policy_enterprise.go depending on build tags.
var defaultPolicy Policy
