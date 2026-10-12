# 0005. Unix Domain Sockets for Agent IPC

We decided to use Unix Domain Sockets (`~/.aegis/run/agent.sock` on Unix/macOS) and Named Pipes (on Windows) with strict `0600` file permissions for communication between the Core Server and the out-of-process Agent Runtime. This eliminates TCP port collisions, bypasses network stack overhead, and prevents unauthorized local browser access via DNS rebinding or port scanning.
