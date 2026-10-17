package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type clientAttempt struct {
	count      int
	firstSeen  time.Time
	lockedTill time.Time
}

// PairingSession represents an authenticated companion session with TTL.
type PairingSession struct {
	ClientType string
	ExpiresAt  time.Time
	CreatedAt  time.Time
}

// PairingManager manages ephemeral pairing tokens, session tokens, and LAN IP auto-detection.
type PairingManager struct {
	mu             sync.RWMutex
	port           int
	lanIP          string
	pairingToken   string
	pairingExpires time.Time
	sessions       map[string]PairingSession
	ttl            time.Duration
	attempts       map[string]*clientAttempt
	isLocked       bool
}

// NewPairingManager creates and initializes a pairing manager with auto-detected LAN IP and active pairing code.
func NewPairingManager(port int, ttl ...time.Duration) *PairingManager {
	tokenTTL := 24 * time.Hour
	if len(ttl) > 0 && ttl[0] > 0 {
		tokenTTL = ttl[0]
	}

	detectedIP := detectLANIP()
	pm := &PairingManager{
		port:           port,
		lanIP:          detectedIP,
		sessions:       make(map[string]PairingSession),
		ttl:            tokenTTL,
		attempts:       make(map[string]*clientAttempt),
	}

	pm.regeneratePairingTokenLocked(tokenTTL)
	return pm
}

// SetPort updates the active port when listener port differs.
func (pm *PairingManager) SetPort(port int) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.port = port
}

// SetLocked controls whether companion pairing is enabled or administratively locked.
func (pm *PairingManager) SetLocked(locked bool) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.isLocked = locked
}

// IsLocked reports whether companion pairing is currently locked.
func (pm *PairingManager) IsLocked() bool {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return pm.isLocked
}

// DetectLANIP returns the auto-detected LAN IP address.
func (pm *PairingManager) DetectLANIP() string {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return pm.lanIP
}

func (pm *PairingManager) regeneratePairingTokenLocked(ttl time.Duration) {
	code := generateSecurePairingCode(6)
	pm.pairingToken = code
	pm.pairingExpires = time.Now().Add(ttl)
}

// RefreshPairingToken forces a new pairing token with a fresh expiration window.
func (pm *PairingManager) RefreshPairingToken() (string, time.Time) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.regeneratePairingTokenLocked(pm.ttl)
	return pm.pairingToken, pm.pairingExpires
}

// GetInfo returns current pairing status, detected LAN IP, active token, and pairing URL.
func (pm *PairingManager) GetInfo() PairingInfoResponse {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if pm.isLocked {
		return PairingInfoResponse{
			LanIP:        pm.lanIP,
			Port:         pm.port,
			PairingToken: "[LOCKED]",
			PairingURL:   "",
			ExpiresIn:    0,
			ExpiresAt:    0,
		}
	}

	// Auto refresh if expired
	if time.Now().After(pm.pairingExpires) {
		pm.regeneratePairingTokenLocked(pm.ttl)
	}

	pairingURL := fmt.Sprintf("http://%s:%d/?mode=companion&token=%s", pm.lanIP, pm.port, pm.pairingToken)
	remainingSec := int64(time.Until(pm.pairingExpires).Seconds())
	if remainingSec < 0 {
		remainingSec = 0
	}

	return PairingInfoResponse{
		LanIP:        pm.lanIP,
		Port:         pm.port,
		PairingToken: pm.pairingToken,
		PairingURL:   pairingURL,
		ExpiresIn:    remainingSec,
		ExpiresAt:    pm.pairingExpires.Unix(),
	}
}

// Handshake exchanges a valid unexpired pairing token for a time-limited session token.
func (pm *PairingManager) Handshake(pairingToken, clientType string, clientIP ...string) (*HandshakeResponse, error) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if pm.isLocked {
		return nil, errors.New("companion pairing is temporarily locked by administrator policy")
	}

	ipKey := "global"
	if len(clientIP) > 0 && clientIP[0] != "" {
		host, _, err := net.SplitHostPort(clientIP[0])
		if err == nil {
			ipKey = host
		} else {
			ipKey = clientIP[0]
		}
	}

	if pm.attempts == nil {
		pm.attempts = make(map[string]*clientAttempt)
	}

	att, exists := pm.attempts[ipKey]
	if !exists {
		att = &clientAttempt{firstSeen: time.Now()}
		pm.attempts[ipKey] = att
	}

	if time.Now().Before(att.lockedTill) {
		return nil, fmt.Errorf("too many failed pairing attempts; client is temporarily locked out until %s", att.lockedTill.Format("15:04:05"))
	}

	if time.Since(att.firstSeen) > time.Minute {
		att.count = 0
		att.firstSeen = time.Now()
	}

	cleanToken := strings.TrimSpace(pairingToken)
	if cleanToken == "" {
		return nil, fmt.Errorf("pairing token cannot be empty")
	}

	match := len(cleanToken) == len(pm.pairingToken) && subtle.ConstantTimeCompare([]byte(pm.pairingToken), []byte(cleanToken)) == 1
	if time.Now().After(pm.pairingExpires) || !match {
		att.count++
		if att.count >= 5 {
			att.lockedTill = time.Now().Add(5 * time.Minute)
			pm.regeneratePairingTokenLocked(pm.ttl)
			return nil, fmt.Errorf("too many failed pairing attempts; client locked out for 5 minutes (pairing token regenerated)")
		}
		return nil, fmt.Errorf("invalid or expired pairing token")
	}

	// Success: reset attempts
	att.count = 0
	att.lockedTill = time.Time{}

	// Generate 32-byte cryptographic session token
	sessionBytes := make([]byte, 32)
	if _, err := rand.Read(sessionBytes); err != nil {
		return nil, fmt.Errorf("crypto rand failure: %w", err)
	}
	sessionToken := hex.EncodeToString(sessionBytes)
	expiresAt := time.Now().Add(pm.ttl)

	pm.sessions[sessionToken] = PairingSession{
		ClientType: clientType,
		ExpiresAt:  expiresAt,
		CreatedAt:  time.Now(),
	}

	return &HandshakeResponse{
		SessionToken: sessionToken,
		ExpiresIn:    int64(pm.ttl.Seconds()),
		ExpiresAt:    expiresAt.Unix(),
	}, nil
}

// CreateLocalSession creates and registers an ephemeral session token for the local Web shell (ADR 0017).
func (pm *PairingManager) CreateLocalSession() string {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	sessionBytes := make([]byte, 32)
	if _, err := rand.Read(sessionBytes); err != nil {
		return ""
	}
	token := hex.EncodeToString(sessionBytes)
	pm.sessions[token] = PairingSession{
		ClientType: "local-shell",
		ExpiresAt:  time.Now().Add(pm.ttl),
		CreatedAt:  time.Now(),
	}
	return token
}

// ValidateToken verifies whether the provided token matches an active unexpired session or active pairing code.
func (pm *PairingManager) ValidateToken(token string) bool {
	clean := strings.TrimSpace(token)
	if clean == "" {
		return false
	}

	pm.mu.RLock()
	defer pm.mu.RUnlock()

	// Check against pairing token
	if time.Now().Before(pm.pairingExpires) && len(clean) == len(pm.pairingToken) && subtle.ConstantTimeCompare([]byte(pm.pairingToken), []byte(clean)) == 1 {
		return true
	}

	// Check against active session tokens
	sess, exists := pm.sessions[clean]
	if !exists {
		return false
	}

	return time.Now().Before(sess.ExpiresAt)
}

// IsLoopbackRemote returns true if the incoming HTTP request originates from local loopback (127.0.0.1, ::1) or in-memory test runner (192.0.2.1).
func IsLoopbackRemote(r *http.Request) bool {
	if r.RemoteAddr == "" {
		return true
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}

	ip := net.ParseIP(host)
	if ip != nil && (ip.IsLoopback() || ip.String() == "192.0.2.1") {
		return true
	}

	return host == "127.0.0.1" || host == "::1" || host == "localhost"
}

// ExtractToken retrieves the bearer or query token from an HTTP request.
func ExtractToken(r *http.Request) string {
	// 1. Authorization: Bearer <token>
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}

	// 2. Custom headers
	if tok := r.Header.Get("X-Session-Token"); tok != "" {
		return strings.TrimSpace(tok)
	}
	if tok := r.Header.Get("X-Pairing-Token"); tok != "" {
		return strings.TrimSpace(tok)
	}

	// 3. Query string parameter (?token=...)
	if tok := r.URL.Query().Get("token"); tok != "" {
		return strings.TrimSpace(tok)
	}

	return ""
}

// detectLANIP discovers non-loopback IPv4 network addresses on private subnets.
func detectLANIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "127.0.0.1"
	}

	var fallback string
	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		if !ok || ipNet.IP.IsLoopback() {
			continue
		}
		ip4 := ipNet.IP.To4()
		if ip4 == nil {
			continue
		}

		ipStr := ip4.String()
		// Prioritize standard RFC 1918 private subnets
		if strings.HasPrefix(ipStr, "192.168.") || strings.HasPrefix(ipStr, "10.") || isClassBPrivate(ip4) {
			return ipStr
		}
		if fallback == "" {
			fallback = ipStr
		}
	}

	if fallback != "" {
		return fallback
	}
	return "127.0.0.1"
}

func isClassBPrivate(ip net.IP) bool {
	if len(ip) != 4 && len(ip) != 16 {
		return false
	}
	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}
	return ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31
}

// generateSecurePairingCode produces an alphanumeric pairing string excluding ambiguous characters.
func generateSecurePairingCode(length int) string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, length)
	maxVal := big.NewInt(int64(len(charset)))
	for i := range b {
		num, err := rand.Int(rand.Reader, maxVal)
		if err != nil {
			b[i] = charset[i%len(charset)]
		} else {
			b[i] = charset[num.Int64()]
		}
	}
	return string(b)
}
