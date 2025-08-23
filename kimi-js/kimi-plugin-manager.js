class KimiPluginManager {
    constructor() {
        this.plugins = [];
        this.pluginsRoot = "kimi-plugins/";
    }

    // Common security validation for plugin file paths
    isValidPluginPath(path) {
        return (
            typeof path === "string" &&
            /^[-a-zA-Z0-9_\/.]+$/.test(path) &&
            !path.startsWith("/") &&
            !path.includes("..") &&
            !/^https?:\/\//i.test(path) &&
            path.startsWith("kimi-plugins/")
        );
    }
    async loadPlugins() {
        const pluginDirs = await this.getPluginDirs();
        this.plugins = [];
        let pluginThemeActive = false;
        for (const dir of pluginDirs) {
            try {
                const manifest = await fetch(this.pluginsRoot + dir + "/manifest.json").then(r => r.json());
                manifest._dir = dir;
                manifest.enabled = this.isPluginEnabled(dir, manifest.enabled);

                // Basic manifest validation and path sanitization (deny external or absolute URLs)
                const validTypes = new Set(["theme", "voice", "behavior"]);
                const isSafePath = p =>
                    typeof p === "string" &&
                    /^[-a-zA-Z0-9_\/.]+$/.test(p) &&
                    !p.startsWith("/") &&
                    !p.includes("..") &&
                    !/^https?:\/\//i.test(p);

                if (!manifest.name || !manifest.type || !validTypes.has(manifest.type)) {
                    console.warn(`Invalid plugin manifest in ${dir}: missing name or invalid type`);
                    continue;
                }
                if (manifest.style && !isSafePath(manifest.style)) {
                    console.warn(`Blocked unsafe style path in ${dir}: ${manifest.style}`);
                    delete manifest.style;
                }
                if (manifest.main && !isSafePath(manifest.main)) {
                    console.warn(`Blocked unsafe main path in ${dir}: ${manifest.main}`);
                    delete manifest.main;
                }

                this.plugins.push(manifest);

                if (manifest.enabled && manifest.style) {
                    this.loadCSS(this.pluginsRoot + dir + "/" + manifest.style);
                }
                if (manifest.enabled && manifest.main) {
                    this.loadJS(this.pluginsRoot + dir + "/" + manifest.main);
                }
                if (manifest.enabled && manifest.type === "theme" && dir === "sample-theme") {
                    pluginThemeActive = true;
                }
            } catch (e) {
                console.warn("Failed loading plugin:", dir, e);
            }
        }
        if (pluginThemeActive) {
            document.documentElement.setAttribute("data-theme", "plugin-sample-theme");
        } else {
            // Restore previous or default theme depuis Dexie
            if (window.kimiDB && window.kimiDB.getPreference) {
                const userTheme = await window.kimiDB.getPreference("colorTheme", "dark");
                document.documentElement.setAttribute("data-theme", userTheme);
            } else {
                document.documentElement.setAttribute("data-theme", "dark");
            }
        }
        this.renderPluginList();
    }
    async getPluginDirs() {
        return ["sample-theme", "sample-voice", "sample-behavior"];
    }
    loadCSS(href) {
        if (!window.KimiDOMUtils) {
            console.error("KimiDOMUtils not available for loadCSS");
            return;
        }
        if (!window.KimiDOMUtils.get('link[href="' + href + '"]')) {
            if (!this.isValidPluginPath(href)) {
                console.error(`Blocked unsafe CSS path: ${href}`);
                return;
            }

            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.type = "text/css";
            link.href = href;

            link.onerror = function () {
                console.error(`Failed to load plugin CSS: ${href}`);
            };

            document.head.appendChild(link);
        }
    }
    loadJS(src) {
        if (!window.KimiDOMUtils) {
            console.error("KimiDOMUtils not available for loadJS");
            return;
        }
        if (!window.KimiDOMUtils.get('script[src="' + src + '"]')) {
            if (!this.isValidPluginPath(src)) {
                console.error(`Blocked unsafe script path: ${src}`);
                return;
            }

            const script = document.createElement("script");
            script.src = src;
            script.type = "text/javascript";

            script.onerror = function () {
                console.error(`Failed to load plugin script: ${src}`);
            };

            if (window.CSP_NONCE) {
                script.nonce = window.CSP_NONCE;
            }

            document.body.appendChild(script);
        }
    }
    renderPluginList() {
        if (!window.KimiDOMUtils) {
            console.error("KimiDOMUtils not available");
            return;
        }
        const container = window.KimiDOMUtils.get("#plugin-list");
        if (!container) return;
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        for (const plugin of this.plugins) {
            const div = document.createElement("div");
            div.className = "plugin-card";
            // Left: info
            const info = document.createElement("div");
            info.className = "plugin-info";
            const title = document.createElement("div");
            title.className = "plugin-title";
            title.textContent = plugin.name;
            const type = document.createElement("span");
            type.className = "plugin-type";
            type.textContent = plugin.type;
            title.appendChild(type);
            const desc = document.createElement("div");
            desc.className = "plugin-desc";
            desc.textContent = plugin.description;
            const author = document.createElement("div");
            author.className = "plugin-author";
            author.textContent = plugin.author;
            info.appendChild(title);
            info.appendChild(desc);
            info.appendChild(author);
            div.appendChild(info);
            // Center: badges/swatch
            const centerCol = document.createElement("div");
            centerCol.className = "plugin-card-center";
            const typeBadge = document.createElement("span");
            typeBadge.className = "plugin-type-badge";
            typeBadge.textContent =
                plugin.type === "theme" ? "Theme" : plugin.type.charAt(0).toUpperCase() + plugin.type.slice(1);
            centerCol.appendChild(typeBadge);
            if (plugin.type === "theme") {
                const swatch = document.createElement("div");
                swatch.className = "plugin-theme-swatch";

                // Create color spans safely
                const colors = ["#3b82f6", "#a5b4fc", "#6366f1"];
                colors.forEach(color => {
                    const span = document.createElement("span");
                    span.style.background = color;
                    swatch.appendChild(span);
                });
                centerCol.appendChild(swatch);
                if (plugin.enabled) {
                    const activeBadge = document.createElement("span");
                    activeBadge.className = "plugin-active-badge";
                    activeBadge.textContent = "Active Theme";
                    centerCol.appendChild(activeBadge);
                }
            }
            div.appendChild(centerCol);
            // Right: switch
            const rightCol = document.createElement("div");
            rightCol.className = "plugin-card-switch";
            const switchLabel = document.createElement("label");
            switchLabel.className = "toggle-switch";
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = !!plugin.enabled;
            input.style.display = "none";
            input.addEventListener("change", () => {
                plugin.enabled = input.checked;
                this.savePluginState(plugin._dir, plugin.enabled);
                this.loadPlugins();
                if (input.checked) {
                    switchLabel.classList.add("active");
                } else {
                    switchLabel.classList.remove("active");
                }
            });
            const slider = document.createElement("span");
            slider.className = "slider";
            switchLabel.appendChild(input);
            switchLabel.appendChild(slider);
            if (input.checked) switchLabel.classList.add("active");
            rightCol.appendChild(switchLabel);
            div.appendChild(rightCol);
            container.appendChild(div);
        }
    }
    savePluginState(dir, enabled) {
        const key = "kimi-plugin-enabled-" + dir;
        localStorage.setItem(key, enabled ? "1" : "0");
    }
    isPluginEnabled(dir, defaultValue) {
        const key = "kimi-plugin-enabled-" + dir;
        const val = localStorage.getItem(key);
        if (val === null) return defaultValue;
        return val === "1";
    }
}

window.KimiPluginManager = new KimiPluginManager();

document.addEventListener("DOMContentLoaded", () => {
    if (window.KimiPluginManager) window.KimiPluginManager.loadPlugins();
    const refreshBtn = document.getElementById("refresh-plugins");
    if (refreshBtn) {
        refreshBtn.onclick = async () => {
            const originalText = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
            refreshBtn.disabled = true;

            try {
                await window.KimiPluginManager.loadPlugins();
                refreshBtn.innerHTML = '<i class="fas fa-check"></i> Refreshed!';
                setTimeout(() => {
                    refreshBtn.innerHTML = originalText;
                    refreshBtn.disabled = false;
                }, 1500);
            } catch (error) {
                console.error("Error refreshing plugins:", error);
                refreshBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error';
                setTimeout(() => {
                    refreshBtn.innerHTML = originalText;
                    refreshBtn.disabled = false;
                }, 2000);
            }
        };
    }
});
