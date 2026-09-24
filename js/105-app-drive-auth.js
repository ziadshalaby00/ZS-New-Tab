/**
 * ZS New Tab – Google Drive auth (OAuth 2.0 via launchWebAuthFlow)
 * Cross-browser: Chrome, Edge, Firefox.
 */
window.registerModule("ZSDrive", (function () {
    "use strict";

    // =============================================
    //  1. CONFIG
    // =============================================
    const CLIENT_ID = "148197040207-5alid3ljh2lk9u83f497u4jkv914uvdp.apps.googleusercontent.com";

    const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

    // =============================================
    //  2. TOKEN CACHE (in-memory only)
    // =============================================
    let cachedToken = null;
    let cachedExpiry = 0;

    // =============================================
    //  3. HELPERS
    // =============================================
    function parseHashParams(url) {
        const hash = url.split("#")[1] || "";
        const params = new URLSearchParams(hash);
        const out = {};
        for (const [k, v] of params.entries()) out[k] = v;
        return out;
    }

    // =============================================
    //  4. PUBLIC API
    // =============================================

    /**
     * Returns a valid access token.
     * If nothing cached, or expired, requests a fresh one from Google.
     *
     * @param {boolean} [interactive=true]
     * @returns {Promise<string>}
     */
    async function getAccessToken(interactive = true) {
        const now = Date.now();

        if (cachedToken && now < cachedExpiry - 60_000) {
            return cachedToken;
        }

        // OAuth "state" parameter — CSRF protection.
        // A random value is sent to Google and must come back unchanged in
        // the redirect. Prevents a malicious page from feeding us a fake
        // redirect URL that looks like a valid auth response.
        // Note: extensions are a lower-risk environment than websites,
        // but Google still recommends this and some reviewers check for it.
        // crypto.randomUUID() requires Chrome 92+, but our manifest
        // declares minimum_chrome_version: 88. Fall back to
        // crypto.getRandomValues (available since Chrome 11) so the
        // extension doesn't silently break on old Chromium builds.
        const stateBytes = new Uint8Array(16);
        crypto.getRandomValues(stateBytes);
        const state = Array.from(stateBytes, b =>
            b.toString(16).padStart(2, "0")
        ).join("");

        const redirectUri = chrome.identity.getRedirectURL();
        const authUrl =
            "https://accounts.google.com/o/oauth2/v2/auth?" +
            `client_id=${encodeURIComponent(CLIENT_ID)}` +
            "&response_type=token" +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&scope=${encodeURIComponent(SCOPES.join(" "))}` +
            `&state=${encodeURIComponent(state)}`;

        let redirectUrl;
        try {
            redirectUrl = await chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive,
            });
        } catch (err) {
            console.error("launchWebAuthFlow failed:", err);
            throw new Error("AUTH_CANCELLED");
        }

        if (!redirectUrl) throw new Error("AUTH_CANCELLED");

        const params = parseHashParams(redirectUrl);

        if (params.error) {
            throw new Error(params.error_description || params.error);
        }
        if (params.state !== state) {
            // Either a real CSRF attempt or (far more likely) a leftover
            // tab from an earlier session. Either way, refuse to use the
            // response — the user can retry and get a fresh state.
            throw new Error("OAuth state mismatch");
        }
        if (!params.access_token) {
            throw new Error("No access_token in redirect");
        }

        cachedToken = params.access_token;
        cachedExpiry = now + (parseInt(params.expires_in, 10) || 3600) * 1000;

        return cachedToken;
    }

    function clearToken() {
        cachedToken = null;
        cachedExpiry = 0;
    }

    async function signOut() {
        if (cachedToken) {
            try {
                await chrome.identity.launchWebAuthFlow({
                    url: `https://accounts.google.com/o/oauth2/revoke?token=${cachedToken}`,
                    interactive: false,
                });
            } catch (_) {}
        }
        clearToken();
    }

    return {
        getAccessToken,
        clearToken,
        signOut,
        CLIENT_ID,
        SCOPES,
    };
})());