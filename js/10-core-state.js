window.registerModule('ZSCore', (function () {
    "use strict";

    /**
     * Default state
     */
    const defaultState = {
        settings: {
            name: "",
            rows: 4,
            cols: 6,
            engine: "https://www.google.com/search?q=",
            accent: "#e8a33d",
        },
        sites: [
            { id: "1", name: "Google", url: "https://google.com" },
            { id: "2", name: "YouTube", url: "https://youtube.com" },
            { id: "3", name: "Facebook", url: "https://facebook.com" },
            { id: "4", name: "Instagram", url: "https://instagram.com" },
            { id: "5", name: "X (Twitter)", url: "https://x.com" },
            { id: "7", name: "Wikipedia", url: "https://wikipedia.org" },
            { id: "8", name: "Amazon", url: "https://amazon.com" },
            { id: "11", name: "LinkedIn", url: "https://linkedin.com" },
            { id: "12", name: "Reddit", url: "https://reddit.com" },
            { id: "13", name: "Pinterest", url: "https://pinterest.com" },
            { id: "14", name: "Twitch", url: "https://twitch.tv" },
            { id: "16", name: "Yahoo", url: "https://yahoo.com" },
            { id: "17", name: "Bing", url: "https://bing.com" },
            { id: "18", name: "Microsoft", url: "https://microsoft.com" },
            { id: "19", name: "Apple", url: "https://apple.com" },
            { id: "20", name: "GitHub", url: "https://github.com" },
            { id: "21", name: "ChatGPT", url: "https://chat.openai.com" },
            { id: "22", name: "Gmail", url: "https://mail.google.com" },
            { id: "23", name: "Google Drive", url: "https://drive.google.com" },
            { id: "24", name: "Google Maps", url: "https://maps.google.com" },
            { id: "25", name: "Telegram", url: "https://web.telegram.org" },
            { id: "26", name: "Discord", url: "https://discord.com" },
            { id: "27", name: "Zoom", url: "https://zoom.us" },
            { id: "28", name: "eBay", url: "https://ebay.com" },
            { id: "29", name: "AliExpress", url: "https://aliexpress.com" },
            { id: "30", name: "Canva", url: "https://canva.com" }
        ]
    };

    /**
     * Preset accent colors shown in the settings panel.
     */
    const THEMES = [
        { name: "Amber",  accent: "#E8A33D" },
        { name: "Orange", accent: "#E58A4E" },
        { name: "Coral",  accent: "#E4776A" },
        { name: "Rose",   accent: "#D96B91" },
        { name: "Pink",   accent: "#D477B5" },
        { name: "Violet", accent: "#B47BD6" },
        { name: "Indigo", accent: "#7E86D8" },
        { name: "Blue",   accent: "#6F9FE3" },
        { name: "Azure",  accent: "#5FBAE8" },
        { name: "Cyan",   accent: "#5CCBCB" },
        { name: "Teal",   accent: "#55BFA8" },
        { name: "Mint",   accent: "#72C69A" },
        { name: "Green",  accent: "#79B86B" },
        { name: "Lime",   accent: "#A8C45A" },
        { name: "Olive",  accent: "#B0A84F" },
        { name: "Slate",  accent: "#8995A5" },
        { name: "Silver", accent: "#A8ADB7" },
        { name: "Graphite", accent: "#727A86" },
    ];

    return {
        defaultState,
        THEMES
    }
})());