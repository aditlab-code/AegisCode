import Cocoa
import WebKit

var globalDelegate: AppDelegate?

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    var serverPipe: Pipe?
    var serverPort: Int = 8080
    var isTerminating = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        createMenuBar()
        startBackendServer()
    }

    func createMenuBar() {
        let menubar = NSMenu()
        let appMenuItem = NSMenuItem()
        menubar.addItem(appMenuItem)
        NSApp.mainMenu = menubar

        let appMenu = NSMenu()
        let quitMenuItem = NSMenuItem(
            title: "Quit AegisCode",
            action: #selector(handleQuit),
            keyEquivalent: "q"
        )
        quitMenuItem.target = self
        appMenu.addItem(quitMenuItem)
        appMenuItem.submenu = appMenu
    }

    @objc func handleQuit() {
        terminateAllAndExit()
    }

    func startBackendServer() {
        let bundleURL = Bundle.main.bundleURL
        let serverURL = bundleURL.appendingPathComponent("Contents/MacOS/aegiscode-server")
        
        let process = Process()
        process.executableURL = serverURL
        process.arguments = []
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        self.serverPipe = pipe
        self.serverProcess = process

        let handle = pipe.fileHandleForReading
        handle.readabilityHandler = { [weak self] fileHandle in
            let data = fileHandle.availableData
            guard !data.isEmpty else { return }
            if let output = String(data: data, encoding: .utf8) {
                if let range = output.range(of: "listening on http://localhost:") {
                    let substring = output[range.upperBound...]
                    let portDigits = substring.prefix(while: { $0.isNumber })
                    if let port = Int(portDigits) {
                        DispatchQueue.main.async {
                            self?.serverPort = port
                            self?.setupWindowAndLoadURL(port: port)
                        }
                    }
                }
            }
        }

        do {
            try process.run()
        } catch {
            print("Failed to spawn server process: \(error)")
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            if self?.window == nil {
                self?.setupWindowAndLoadURL(port: self?.serverPort ?? 8080)
            }
        }
    }

    func setupWindowAndLoadURL(port: Int) {
        if self.window != nil { return }

        let rect = NSRect(x: 100, y: 100, width: 1280, height: 800)
        let styleMask: NSWindow.StyleMask = [.titled, .closable, .miniaturizable, .resizable]
        
        self.window = NSWindow(contentRect: rect, styleMask: styleMask, backing: .buffered, defer: false)
        self.window.title = "AegisCode"
        self.window.minSize = NSSize(width: 1024, height: 640)
        self.window.center()
        self.window.delegate = self
        self.window.backgroundColor = NSColor(red: 9/255.0, green: 13/255.0, blue: 22/255.0, alpha: 1.0)

        let config = WKWebViewConfiguration()
        self.webView = WKWebView(frame: self.window.contentView!.bounds, configuration: config)
        self.webView.autoresizingMask = [.width, .height]
        self.webView.underPageBackgroundColor = NSColor(red: 9/255.0, green: 13/255.0, blue: 22/255.0, alpha: 1.0)

        self.window.contentView?.addSubview(self.webView)
        self.window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        let url = URL(string: "http://localhost:\(port)/")!
        self.webView.load(URLRequest(url: url))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func windowWillClose(_ notification: Notification) {
        terminateAllAndExit()
    }

    func applicationWillTerminate(_ notification: Notification) {
        terminateAllAndExit()
    }

    func terminateAllAndExit() {
        if isTerminating { return }
        isTerminating = true

        if let process = self.serverProcess, process.isRunning {
            let pid = process.processIdentifier
            process.terminate()
            kill(-pid, SIGTERM)
            kill(pid, SIGTERM)
            usleep(250_000)
            if process.isRunning {
                kill(-pid, SIGKILL)
                kill(pid, SIGKILL)
            }
        }
        exit(0)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
globalDelegate = delegate
app.delegate = delegate

// Register POSIX signal handlers to guarantee port kill on any termination event
let signalHandler: @convention(c) (Int32) -> Void = { _ in
    globalDelegate?.terminateAllAndExit()
    exit(0)
}
signal(SIGTERM, signalHandler)
signal(SIGINT, signalHandler)
signal(SIGHUP, signalHandler)

app.run()
