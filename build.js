#!/usr/bin/env node
/**
 * build.js
 *
 * Builds the dist/ folder for the ZS New Tab extension. Node port of
 * the old build.ps1 — same behavior, but exports runBuild() so
 * dev-server.js can call it in-process (no spawning a new shell per
 * rebuild) and use esbuild's JS API directly instead of shelling out
 * to its CLI binary.
 *
 * CLI usage:
 *   node build.js                 -> full build, with minification
 *   node build.js --no-minify     -> skip minification (faster, for debugging)
 *   node build.js --no-clean      -> keep existing dist/ instead of wiping it first
 *
 * Programmatic usage (e.g. from dev-server.js):
 *   const { runBuild } = require("./build.js");
 *   const result = runBuild({ minify: false, clean: true });
 *   // result = { ok, warnings, cssSizeBefore, cssSizeAfter, jsSizeBefore, jsSizeAfter, error }
 *
 * After this runs, use package-extension.ps1 to produce the .zip / .xpi
 * (that one stays in PowerShell — it leans on .NET's ZipArchive to
 * guarantee forward-slash paths for Firefox, which isn't worth
 * replacing with an extra npm dependency).
 */

const fs = require("fs");
const path = require("path");

// -----------------------------------------------------------------
// Small color helpers (no chalk dependency needed)
// -----------------------------------------------------------------
const c = {
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

// Thrown for anything that should stop the build immediately
// (missing index.html, missing source file, etc.) — mirrors the
// `exit 1` calls in build.ps1.
class BuildError extends Error {}

function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
    return bytes + " B";
}

function getDirectorySize(dir) {
    let total = 0;
    const stack = [dir];
    while (stack.length) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) stack.push(full);
            else if (entry.isFile()) total += fs.statSync(full).size;
        }
    }
    return total;
}

function getNumericPrefix(fileName) {
    const m = fileName.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

// Returns only the files involved in an out-of-order pair, not the
// whole list — same behavior as Get-OutOfOrderFiles in build.ps1.
function getOutOfOrderFiles(files) {
    const problems = [];
    for (let i = 1; i < files.length; i++) {
        const prevNum = getNumericPrefix(files[i - 1]);
        const currNum = getNumericPrefix(files[i]);
        if (prevNum === null || currNum === null) continue;
        if (currNum < prevNum) {
            if (!problems.includes(files[i - 1])) problems.push(files[i - 1]);
            if (!problems.includes(files[i])) problems.push(files[i]);
        }
    }
    return problems;
}

// Replaces every match of `regex` (must have the "g" flag) in `text`:
// the first match becomes `replacement`, every later match is removed.
// Positions are re-scanned automatically by .replace(), so no manual
// index bookkeeping is needed (unlike the PowerShell version).
function replaceAllButFirst(text, regex, replacement) {
    let first = true;
    return text.replace(regex, () => {
        if (first) {
            first = false;
            return replacement;
        }
        return "";
    });
}

// -----------------------------------------------------------------
// Minification (esbuild's JS API — no child process, no shell quoting)
// -----------------------------------------------------------------
function getEsbuild(root) {
    try {
        // Resolve esbuild starting from the project root so this works
        // regardless of where build.js itself lives.
        return require(require.resolve("esbuild", { paths: [root] }));
    } catch {
        return null;
    }
}

function minifyFile(esbuild, filePath, loader, warnings) {
    try {
        const code = fs.readFileSync(filePath, "utf8");
        const result = esbuild.transformSync(code, { minify: true, loader });
        fs.writeFileSync(filePath, result.code, "utf8");
    } catch (err) {
        warnings.push(
            `Warning: minification failed for ${path.basename(filePath)} — keeping unminified version. (${err.message})`
        );
    }
}

// -----------------------------------------------------------------
// Main build
// -----------------------------------------------------------------
function runBuild({ minify = true, clean = true } = {}) {
    const root = process.cwd();
    const distFolder = path.join(root, "dist");
    const sourceHtmlPath = path.join(root, "index.html");
    const warnings = [];

    try {
        if (!fs.existsSync(sourceHtmlPath)) {
            throw new BuildError(`index.html not found in ${root}`);
        }

        const esbuild = minify ? getEsbuild(root) : null;
        if (minify && !esbuild) {
            warnings.push(
                "Warning: esbuild not found — run 'npm install esbuild --save-dev' or build with minify off."
            );
        }

        // --- Clean / create dist/ ---
        if (fs.existsSync(distFolder) && clean) {
            fs.rmSync(distFolder, { recursive: true, force: true });
        }
        for (const sub of ["js", "styles"]) {
            fs.mkdirSync(path.join(distFolder, sub), { recursive: true });
        }

        // --- Parse index.html -> ordered file lists ---
        const html = fs.readFileSync(sourceHtmlPath, "utf8");

        const cssRegex = /<link\s+rel="stylesheet"\s+href="\.\/styles\/([^"]+)"\s*>/g;
        const jsRegex = /<script\s+src="\.\/js\/(?!script\.preload)([^"]+)"><\/script>/g;

        const cssMatches = [...html.matchAll(cssRegex)];
        const jsMatches = [...html.matchAll(jsRegex)];

        if (cssMatches.length === 0) throw new BuildError("No <link rel=stylesheet> tags found in index.html.");
        if (jsMatches.length === 0) throw new BuildError("No <script src=...> tags found in index.html.");

        const cssFiles = cssMatches.map((m) => m[1]);
        const jsFiles = jsMatches.map((m) => m[1]);

        // --- Validate source files against index.html (warnings only) ---
        const stylesDir = path.join(root, "styles");
        const jsDir = path.join(root, "js");

        const sourceCssFiles = fs.existsSync(stylesDir)
            ? fs.readdirSync(stylesDir).filter((f) => f.endsWith(".css"))
            : [];
        const sourceJsFiles = fs.existsSync(jsDir)
            ? fs.readdirSync(jsDir).filter((f) => f.endsWith(".js") && f !== "script.preload.js")
            : [];

        const unreferencedCss = sourceCssFiles.filter((f) => !cssFiles.includes(f));
        const unreferencedJs = sourceJsFiles.filter((f) => !jsFiles.includes(f));

        if (unreferencedCss.length > 0) {
            warnings.push("Warning: CSS files found in styles/ but not referenced in index.html:");
            unreferencedCss.forEach((f) => warnings.push(`    styles/${f}`));
        }
        if (unreferencedJs.length > 0) {
            warnings.push("Warning: JS files found in js/ but not referenced in index.html:");
            unreferencedJs.forEach((f) => warnings.push(`    js/${f}`));
        }

        for (const { type, files } of [
            { type: "CSS", files: cssFiles },
            { type: "JS", files: jsFiles },
        ]) {
            const problems = getOutOfOrderFiles(files);
            if (problems.length > 0) {
                warnings.push(`Warning: ${type} files in index.html are not in numeric order.`);
                warnings.push("  Out-of-order files:");
                problems.forEach((f) => warnings.push(`    ${f}`));
            }
        }

        console.log("");
        console.log(c.cyan(`Found ${cssFiles.length} CSS files:`));
        cssFiles.forEach((f) => console.log(`    ${f}`));
        console.log(c.cyan(`Found ${jsFiles.length} JS files:`));
        jsFiles.forEach((f) => console.log(`    ${f}`));
        console.log("");

        // --- Bundle CSS ---
        let cssContent = [
            "/* ============================================================",
            "   ZS New Tab - bundled stylesheet",
            "   Generated by build.js - DO NOT EDIT BY HAND.",
            "   Source files live under styles/ in the repo.",
            "   ============================================================ */",
            "",
        ].join("\n");

        for (const file of cssFiles) {
            const filePath = path.join(stylesDir, file);
            if (!fs.existsSync(filePath)) throw new BuildError(`Missing CSS source: styles/${file}`);
            cssContent += `/* ===== ${file} ===== */\n${fs.readFileSync(filePath, "utf8")}\n\n`;
        }

        const cssOut = path.join(distFolder, "styles", "styles.css");
        fs.writeFileSync(cssOut, cssContent, "utf8");
        const cssSizeBefore = Buffer.byteLength(cssContent, "utf8");

        if (minify && esbuild) minifyFile(esbuild, cssOut, "css", warnings);

        // --- Bundle JS ---
        let jsContent = [
            "/* ============================================================",
            "   ZS New Tab - bundled script",
            "   Generated by build.js - DO NOT EDIT BY HAND.",
            "   Source files live under js/ in the repo.",
            "   ============================================================ */",
            "",
        ].join("\n");

        for (const file of jsFiles) {
            const filePath = path.join(jsDir, file);
            if (!fs.existsSync(filePath)) throw new BuildError(`Missing JS source: js/${file}`);
            jsContent += `/* ===== ${file} ===== */\n${fs.readFileSync(filePath, "utf8")}\n\n`;
        }

        const jsOut = path.join(distFolder, "js", "script.js");
        fs.writeFileSync(jsOut, jsContent, "utf8");
        const jsSizeBefore = Buffer.byteLength(jsContent, "utf8");

        if (minify && esbuild) minifyFile(esbuild, jsOut, "js", warnings);

        // --- Copy preload script as-is, then minify separately ---
        const preloadSrc = path.join(jsDir, "script.preload.js");
        if (!fs.existsSync(preloadSrc)) throw new BuildError("Missing js/script.preload.js");
        const preloadOut = path.join(distFolder, "js", "script.preload.js");
        fs.copyFileSync(preloadSrc, preloadOut);
        if (minify && esbuild) minifyFile(esbuild, preloadOut, "js", warnings);

        // --- Copy fonts/ icons/ manifest.json ---
        for (const item of ["fonts", "icons"]) {
            const src = path.join(root, item);
            if (fs.existsSync(src)) {
                fs.cpSync(src, path.join(distFolder, item), { recursive: true });
            } else {
                warnings.push(`Warning: ${item}/ not found in source, skipping.`);
            }
        }

        const manifestSrc = path.join(root, "manifest.json");
        if (!fs.existsSync(manifestSrc)) throw new BuildError("manifest.json not found.");
        fs.copyFileSync(manifestSrc, path.join(distFolder, "manifest.json"));

        // --- Rewrite index.html for dist/ ---
        let newHtml = replaceAllButFirst(
            html,
            /<link\s+rel="stylesheet"\s+href="\.\/styles\/([^"]+)"\s*>/g,
            '<link rel="stylesheet" href="./styles/styles.css">'
        );
        newHtml = replaceAllButFirst(
            newHtml,
            /<script\s+src="\.\/js\/(?!script\.preload)([^"]+)"><\/script>/g,
            '<script src="./js/script.js"></script>'
        );

        newHtml = newHtml.replace(
            /<!--\s*Main Stylesheet \(split files, loaded in order\)\s*-->/,
            "<!-- Bundled Stylesheet -->"
        );
        newHtml = newHtml.replace(
            /<!--\s*JavaScript \(split files, loaded in order\)\s*-->/,
            "<!-- Bundled JavaScript -->"
        );

        // Collapse runs of 3+ blank lines into a single blank line
        newHtml = newHtml.replace(/(\r?\n[ \t]*){3,}/g, "\r\n\r\n");

        fs.writeFileSync(path.join(distFolder, "index.html"), newHtml, "utf8");

                // --- Summary ---
        const cssSizeAfter = fs.statSync(cssOut).size;
        const jsSizeAfter = fs.statSync(jsOut).size;
        const distSize = getDirectorySize(distFolder);
        const didMinify = minify && !!esbuild;

        console.log(c.green("Build complete."));
        if (didMinify) {
            console.log(`  styles/styles.css   ${formatSize(cssSizeBefore)} -> ${formatSize(cssSizeAfter)}`);
            console.log(`  js/script.js        ${formatSize(jsSizeBefore)} -> ${formatSize(jsSizeAfter)}`);
        } else {
            console.log(`  styles/styles.css   ${formatSize(cssSizeAfter)}`);
            console.log(`  js/script.js        ${formatSize(jsSizeAfter)}`);
        }
        console.log(c.cyan(`  dist/               ${formatSize(distSize)}`));
        console.log(`                      ${distFolder}`);

        if (warnings.length > 0) {
            console.log("");
            console.log(c.yellow("============================================================"));
            console.log(c.yellow(" WARNINGS"));
            console.log(c.yellow("============================================================"));
            warnings.forEach((w) => console.log(c.yellow(w)));
            console.log("");
        }

        return { ok: true, warnings, cssSizeBefore, cssSizeAfter, jsSizeBefore, jsSizeAfter };
    } catch (err) {
        const message = err instanceof BuildError ? err.message : `Unexpected error: ${err.message}`;
        console.log(c.red(message));
        return { ok: false, warnings, error: message };
    }
}

module.exports = { runBuild };

// -----------------------------------------------------------------
// CLI entry point
// -----------------------------------------------------------------
if (require.main === module) {
    const args = process.argv.slice(2);
    const minify = !args.includes("--no-minify");
    const clean = !args.includes("--no-clean");

    const result = runBuild({ minify, clean });
    process.exit(result.ok ? 0 : 1);
}