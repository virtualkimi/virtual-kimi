// ===== KIMI MEMORY UI MANAGER =====
class KimiMemoryUI {
    constructor() {
        this.memorySystem = null;
        this.isInitialized = false;
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
            addMemoryBtn.addEventListener("click", () => this.addManualMemory());
        }

        // Memory modal close
        const memoryClose = document.getElementById("memory-close");
        if (memoryClose) {
            memoryClose.addEventListener("click", () => this.closeMemoryModal());
        }

        // Memory export
        const memoryExport = document.getElementById("memory-export");
        if (memoryExport) {
            memoryExport.addEventListener("click", () => this.exportMemories());
        }

        // Memory filter
        const memoryFilter = document.getElementById("memory-filter-category");
        if (memoryFilter) {
            memoryFilter.addEventListener("change", () => this.filterMemories());
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
        }
    }

    async loadMemories() {
        if (!this.memorySystem) return;

        try {
            const memories = await this.memorySystem.getAllMemories();
            console.log("Loading memories into UI:", memories.length);
            this.renderMemories(memories);
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

                html += `
                    <div class="memory-item ${isAutomatic ? "memory-auto" : "memory-manual"}" data-memory-id="${memory.id}">
                        <div class="memory-header">
                            <div class="memory-badges">
                                <span class="memory-type ${memory.type}">${memory.type === "auto_extracted" ? "🤖 Auto" : "✋ Manual"}</span>
                                <span class="memory-confidence confidence-${this.getConfidenceLevel(confidence)}">${confidence}%</span>
                                ${isLongContent ? `<span class="memory-length">${wordCount} mots</span>` : ""}
                            </div>
                        </div>
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
                                    <i class="fas fa-chevron-down" id="icon-${memory.id}"></i> Voir plus
                                </button>
                            `
                                    : ""
                            }
                        </div>
                        <div class="memory-meta">
                            <span class="memory-date">${this.formatDate(memory.timestamp)}</span>
                            ${memory.sourceText ? `<span class="memory-source" title="${this.escapeHtml(memory.sourceText)}">� Extrait de conversation</span>` : `<span>📝 Ajouté manuellement</span>`}
                        </div>
                        <div class="memory-actions">
                            <button class="memory-edit-btn" onclick="kimiMemoryUI.editMemory('${memory.id}')" title="Modifier cette mémoire">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="memory-delete-btn" onclick="kimiMemoryUI.deleteMemory('${memory.id}')" title="Supprimer cette mémoire">
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

        memoryList.innerHTML = html;
    }

    formatCategoryName(category) {
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
        // Escape HTML first
        const escapedContent = this.escapeHtml(content);

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

    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
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
            expandBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Voir plus';
        } else {
            previewShort.style.display = "none";
            previewFull.style.display = "block";
            icon.className = "fas fa-chevron-up";
            expandBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Voir moins';
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
                    <i class="fas fa-edit"></i> Edit Memory
                </h3>
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Category:</label>
                    <select id="edit-memory-category" class="kimi-select" style="width: 100%;">
                        <option value="personal" ${memory.category === "personal" ? "selected" : ""}>Personal Info</option>
                        <option value="preferences" ${memory.category === "preferences" ? "selected" : ""}>Likes & Dislikes</option>
                        <option value="relationships" ${memory.category === "relationships" ? "selected" : ""}>Relationships</option>
                        <option value="activities" ${memory.category === "activities" ? "selected" : ""}>Activities & Hobbies</option>
                        <option value="goals" ${memory.category === "goals" ? "selected" : ""}>Goals & Plans</option>
                        <option value="experiences" ${memory.category === "experiences" ? "selected" : ""}>Experiences</option>
                        <option value="important" ${memory.category === "important" ? "selected" : ""}>Important Events</option>
                    </select>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500;">Content:</label>
                    <textarea id="edit-memory-content" class="kimi-input" style="width: 100%; height: 100px; resize: vertical;" placeholder="Memory content...">${memory.content}</textarea>
                </div>
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button id="cancel-edit" class="kimi-button" style="background: #6c757d;">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    <button id="save-edit" class="kimi-button">
                        <i class="fas fa-save"></i> Save
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
                const newCategory = dialog.querySelector("#edit-memory-category").value;
                const newContent = dialog.querySelector("#edit-memory-content").value.trim();

                if (!newContent) {
                    this.showFeedback("Le contenu ne peut pas être vide", "error");
                    return;
                }

                console.log(`🔄 Tentative de mise à jour de la mémoire ID: ${memoryId}`);
                console.log("Nouvelles données:", { category: newCategory, content: newContent });

                try {
                    const result = await this.memorySystem.updateMemory(memoryId, {
                        category: newCategory,
                        content: newContent
                    });

                    console.log("Résultat de l'update:", result);

                    if (result === true) {
                        // Fermer le modal
                        document.body.removeChild(overlay);

                        // Forcer le rechargement complet
                        await this.loadMemories();
                        await this.updateMemoryStats();

                        this.showFeedback("Mémoire mise à jour avec succès");
                        console.log("✅ Interface mise à jour");
                    } else {
                        this.showFeedback("Erreur: Impossible de mettre à jour la mémoire", "error");
                        console.error("❌ Update échoué, résultat:", result);
                    }
                } catch (error) {
                    console.error("Error updating memory:", error);
                    this.showFeedback("Erreur lors de la mise à jour de la mémoire", "error");
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
            await this.updateMemoryStats();
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

    // Force refresh de l'interface (utile pour debug)
    async forceRefresh() {
        console.log("🔄 Force refresh de l'interface mémoire...");
        try {
            if (this.memorySystem) {
                // Migrer les IDs si nécessaire
                await this.memorySystem.migrateIncompatibleIDs();

                // Recharger les mémoires
                await this.loadMemories();
                await this.updateMemoryStats();

                console.log("✅ Refresh forcé terminé");
            }
        } catch (error) {
            console.error("❌ Erreur lors du refresh forcé:", error);
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
