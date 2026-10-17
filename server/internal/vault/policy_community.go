//go:build !enterprise

package vault

import (
	"fmt"
	"time"
)

type communityPolicy struct{}

func init() {
	defaultPolicy = &communityPolicy{}
}

func (p *communityPolicy) Name() string {
	return "community"
}

func (p *communityPolicy) HandleFailedAttempt(failedAttempts int, now time.Time) (int64, bool, bool, error) {
	// Community Edition: Soft progressive rate-limiting only. Zero panic kill, zero quarantine lockout.
	if failedAttempts >= 5 {
		// 30 seconds soft delay
		lockoutUntil := now.Add(30 * time.Second).UnixMilli()
		return lockoutUntil, false, false, fmt.Errorf("%w: paused for 30 seconds after multiple incorrect attempts", ErrSoftDeadlock)
	}

	remaining := 5 - failedAttempts
	return 0, false, false, fmt.Errorf("%w: %d attempts remaining before 30s pause", ErrInvalidPassphrase, remaining)
}

func (p *communityPolicy) IsQuarantined(_ bool) bool {
	// Community Edition never traps the user in quarantine
	return false
}

func (p *communityPolicy) AllowsRecoveryKey() bool {
	return true
}
