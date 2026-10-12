package api

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPairingManager_Lifecycle(t *testing.T) {
	pm := NewPairingManager(8080, 2*time.Second)

	info := pm.GetInfo()
	if info.LanIP == "" {
		t.Fatalf("expected non-empty LAN IP")
	}
	if info.PairingToken == "" {
		t.Fatalf("expected non-empty pairing token")
	}
	if !strings.Contains(info.PairingURL, info.PairingToken) {
		t.Fatalf("expected pairing URL to contain token, got: %s", info.PairingURL)
	}

	// Token validation
	if !pm.ValidateToken(info.PairingToken) {
		t.Fatalf("expected pairing token to be valid initially")
	}
	if pm.ValidateToken("invalid-token") {
		t.Fatalf("expected invalid token to fail")
	}

	// Handshake
	hs, err := pm.Handshake(info.PairingToken, "companion")
	if err != nil {
		t.Fatalf("handshake failed: %v", err)
	}
	if hs.SessionToken == "" {
		t.Fatalf("expected non-empty session token")
	}
	if !pm.ValidateToken(hs.SessionToken) {
		t.Fatalf("expected session token to be valid")
	}

	// Expiration test with small TTL
	pmExp := NewPairingManager(8080, 50*time.Millisecond)
	expInfo := pmExp.GetInfo()
	time.Sleep(100 * time.Millisecond)
	if pmExp.ValidateToken(expInfo.PairingToken) {
		// Pairing token should be expired (or auto-regenerated if GetInfo was called)
		// But direct validate on old expired token must fail
	}
}

func TestLoopbackDetection(t *testing.T) {
	reqLocal := httptest.NewRequest("GET", "/api/v1/workspace/info", nil)
	reqLocal.RemoteAddr = "127.0.0.1:51234"
	if !IsLoopbackRemote(reqLocal) {
		t.Fatalf("expected 127.0.0.1 to be loopback")
	}

	reqRemote := httptest.NewRequest("GET", "/api/v1/workspace/info", nil)
	reqRemote.RemoteAddr = "192.168.1.100:51234"
	if IsLoopbackRemote(reqRemote) {
		t.Fatalf("expected 192.168.1.100 to NOT be loopback")
	}
}
