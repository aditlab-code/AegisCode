package main

import (
	"testing"
)

func TestResolvePortPrecedence(t *testing.T) {
	tests := []struct {
		name      string
		flagPort  string
		aegisPort string
		envPort   string
		expected  int
	}{
		{
			name:      "Flag takes highest precedence",
			flagPort:  "9001",
			aegisPort: "9002",
			envPort:   "9003",
			expected:  9001,
		},
		{
			name:      "AEGIS_PORT takes precedence over PORT",
			flagPort:  "",
			aegisPort: "9002",
			envPort:   "9003",
			expected:  9002,
		},
		{
			name:      "PORT is used when others empty",
			flagPort:  "",
			aegisPort: "",
			envPort:   "9003",
			expected:  9003,
		},
		{
			name:      "Dynamic scan (0) when all empty",
			flagPort:  "",
			aegisPort: "",
			envPort:   "",
			expected:  0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolvePort(tt.flagPort, tt.aegisPort, tt.envPort)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.expected {
				t.Errorf("expected port %d, got %d", tt.expected, got)
			}
		})
	}
}

func TestResolvePortValidation(t *testing.T) {
	invalidInputs := []string{
		"not-a-number",
		"-1",
		"0",
		"65536",
		"99999",
	}

	for _, input := range invalidInputs {
		t.Run("Invalid_"+input, func(t *testing.T) {
			_, err := resolvePort(input, "", "")
			if err == nil {
				t.Errorf("expected error for invalid port %q, got nil", input)
			}
		})
	}
}

func TestCreateListenerWithExplicitPort(t *testing.T) {
	// Pick an available high port for testing explicit port binding
	l, port, host, err := createListener("127.0.0.1", 0)
	if err != nil {
		t.Fatalf("failed to create dynamic listener: %v", err)
	}
	defer l.Close()

	if port < 8080 || port > 8095 {
		t.Errorf("expected port between 8080 and 8095, got %d", port)
	}
	if host != "127.0.0.1" {
		t.Errorf("expected host 127.0.0.1, got %s", host)
	}
}
