# 0006. Pragmatic Go Package Layout

We decided to structure the Go Core Server using a pragmatic, flat package-by-feature layout (`cmd/server/main.go`, `internal/config`, `internal/store`, `internal/supervisor`, `internal/workspace`, `internal/api`). This adheres strictly to the repository principle "DONT Over Engineering", providing straightforward idiomatic Go development and testing without deep hexagonal or DDD boilerplate layers.
