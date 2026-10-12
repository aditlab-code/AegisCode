# 0001. Hybrid Layered Core with Out-of-Process Workers and Event-Driven Streaming

We decided to structure AegisCode as a Hybrid Layered Core (Local Server) with Out-of-Process Workers communicating via Event-Driven Streaming (SSE/stdio JSON-RPC) and an embedded SQLite Metadata Store in the OS App Data Directory. This avoids the heavy memory and IPC latency penalties of enterprise distributed microservices while providing crash isolation for compilers, linters, and terminals in a lightweight local IDE.
