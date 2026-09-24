#!/usr/bin/env node
/**
 * test-engines.js
 *
 * Automated reachability test for the ZS New Tab search engines.
 *
 * What it does:
 *   - Reads SEARCH_ENGINES from js/10-core-state.js (regex + eval, no build needed).
 *   - Fetches each engine URL with a sample query.
 *   - Checks: HTTP status, final URL after redirects, query presence in the URL.
 *   - Prints a PASS / WARN / BLOCKED / FAIL table.
 *
 * Verdicts:
 *   PASS     reachable and the query is visible in the final URL
 *   WARN     reachable, but the query can't be confirmed (redirect, login
 *            wall, JS-rendered page, or query lives in a #fragment)
 *   BLOCKED  401 / 403 / 429 / 503 / 999: almost always bot protection or
 *            rate limiting against Node, NOT a broken link. Check in a browser.
 *   FAIL     network error, timeout, 404 / 410, or another 4xx / 5xx
 *
 * What it CAN'T do:
 *   - Verify the site actually showed search results for the query. A site
 *     can return 200 with a generic homepage that ignores the query.
 *   - Get past bot protection that fingerprints TLS (Cloudflare etc.).
 *     Headers help a little, but Node's fetch is still not a real browser.
 *
 * Usage:
 *   node test-engines.js
 *   node test-engines.js "arabic query"
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const STATE_FILE = path.join(ROOT, "js", "10-core-state.js");

const TIMEOUT_MS = 12000;
const BATCH_SIZE = 2;          // parallel requests per batch (low = fewer 429s)
const BATCH_DELAY_MS = 1500;   // pause between batches
const MAX_RETRIES_429 = 2;     // retries when a site answers 429
const MAX_RETRY_WAIT_MS = 10000;

const BLOCKED_CODES = new Set([401, 403, 429, 503, 999]);

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/131.0.0.0 Safari/537.36",
    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -----------------------------------------------------------------
// Load engines
// -----------------------------------------------------------------
function loadEngines() {
    const src = fs.readFileSync(STATE_FILE, "utf8");
    const match = src.match(/const\s+SEARCH_ENGINES\s*=\s*(\[[\s\S]*?\n\s*\]);/);
    if (!match) throw new Error("Could not find SEARCH_ENGINES in " + STATE_FILE);
    // Safe-ish: we only eval the array literal we matched ourselves.
    return new Function(`return ${match[1]};`)();
}

// -----------------------------------------------------------------
// Single request (no retry)
// -----------------------------------------------------------------
async function fetchOnce(url, query) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: HEADERS,
        });

        clearTimeout(timer);

        const finalUrl = res.url;

        // Heuristic: does the query survive the redirect chain?
        const normQuery = query.toLowerCase();
        const finalLower = finalUrl.toLowerCase();
        const queryInFinalUrl =
            finalLower.includes(encodeURIComponent(query).toLowerCase()) ||
            finalLower.includes(normQuery.replace(/ /g, "+")) ||
            finalLower.includes(normQuery.replace(/ /g, "%20"));

        return {
            status: res.status,
            finalUrl,
            queryInFinalUrl,
            retryAfter: res.headers.get("retry-after"),
        };
    } catch (err) {
        clearTimeout(timer);
        // Node's fetch hides the real reason in err.cause (ENOTFOUND, ECONNRESET, ...)
        const detail = err.cause?.code || err.cause?.message || err.message;
        return {
            status: 0,
            error: err.name === "AbortError" ? "TIMEOUT" : detail,
        };
    }
}

// -----------------------------------------------------------------
// Single engine test (with 429 retry)
// -----------------------------------------------------------------
async function testEngine(engine, query) {
    const url = engine.url + encodeURIComponent(query);
    let result;

    for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
        result = await fetchOnce(url, query);

        if (result.status !== 429 || attempt === MAX_RETRIES_429) break;

        const headerWait = Number(result.retryAfter) * 1000;
        const wait = Math.min(
            Number.isFinite(headerWait) && headerWait > 0 ? headerWait : 3000 * (attempt + 1),
            MAX_RETRY_WAIT_MS
        );
        await sleep(wait);
    }

    return { ...result, verdict: classify(engine, result) };
}

// -----------------------------------------------------------------
// Verdict
// -----------------------------------------------------------------
function classify(engine, r) {
    if (r.error) {
        return { level: "FAIL", note: r.error };
    }
    if (BLOCKED_CODES.has(r.status)) {
        return { level: "BLOCKED", note: `HTTP ${r.status} (bot protection / rate limit)` };
    }
    if (r.status >= 400) {
        return { level: "FAIL", note: `HTTP ${r.status}` };
    }
    if (engine.url.includes("#")) {
        return { level: "WARN", note: "query is in the #fragment (never sent to server), check manually" };
    }
    if (!r.queryInFinalUrl) {
        return { level: "WARN", note: "query not visible in final URL" };
    }
    return { level: "PASS", note: "" };
}

// -----------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------
const c = {
    red:     s => `\x1b[31m${s}\x1b[0m`,
    green:   s => `\x1b[32m${s}\x1b[0m`,
    yellow:  s => `\x1b[33m${s}\x1b[0m`,
    magenta: s => `\x1b[35m${s}\x1b[0m`,
    dim:     s => `\x1b[2m${s}\x1b[0m`,
    bold:    s => `\x1b[1m${s}\x1b[0m`,
};

const COLOR_BY_LEVEL = {
    PASS: c.green,
    WARN: c.yellow,
    BLOCKED: c.magenta,
    FAIL: c.red,
};

function pad(s, n) { return String(s).padEnd(n); }
function padNum(s, n) { return String(s).padStart(n); }

// -----------------------------------------------------------------
// Main
// -----------------------------------------------------------------
async function run() {
    const query = process.argv[2] || "hello world test";
    const engines = loadEngines();

    console.log("");
    console.log(c.bold(`Testing ${engines.length} engines`));
    console.log(c.dim(
        `Query: "${query}"    Timeout: ${TIMEOUT_MS}ms    Batch: ${BATCH_SIZE}    Delay: ${BATCH_DELAY_MS}ms`
    ));
    console.log("");

    const results = [];

    for (let i = 0; i < engines.length; i += BATCH_SIZE) {
        const batch = engines.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(async (eng) => {
                const r = await testEngine(eng, query);
                return { ...eng, ...r };
            })
        );
        results.push(...batchResults);
        process.stdout.write(
            c.dim(`  tested ${Math.min(i + BATCH_SIZE, engines.length)}/${engines.length}\r`)
        );

        if (i + BATCH_SIZE < engines.length) await sleep(BATCH_DELAY_MS);
    }
    process.stdout.write(" ".repeat(40) + "\r"); // clear progress line

    // ---- Print table ----
    const W_GROUP = 18;
    const W_NAME = 20;
    const W_STATUS = 6;
    const W_VERDICT = 40;

    console.log("");
    console.log(c.bold(
        pad("Group", W_GROUP) + " " +
        pad("Engine", W_NAME) + " " +
        padNum("Code", W_STATUS) + "  " +
        "Verdict"
    ));
    console.log(c.dim("─".repeat(W_GROUP + W_NAME + W_STATUS + W_VERDICT + 4)));

    const counts = { PASS: 0, WARN: 0, BLOCKED: 0, FAIL: 0 };

    for (const r of results) {
        const { level, note } = r.verdict;
        counts[level]++;

        const color = COLOR_BY_LEVEL[level];
        const text = note ? `${level}: ${note}` : level;

        console.log(
            pad(r.group || "Other", W_GROUP) + " " +
            pad(r.name, W_NAME) + " " +
            padNum(r.status || "-", W_STATUS) + "  " +
            color(text)
        );
    }

    console.log(c.dim("─".repeat(W_GROUP + W_NAME + W_STATUS + W_VERDICT + 4)));
    console.log("");
    console.log(c.bold("Summary"));
    console.log(`  ${c.green("PASS")}     ${counts.PASS}`);
    console.log(`  ${c.yellow("WARN")}     ${counts.WARN}   ${c.dim("(reachable, query not confirmed: verify manually)")}`);
    console.log(`  ${c.magenta("BLOCKED")}  ${counts.BLOCKED}   ${c.dim("(bot protection / rate limit: test in a real browser)")}`);
    console.log(`  ${c.red("FAIL")}     ${counts.FAIL}   ${c.dim("(network error, timeout, 404, other 4xx/5xx)")}`);
    console.log(`  ${c.dim("Total    " + results.length)}`);
    console.log("");

    // Only real failures should fail a CI run; BLOCKED/WARN need a human.
    if (counts.FAIL > 0) process.exitCode = 1;
}

run().catch(err => {
    console.error(c.red("Test failed to run: " + err.message));
    process.exit(1);
});