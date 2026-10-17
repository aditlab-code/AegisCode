//go:build !enterprise

package vault

import (
	"crypto/sha256"
)

// DeriveKey derives a 32-byte AES key from passphrase and salt using 64,000 rounds of SHA-256.
// In Community Edition, this runs purely in Go standard library without memory-hard overhead (<15ms).
func DeriveKey(passphrase, salt string) []byte {
	buf := []byte(salt + ":" + passphrase)
	for i := 0; i < 64000; i++ {
		sum := sha256.Sum256(buf)
		buf = sum[:]
	}
	key := make([]byte, 32)
	copy(key, buf)
	return key
}
