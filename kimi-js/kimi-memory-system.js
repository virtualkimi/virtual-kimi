// ===== KIMI INTELLIGENT MEMORY SYSTEM =====
class KimiMemorySystem {
    constructor(database) {
        this.db = database;
        this.memoryEnabled = true;
        this.maxMemoryEntries = 100;
        this.memoryCategories = {
            personal: "Personal Information",
            preferences: "Likes & Dislikes",
            relationships: "Relationships & People",
            activities: "Activities & Hobbies",
            goals: "Goals & Aspirations",
            experiences: "Shared Experiences",
            important: "Important Events"
        };

        // Patterns for automatic memory extraction (multilingual)
        this.extractionPatterns = {
            personal: [
                // English patterns
                /(?:my name is|i'm called|call me|i am) (\w+)/i,
                /(?:i am|i'm) (\d+) years? old/i,
                /(?:i live in|i'm from|from) ([^,.!?]+)/i,
                /(?:i work as|my job is|i'm a) ([^,.!?]+)/i,
                // French patterns
                /(?:je m'appelle|mon nom est|je suis) ([^,.!?]+)/i,
                /(?:j'ai) (\d+) ans?/i,
                /(?:j'habite à|je vis à|je viens de) ([^,.!?]+)/i,
                /(?:je travaille comme|mon travail est|je suis) ([^,.!?]+)/i
            ],
            preferences: [
                // English patterns
                /(?:i love|i like|i enjoy|i prefer) ([^,.!?]+)/i,
                /(?:i hate|i dislike|i don't like) ([^,.!?]+)/i,
                /(?:my favorite|i really like) ([^,.!?]+)/i,
                // French patterns
                /(?:j'aime|j'adore|je préfère) ([^,.!?]+)/i,
                /(?:je déteste|je n'aime pas) ([^,.!?]+)/i,
                /(?:mon préféré|ma préférée) (?:est|sont) ([^,.!?]+)/i,
                // Explicit memory requests
                /(?:ajoute? (?:au|à la) (?:système? )?(?:de )?mémoire|retiens?|mémorise?) (?:que )?(.+)/i,
                /(?:add to memory|remember|memorize) (?:that )?(.+)/i
            ],
            relationships: [
                // English patterns
                /(?:my (?:wife|husband|girlfriend|boyfriend|partner)) (?:is|named?) ([^,.!?]+)/i,
                /(?:my (?:mother|father|sister|brother|friend)) ([^,.!?]+)/i,
                // French patterns
                /(?:ma (?:femme|copine|partenaire)|mon (?:mari|copain|partenaire)) (?:s'appelle|est) ([^,.!?]+)/i,
                /(?:ma (?:mère|sœur)|mon (?:père|frère|ami)) (?:s'appelle|est) ([^,.!?]+)/i
            ],
            activities: [
                // English patterns
                /(?:i play|i do|i practice) ([^,.!?]+)/i,
                /(?:my hobby is|i hobby) ([^,.!?]+)/i,
                // French patterns
                /(?:je joue|je fais|je pratique) ([^,.!?]+)/i,
                /(?:mon passe-temps|mon hobby) (?:est|c'est) ([^,.!?]+)/i
            ],
            goals: [
                // English patterns
                /(?:i want to|i plan to|my goal is) ([^,.!?]+)/i,
                /(?:i'm learning|i study) ([^,.!?]+)/i,
                // French patterns
                /(?:je veux|je vais|mon objectif est) ([^,.!?]+)/i,
                /(?:j'apprends|j'étudie) ([^,.!?]+)/i
            ]
        };
    }

    async init() {
        if (!this.db) {
            console.warn("Database not available for memory system");
            return;
        }

        try {
            this.memoryEnabled = await this.db.getPreference("memorySystemEnabled", true);
            this.selectedCharacter = await this.db.getSelectedCharacter();
            await this.createMemoryTables();

            // Migrer les IDs incompatibles si nécessaire
            await this.migrateIncompatibleIDs();
        } catch (error) {
            console.error("Memory system initialization error:", error);
        }
    }

    async createMemoryTables() {
        // Ensure memory tables exist in database
        if (!this.db.db.memories) {
            console.warn("Memory table not found in database schema");
            return;
        }
    }

    // MEMORY EXTRACTION from conversation
    async extractMemoryFromText(userText, kimiResponse = null) {
        if (!this.memoryEnabled || !userText) return [];

        const extractedMemories = [];
        const text = userText.toLowerCase();

        console.log("🔍 Memory extraction - Processing text:", userText);

        // Enhanced extraction with context awareness
        const existingMemories = await this.getAllMemories();

        // First, check for explicit memory requests
        const explicitRequests = this.detectExplicitMemoryRequests(userText);
        if (explicitRequests.length > 0) {
            console.log("🎯 Explicit memory requests detected:", explicitRequests);
            extractedMemories.push(...explicitRequests);
        }

        // Extract using patterns
        for (const [category, patterns] of Object.entries(this.extractionPatterns)) {
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    const content = match[1].trim();

                    // Skip very short or generic content
                    if (content.length < 2 || this.isGenericContent(content)) {
                        continue;
                    }

                    // Check if this is a meaningful update to existing memory
                    const isUpdate = await this.isMemoryUpdate(category, content, existingMemories);

                    const memory = {
                        category: category,
                        type: "auto_extracted",
                        content: content,
                        sourceText: userText,
                        confidence: this.calculateExtractionConfidence(match, userText),
                        timestamp: new Date(),
                        character: this.selectedCharacter,
                        isUpdate: isUpdate
                    };

                    console.log(`💡 Pattern match for ${category}:`, content);
                    extractedMemories.push(memory);
                }
            }
        }

        // Enhanced pattern detection for more natural expressions
        const enhancedMemories = await this.detectNaturalExpressions(userText, existingMemories);
        extractedMemories.push(...enhancedMemories);

        // Save extracted memories with intelligent deduplication
        const savedMemories = [];
        for (const memory of extractedMemories) {
            console.log("💾 Saving memory:", memory.content);
            const saved = await this.addMemory(memory);
            if (saved) savedMemories.push(saved);
        }

        if (savedMemories.length > 0) {
            console.log(`✅ Successfully extracted and saved ${savedMemories.length} memories`);
        } else {
            console.log("📝 No memories extracted from this text");
        }

        return savedMemories;
    }

    // Detect explicit memory requests like "ajoute en mémoire que..."
    detectExplicitMemoryRequests(text) {
        const memories = [];
        const lowerText = text.toLowerCase();

        // French patterns for explicit memory requests
        const frenchPatterns = [
            /(?:ajoute?s?(?:r)?|retiens?|mémorise?s?|enregistre?s?|sauvegarde?s?)\s+(?:au|à|en|dans)\s+(?:la\s+|le\s+)?(?:système?\s+(?:de\s+)?)?mémoire\s+(?:que\s+)?(.+)/i,
            /(?:peux-tu|pourrais-tu|veux-tu)?\s*(?:ajouter|retenir|mémoriser|enregistrer|sauvegarder)\s+(?:que\s+)?(.+)\s+(?:en|dans)\s+(?:la\s+|le\s+)?mémoire/i,
            /(?:je\s+veux\s+que\s+tu\s+)?(?:retienne?s|mémorise?s|ajoute?s)\s+(?:que\s+)?(.+)/i
        ];

        // English patterns for explicit memory requests
        const englishPatterns = [
            /(?:add\s+to\s+memory|remember|memorize|save\s+(?:to\s+)?memory)\s+(?:that\s+)?(.+)/i,
            /(?:can\s+you|could\s+you)?\s*(?:add|remember|memorize|save)\s+(?:that\s+)?(.+)\s+(?:to\s+|in\s+)?memory/i,
            /(?:i\s+want\s+you\s+to\s+)?(?:remember|memorize|add)\s+(?:that\s+)?(.+)/i
        ];

        const allPatterns = [...frenchPatterns, ...englishPatterns];

        for (const pattern of allPatterns) {
            const match = lowerText.match(pattern);
            if (match && match[1]) {
                const content = match[1].trim();

                // Determine category based on content
                const category = this.categorizeExplicitMemory(content);

                memories.push({
                    category: category,
                    type: "explicit_request",
                    content: content,
                    sourceText: text,
                    confidence: 1.0, // High confidence for explicit requests
                    timestamp: new Date(),
                    character: this.selectedCharacter,
                    isUpdate: false
                });
                break; // Only take the first match to avoid duplicates
            }
        }

        return memories;
    }

    // Categorize explicit memory based on content analysis
    categorizeExplicitMemory(content) {
        const lowerContent = content.toLowerCase();

        // Preference indicators
        if (
            lowerContent.includes("j'aime") ||
            lowerContent.includes("i like") ||
            lowerContent.includes("j'adore") ||
            lowerContent.includes("i love") ||
            lowerContent.includes("je préfère") ||
            lowerContent.includes("i prefer") ||
            lowerContent.includes("je déteste") ||
            lowerContent.includes("i hate")
        ) {
            return "preferences";
        }

        // Personal information indicators
        if (
            lowerContent.includes("je m'appelle") ||
            lowerContent.includes("my name is") ||
            (lowerContent.includes("j'ai") && lowerContent.includes("ans")) ||
            lowerContent.includes("years old") ||
            lowerContent.includes("j'habite") ||
            lowerContent.includes("i live")
        ) {
            return "personal";
        }

        // Relationship indicators
        if (
            lowerContent.includes("ma femme") ||
            lowerContent.includes("my wife") ||
            lowerContent.includes("mon mari") ||
            lowerContent.includes("my husband") ||
            lowerContent.includes("mon ami") ||
            lowerContent.includes("my friend") ||
            lowerContent.includes("ma famille") ||
            lowerContent.includes("my family")
        ) {
            return "relationships";
        }

        // Activity indicators
        if (
            lowerContent.includes("je joue") ||
            lowerContent.includes("i play") ||
            lowerContent.includes("je pratique") ||
            lowerContent.includes("i practice") ||
            lowerContent.includes("mon hobby") ||
            lowerContent.includes("my hobby")
        ) {
            return "activities";
        }

        // Goal indicators
        if (
            lowerContent.includes("je veux") ||
            lowerContent.includes("i want") ||
            lowerContent.includes("mon objectif") ||
            lowerContent.includes("my goal") ||
            lowerContent.includes("j'apprends") ||
            lowerContent.includes("i'm learning")
        ) {
            return "goals";
        }

        // Default to preferences for most explicit requests
        return "preferences";
    }

    // Check if content is too generic to be useful
    isGenericContent(content) {
        const genericWords = ["yes", "no", "ok", "okay", "sure", "thanks", "hello", "hi", "bye"];
        return genericWords.includes(content.toLowerCase()) || content.length < 2;
    }

    // Calculate confidence based on context and pattern strength
    calculateExtractionConfidence(match, fullText) {
        let confidence = 0.6; // Base confidence

        // Boost confidence for explicit statements
        if (fullText.includes("my name is") || fullText.includes("i am called")) {
            confidence += 0.3;
        }

        // Boost for longer, more specific content
        if (match[1] && match[1].trim().length > 10) {
            confidence += 0.1;
        }

        // Reduce confidence for uncertain language
        if (fullText.includes("maybe") || fullText.includes("perhaps") || fullText.includes("might")) {
            confidence -= 0.2;
        }

        return Math.min(1.0, Math.max(0.1, confidence));
    }

    // Check if this is an update to existing memory rather than new info
    async isMemoryUpdate(category, content, existingMemories) {
        const categoryMemories = existingMemories.filter(m => m.category === category);

        for (const memory of categoryMemories) {
            const similarity = this.calculateSimilarity(memory.content, content);
            if (similarity > 0.3) {
                // Lower threshold for updates
                return true;
            }
        }

        return false;
    }

    // Detect natural expressions that patterns might miss
    async detectNaturalExpressions(text, existingMemories) {
        const naturalMemories = [];
        const lowerText = text.toLowerCase();

        // Detect name mentions in natural context
        const namePatterns = [/call me (\w+)/i, /(\w+) here[,.]?/i, /this is (\w+)/i, /(\w+) speaking/i];

        for (const pattern of namePatterns) {
            const match = lowerText.match(pattern);
            if (match && match[1] && match[1].length > 1) {
                const name = match[1].trim();

                // Skip if too generic
                if (!this.isGenericContent(name) && !this.isCommonWord(name)) {
                    naturalMemories.push({
                        category: "personal",
                        type: "auto_extracted",
                        content: name,
                        sourceText: text,
                        confidence: 0.7,
                        timestamp: new Date(),
                        character: this.selectedCharacter
                    });
                }
            }
        }

        return naturalMemories;
    }

    // Check if word is too common to be a name
    isCommonWord(word, language = "en") {
        // Use existing constants if available
        if (window.KIMI_COMMON_WORDS && window.KIMI_COMMON_WORDS[language]) {
            return window.KIMI_COMMON_WORDS[language].includes(word.toLowerCase());
        }

        // Fallback to original English list
        const commonWords = [
            "the",
            "and",
            "for",
            "are",
            "but",
            "not",
            "you",
            "all",
            "can",
            "had",
            "her",
            "was",
            "one",
            "our",
            "out",
            "day",
            "get",
            "has",
            "him",
            "his",
            "how",
            "man",
            "new",
            "now",
            "old",
            "see",
            "two",
            "way",
            "who",
            "boy",
            "did",
            "its",
            "let",
            "put",
            "say",
            "she",
            "too",
            "use"
        ];
        return commonWords.includes(word.toLowerCase());
    }

    // MANUAL MEMORY MANAGEMENT
    async addMemory(memoryData) {
        if (!this.db || !this.memoryEnabled) return;

        try {
            // Check for duplicates with intelligent merging
            const existing = await this.findSimilarMemory(memoryData);
            if (existing) {
                // Intelligent merge strategy
                return await this.mergeMemories(existing, memoryData);
            }

            // Add memory with metadata (let DB auto-generate ID)
            const memory = {
                category: memoryData.category || "personal",
                type: memoryData.type || "manual",
                content: memoryData.content,
                sourceText: memoryData.sourceText || "",
                confidence: memoryData.confidence || 1.0,
                timestamp: memoryData.timestamp || new Date(),
                character: memoryData.character || this.selectedCharacter,
                isActive: true,
                tags: memoryData.tags || [],
                lastModified: new Date(),
                accessCount: 0,
                importance: this.calculateImportance(memoryData)
            };

            if (this.db.db.memories) {
                const id = await this.db.db.memories.add(memory);
                memory.id = id; // Store the auto-generated ID
                console.log(`Memory added with ID: ${id}`);
            }

            // Cleanup old memories if we exceed limit
            await this.cleanupOldMemories();

            // Notify LLM system to refresh context
            this.notifyLLMContextUpdate();

            return memory;
        } catch (error) {
            console.error("Error adding memory:", error);
        }
    }

    // Intelligent memory merging
    async mergeMemories(existingMemory, newMemoryData) {
        try {
            // Determine merge strategy based on content and confidence
            const strategy = this.determineMergeStrategy(existingMemory, newMemoryData);

            let mergedContent = existingMemory.content;
            let mergedConfidence = existingMemory.confidence;
            let mergedTags = [...(existingMemory.tags || [])];

            switch (strategy) {
                case "update_content":
                    // New information is more confident/recent
                    mergedContent = newMemoryData.content;
                    mergedConfidence = Math.max(existingMemory.confidence, newMemoryData.confidence || 0.8);
                    break;

                case "merge_content":
                    // Combine information intelligently
                    if (
                        existingMemory.category === "personal" &&
                        this.areRelatedNames(existingMemory.content, newMemoryData.content)
                    ) {
                        // Handle name variants
                        mergedContent = this.mergeNames(existingMemory.content, newMemoryData.content);
                    } else {
                        // General merge - keep most specific
                        mergedContent =
                            newMemoryData.content.length > existingMemory.content.length
                                ? newMemoryData.content
                                : existingMemory.content;
                    }
                    mergedConfidence = (existingMemory.confidence + (newMemoryData.confidence || 0.8)) / 2;
                    break;

                case "add_variant":
                    // Store as variant/alias
                    mergedTags.push(`alias:${newMemoryData.content}`);
                    break;

                case "boost_confidence":
                    // Same content, boost confidence
                    mergedConfidence = Math.min(1.0, existingMemory.confidence + 0.1);
                    break;
            }

            // Update existing memory
            const updatedMemory = {
                ...existingMemory,
                content: mergedContent,
                confidence: mergedConfidence,
                tags: [...new Set(mergedTags)], // Remove duplicates
                lastModified: new Date(),
                accessCount: (existingMemory.accessCount || 0) + 1,
                importance: Math.max(existingMemory.importance || 0.5, this.calculateImportance(newMemoryData))
            };

            await this.updateMemory(existingMemory.id, updatedMemory);
            return updatedMemory;
        } catch (error) {
            console.error("Error merging memories:", error);
            return existingMemory;
        }
    }

    // Determine how to merge two related memories
    determineMergeStrategy(existing, newData) {
        const similarity = this.calculateSimilarity(existing.content, newData.content);
        const newConfidence = newData.confidence || 0.8;

        // If very similar content but new has higher confidence
        if (similarity > 0.9 && newConfidence > existing.confidence) {
            return "boost_confidence";
        }

        // If moderately similar, decide based on specificity and recency
        if (similarity > 0.7) {
            if (newData.content.length > existing.content.length * 1.5) {
                return "update_content"; // New is more detailed
            } else {
                return "merge_content";
            }
        }

        // For names, handle as variants
        if (existing.category === "personal" && this.areRelatedNames(existing.content, newData.content)) {
            return "add_variant";
        }

        // Default to merging
        return "merge_content";
    }

    // Merge name variants intelligently
    mergeNames(name1, name2) {
        // Keep the longest/most formal version as primary
        if (name1.length > name2.length) {
            return name1;
        } else if (name2.length > name1.length) {
            return name2;
        }

        // If same length, keep the first one
        return name1;
    }

    // Calculate importance of memory for prioritization
    calculateImportance(memoryData) {
        let importance = 0.5; // Base importance

        // Personal information is generally more important
        const categoryWeights = {
            personal: 0.9,
            relationships: 0.8,
            goals: 0.7,
            preferences: 0.6,
            activities: 0.5,
            experiences: 0.4,
            important: 1.0
        };

        importance = categoryWeights[memoryData.category] || 0.5;

        // Boost importance for longer, more detailed content
        if (memoryData.content && memoryData.content.length > 20) {
            importance += 0.1;
        }

        // High confidence boosts importance
        if (memoryData.confidence && memoryData.confidence > 0.9) {
            importance += 0.1;
        }

        return Math.min(1.0, importance);
    }

    async updateMemory(memoryId, updateData) {
        if (!this.db) return false;

        try {
            // Ensure memoryId is the correct type
            const numericId = typeof memoryId === "string" ? parseInt(memoryId) : memoryId;

            // Vérifier d'abord que la mémoire existe
            const existingMemory = await this.db.db.memories.get(numericId);
            if (!existingMemory) {
                console.error(`❌ Memory with ID ${numericId} not found in database`);
                return false;
            }

            console.log(`🔄 Updating memory ${numericId}:`, { existing: existingMemory, update: updateData });

            const update = {
                ...updateData,
                lastModified: new Date()
            };

            if (this.db.db.memories) {
                const result = await this.db.db.memories.update(numericId, update);

                console.log(`Memory update result for ID ${numericId}:`, result);

                if (result > 0) {
                    console.log("✅ Memory updated successfully");
                    // Notify LLM system to refresh context
                    this.notifyLLMContextUpdate();
                    return true;
                } else {
                    console.error("❌ Memory update failed - no rows affected");
                    return false;
                }
            }
        } catch (error) {
            console.error("Error updating memory:", error, { memoryId, updateData });
            return false;
        }
    }

    async deleteMemory(memoryId) {
        if (!this.db) return false;

        try {
            // Ensure memoryId is the correct type
            const numericId = typeof memoryId === "string" ? parseInt(memoryId) : memoryId;

            if (this.db.db.memories) {
                const result = await this.db.db.memories.delete(numericId);

                console.log(`Memory delete result for ID ${numericId}:`, result);

                // Notify LLM system to refresh context
                if (result) {
                    this.notifyLLMContextUpdate();
                }

                return result;
            }
        } catch (error) {
            console.error("Error deleting memory:", error, { memoryId });
            return false;
        }
    }

    notifyLLMContextUpdate() {
        // Debounce context updates to avoid excessive calls
        if (this.contextUpdateTimeout) {
            clearTimeout(this.contextUpdateTimeout);
        }

        this.contextUpdateTimeout = setTimeout(() => {
            if (window.kimiLLM && typeof window.kimiLLM.refreshMemoryContext === "function") {
                window.kimiLLM.refreshMemoryContext();
            }
        }, 500);
    }

    async getMemoriesByCategory(category, character = null) {
        if (!this.db) return [];

        try {
            character = character || this.selectedCharacter;

            if (this.db.db.memories) {
                return await this.db.db.memories
                    .where("[character+category]")
                    .equals([character, category])
                    .and(m => m.isActive)
                    .reverse()
                    .sortBy("timestamp");
            }
        } catch (error) {
            console.error("Error getting memories by category:", error);
            return [];
        }
    }

    async getAllMemories(character = null) {
        if (!this.db) return [];

        try {
            character = character || this.selectedCharacter;

            if (this.db.db.memories) {
                const memories = await this.db.db.memories
                    .where("character")
                    .equals(character)
                    .and(m => m.isActive)
                    .reverse()
                    .sortBy("timestamp");

                console.log(`Retrieved ${memories.length} memories for character: ${character}`);
                return memories;
            }
        } catch (error) {
            console.error("Error getting all memories:", error);
            return [];
        }
    }

    async findSimilarMemory(memoryData) {
        if (!this.db) return null;

        try {
            const memories = await this.getMemoriesByCategory(memoryData.category);

            // Enhanced similarity check with multiple criteria
            for (const memory of memories) {
                const contentSimilarity = this.calculateSimilarity(memory.content, memoryData.content);

                // Different thresholds based on category
                let threshold = 0.8;
                if (memoryData.category === "personal") {
                    threshold = 0.6; // Names and personal info can vary more
                } else if (memoryData.category === "preferences") {
                    threshold = 0.7; // Preferences can be expressed differently
                }

                if (contentSimilarity > threshold) {
                    return memory;
                }

                // Special handling for names (check if one is contained in the other)
                if (memoryData.category === "personal" && this.areRelatedNames(memory.content, memoryData.content)) {
                    return memory;
                }
            }
        } catch (error) {
            console.error("Error finding similar memory:", error);
        }

        return null;
    }

    // Check if two names are related (nicknames, variants, etc.)
    areRelatedNames(name1, name2) {
        const n1 = name1.toLowerCase().trim();
        const n2 = name2.toLowerCase().trim();

        // Exact match
        if (n1 === n2) return true;

        // One contains the other (Jean-Pierre vs Jean)
        if (n1.includes(n2) || n2.includes(n1)) return true;

        // Common nickname patterns
        const nicknames = {
            jean: ["jp", "jeannot"],
            pierre: ["pete", "pietro"],
            marie: ["mary", "maria"],
            michael: ["mike", "mick"],
            william: ["bill", "will", "willy"],
            robert: ["bob", "rob", "bobby"],
            richard: ["rick", "dick", "richie"],
            thomas: ["tom", "tommy"],
            christopher: ["chris", "kit"],
            anthony: ["tony", "ant"]
        };

        for (const [full, nicks] of Object.entries(nicknames)) {
            if ((n1 === full && nicks.includes(n2)) || (n2 === full && nicks.includes(n1))) {
                return true;
            }
        }

        return false;
    }

    calculateSimilarity(text1, text2) {
        // Enhanced similarity calculation
        const words1 = text1
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2);
        const words2 = text2
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2);

        if (words1.length === 0 || words2.length === 0) {
            return text1.toLowerCase() === text2.toLowerCase() ? 1 : 0;
        }

        const intersection = words1.filter(word => words2.includes(word));
        const union = [...new Set([...words1, ...words2])];

        let similarity = intersection.length / union.length;

        // Boost similarity for exact substring matches
        if (text1.toLowerCase().includes(text2.toLowerCase()) || text2.toLowerCase().includes(text1.toLowerCase())) {
            similarity += 0.2;
        }

        return Math.min(1.0, similarity);
    }

    async cleanupOldMemories() {
        if (!this.db) return;

        try {
            const memories = await this.getAllMemories();

            if (memories.length > this.maxMemoryEntries) {
                // Keep most recent and important memories
                memories.sort((a, b) => {
                    // Priority: confidence * recency
                    const scoreA = a.confidence * (Date.now() - new Date(a.timestamp).getTime());
                    const scoreB = b.confidence * (Date.now() - new Date(b.timestamp).getTime());
                    return scoreB - scoreA;
                });

                const toDelete = memories.slice(this.maxMemoryEntries);
                for (const memory of toDelete) {
                    await this.deleteMemory(memory.id);
                }
            }
        } catch (error) {
            console.error("Error cleaning up old memories:", error);
        }
    }

    // MEMORY RETRIEVAL FOR LLM
    async getRelevantMemories(context = "", limit = 10) {
        if (!this.memoryEnabled) return [];

        try {
            const allMemories = await this.getAllMemories();

            if (allMemories.length === 0) return [];

            if (!context) {
                // Return most important and recent memories
                return this.selectMostImportantMemories(allMemories, limit);
            }

            // Score memories based on relevance to context
            const scoredMemories = allMemories.map(memory => ({
                ...memory,
                relevanceScore: this.calculateRelevance(memory, context)
            }));

            // Sort by relevance and return top results
            scoredMemories.sort((a, b) => b.relevanceScore - a.relevanceScore);

            // Filter out very low relevance memories
            const relevantMemories = scoredMemories.filter(m => m.relevanceScore > 0.1);

            return relevantMemories.slice(0, limit);
        } catch (error) {
            console.error("Error getting relevant memories:", error);
            return [];
        }
    }

    // Select most important memories when no context is provided
    selectMostImportantMemories(memories, limit) {
        // Score by importance, recency, and access count
        const scoredMemories = memories.map(memory => {
            let score = memory.importance || 0.5;

            // Boost recent memories
            const daysSinceCreation = (Date.now() - new Date(memory.timestamp)) / (1000 * 60 * 60 * 24);
            score += Math.max(0, (7 - daysSinceCreation) / 7) * 0.2; // Recent boost

            // Boost frequently accessed memories
            const accessCount = memory.accessCount || 0;
            score += Math.min(accessCount / 10, 0.2); // Access boost

            // Boost high confidence memories
            score += (memory.confidence || 0.5) * 0.1;

            return { ...memory, importanceScore: score };
        });

        scoredMemories.sort((a, b) => b.importanceScore - a.importanceScore);
        return scoredMemories.slice(0, limit);
    }

    calculateRelevance(memory, context) {
        const contextWords = context
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2);
        const memoryWords = memory.content
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2);

        let score = 0;

        // Enhanced content similarity with keyword matching
        score += this.calculateSimilarity(memory.content, context) * 0.4;

        // Keyword matching bonus
        let keywordMatches = 0;
        for (const word of contextWords) {
            if (memoryWords.includes(word)) {
                keywordMatches++;
            }
        }
        if (contextWords.length > 0) {
            score += (keywordMatches / contextWords.length) * 0.3;
        }

        // Category relevance bonus based on context
        score += this.getCategoryRelevance(memory.category, context) * 0.1;

        // Recent memories get bonus for current conversation
        const daysSinceCreation = (Date.now() - new Date(memory.timestamp)) / (1000 * 60 * 60 * 24);
        score += Math.max(0, (30 - daysSinceCreation) / 30) * 0.1;

        // Confidence and importance boost
        score += (memory.confidence || 0.5) * 0.05;
        score += (memory.importance || 0.5) * 0.05;

        return Math.min(1.0, score);
    }

    // Determine if memory category is relevant to current context
    getCategoryRelevance(category, context) {
        const contextLower = context.toLowerCase();

        const categoryKeywords = {
            personal: ["name", "age", "live", "work", "job", "who", "am", "myself"],
            preferences: ["like", "love", "hate", "prefer", "enjoy", "favorite", "dislike"],
            relationships: ["family", "friend", "wife", "husband", "partner", "mother", "father"],
            activities: ["play", "hobby", "sport", "activity", "practice", "do"],
            goals: ["want", "plan", "goal", "dream", "hope", "wish", "future"],
            experiences: ["remember", "happened", "story", "experience", "time"],
            important: ["important", "remember", "special", "never forget"]
        };

        const keywords = categoryKeywords[category] || [];
        let relevance = 0;

        for (const keyword of keywords) {
            if (contextLower.includes(keyword)) {
                relevance += 0.2;
            }
        }

        return Math.min(1.0, relevance);
    }

    // Update access count when memory is used
    async recordMemoryAccess(memoryId) {
        try {
            const memory = await this.db.db.memories.get(memoryId);
            if (memory) {
                memory.accessCount = (memory.accessCount || 0) + 1;
                memory.lastAccessed = new Date();
                await this.db.db.memories.put(memory);
            }
        } catch (error) {
            console.error("Error recording memory access:", error);
        }
    }

    // MEMORY STATISTICS
    async getMemoryStats() {
        try {
            const memories = await this.getAllMemories();
            const stats = {
                total: memories.length,
                byCategory: {},
                averageConfidence: 0,
                oldestMemory: null,
                newestMemory: null
            };

            if (memories.length > 0) {
                // Category breakdown
                for (const memory of memories) {
                    stats.byCategory[memory.category] = (stats.byCategory[memory.category] || 0) + 1;
                }

                // Average confidence
                stats.averageConfidence = memories.reduce((sum, m) => sum + m.confidence, 0) / memories.length;

                // Oldest and newest
                const sortedByDate = [...memories].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                stats.oldestMemory = sortedByDate[0];
                stats.newestMemory = sortedByDate[sortedByDate.length - 1];
            }

            return stats;
        } catch (error) {
            console.error("Error getting memory stats:", error);
            return { total: 0, byCategory: {}, averageConfidence: 0 };
        }
    }

    // MEMORY TOGGLE
    async toggleMemorySystem(enabled) {
        this.memoryEnabled = enabled;
        if (this.db) {
            await this.db.setPreference("memorySystemEnabled", enabled);
        }
    }

    // EXPORT/IMPORT MEMORIES
    async exportMemories() {
        try {
            const memories = await this.getAllMemories();
            return {
                exportDate: new Date().toISOString(),
                character: this.selectedCharacter,
                memories: memories,
                version: "1.0"
            };
        } catch (error) {
            console.error("Error exporting memories:", error);
            return null;
        }
    }

    async importMemories(importData) {
        if (!importData || !importData.memories) return false;

        try {
            for (const memory of importData.memories) {
                await this.addMemory({
                    ...memory,
                    type: "imported",
                    character: this.selectedCharacter
                });
            }
            return true;
        } catch (error) {
            console.error("Error importing memories:", error);
            return false;
        }
    }

    // MIGRATION UTILITIES
    async migrateIncompatibleIDs() {
        if (!this.db) return false;

        try {
            console.log("🔧 Début de la migration des IDs incompatibles...");

            // Récupérer toutes les mémoires
            const allMemories = await this.db.db.memories.toArray();
            console.log(`📊 ${allMemories.length} mémoires trouvées`);

            const incompatibleMemories = allMemories.filter(memory => {
                // Les IDs auto-increment sont des entiers séquentiels (1, 2, 3...)
                // Les anciens IDs manuels sont des nombres très grands (timestamps)
                return memory.id > 10000; // Seuil arbitraire pour détecter les anciens IDs
            });

            if (incompatibleMemories.length === 0) {
                console.log("✅ Aucune migration nécessaire");
                return true;
            }

            console.log(`🔄 Migration de ${incompatibleMemories.length} mémoires avec IDs incompatibles`);

            // Sauvegarder les données avant suppression
            const dataToMigrate = incompatibleMemories.map(memory => {
                const { id, ...memoryData } = memory; // Enlever l'ancien ID
                return memoryData;
            });

            // Supprimer les anciennes entrées
            await this.db.db.memories.bulkDelete(incompatibleMemories.map(m => m.id));

            // Réinsérer avec de nouveaux IDs auto-générés
            const newIds = await this.db.db.memories.bulkAdd(dataToMigrate);

            console.log(`✅ Migration terminée. Nouveaux IDs:`, newIds);
            return true;
        } catch (error) {
            console.error("❌ Erreur lors de la migration:", error);
            return false;
        }
    }
}

window.KimiMemorySystem = KimiMemorySystem;
