//go:build !enterprise

package api

// In Community Edition, companion pairing is not locked down by default,
// allowing local developer exploration unless explicitly locked.
const defaultCompanionLocked = false
