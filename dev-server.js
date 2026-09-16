#!/usr/bin/env node
/**
 * dev-server.js
 *
 * Dev watcher + static server for the ZS New Tab extension.
 *
 *   node dev-server.js            -> fast rebuilds (skips esbuild minify)
 *   node dev-server.js --minify   -> rebuilds with minification too
 *
 * What it does:
 *   1. Runs build.js's runBuild() once on startup (in-process, no
 *      child process spawned — just a direct function call).
 *   2. Serves dist/ over HTTP (default http://localhost:5500).
 *   3. Opens that URL in your default browser automatically.
 *   4. Watches styles/, js/, index.html, manifest.json, fonts/, icons/
 *      and re-runs the build whenever something changes (debounced).
 *   5. Injects a tiny live-reload snippet into the served index.html
 *      so the page refreshes itself after a rebuild — no manual F5.
 *
 * Note: this only previews dist/index.html as a normal web page. It
 * does NOT emulate chrome.* extension APIs — to actually test the
 * extension, load dist/ as an unpacked extension in the browser.
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");
const { runBuild } = require("./build.js");

// -----------------------------------------------------------------
// Config
// -----------------------------------------------------------------
const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const PORT = process.env.PORT ? Number(process.env.PORT) : 5500;
const MINIFY = process.argv.includes("--minify");

const WATCH_TARGETS = ["styles", "js", "index.html", "manifest.json", "fonts", "icons"];
const DEBOUNCE_MS = 200;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
};

const LIVERELOAD_SNIPPET = `
<script>
(function () {
    var knownVersion = null;
    setInterval(function () {
        fetch("/__build_version")
            .then(function (r) { return r.text(); })
            .then(function (v) {
                if (knownVersion === null) { knownVersion = v; return; }
                if (v !== knownVersion) { location.reload(); }
            })
            .catch(function () { /* server mid-rebuild, ignore */ });
    }, 500);
})();
</script>
`;

// -----------------------------------------------------------------
// Build
// -----------------------------------------------------------------
let buildVersion = 0;
let buildInProgress = false;
let buildQueued = false;

function triggerBuild() {
    if (buildInProgress) {
        buildQueued = true;
        return;
    }
    buildInProgress = true;

    console.log(`\n[dev] rebuilding${MINIFY ? " (minified)" : ""}...`);
    // In-process call — no child process spawned, so no PowerShell
    // startup cost and none of the native-command stderr quirks.
    const result = runBuild({ minify: MINIFY, clean: true });

    buildInProgress = false;
    if (result.ok) {
        buildVersion++;
        console.log("[dev] build OK — reloading browser");
    } else {
        console.log(`[dev] build FAILED — dist/ left as-is`);
    }

    if (buildQueued) {
        buildQueued = false;
        triggerBuild();
    }
}

// -----------------------------------------------------------------
// Watching (debounced)
// -----------------------------------------------------------------
let debounceTimer = null;

function scheduleRebuild(changedPath) {
    console.log(`[dev] change detected: ${changedPath}`);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerBuild, DEBOUNCE_MS);
}

function startWatching() {
    for (const target of WATCH_TARGETS) {
        const fullPath = path.join(ROOT, target);
        if (!fs.existsSync(fullPath)) continue;

        const stat = fs.statSync(fullPath);
        const watchOpts = stat.isDirectory() ? { recursive: true } : {};

        try {
            fs.watch(fullPath, watchOpts, (eventType, filename) => {
                scheduleRebuild(filename ? path.join(target, filename) : target);
            });
            console.log(`[dev] watching ${target}${stat.isDirectory() ? "/**" : ""}`);
        } catch (err) {
            console.log(`[dev] warning: could not watch ${target}: ${err.message}`);
        }
    }
}

// -----------------------------------------------------------------
// Static server
// -----------------------------------------------------------------
function serveFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("404 Not Found: " + filePath);
            return;
        }

        if (ext === ".html") {
            let html = data.toString("utf8");
            html = html.includes("</body>")
                ? html.replace("</body>", LIVERELOAD_SNIPPET + "</body>")
                : html + LIVERELOAD_SNIPPET;
            res.writeHead(200, { "Content-Type": contentType });
            res.end(html);
            return;
        }

        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
    });
}

function startServer() {
    const server = http.createServer((req, res) => {
        if (req.url === "/__build_version") {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end(String(buildVersion));
            return;
        }

        let urlPath = decodeURIComponent(req.url.split("?")[0]);
        if (urlPath === "/") urlPath = "/index.html";

        const filePath = path.join(DIST, urlPath);

        // Basic guard against escaping dist/
        if (!filePath.startsWith(DIST)) {
            res.writeHead(403);
            res.end("Forbidden");
            return;
        }

        serveFile(res, filePath);
    });

    server.listen(PORT, () => {
        console.log(`[dev] serving dist/ at http://localhost:${PORT}`);
        openBrowser(`http://localhost:${PORT}/`);
    });
}

function openBrowser(url) {
    const platform = os.platform();
    let cmd;
    if (platform === "win32") {
        cmd = `start "" "${url}"`;
    } else if (platform === "darwin") {
        cmd = `open "${url}"`;
    } else {
        cmd = `xdg-open "${url}"`;
    }
    require("child_process").exec(cmd, (err) => {
        if (err) console.log(`[dev] could not auto-open browser — open ${url} manually`);
    });
}

// -----------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------
if (!fs.existsSync(path.join(ROOT, "build.js"))) {
    console.error("[dev] build.js not found in current directory. Run this from the project root.");
    process.exit(1);
}

console.log(`[dev] starting${MINIFY ? " (minified rebuilds)" : " (fast rebuilds, use --minify for full)"}...`);
triggerBuild();
startWatching();
startServer();