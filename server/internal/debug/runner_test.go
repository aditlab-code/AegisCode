package debug

import (
	"context"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestFindDelve(t *testing.T) {
	path, err := FindDelve()
	if err != nil {
		t.Skipf("Skipping TestFindDelve: dlv not installed on test host: %v", err)
	}
	if path == "" {
		t.Fatalf("expected non-empty dlv path")
	}
}

func TestAllocateFreePort(t *testing.T) {
	port, err := AllocateFreePort()
	if err != nil {
		t.Fatalf("AllocateFreePort failed: %v", err)
	}
	if port <= 1024 || port > 65535 {
		t.Fatalf("unexpected port: %d", port)
	}

	// Verify port is actually available to bind
	l, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(port))
	if err != nil {
		t.Fatalf("allocated port %d is not immediately bindable: %v", port, err)
	}
	_ = l.Close()
}

func TestDelveRunnerLifecycle(t *testing.T) {
	_, err := FindDelve()
	if err != nil {
		t.Skip("skipping TestDelveRunnerLifecycle because dlv is not installed")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	runner, err := StartDelve(ctx, "")
	if err != nil {
		t.Fatalf("StartDelve failed: %v", err)
	}

	if runner.Port <= 0 {
		t.Fatalf("expected positive port, got %d", runner.Port)
	}

	// Verify DAP client is connected and responds
	if runner.Client == nil {
		t.Fatalf("expected non-nil runner.Client")
	}
	initCtx, initCancel := context.WithTimeout(ctx, 3*time.Second)
	_, err = runner.Client.Initialize(initCtx)
	initCancel()
	if err != nil {
		t.Fatalf("failed to initialize delve dap client: %v", err)
	}

	// Clean teardown
	if err := runner.Close(); err != nil {
		t.Fatalf("runner.Close() error: %v", err)
	}

	// Ensure port is freed
	time.Sleep(100 * time.Millisecond)
	connAfter, errAfter := net.DialTimeout("tcp", "127.0.0.1:"+strconv.Itoa(runner.Port), 200*time.Millisecond)
	if errAfter == nil {
		_ = connAfter.Close()
		t.Fatalf("port %d should have been released after close", runner.Port)
	}
}

func TestCppCompilationErrorOnMissingSource(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cfg, ok := GetAdapter("cpp")
	if !ok {
		t.Fatalf("cpp adapter config not found")
	}

	// StartAdapter with a non-existent .cpp file should fail at compilation
	_, _, err := StartAdapter(ctx, cfg, "non_existent_source.cpp", t.TempDir())
	if err == nil {
		t.Fatalf("expected error compiling non-existent C++ source, got nil")
	}
	if !strings.Contains(err.Error(), "compile") {
		t.Fatalf("expected compilation error message, got: %v", err)
	}
}
