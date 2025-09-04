// ===== KIMI MEMORY UI MANAGER =====
class KimiMemoryUI {
    constructor() {
        this.memorySystem = null;
        this.isInitialized = false;
        // Debounce helpers for UI refresh to coalesce multiple DB reads
        this._debounceTimers = {};
    }

    debounce(key, fn, wait = 350) {
        if (this._debounceTimers[key]) clearTimeout(this._debounceTimers[key]);
        this._debounceTimers[key] = setTimeout(() => {
            fn();
            delete this._debounceTimers[key];
        }, wait);
    }

    async init() {
        if (!window.kimiMemorySystem) {
            console.warn("Memory system not available");
            return;
        }

        this.memorySystem = window.kimiMemorySystem;
        this.setupEventListeners();
        await this.updateMemoryStats();
        this.isInitialized = true;
    }

    setupEventListeners() {
        // Memory toggle
        const memoryToggle = document.getElementById("memory-toggle");
        if (memoryToggle) {
            memoryToggle.addEventListener("click", () => this.toggleMemorySystem());
        }

        // View memories button
        const viewMemoriesBtn = document.getElementById("view-memories");
        if (viewMemoriesBtn) {
            viewMemoriesBtn.addEventListener("click", () => this.openMemoryModal());
        }

        // Add memory button
        const addMemoryBtn = document.getElementById("add-memory");
        if (addMemoryBtn) {
            addMemoryBtn.addEventListener("click", () => {
                this.addManualMemory();
                ensureVideoNeutralOnUIChange();
            });
        }

        // Memory modal close
        const memoryClose = document.getElementById("memory-close");
        if (memoryClose) {
            memoryClose.addEventListener("click", () => {
                this.closeMemoryModal();
                ensureVideoNeutralOnUIChange();
            });
        }

        // Memory export
        const memoryExport = document.getElementById("memory-export");
        if (memoryExport) {
            memoryExport.addEventListener("click", () => this.exportMemories());
        }

        // Memory filter
        const memoryFilter = document.getElementById("memory-filter-category");
        if (memoryFilter) {
            memoryFilter.addEventListener("change", () => {
                this.filterMemories();
                ensureVideoNeutralOnUIChange();
            });
        }

        // Memory search
        const memorySearch = document.getElementById("memory-search");
        if (memorySearch) {
            memorySearch.addEventListener("input", () => this.filterMemories());
        }

        // Close modal on overlay click
        const memoryOverlay = document.getElementById("memory-overlay");
        if (memoryOverlay) {
            memoryOverlay.addEventListener("click", e => {
                if (e.target === memoryOverlay) {
                    this.closeMemoryModal();
                }
            });
        }

        // Delegated handler for memory-source clicks / touch / keyboard
        const memoryList = document.getElementById("memory-list");
        if (memoryList) {
            // Click and touch
            memoryList.addEventListener("click", e => this.handleMemorySourceToggle(e));
            memoryList.addEventListener("touchstart", e => this.handleMemorySourceToggle(e));

            // General delegated click handler for memory actions (summarize, etc.)
            memoryList.addEventListener("click", e => this.handleMemoryListClick(e));

            // Keyboard accessibility: Enter / Space when focused on .memory-source
            memoryList.addEventListener("keydown", e => {
                const target = e.target;
                if (target && target.classList && target.classList.contains("memory-source")) {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        this.toggleSourceContentForElement(target);
                    }
                }
            });
        }
    }

    // Delegated click handler for actions inside the memory list
    async handleMemoryListClick(e) {
        try {
            const summarizeBtn = e.target.closest && e.target.closest("#memory-summarize-btn");
            if (summarizeBtn) {
                e.stopPropagation();
                await this.handleSummarizeAction();
                return;
            }
        } catch (err) {
            console.error("Error handling memory list click", err);
        }
    }

    async toggleMemorySystem() {
        if (!this.memorySystem) return;

        const toggle = document.getElementById("memory-toggle");
        const enabled = !this.memorySystem.memoryEnabled;

        await this.memorySystem.toggleMemorySystem(enabled);

        if (toggle) {
            toggle.setAttribute("aria-checked", enabled.toString());
            toggle.classList.toggle("active", enabled);
        }

        // Show feedback
        this.showFeedback(enabled ? "Memory system enabled" : "Memory system disabled");
    }

    async addManualMemory() {
        const categorySelect = document.getElementById("memory-category");
        const contentInput = document.getElementById("memory-content");

        if (!categorySelect || !contentInput) return;

        const category = categorySelect.value;
        const content = contentInput.value.trim();

        if (!content) {
            this.showFeedback("Please enter memory content", "error");
            return;
        }

        try {
            await this.memorySystem.addMemory({
                category: category,
                content: content,
                type: "manual",
                confidence: 1.0
            });

            contentInput.value = "";
            await this.updateMemoryStats();
            this.showFeedback("Memory added successfully");
        } catch (error) {
            console.error("Error adding memory:", error);
            this.showFeedback("Error adding memory", "error");
        }
    }

    async openMemoryModal() {
        const overlay = document.getElementById("memory-overlay");
        if (!overlay) return;

        overlay.style.display = "flex";
        await this.loadMemories();
    }

    closeMemoryModal() {
        const overlay = document.getElementById("memory-overlay");
        if (overlay) {
            overlay.style.display = "none";
            // Ensure background video resumes after closing memory modal
            const kv = window.kimiVideo;
            if (kv && kv.activeVideo) {
                try {
                    const v = kv.activeVideo;
                    if (v.ended) {
                        if (typeof kv.returnToNeutral === "function") kv.returnToNeutral();
                    } else if (v.paused) {
                        // Use centralized video utility for play
                        window.KimiVideoManager.getVideoElement(v)
                            .play()
                            .catch(() => {
                                if (typeof kv.returnToNeutral === "function") kv.returnToNeutral();
                            });
                    }
                } catch {}
            }
        }
    }

    async loadMemories() {
        if (!this.memorySystem) return;

        try {
            // Use debounce to avoid multiple rapid DB reads
            this.debounce("loadMemories", async () => {
                const memories = await this.memorySystem.getAllMemories();
                console.log("Loading memories into UI:", memories.length);
                this.renderMemories(memories);
            });
        } catch (error) {
            console.error("Error loading memories:", error);
        }
    }

    async filterMemories() {
        const filterSelect = document.getElementById("memory-filter-category");
        const searchInput = document.getElementById("memory-search");
        if (!this.memorySystem) return;

        try {
            const category = filterSelect?.value;
            const searchTerm = searchInput?.value.toLowerCase().trim();
            let memories;

            if (category) {
                memories = await this.memorySystem.getMemoriesByCategory(category);
            } else {
                memories = await this.memorySystem.getAllMemories();
            }

            // Apply search filter if search term exists
            if (searchTerm) {
                memories = memories.filter(
                    memory =>
                        memory.content.toLowerCase().includes(searchTerm) ||
                        memory.category.toLowerCase().includes(searchTerm) ||
                        (memory.sourceText && memory.sourceText.toLowerCase().includes(searchTerm))
                );
            }

            this.renderMemories(memories);
        } catch (error) {
            console.error("Error filtering memories:", error);
        }
    }

    renderMemories(memories) {
        const memoryList = document.getElementById("memory-list");
        if (!memoryList) return;

        console.log("Rendering memories:", memories); // Debug logging

        if (memories.length === 0) {
            memoryList.innerHTML = `
                <div class="memory-empty">
                    <i class="fas fa-brain"></i>
                    <p>No memories found. Start chatting to build memories automatically, or add them manually.</p>
                </div>
            `;
            return;
        }

        // Group memories by category for better organization
        const groupedMemories = memories.reduce((groups, memory) => {
            const category = memory.category || "other";
            if (!groups[category]) groups[category] = [];
            groups[category].push(memory);
            return groups;
        }, {});

        let html = "";

        // Toolbar with summarize action
        html += `
            <div class="memory-toolbar" style="display:flex; gap:8px; align-items:center; margin-bottom:12px;">
                <button id="memory-summarize-btn" class="kimi-button" title="Summarize recent memories">📝 Summarize last 7 days</button>
            </div>
        `;
        Object.entries(groupedMemories).forEach(([category, categoryMemories]) => {
            html += `
                <div class="memory-category-group">
                    <h4 class="memory-category-header">
                        ${this.getCategoryIcon(category)} ${this.formatCategoryName(category)}
                        <span class="memory-category-count">(${categoryMemories.length})</span>
                    </h4>
                    <div class="memory-category-items">
            `;

            categoryMemories.forEach(memory => {
                const confidence = Math.round(memory.confidence * 100);
                const isAutomatic = memory.type === "auto_extracted";
                const previewLength = 120;
                const isLongContent = memory.content.length > previewLength;
                const previewText = isLongContent ? memory.content.substring(0, previewLength) + "..." : memory.content;
                const wordCount = memory.content.split(/\s+/).length;
                const importance = typeof memory.importance === "number" ? memory.importance : 0.5;
                const importanceLevel = this.getImportanceLevelFromValue(importance);
                const importancePct = Math.round(importance * 100);
                const tagsHtml = this.renderTags(memory.tags || []);

                html += `
                    <div class="memory-item ${isAutomatic ? "memory-auto" : "memory-manual"}" data-memory-id="${memory.id}">
                        <div class="memory-header">
                            <div class="memory-item-title">${window.KimiValidationUtils && window.KimiValidationUtils.escapeHtml ? window.KimiValidationUtils.escapeHtml(memory.title || "") : memory.title || ""}${!memory.title ? "" : ""}</div>
                            <div class="memory-badges">
                                <span class="memory-type ${memory.type}">${memory.type === "auto_extracted" ? "🤖 Auto" : "✋ Manual"}</span>
                                <span class="memory-confidence confidence-${this.getConfidenceLevel(confidence)}">${confidence}%</span>
                                ${memory.type === "summary" || (memory.tags && memory.tags.includes("summary")) ? `<span class="memory-summary-badge" style="background:var(--accent-color);color:white;padding:2px 6px;border-radius:12px;margin-left:8px;font-size:0.8em;">Summary</span>` : ""}
                                ${isLongContent ? `<span class="memory-length">${wordCount} mots</span>` : ""}
                <span class="memory-importance importance-${importanceLevel}" title="Importance: ${importancePct}% (${importanceLevel})">${importanceLevel.charAt(0).toUpperCase() + importanceLevel.slice(1)}</span>
                            </div>
                        </div>
                        ${
                            !memory.title
                                ? `
                        <div class="memory-preview">
                            <div class="memory-preview-text ${isLongContent ? "memory-preview-short" : ""}" id="preview-${memory.id}">
                                ${this.highlightMemoryContent(previewText)}
                            </div>
                            ${
                                isLongContent
                                    ? `
                                <div class="memory-preview-full" id="full-${memory.id}" style="display: none;">
                                    ${this.highlightMemoryContent(memory.content)}
                                </div>
                                <button class="memory-expand-btn" onclick="kimiMemoryUI.toggleMemoryContent('${memory.id}')">
                                    <i class="fas fa-chevron-down" id="icon-${memory.id}"></i> <span data-i18n="view_more"></span>
                                </button>
                            `
                                    : ""
                            }
                        </div>
                        `
                                : ""
                        }
            ${tagsHtml}
                        <div class="memory-meta">
                            <span class="memory-date">${this.formatDate(memory.timestamp)}</span>
                            ${
                                memory.sourceText
                                    ? `<span class="memory-source" data-i18n="memory_source_label" title="${
                                          window.KimiValidationUtils && window.KimiValidationUtils.escapeHtml
                                              ? window.KimiValidationUtils.escapeHtml(memory.sourceText)
                                              : memory.sourceText
                                      }"></span>`
                                    : `<span data-i18n="memory_manually_added"></span>`
                            }
                        </div>
                            ${
                                memory.sourceText
                                    ? `<div class="memory-source-content" id="source-content-${memory.id}" style="display:none;">${
                                          window.KimiValidationUtils && window.KimiValidationUtils.escapeHtml
                                              ? window.KimiValidationUtils.escapeHtml(memory.sourceText)
                                              : memory.sourceText
                                      }</div>`
                                    : ""
                            }
                                <div class="memory-actions">
                                    <button class="memory-edit-btn" onclick="kimiMemoryUI.editMemory('${memory.id}')" data-i18n-title="edit_memory_button_title">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="memory-delete-btn" onclick="kimiMemoryUI.deleteMemory('${memory.id}')" data-i18n-title="delete_memory_button_title">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        // Minimal runtime guard: block accidental <script> tags in generated HTML
        // This is a non-intrusive safety check that prevents XSS when the
        // assembled `html` somehow contains script tags. In normal operation
        // the content is escaped via KimiValidationUtils and highlightMemoryContent(),
        // so this will not run; it only activates on suspicious input.
        try {
            if (/\<\s*script\b/i.test(html)) {
                console.warn("Blocked suspicious <script> tag in memory HTML rendering");
                // Fallback: render as safe text to avoid executing injected scripts
                memoryList.textContent = html;
            } else {
                memoryList.innerHTML = html;
            }
        } catch (e) {
            // On any unexpected error, fallback to safe text rendering
            console.error("Error while rendering memories, falling back to safe text:", e);
            memoryList.textContent = html;
        }

        // Apply translations to dynamic content
        if (window.applyTranslations && typeof window.applyTranslations === "function") {
            window.applyTranslations();
        }
    }

    // Map importance value [0..1] to level string
    getImportanceLevelFromValue(value) {
        if (value >= 0.8) return "high";
        if (value >= 0.6) return "medium";
        return "low";
    }

    // Render tags as compact chips; show up to 4 then "+N"
    renderTags(tags) {
        if (!Array.isArray(tags) || tags.length === 0) return "";
        const maxVisible = 4;
        const visible = tags.slice(0, maxVisible);
        const moreCount = tags.length - visible.length;

        const escape = txt =>
            window.KimiValidationUtils && window.KimiValidationUtils.escapeHtml
                ? window.KimiValidationUtils.escapeHtml(String(txt))
                : String(txt);

        const classify = tag => {
            if (tag.startsWith("relationship:")) return "tag-relationship";
            if (tag.startsWith("boundary:")) return "tag-boundary";
            if (tag.startsWith("time:")) return "tag-time";
            if (tag.startsWith("type:")) return "tag-type";
            return "tag-generic";
        };

        const chips = visible
            .map(tag => `<span class="memory-tag ${classify(tag)}" title="${escape(tag)}">${escape(tag)}</span>`)
            .join("");

        const moreChip = moreCount > 0 ? `<span class="memory-tag tag-more" title="${moreCount} more">+${moreCount}</span>` : "";

        return `<div class="memory-tags">${chips}${moreChip}</div>`;
    }

    formatCategoryName(category) {
        // Try to resolve via i18n keys first, fallback to hardcoded English
        const i18nKey = `memory_category_${category}`;
        if (window.kimiI18nManager && typeof window.kimiI18nManager.t === "function") {
            const val = window.kimiI18nManager.t(i18nKey);
            if (val && val !== i18nKey) return val;
        }

        const names = {
            personal: "Personal Information",
            preferences: "Likes & Dislikes",
            relationships: "Relationships & People",
            activities: "Activities & Hobbies",
            goals: "Goals & Aspirations",
            experiences: "Shared Experiences",
            important: "Important Events"
        };

        return names[category] || category.charAt(0).toUpperCase() + category.slice(1);
    }

    getConfidenceLevel(confidence) {
        if (confidence >= 80) return "high";
        if (confidence >= 60) return "medium";
        return "low";
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffTime = now - date;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    highlightMemoryContent(content) {
        // Escape HTML first using centralized util
        const escapedContent =
            window.KimiValidationUtils && window.KimiValidationUtils.escapeHtml
                ? window.KimiValidationUtils.escapeHtml(content)
                : content;

        // Simple highlighting for search terms if there's a search active
        const searchInput = document.getElementById("memory-search");
        if (searchInput && searchInput.value.trim()) {
            const searchTerm = searchInput.value.trim();
            const regex = new RegExp(`(${searchTerm})`, "gi");
            return escapedContent.replace(
                regex,
                '<mark style="background: var(--primary-color); color: white; padding: 1px 3px; border-radius: 2px;">$1</mark>'
            );
        }

        return escapedContent;
    }

    getCategoryIcon(category) {
        const icons = {
            personal: "👤",
            preferences: "❤️",
            relationships: "👨‍👩‍👧‍👦",
            activities: "🎯",
            goals: "🎯",
            experiences: "⭐",
            important: "📌"
        };
        return icons[category] || "📝";
    }

    toggleMemoryContent(memoryId) {
        const previewShort = document.getElementById(`preview-${memoryId}`);
        const previewFull = document.getElementById(`full-${memoryId}`);
        const icon = document.getElementById(`icon-${memoryId}`);
        const expandBtn = icon?.closest(".memory-expand-btn");

        if (!previewShort || !previewFull || !icon || !expandBtn) return;

        const isExpanded = previewFull.style.display !== "none";

        if (isExpanded) {
            previewShort.style.display = "block";
            previewFull.style.display = "none";
            icon.className = "fas fa-chevron-down";
            expandBtn.innerHTML = '<i class="fas fa-chevron-down"></i> <span data-i18n="view_more"></span>';
        } else {
            previewShort.style.display = "none";
            previewFull.style.display = "block";
            icon.className = "fas fa-chevron-up";
            expandBtn.innerHTML = '<i class="fas fa-chevron-up"></i> <span data-i18n="view_less"></span>';
        }

        // Re-apply translations for the new button label
        if (window.applyTranslations && typeof window.applyTranslations === "function") {
            window.applyTranslations();
        }
    }

    // Handle delegated click/touch events for .memory-source
    handleMemorySourceToggle(e) {
        try {
            const el = e.target.closest && e.target.closest(".memory-source");
            if (!el) return;
            // Prevent triggering parent handlers
            e.stopPropagation();
            e.preventDefault();
            this.toggleSourceContentForElement(el);
        } catch (err) {
            console.error("Error handling memory-source toggle", err);
        }
    }

    // Toggle the adjacent .memory-source-content for a given .memory-source element
    toggleSourceContentForElement(sourceEl) {
        if (!sourceEl) return;
        // The memory id is present on the nearest .memory-item
        const item = sourceEl.closest(".memory-item");
        if (!item) return;
        const id = item.getAttribute("data-memory-id");
        if (!id) return;

        const contentEl = document.getElementById(`source-content-${id}`);
        if (!contentEl) return;

        const isVisible = contentEl.style.display !== "none" && contentEl.style.display !== "";

        // Close any other open source contents
        document.querySelectorAll(".memory-source-content").forEach(el => {
            if (el !== contentEl) el.style.display = "none";
        });

        if (isVisible) {
            contentEl.style.display = "none";
            sourceEl.setAttribute("aria-expanded", "false");
        } else {
            // simple sliding animation via max-height for smoother appearance
            contentEl.style.display = "block";
            sourceEl.setAttribute("aria-expanded", "true");
        }
    }

    async editMemory(memoryId) {
        if (!this.memorySystem) return;

        try {
            // Get the memory to edit
            const memories = await this.memorySystem.getAllMemories();
            const memory = memories.find(m => m.id == memoryId);
            if (!memory) {
                this.showFeedback("Memory not found", "error");
                return;
            }

            // Create edit dialog
            const overlay = document.createElement("div");
            overlay.className = "memory-edit-overlay";
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10001;
            `;

            const dialog = document.createElement("div");
            dialog.className = "memory-edit-dialog";
            dialog.style.cssText = `
                background: var(--background-secondary);
                border-radius: 12px;
                padding: 24px;
                width: 90%;
                max-width: 500px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            `;

            dialog.innerHTML = `
                <h3 style="margin: 0 0 20px 0; color: var(--text-primary);">
                    <i class="fas fa-edit"></i> <span data-i18n="edit_memory_title"></span>
                </h3>
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;" data-i18n="label_title"></label>
                    <input id="edit-memory-title" class="kimi-input" style="width:100%;" value="${
                        window.KimiValidationUtils && window.KimiValidationUtils.escapeHtml
                            ? window.KimiValidationUtils.escapeHtml(memory.title || "")
                            : memory.title || ""
                    }" placeholder="Optional title for this memory" />
                </div>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;" data-i18n="label_category"></label>
                    <select id="edit-memory-category" class="kimi-select" style="width: 100%;">
                        <option value="personal" ${memory.category === "personal" ? "selected" : ""}>${
                            window.kimiI18nManager && window.kimiI18nManager.t
                                ? window.kimiI18nManager.t("memory_category_personal")
                                : "Personal Info"
                        }</option>
                        <option value="preferences" ${memory.category === "preferences" ? "selected" : ""}>${
                            window.kimiI18nManager && window.kimiI18nManager.t
                                ? window.kimiI18nManager.t("memory_category_preferences")
                                : "Likes & Dislikes"
                        }</option>
                        <option value="relationships" ${memory.category === "relationships" ? "selected" : ""}>${
                            window.kimiI18nManager && window.kimiI18nManager.t
                                ? window.kimiI18nManager.t("memory_category_relationships")
                                : "Relationships"
                        }</option>
                        <option value="activities" ${memory.category === "activities" ? "selected" : ""}>${
                            window.kimiI18nManager && window.kimiI18nManager.t
                                ? window.kimiI18nManager.t("memory_category_activities")
                                : "Activities & Hobbies"
                        }</option>
                        <option value="goals" ${memory.category === "goals" ? "selected" : ""}>${
                            window.kimiI18nManager && window.kimiI18nManager.t
                                ? window.kimiI18nManager.t("memory_category_goals")
                                : "Goals & Plans"
                        }</option>
                        <option value="experiences" ${memory.category === "experiences" ? "selected" : ""}>${
                            window.kimiI18nManager && window.kimiI18nManager.t
                                ? window.kimiI18nManager.t("memory_category_experiences")
                                : "Experiences"
                        }</option>
                        <option value="important" ${memory.category === "important" ? "selected" : ""}>${
                            window.kimiI18nManager && window.kimiI18nManager.t
                                ? window.kimiI18nManager.t("memory_category_important")
                                : "Important Events"
                        }</option>
                    </select>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;" data-i18n="label_content"></label>
                    <textarea id="edit-memory-content" class="kimi-input" style="width: 100%; height: 100px; resize: vertical;" placeholder="Memory content...">${
                        window.KimiValidationUtils && window.KimiValidationUtils.escapeHtml
                            ? window.KimiValidationUtils.escapeHtml(memory.sourceText || memory.content || "")
                            : memory.sourceText || memory.content || ""
                    }</textarea>
                </div>
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button id="cancel-edit" class="kimi-button" style="background: #6c757d;" data-i18n="cancel">
                        <i class="fas fa-times"></i> <span data-i18n="cancel"></span>
                    </button>
                    <button id="save-edit" class="kimi-button">
                        <i class="fas fa-save"></i> <span data-i18n="save"></span>
                    </button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // Handle buttons
            dialog.querySelector("#cancel-edit").addEventListener("click", () => {
                document.body.removeChild(overlay);
            });

            dialog.querySelector("#save-edit").addEventListener("click", async () => {
                const newTitle = dialog.querySelector("#edit-memory-title").value.trim();
                const newCategory = dialog.querySelector("#edit-memory-category").value;
                const newContent = dialog.querySelector("#edit-memory-content").value.trim();

                if (!newContent) {
                    this.showFeedback(
                        window.kimiI18nManager ? window.kimiI18nManager.t("validation_empty_message") : "Content cannot be empty",
                        "error"
                    );
                    return;
                }

                console.log(`🔄 Attempting to update memory ID: ${memoryId}`);
                console.log("New data:", { category: newCategory, content: newContent });

                try {
                    // Also update sourceText so the "📝 Memory of the conversation" shows edited content
                    const result = await this.memorySystem.updateMemory(memoryId, {
                        title: newTitle,
                        category: newCategory,
                        content: newContent,
                        sourceText: newContent
                    });

                    console.log("Update result:", result);

                    if (result === true) {
                        // Close the modal
                        document.body.removeChild(overlay);

                        // Force full reload
                        await this.loadMemories();
                        await this.updateMemoryStats();

                        this.showFeedback(window.kimiI18nManager ? window.kimiI18nManager.t("saved") : "Saved");
                        console.log("✅ UI updated");
                    } else {
                        this.showFeedback(
                            window.kimiI18nManager
                                ? window.kimiI18nManager.t("fallback_general_error")
                                : "Error: unable to update memory",
                            "error"
                        );
                        console.error("❌ Update failed, result:", result);
                    }
                } catch (error) {
                    console.error("Error updating memory:", error);
                    this.showFeedback(
                        window.kimiI18nManager ? window.kimiI18nManager.t("fallback_general_error") : "Error updating memory",
                        "error"
                    );
                }
            });

            // Close on overlay click
            overlay.addEventListener("click", e => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                }
            });
        } catch (error) {
            console.error("Error editing memory:", error);
            this.showFeedback("Error loading memory for editing", "error");
        }
    }

    async deleteMemory(memoryId) {
        if (!confirm("Are you sure you want to delete this memory?")) return;

        try {
            await this.memorySystem.deleteMemory(memoryId);
            await this.loadMemories();
            // Debounced stats update
            this.debounce("updateStats", async () => await this.updateMemoryStats());
            this.showFeedback("Memory deleted");
        } catch (error) {
            console.error("Error deleting memory:", error);
            this.showFeedback("Error deleting memory", "error");
        }
    }

    async exportMemories() {
        if (!this.memorySystem) return;

        try {
            const exportData = await this.memorySystem.exportMemories();
            if (exportData) {
                const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                    type: "application/json"
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `kimi-memories-${new Date().toISOString().split("T")[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                this.showFeedback("Memories exported successfully");
            }
        } catch (error) {
            console.error("Error exporting memories:", error);
            this.showFeedback("Error exporting memories", "error");
        }
    }

    async handleSummarizeAction() {
        if (!this.memorySystem) return;
        try {
            // Destructive confirmation modal
            const confirmMsg = `This action will create a single summary memory for the last 7 days and permanently DELETE the source memories. This is irreversible. Do you want to continue?`;
            if (!confirm(confirmMsg)) {
                this.showFeedback("Summary canceled");
                return;
            }

            this.showFeedback("Creating summary and replacing sources...");
            const result = await this.memorySystem.summarizeAndReplace(7, {});
            if (result) {
                this.showFeedback("Summary created and sources deleted");
                await this.loadMemories();
                await this.updateMemoryStats();
            } else {
                this.showFeedback("No recent memories to summarize");
            }
        } catch (e) {
            console.error("Error creating destructive summary", e);
            this.showFeedback("Error creating summary", "error");
        }
    }

    async updateMemoryStats() {
        if (!this.memorySystem) return;

        try {
            const stats = await this.memorySystem.getMemoryStats();
            const memoryCount = document.getElementById("memory-count");
            const memoryToggle = document.getElementById("memory-toggle");

            if (memoryCount) {
                memoryCount.textContent = `${stats.total} memories`;
            }

            // Update toggle state
            if (memoryToggle) {
                const enabled = this.memorySystem.memoryEnabled;
                memoryToggle.setAttribute("aria-checked", enabled.toString());
                memoryToggle.classList.toggle("active", enabled);

                // Add visual indicator for memory status
                const indicator = memoryToggle.querySelector(".memory-indicator") || document.createElement("div");
                if (!memoryToggle.querySelector(".memory-indicator")) {
                    indicator.className = "memory-indicator";
                    memoryToggle.appendChild(indicator);
                }
                indicator.style.cssText = `
                    position: absolute;
                    top: -2px;
                    right: -2px;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: ${enabled ? "#27ae60" : "#e74c3c"};
                    border: 2px solid white;
                `;
            }
        } catch (error) {
            console.error("Error updating memory stats:", error);
        }
    }

    // Force refresh of the memory UI (useful for debugging)
    async forceRefresh() {
        console.log("🔄 Force refresh of memory UI...");
        try {
            if (this.memorySystem) {
                // Migrate IDs if necessary
                await this.memorySystem.migrateIncompatibleIDs();

                // Reload memories
                await this.loadMemories();
                await this.updateMemoryStats();

                console.log("✅ Forced refresh completed");
            }
        } catch (error) {
            console.error("❌ Error during forced refresh:", error);
        }
    }

    showFeedback(message, type = "success") {
        // Create feedback element
        const feedback = document.createElement("div");
        feedback.className = `memory-feedback memory-feedback-${type}`;
        feedback.textContent = message;

        // Style the feedback based on type
        let backgroundColor;
        switch (type) {
            case "error":
                backgroundColor = "#e74c3c";
                break;
            case "info":
                backgroundColor = "#3498db";
                break;
            default:
                backgroundColor = "#27ae60";
        }

        // Style the feedback
        Object.assign(feedback.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            padding: "12px 20px",
            borderRadius: "6px",
            color: "white",
            backgroundColor: backgroundColor,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            zIndex: "10000",
            fontSize: "14px",
            fontWeight: "500",
            opacity: "0",
            transform: "translateX(100%)",
            transition: "all 0.3s ease"
        });

        document.body.appendChild(feedback);

        // Animate in
        setTimeout(() => {
            feedback.style.opacity = "1";
            feedback.style.transform = "translateX(0)";
        }, 10);

        // Remove after delay (longer for info messages, shorter for others)
        const delay = type === "info" ? 2000 : 3000;
        setTimeout(() => {
            feedback.style.opacity = "0";
            feedback.style.transform = "translateX(100%)";
            setTimeout(() => {
                if (feedback.parentNode) {
                    feedback.parentNode.removeChild(feedback);
                }
            }, 300);
        }, delay);
    }
}

// Initialize memory UI when DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
    window.kimiMemoryUI = new KimiMemoryUI();

    // Wait for memory system to be ready
    const waitForMemorySystem = () => {
        if (window.kimiMemorySystem) {
            window.kimiMemoryUI.init();
        } else {
            setTimeout(waitForMemorySystem, 100);
        }
    };

    setTimeout(waitForMemorySystem, 1000); // Give time for initialization
});

window.KimiMemoryUI = KimiMemoryUI;

function ensureVideoNeutralOnUIChange() {
    if (window.kimiVideo && window.kimiVideo.getCurrentVideoInfo) {
        const info = window.kimiVideo.getCurrentVideoInfo();
        if (info && info.ended) window.kimiVideo.returnToNeutral();
    }
}
