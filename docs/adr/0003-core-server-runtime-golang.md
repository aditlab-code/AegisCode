# 0003. Core Server Implementation in Go (Golang)

We decided to implement the Core Server in Go (Golang) compiled as a single standalone binary. This balances lightweight runtime resource consumption, instant startup latency, native goroutine concurrency for multiplexed SSE and PTY streams, and straightforward learning ergonomics, while avoiding heavy Node.js runtime overhead.
