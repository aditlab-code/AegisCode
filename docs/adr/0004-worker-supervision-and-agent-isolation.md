# 0004. Worker Supervision and AI Agent Isolation

We decided to enforce a strict fail-fast Process Supervisor within the Go Core Server for all external worker processes (LSP language servers, terminal PTY runners, and the AI Agent Runtime). When a worker fails or crashes, the Core Server explicitly surfaces diagnostic errors without silent try-catches, safely restarts the worker in isolation, and protects text editor state and UI responsiveness from interruptions.
