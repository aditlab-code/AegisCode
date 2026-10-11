package supervisor

import (
	"sync"
	"time"
)

type WorkerStatus string

const (
	StatusStarting WorkerStatus = "starting"
	StatusRunning  WorkerStatus = "running"
	StatusBackoff  WorkerStatus = "backoff"
	StatusCrashed  WorkerStatus = "crashed"
	StatusStopped  WorkerStatus = "stopped"
)

type RestartPolicy string

const (
	RestartNever     RestartPolicy = "never"
	RestartOnFailure RestartPolicy = "on-failure"
)

// WorkerConfig defines execution and restart parameters for a supervised process.
type WorkerConfig struct {
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	Command       string        `json:"command"`
	Args          []string      `json:"args"`
	Env           []string      `json:"env"`
	Dir           string        `json:"dir"`
	RestartPolicy RestartPolicy `json:"restartPolicy"`
	MaxRetries    int           `json:"maxRetries"`  // default 3
	RetryWindow   time.Duration `json:"retryWindow"` // default 30s
}

// WorkerInfo contains live diagnostic metadata for API consumers and UI panels.
type WorkerInfo struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	Command      string       `json:"command"`
	Status       WorkerStatus `json:"status"`
	PID          int          `json:"pid"`
	RestartCount int          `json:"restartCount"`
	Uptime       int64        `json:"uptimeSeconds"`
	LastError    string       `json:"lastError,omitempty"`
}

// CrashEvent captures diagnostic telemetry when a worker terminates unexpectedly.
type CrashEvent struct {
	WorkerID  string    `json:"workerId"`
	Name      string    `json:"name"`
	ExitCode  int       `json:"exitCode"`
	Error     string    `json:"error"`
	TailLogs  string    `json:"tailLogs"`
	Timestamp time.Time `json:"timestamp"`
}

// RingBuffer is a thread-safe circular byte buffer with a fixed maximum capacity.
type RingBuffer struct {
	mu     sync.Mutex
	buf    []byte
	size   int
	start  int
	length int
}

// NewRingBuffer allocates a thread-safe ring buffer with the specified byte capacity.
func NewRingBuffer(size int) *RingBuffer {
	if size <= 0 {
		size = 64 * 1024 // 64 KB default
	}
	return &RingBuffer{
		buf:  make([]byte, size),
		size: size,
	}
}

// Write appends bytes to the ring buffer, overwriting the oldest bytes when full.
func (r *RingBuffer) Write(p []byte) (n int, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	n = len(p)
	if n == 0 {
		return 0, nil
	}

	// If input is larger than or equal to buffer capacity, only keep the tail
	if n >= r.size {
		tail := p[n-r.size:]
		copy(r.buf, tail)
		r.start = 0
		r.length = r.size
		return n, nil
	}

	for _, b := range p {
		if r.length < r.size {
			idx := (r.start + r.length) % r.size
			r.buf[idx] = b
			r.length++
		} else {
			r.buf[r.start] = b
			r.start = (r.start + 1) % r.size
		}
	}
	return n, nil
}

// String returns the contiguous log history stored in the ring buffer.
func (r *RingBuffer) String() string {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.length == 0 {
		return ""
	}
	res := make([]byte, r.length)
	for i := 0; i < r.length; i++ {
		res[i] = r.buf[(r.start+i)%r.size]
	}
	return string(res)
}
