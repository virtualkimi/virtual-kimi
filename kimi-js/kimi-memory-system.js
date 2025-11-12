// ===== KIMI INTELLIGENT MEMORY SYSTEM =====
class KimiMemorySystem {
    constructor(database) {
        this.db = database;
        this.memoryEnabled = true;
        this.maxMemoryEntries = 100;

        // Performance optimization: keyword cache with LRU eviction
        this.keywordCache = new Map(); // keyword_language -> boolean (is common)
        this.keywordCacheSize = 1000; // Limit memory usage
        this.keywordCacheHits = 0;
        this.keywordCacheMisses = 0;

        // Performance monitoring
        this.queryStats = {
            extractionTime: [],
            addMemoryTime: [],
            retrievalTime: []
        };

        // Centralized configuration for all thresholds and magic numbers
        this.config = {
            // Content validation thresholds
            minContentLength: 2,
            longContentThreshold: 24,
            titleWordCount: {
                preferred: 3,
                min: 1,
                max: 5
            },

            // Similarity and confidence thresholds
            similarity: {
                personal: 0.6, // Names can vary more (Jean vs Jean-Pierre)
                preferences: 0.7, // Preferences can be expressed differently
                default: 0.8, // General similarity threshold
                veryHigh: 0.9, // For boost_confidence strategy
                update: 0.3 // Lower threshold for memory updates
            },

            // Confidence scoring
            confidence: {
                base: 0.6,
                explicitRequest: 1.0,
                naturalExpression: 0.7,
                bonusForLongContent: 0.1,
                bonusForExplicitStatement: 0.3,
                penaltyForUncertainty: 0.2,
                min: 0.1,
                max: 1.0
            },

            // Memory management
            cleanup: {
                maxEntries: 100,
                ttlDays: 365,
                batchSize: 100,
                touchMinutes: 60
            },

            // Performance settings
            cache: {
                keywordCacheSize: 1000,
                statHistorySize: 100
            },

            // Scoring weights for importance calculation
            importance: {
                categoryWeights: {
                    important: 1.0,
                    personal: 0.9,
                    relationships: 0.85,
                    goals: 0.75,
                    experiences: 0.65,
                    preferences: 0.6,
                    activities: 0.5
                },
                bonuses: {
                    relationshipMilestone: 0.15,
                    boundaries: 0.15,
                    strongEmotion: 0.05,
                    futureReference: 0.05,
                    longContent: 0.05,
                    highConfidence: 0.05
                }
            },

            // Relevance calculation weights
            relevance: {
                contentSimilarity: 0.35,
                keywordOverlap: 0.25,
                categoryRelevance: 0.1,
                recencyBonus: 0.1,
                confidenceBonus: 0.05,
                importanceBonus: 0.05,
                recentDaysThreshold: 30
            }
        };

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
                /(?:je m'appelle|mon nom est|je suis|je me prénomme|je me nomme) ([^,.!?]+)/i,
                /(?:j'ai) (\d+) ans?/i,
                /(?:j'habite à|je vis à|je viens de) ([^,.!?]+)/i,
                /(?:je travaille comme|mon travail est|je suis) ([^,.!?]+)/i,
                // Spanish patterns
                /(?:me llamo|mi nombre es|soy) ([^,.!?]+)/i,
                /(?:tengo) (\d+) años?/i,
                /(?:vivo en|soy de) ([^,.!?]+)/i,
                /(?:trabajo como|mi trabajo es|soy) ([^,.!?]+)/i,
                // Italian patterns
                /(?:mi chiamo|il mio nome è|sono) ([^,.!?]+)/i,
                /(?:ho) (\d+) anni?/i,
                /(?:abito a|vivo a|sono di) ([^,.!?]+)/i,
                /(?:lavoro come|il mio lavoro è|sono) ([^,.!?]+)/i,
                // German patterns
                /(?:ich heiße|mein name ist|ich bin) ([^,.!?]+)/i,
                /(?:ich bin) (\d+) jahre? alt/i,
                /(?:ich wohne in|ich lebe in|ich komme aus) ([^,.!?]+)/i,
                /(?:ich arbeite als|mein beruf ist|ich bin) ([^,.!?]+)/i,
                // Japanese patterns
                /私の名前は([^。！？!?、,.]+)[ですだ]?/i,
                /私は([^。！？!?、,.]+)です/i,
                /([^、。！？!?,.]+)と申します/i,
                /([^、。！？!?,.]+)といいます/i,
                // Chinese patterns
                /我叫([^，。！？!?,.]+)/i,
                /我的名字是([^，。！？!?,.]+)/i,
                /叫我([^，。！？!?,.]+)/i
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
                /(?:ma (?:mère|sœur)|mon (?:père|frère|ami)) (?:s'appelle|est) ([^,.!?]+)/i,
                // Spanish patterns
                /(?:mi (?:esposa|esposo|novia|novio|pareja)) (?:es|se llama) ([^,.!?]+)/i,
                /(?:mi (?:madre|padre|hermana|hermano|amigo|amiga)) (?:es|se llama) ([^,.!?]+)/i,
                // Italian patterns
                /(?:la mia (?:moglie|fidanzata|compagna)|il mio (?:marito|fidanzato|compagno)) (?:è|si chiama) ([^,.!?]+)/i,
                /(?:mia (?:madre|sorella)|mio (?:padre|fratello|amico)) (?:è|si chiama) ([^,.!?]+)/i,
                // German patterns
                /(?:meine (?:frau|freundin|partnerin)|mein (?:mann|freund|partner)) (?:ist|heißt) ([^,.!?]+)/i,
                /(?:meine (?:mutter|schwester)|mein (?:vater|bruder|freund)) (?:ist|heißt) ([^,.!?]+)/i,
                // Japanese patterns
                /(?:私の(?:妻|夫|彼女|彼氏|パートナー))は([^。！？!?、,.]+)(?:です|といいます)/i,
                /(?:私の(?:母|父|姉|妹|兄|弟|友達))は([^。！？!?、,.]+)(?:です|といいます)/i,
                // Chinese patterns
                /(?:我的(?:妻子|丈夫|女朋友|男朋友|伴侣))叫([^，。！？!?,.]+)/i,
                /(?:我的(?:妈妈|父亲|姐姐|妹妹|哥哥|弟弟|朋友))叫([^，。！？!?,.]+)/i
            ],
            activities: [
                // English patterns
                /(?:i play|i do|i practice) ([^,.!?]+)/i,
                /(?:my hobby is|i hobby) ([^,.!?]+)/i,
                // French patterns
                /(?:je joue|je fais|je pratique) ([^,.!?]+)/i,
                /(?:mon passe-temps|mon hobby) (?:est|c'est) ([^,.!?]+)/i,
                // Spanish patterns
                /(?:juego|hago|practico) ([^,.!?]+)/i,
                /(?:mi pasatiempo|mi hobby) (?:es) ([^,.!?]+)/i,
                // Italian patterns
                /(?:gioco|faccio|pratico) ([^,.!?]+)/i,
                /(?:il mio passatempo|il mio hobby) (?:è) ([^,.!?]+)/i,
                // German patterns
                /(?:ich spiele|ich mache|ich übe) ([^,.!?]+)/i,
                /(?:mein hobby ist) ([^,.!?]+)/i,
                // Japanese patterns
                /(?:私は)?(?:[^、。！？!?,.]+)が趣味です/i,
                /趣味は([^。！？!?、,.]+)です/i,
                // Chinese patterns
                /(?:我玩|我做|我练习)([^，。！？!?,.]+)/i,
                /(?:我的爱好是)([^，。！？!?,.]+)/i
            ],
            goals: [
                // English patterns
                /(?:i want to|i plan to|my goal is) ([^,.!?]+)/i,
                /(?:i'm learning|i study) ([^,.!?]+)/i,
                // French patterns
                /(?:je veux|je vais|mon objectif est) ([^,.!?]+)/i,
                /(?:j'apprends|j'étudie) ([^,.!?]+)/i,
                // Spanish patterns
                /(?:quiero|voy a|mi objetivo es) ([^,.!?]+)/i,
                /(?:estoy aprendiendo|estudio) ([^,.!?]+)/i,
                // Italian patterns
                /(?:voglio|andrò a|il mio obiettivo è) ([^,.!?]+)/i,
                /(?:sto imparando|studio) ([^,.!?]+)/i,
                // German patterns
                /(?:ich möchte|ich will|mein ziel ist) ([^,.!?]+)/i,
                /(?:ich lerne|ich studiere) ([^,.!?]+)/i,
                // Japanese patterns
                /(?:私は)?(?:[^、。！？!?,.]+)したい/i,
                /(?:学んでいる|勉強している) ([^。！？!?、,.]+)/i,
                // Chinese patterns
                /(?:我想|我要|我的目标是)([^，。！？!?,.]+)/i,
                /(?:我在学习|我学习)([^，。！？!?,.]+)/i
            ],
            experiences: [
                // English patterns
                /we went to ([^,.!?]+)/i,
                /we met (?:at|on|in) ([^,.!?]+)/i,
                /our (?:first date|first kiss|trip|vacation) (?:was|was at|was on|was in|was to) ([^,.!?]+)/i,
                /our anniversary (?:is|falls on|will be) ([^,.!?]+)/i,
                /we moved in (?:together )?(?:on|in)?\s*([^,.!?]+)/i,
                // French patterns
                /on s'est rencontr[ée]s? (?:à|au|en|le) ([^,.!?]+)/i,
                /on est all[ée]s? à ([^,.!?]+)/i,
                /notre (?:premier rendez-vous|première sortie) (?:était|c'était) ([^,.!?]+)/i,
                /notre anniversaire (?:est|c'est) ([^,.!?]+)/i,
                /on a emménagé (?:ensemble\s*)?(?:le|en|à)\s*([^,.!?]+)/i,
                // Spanish patterns
                /nos conocimos (?:en|el|la) ([^,.!?]+)/i,
                /fuimos a ([^,.!?]+)/i,
                /nuestra (?:primera cita|primera salida) (?:fue|era) ([^,.!?]+)/i,
                /nuestro aniversario (?:es|cae en|será) ([^,.!?]+)/i,
                /nos mudamos (?:juntos\s*)?(?:el|en|a)\s*([^,.!?]+)/i,
                // Italian patterns
                /ci siamo conosciuti (?:a|al|in|il) ([^,.!?]+)/i,
                /siamo andati a ([^,.!?]+)/i,
                /il nostro (?:primo appuntamento|primo bacio|viaggio) (?:era|è stato) ([^,.!?]+)/i,
                /il nostro anniversario (?:è|cade il|sarà) ([^,.!?]+)/i,
                /ci siamo trasferiti (?:insieme\s*)?(?:il|in|a)\s*([^,.!?]+)/i,
                // German patterns
                /wir haben uns (?:in|am) ([^,.!?]+) kennengelernt/i,
                /wir sind (?:nach|zu) ([^,.!?]+) (?:gegangen|gefahren)/i,
                /unser (?:erstes date|erster kuss|urlaub) (?:war|fand statt) ([^,.!?]+)/i,
                /unser jahrestag (?:ist|fällt auf|wird sein) ([^,.!?]+)/i,
                /wir sind (?:zusammen )?eingezogen (?:am|im|in)\s*([^,.!?]+)/i,
                // Japanese patterns
                /私たちは([^、。！？!?,.]+)で出会った/i,
                /一緒に([^、。！？!?,.]+)へ行った/i,
                /私たちの記念日(?:は)?([^、。！？!?,.]+)/i,
                /一緒に引っ越した(?:のは)?([^、。！？!?,.]+)/i,
                // Chinese patterns
                /我们在([^，。！？!?,.]+)认识/i,
                /我们去了([^，。！？!?,.]+)/i,
                /我们的纪念日是([^，。！？!?,.]+)/i,
                /我们一起搬家(?:是在)?([^，。！？!?,.]+)/i
            ],
            important: [
                // English patterns
                /it's important (?:to remember|that) (.+)/i,
                /please remember (.+)/i,
                // French patterns
                /c'est important (?:de se souvenir|que) (.+)/i,
                /merci de te souvenir (.+)/i,
                // Spanish patterns
                /es importante (?:recordar|que) (.+)/i,
                /por favor recuerda (.+)/i,
                // Italian patterns
                /è importante (?:ricordare|che) (.+)/i,
                /per favore ricorda (.+)/i,
                // German patterns
                /es ist wichtig (?:zu erinnern|dass) (.+)/i,
                /bitte erinnere dich an (.+)/i,
                // Japanese patterns
                /重要なのは(.+)です/i,
                /覚えておいてほしいのは(.+)です/i,
                // Chinese patterns
                /重要的是(.+)/i,
                /请记住(.+)/i
            ]
        };

        // Performance optimization: pre-compile regex patterns
        this.compiledPatterns = {};
        this.initializeCompiledPatterns();
    }

    // Pre-compile all regex patterns for better performance
    initializeCompiledPatterns() {
        try {
            for (const [category, patterns] of Object.entries(this.extractionPatterns)) {
                this.compiledPatterns[category] = patterns.map(pattern => {
                    if (pattern instanceof RegExp) {
                        return pattern; // Already compiled
                    }
                    return new RegExp(pattern.source, pattern.flags);
                });
            }

            if (window.KIMI_CONFIG?.DEBUG?.MEMORY) {
                const totalPatterns = Object.values(this.compiledPatterns).reduce((sum, arr) => sum + arr.length, 0);
                console.log(`🚀 Pre-compiled ${totalPatterns} regex patterns for memory extraction`);
            }
        } catch (error) {
            console.error("Error pre-compiling regex patterns:", error);
            // Fallback: use original patterns
            this.compiledPatterns = this.extractionPatterns;
        }
    }

    // Utility method to get consistent creation timestamp
    getCreationTimestamp(memory) {
        // Prefer createdAt, fallback to timestamp for backward compatibility
        return memory.createdAt || memory.timestamp || new Date();
    }

    // Utility method to calculate days since creation
    getDaysSinceCreation(memory) {
        const created = new Date(this.getCreationTimestamp(memory)).getTime();
        return (Date.now() - created) / (1000 * 60 * 60 * 24);
    }

    async init() {
        if (!this.db) {
            console.warn("Database not available for memory system");
            return;
        }

        try {
            this.memoryEnabled = await this.db.getPreference("memorySystemEnabled", window.KIMI_CONFIG?.DEFAULTS?.MEMORY_SYSTEM_ENABLED ?? true);
            this.selectedCharacter = await this.db.getSelectedCharacter();
            await this.createMemoryTables();

            // Legacy migrations disabled - uncomment if needed for old databases
            // await this.migrateIncompatibleIDs();
            // this.populateKeywordsForAllMemories().catch(e => console.warn("Keyword population failed", e));
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

        // Ensure selectedCharacter is initialized
        if (!this.selectedCharacter) {
            this.selectedCharacter = this.db ? await this.db.getSelectedCharacter() : "kimi";
        }

        const extractedMemories = [];
        const text = userText.toLowerCase();

        // Memory extraction processing (debug info reduced for performance)

        // Enhanced extraction with context awareness
        const existingMemories = await this.getAllMemories();

        // First, check for explicit memory requests
        const explicitRequests = this.detectExplicitMemoryRequests(userText);
        if (explicitRequests.length > 0) {
            // Explicit memory requests detected
            extractedMemories.push(...explicitRequests);
        }

        // Extract using pre-compiled patterns for better performance
        const patternsToUse = this.compiledPatterns || this.extractionPatterns;
        for (const [category, patterns] of Object.entries(patternsToUse)) {
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match && match[1]) {
                    const content = match[1].trim();

                    // Skip very short or generic content
                    if (content.length < this.config.minContentLength || this.isGenericContent(content)) {
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
                        createdAt: new Date(), // Use createdAt consistently
                        character: this.selectedCharacter || "kimi", // Fallback protection
                        isUpdate: isUpdate
                    };

                    // Pattern match detected
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
            try {
                console.log("💾 Saving memory:", memory.content);
                const saved = await this.addMemory(memory);
                if (saved) {
                    savedMemories.push(saved);
                } else {
                    console.warn("⚠️ Memory was not saved (possibly filtered or merged):", memory.content);
                }
            } catch (error) {
                console.error("❌ Failed to save memory:", {
                    content: memory.content,
                    category: memory.category,
                    error: error.message
                });
                // Continue processing other memories even if one fails
            }
        }

        if (savedMemories.length > 0) {
            if (window.KIMI_CONFIG?.DEBUG?.MEMORY) {
                console.log(`✅ Successfully extracted and saved ${savedMemories.length} memories`);
            }
        } else if (window.KIMI_CONFIG?.DEBUG?.MEMORY) {
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

        // Spanish explicit memory requests
        const spanishPatterns = [
            /(?:añade|agrega|recuerda|memoriza|guarda)\s+(?:en|a)\s+(?:la\s+)?memoria\s+(?:que\s+)?(.+)/i,
            /(?:puedes|podrías)?\s*(?:añadir|agregar|recordar|memorizar|guardar)\s+(?:que\s+)?(.+)\s+(?:en|a)\s+(?:la\s+)?memoria/i,
            /(?:quiero\s+que\s+)?(?:recuerdes|memorices|añadas)\s+(?:que\s+)?(.+)/i
        ];

        // Italian explicit memory requests
        const italianPatterns = [
            /(?:aggiungi|ricorda|memorizza|salva)\s+(?:nella|in)\s+memoria\s+(?:che\s+)?(.+)/i,
            /(?:puoi|potresti)?\s*(?:aggiungere|ricordare|memorizzare|salvare)\s+(?:che\s+)?(.+)\s+(?:nella|in)\s+memoria/i,
            /(?:voglio\s+che\s+)?(?:ricordi|memorizzi|aggiunga)\s+(?:che\s+)?(.+)/i
        ];

        // German explicit memory requests
        const germanPatterns = [
            /(?:füge|merke|speichere)\s+(?:es\s+)?(?:in|zur)\s+?gedächtnis|speicher\s+(?:dass\s+)?(.+)/i,
            /(?:kannst\s+du|könntest\s+du)?\s*(?:hinzufügen|merken|speichern)\s+(?:dass\s+)?(.+)\s+(?:in|zum)\s+(?:gedächtnis|speicher)/i,
            /(?:ich\s+möchte\s+dass\s+du)\s*(?:merkst|speicherst|hinzufügst)\s+(?:dass\s+)?(.+)/i
        ];

        // Japanese explicit memory requests
        const japanesePatterns = [/記憶に(?:追加|保存|覚えて)(?:して)?(?:ほしい|ください)?(?:、)?(.+)/i, /(?:覚えて|記憶して)(?:ほしい|ください)?(?:、)?(.+)/i];

        // Chinese explicit memory requests
        const chinesePatterns = [/把(.+)记在(?:记忆|内存|记忆库)里/i, /(?:请)?记住(?:这件事|这个|以下)?(.+)/i, /保存到记忆(?:里|中)(?:的是)?(.+)/i];

        const allPatterns = [
            ...frenchPatterns,
            ...englishPatterns,
            ...spanishPatterns,
            ...italianPatterns,
            ...germanPatterns,
            ...japanesePatterns,
            ...chinesePatterns
        ];

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
        return genericWords.includes(content.toLowerCase()) || content.length < this.config.minContentLength;
    }

    // Calculate confidence based on context and pattern strength
    calculateExtractionConfidence(match, fullText) {
        let confidence = this.config.confidence.base; // Base confidence from config

        // Boost confidence for explicit statements
        const lower = fullText.toLowerCase();
        if (
            lower.includes("my name is") ||
            lower.includes("i am called") ||
            lower.includes("je m'appelle") ||
            lower.includes("mon nom est") ||
            lower.includes("je me prénomme") ||
            lower.includes("je me nomme") ||
            lower.includes("me llamo") ||
            lower.includes("mi nombre es") ||
            lower.includes("mi chiamo") ||
            lower.includes("il mio nome è") ||
            lower.includes("ich heiße") ||
            lower.includes("mein name ist") ||
            lower.includes("と申します") ||
            lower.includes("私の名前は") ||
            lower.includes("我叫") ||
            lower.includes("我的名字是")
        ) {
            confidence += this.config.confidence.bonusForExplicitStatement;
        }

        // Boost for longer, more specific content
        if (match[1] && match[1].trim().length > this.config.longContentThreshold) {
            confidence += this.config.confidence.bonusForLongContent;
        }

        // Reduce confidence for uncertain language
        if (fullText.includes("maybe") || fullText.includes("perhaps") || fullText.includes("might")) {
            confidence -= this.config.confidence.penaltyForUncertainty;
        }

        return Math.min(this.config.confidence.max, Math.max(this.config.confidence.min, confidence));
    }

    // Generate a short title (2-5 words max) from content for auto-extracted memories
    generateTitleFromContent(content) {
        if (!content || typeof content !== "string") return "";
        // Remove surrounding punctuation and collapse whitespace
        const cleaned = content
            .replace(/[\n\r]+/g, " ")
            .replace(/["'“”‘’–—:;()\[\]{}]+/g, "")
            .trim();
        const words = cleaned.split(/\s+/).filter(Boolean);

        if (words.length === 0) return "";
        // Prefer 3 words when available, minimum 2 when possible, maximum 5
        let take;
        if (words.length >= this.config.titleWordCount.preferred) take = this.config.titleWordCount.preferred;
        else take = words.length; // 1 or 2
        take = Math.min(this.config.titleWordCount.max, Math.max(this.config.titleWordCount.min, take));

        const slice = words.slice(0, take);
        // Capitalize first word for nicer title
        slice[0] = slice[0].charAt(0).toUpperCase() + slice[0].slice(1);
        return slice.join(" ");
    }

    // Check if this is an update to existing memory rather than new info
    async isMemoryUpdate(category, content, existingMemories) {
        const categoryMemories = existingMemories.filter(m => m.category === category);

        for (const memory of categoryMemories) {
            const similarity = this.calculateSimilarity(memory.content, content);
            if (similarity > this.config.similarity.update) {
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

        // Detect name mentions in natural context (multilingual)
        const namePatterns = [
            // English
            /call me (\w+)/i,
            /(\w+) here[,.]?/i,
            /this is (\w+)/i,
            /(\w+) speaking/i,
            // French
            /appelle-?moi (\w+)/i,
            /on m'appelle (\w+)/i,
            /c'est (\w+)/i,
            // Spanish
            /llámame (\w+)/i,
            /me llaman (\w+)/i,
            /soy (\w+)/i,
            // Italian
            /chiamami (\w+)/i,
            /mi chiamano (\w+)/i,
            /sono (\w+)/i,
            // German
            /nenn mich (\w+)/i,
            /man nennt mich (\w+)/i,
            /ich bin (\w+)/i,
            // Japanese
            /(?:私は)?(\w+)です/i,
            // Chinese
            /我是(\w+)/i,
            /叫我(\w+)/i
        ];

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
                        createdAt: new Date(), // Use createdAt consistently
                        character: this.selectedCharacter || "kimi" // Fallback protection
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
            const now = new Date();
            const memory = {
                category: memoryData.category || "personal",
                type: memoryData.type || "manual",
                content: memoryData.content,
                // precomputed keywords for faster matching and relevance
                keywords: this.deriveKeywords(memoryData.content),
                // Title: use provided title or generate for auto_extracted
                title:
                    memoryData.title && typeof memoryData.title === "string"
                        ? memoryData.title
                        : memoryData.type === "auto_extracted"
                          ? this.generateTitleFromContent(memoryData.content)
                          : "",
                sourceText: memoryData.sourceText || "",
                confidence: memoryData.confidence || 1.0,
                createdAt: memoryData.createdAt || memoryData.timestamp || now, // Unified timestamp handling
                character: memoryData.character || this.selectedCharacter || "kimi", // Fallback protection
                isActive: true,
                tags: [...new Set([...(memoryData.tags || []), ...this.deriveMemoryTags(memoryData)])],
                lastModified: now,
                lastAccess: now,
                accessCount: 0,
                importance: this.calculateImportance(memoryData)
            };

            if (this.db.db.memories) {
                const id = await this.db.db.memories.add(memory);
                memory.id = id; // Store the auto-generated ID
                if (window.KIMI_CONFIG?.DEBUG?.MEMORY) {
                    console.log(`Memory added with ID: ${id}`);
                }
            }

            // Cleanup old memories if we exceed limit
            await this.cleanupOldMemories();

            // Notify LLM system to refresh context
            this.notifyLLMContextUpdate();

            return memory;
        } catch (error) {
            console.error("Error adding memory:", error);
            return null; // Return null instead of undefined for clearer error handling
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
                    if (existingMemory.category === "personal" && this.areRelatedNames(existingMemory.content, newMemoryData.content)) {
                        // Handle name variants
                        mergedContent = this.mergeNames(existingMemory.content, newMemoryData.content);
                    } else {
                        // General merge - keep most specific
                        mergedContent = newMemoryData.content.length > existingMemory.content.length ? newMemoryData.content : existingMemory.content;
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
                tags: [...new Set([...mergedTags, ...this.deriveMemoryTags(newMemoryData)])], // Remove duplicates
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

    // Simplified memory merge strategy determination
    determineMergeStrategy(existing, newData) {
        const similarity = this.calculateSimilarity(existing.content, newData.content);
        const newConfidence = newData.confidence || this.config.confidence.base;
        const existingConfidence = existing.confidence || this.config.confidence.base;

        // Very high similarity (>90%) - boost confidence if new is more confident
        if (similarity > this.config.similarity.veryHigh) {
            return newConfidence > existingConfidence ? "boost_confidence" : "merge_content";
        }

        // High similarity (>70%) - decide based on content length and specificity
        if (similarity > this.config.similarity.preferences) {
            // If new content is significantly longer (50% more), it's likely more detailed
            if (newData.content.length > existing.content.length * 1.5) {
                return "update_content";
            }
            // If existing is longer, merge to preserve information
            return "merge_content";
        }

        // For personal names, handle as variants if they're related
        if (existing.category === "personal" && this.areRelatedNames(existing.content, newData.content)) {
            return "add_variant";
        }

        // Default strategy for moderate similarity
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

        // Category base weights
        const categoryWeights = {
            important: 1.0,
            personal: 0.9,
            relationships: 0.85,
            goals: 0.75,
            experiences: 0.65,
            preferences: 0.6,
            activities: 0.5
        };

        importance = categoryWeights[memoryData.category] || 0.5;

        const content = (memoryData.content || "").toLowerCase();
        const tags = new Set([...(memoryData.tags || []), ...this.deriveMemoryTags(memoryData)]);

        // Heuristic boosts for meaningful relationship milestones and commitments
        const milestoneTags = [
            "relationship:first_meet",
            "relationship:first_date",
            "relationship:first_kiss",
            "relationship:anniversary",
            "relationship:moved_in",
            "relationship:engaged",
            "relationship:married",
            "relationship:breakup"
        ];
        if ([...tags].some(t => milestoneTags.includes(t))) importance += 0.15;

        // Boundaries and consent are high priority to remember
        if ([...tags].some(t => t.startsWith("boundary:"))) importance += 0.15;

        // Preferences tied to strong like/dislike
        if (content.includes("i love") || content.includes("j'adore") || content.includes("i hate") || content.includes("je déteste")) {
            importance += 0.05;
        }

        // Temporal cues: future commitments or dates
        if (/(\bnext\b|\btomorrow\b|\bce soir\b|\bdemain\b|\bmañana\b|\bdomani\b|\bmorgen\b)/i.test(content)) {
            importance += 0.05;
        }

        // Longer details and high confidence
        if (memoryData.content && memoryData.content.length > this.config.longContentThreshold) importance += this.config.importance.bonuses.longContent;
        if (memoryData.confidence && memoryData.confidence > 0.9) importance += this.config.importance.bonuses.highConfidence;

        // Round to two decimals to avoid floating point artifacts
        return Math.min(1.0, Math.round(importance * 100) / 100);
    }

    // Derive semantic tags from memory content to assist prioritization and merging
    deriveMemoryTags(memoryData) {
        const tags = [];
        const text = (memoryData.content || "").toLowerCase();
        const category = memoryData.category || "";

        // Relationship status and milestones
        if (/(single|célibataire|soltero|single|ledig)/i.test(text)) tags.push("relationship:status_single");
        if (/(in a relationship|en couple|together|ensemble|pareja|coppia|beziehung)/i.test(text)) tags.push("relationship:status_in_relationship");
        if (/(engaged|fiancé|fiancée|promis|promised|verlobt)/i.test(text)) tags.push("relationship:status_engaged");
        if (/(married|marié|mariée|casado|sposato|verheiratet)/i.test(text)) tags.push("relationship:status_married");
        if (/(broke up|rupture|separated|separado|separati|getrennt)/i.test(text)) tags.push("relationship:breakup");
        if (/(first date|premier rendez-vous|primera cita|primo appuntamento)/i.test(text)) tags.push("relationship:first_date");
        if (/(first kiss|premier baiser|primer beso|primo bacio)/i.test(text)) tags.push("relationship:first_kiss");
        if (/(anniversary|anniversaire|aniversario|anniversario|jahrestag)/i.test(text)) tags.push("relationship:anniversary");
        if (/(moved in together|emménagé ensemble|mudamos juntos|trasferiti insieme|zusammen eingezogen)/i.test(text)) tags.push("relationship:moved_in");
        if (/(met at|rencontré à|conocimos en|conosciuti a|kennengelernt)/i.test(text)) tags.push("relationship:first_meet");

        // Boundaries and consent (keep generic and non-graphic)
        if (/(i don't like|je n'aime pas|no me gusta|non mi piace|ich mag nicht)\s+[^,.!?]+/i.test(text)) tags.push("boundary:dislike");
        if (/(i prefer|je préfère|prefiero|preferisco|ich bevorzuge)\s+[^,.!?]+/i.test(text)) tags.push("boundary:preference");
        if (/(no|pas)\s+(?:kissing|baiser|beso|bacio|küssen)/i.test(text)) tags.push("boundary:limit");
        if (/(consent|consentement|consentimiento|consenso|einwilligung)/i.test(text)) tags.push("boundary:consent");

        // Time-related tags
        if (/(today|ce jour|hoy|oggi|heute|今日)/i.test(text)) tags.push("time:today");
        if (/(tomorrow|demain|mañana|domani|morgen|明日)/i.test(text)) tags.push("time:tomorrow");
        if (/(next week|semaine prochaine|la próxima semana|la prossima settimana|nächste woche)/i.test(text)) tags.push("time:next_week");

        // Category-specific hints
        if (category === "preferences") tags.push("type:preference");
        if (category === "personal") tags.push("type:personal");
        if (category === "relationships") tags.push("type:relationship");
        if (category === "experiences") tags.push("type:experience");
        if (category === "goals") tags.push("type:goal");
        if (category === "important") tags.push("type:important");

        return tags;
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

    // Add cleanup method for memory system
    cleanup() {
        if (this.contextUpdateTimeout) {
            clearTimeout(this.contextUpdateTimeout);
            this.contextUpdateTimeout = null;
        }

        // Clear caches to prevent memory leaks
        if (this.keywordCache) {
            this.keywordCache.clear();
        }

        // Reset stats arrays to prevent accumulation
        if (this.queryStats) {
            this.queryStats.extractionTime.length = 0;
            this.queryStats.addMemoryTime.length = 0;
            this.queryStats.retrievalTime.length = 0;
        }
    }

    async getMemoriesByCategory(category, character = null) {
        if (!this.db) return [];

        try {
            character = character || this.selectedCharacter || "kimi"; // Unified fallback

            if (this.db.db.memories) {
                const memories = await this.db.db.memories
                    .where("[character+category]")
                    .equals([character, category])
                    .and(m => m.isActive)
                    .reverse()
                    .sortBy("timestamp");

                // Update lastAccess/accessCount for top results to improve prioritization
                this._touchMemories(memories, 10).catch(() => {});
                return memories;
            }
        } catch (error) {
            console.error("Error getting memories by category:", error);
            return [];
        }
    }

    async getAllMemories(character = null) {
        if (!this.db) return [];

        try {
            character = character || this.selectedCharacter || "kimi";

            if (this.db.db.memories) {
                // Primary IndexedDB (Dexie) sort still leverages the existing 'timestamp' index for performance.
                // Then we apply a stable in-memory reorder using canonical creation time (createdAt fallback timestamp)
                // to unify ordering semantics without breaking older databases lacking createdAt originally.
                const memories = await this.db.db.memories
                    .where("character")
                    .equals(character)
                    .filter(memory => memory.isActive !== false) // Include records without isActive field (legacy)
                    .reverse()
                    .sortBy("timestamp");

                // Backward-compatible canonical ordering: most recent first by getCreationTimestamp
                // (Only if >1 entry to avoid needless array ops.)
                if (memories.length > 1) {
                    memories.sort((a, b) => {
                        const ca = new Date(this.getCreationTimestamp(a)).getTime();
                        const cb = new Date(this.getCreationTimestamp(b)).getTime();
                        return cb - ca; // descending (newest first)
                    });
                }

                if (window.KIMI_DEBUG_MEMORIES) {
                    console.log(`Retrieved ${memories.length} memories for character: ${character}`);
                }

                // Touch top memories to update access metrics
                this._touchMemories(memories, 10).catch(() => {});
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

            // Precompute keywords for new memory
            const newKeys = this.deriveKeywords(memoryData.content || "");

            // Enhanced similarity check with multiple criteria
            for (const memory of memories) {
                // Prefilter by keyword overlap to reduce false positives and improve perf
                const memKeys = memory.keywords || this.deriveKeywords(memory.content || "");
                const overlap = newKeys.filter(k => memKeys.includes(k)).length;
                if (newKeys.length > 0 && overlap === 0) continue; // no shared keywords -> likely different

                const contentSimilarity = this.calculateSimilarity(memory.content, memoryData.content);

                // Different thresholds based on category
                const threshold = this.config.similarity[memoryData.category] || this.config.similarity.default;

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

    // Derive a set of normalized keywords from text
    deriveKeywords(text) {
        if (!text || typeof text !== "string") return [];
        return [
            ...new Set(
                text
                    .toLowerCase()
                    .replace(/[\p{P}\p{S}]/gu, " ")
                    .split(/\s+/)
                    .filter(w => w.length > 2 && !this.isCommonWordSafe(w))
            )
        ];
    }

    // Safe wrapper for isCommonWord to avoid undefined function errors
    isCommonWordSafe(word, language = "en") {
        const cacheKey = `${word.toLowerCase()}_${language}`;

        // Check cache first
        if (this.keywordCache.has(cacheKey)) {
            this.keywordCacheHits++;
            return this.keywordCache.get(cacheKey);
        }

        // Cache miss - compute the result
        this.keywordCacheMisses++;
        let isCommon = false;

        try {
            isCommon = typeof this.isCommonWord === "function" ? this.isCommonWord(word, language) : false;
        } catch (error) {
            console.warn("Error checking common word:", error);
            isCommon = false;
        }

        // Add to cache with LRU eviction
        if (this.keywordCache.size >= this.keywordCacheSize) {
            // Simple LRU: remove oldest entry (first in Map)
            const firstKey = this.keywordCache.keys().next().value;
            this.keywordCache.delete(firstKey);
        }

        this.keywordCache.set(cacheKey, isCommon);
        return isCommon;
    }

    // Get cache statistics for debugging
    getKeywordCacheStats() {
        const total = this.keywordCacheHits + this.keywordCacheMisses;
        return {
            size: this.keywordCache.size,
            hits: this.keywordCacheHits,
            misses: this.keywordCacheMisses,
            hitRate: total > 0 ? ((this.keywordCacheHits / total) * 100).toFixed(2) + "%" : "0%"
        };
    }

    // Get performance statistics for debugging and optimization
    getPerformanceStats() {
        const calculateStats = times => {
            if (times.length === 0) return { avg: 0, max: 0, min: 0, count: 0 };
            return {
                avg: Math.round((times.reduce((sum, t) => sum + t, 0) / times.length) * 100) / 100,
                max: Math.round(Math.max(...times) * 100) / 100,
                min: Math.round(Math.min(...times) * 100) / 100,
                count: times.length
            };
        };

        return {
            keywordCache: this.getKeywordCacheStats(),
            extraction: calculateStats(this.queryStats.extractionTime),
            addMemory: calculateStats(this.queryStats.addMemoryTime),
            retrieval: calculateStats(this.queryStats.retrievalTime)
        };
    }

    // Performance wrapper for memory extraction
    async extractMemoryFromTextTimed(userText, kimiResponse = null) {
        const start = performance.now();
        const result = await this.extractMemoryFromText(userText, kimiResponse);
        const duration = performance.now() - start;

        this.queryStats.extractionTime.push(duration);
        if (this.queryStats.extractionTime.length > 100) {
            this.queryStats.extractionTime.shift(); // Keep only last 100 measurements
        }

        if (duration > 100 && window.KIMI_CONFIG?.DEBUG?.MEMORY) {
            console.warn(`🐌 Slow memory extraction: ${duration.toFixed(2)}ms for text length ${userText?.length || 0}`);
        }

        return result;
    }

    // Get current configuration for debugging and monitoring
    getConfiguration() {
        return {
            ...this.config,
            memoryCategories: this.memoryCategories,
            runtime: {
                memoryEnabled: this.memoryEnabled,
                maxMemoryEntries: this.maxMemoryEntries,
                selectedCharacter: this.selectedCharacter,
                keywordCacheSize: this.keywordCache.size,
                compiledPatternsCount: Object.values(this.compiledPatterns || {}).reduce((sum, arr) => sum + arr.length, 0)
            }
        };
    }

    // Update configuration at runtime (for advanced users)
    updateConfiguration(configPath, value) {
        const keys = configPath.split(".");
        let current = this.config;

        // Navigate to the parent object
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }

        // Set the value
        const lastKey = keys[keys.length - 1];
        const oldValue = current[lastKey];
        current[lastKey] = value;

        if (window.KIMI_CONFIG?.DEBUG?.MEMORY) {
            console.log(`🔧 Configuration updated: ${configPath} = ${value} (was: ${oldValue})`);
        }

        return { oldValue, newValue: value };
    }

    async cleanupOldMemories() {
        if (!this.db) return;

        try {
            // Retrieve all active memories for the current character
            const memories = await this.getAllMemories();

            const maxEntries = window.KIMI_MAX_MEMORIES || this.maxMemoryEntries || 100;
            const ttlDays = window.KIMI_MEMORY_TTL_DAYS || 365;

            // Soft-expire memories older than TTL by marking isActive=false
            const now = Date.now();
            const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
            const expiredMemories = [];

            for (const mem of memories) {
                const created = new Date(this.getCreationTimestamp(mem)).getTime();
                if (now - created > ttlMs) {
                    try {
                        await this.updateMemory(mem.id, { isActive: false });
                        expiredMemories.push(mem.id);
                    } catch (e) {
                        console.error(`Memory expiration failed for ID ${mem.id}:`, {
                            error: e.message,
                            memoryId: mem.id,
                            createdAt: this.getCreationTimestamp(mem),
                            character: mem.character
                        });
                        // Continue with other memories even if one fails
                    }
                }
            }

            if (window.KIMI_CONFIG?.DEBUG?.MEMORY && expiredMemories.length > 0) {
                console.log(`Successfully expired ${expiredMemories.length} memories:`, expiredMemories);
            }

            // Refresh active memories after TTL purge
            const activeMemories = (await this.getAllMemories()).filter(m => m.isActive);

            // If still more than maxEntries, mark lowest-priority ones inactive (soft delete)
            if (activeMemories.length > maxEntries) {
                // Sort by a combined score: low importance + old timestamp + low access
                activeMemories.sort((a, b) => {
                    const scoreA =
                        (a.importance || 0.5) * -1 + (a.accessCount || 0) * 0.01 + new Date(this.getCreationTimestamp(a)).getTime() / (1000 * 60 * 60 * 24);
                    const scoreB =
                        (b.importance || 0.5) * -1 + (b.accessCount || 0) * 0.01 + new Date(this.getCreationTimestamp(b)).getTime() / (1000 * 60 * 60 * 24);
                    return scoreB - scoreA;
                });

                const toDeactivate = activeMemories.slice(maxEntries);
                const deactivatedMemories = [];
                const failedDeactivations = [];

                for (const mem of toDeactivate) {
                    try {
                        await this.updateMemory(mem.id, { isActive: false });
                        deactivatedMemories.push(mem.id);
                    } catch (e) {
                        console.error(`Memory deactivation failed for ID ${mem.id}:`, {
                            error: e.message,
                            memoryId: mem.id,
                            importance: mem.importance,
                            character: mem.character
                        });
                        failedDeactivations.push(mem.id);
                    }
                }

                if (window.KIMI_CONFIG?.DEBUG?.MEMORY) {
                    console.log(`Memory cleanup: ${deactivatedMemories.length} deactivated, ${failedDeactivations.length} failed`);
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
                const res = this.selectMostImportantMemories(allMemories, limit);
                // touch top results to update access metrics
                this._touchMemories(res, limit).catch(() => {});
                return res;
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

            const out = relevantMemories.slice(0, limit).map(r => r);
            // touch top results to update access metrics
            this._touchMemories(
                out.map(r => r),
                limit
            ).catch(() => {});
            return out;
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
            const daysSinceCreation = this.getDaysSinceCreation(memory);
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
        score += this.calculateSimilarity(memory.content, context) * this.config.relevance.contentSimilarity;

        // Keyword overlap boost (derived keywords)
        try {
            const memKeys = memory.keywords || this.deriveKeywords(memory.content || "");
            const ctxKeys = this.deriveKeywords(context || "");
            const keyOverlap = ctxKeys.filter(k => memKeys.includes(k)).length;
            if (ctxKeys.length > 0) {
                score += (keyOverlap / ctxKeys.length) * this.config.relevance.keywordOverlap;
            }
        } catch (e) {
            // fallback to original keyword matching
            let keywordMatches = 0;
            for (const word of contextWords) {
                if (memoryWords.includes(word)) {
                    keywordMatches++;
                }
            }
            if (contextWords.length > 0) {
                score += (keywordMatches / contextWords.length) * this.config.relevance.keywordOverlap;
            }
        }

        // Category relevance bonus based on context
        score += this.getCategoryRelevance(memory.category, context) * this.config.relevance.categoryRelevance;

        // Recent memories get bonus for current conversation
        const daysSinceCreation = this.getDaysSinceCreation(memory);
        score +=
            Math.max(0, (this.config.relevance.recentDaysThreshold - daysSinceCreation) / this.config.relevance.recentDaysThreshold) *
            this.config.relevance.recencyBonus;

        // Confidence and importance boost
        score += (memory.confidence || 0.5) * this.config.relevance.confidenceBonus;
        score += (memory.importance || 0.5) * this.config.relevance.importanceBonus;

        return Math.min(1.0, score);
    }

    // Determine if memory category is relevant to current context
    getCategoryRelevance(category, context) {
        const contextLower = context.toLowerCase();

        const categoryKeywords = {
            personal: ["name", "age", "live", "work", "job", "who", "am", "myself", "appelle", "nombre", "chiamo", "heiße", "名前", "名字", "我叫"],
            preferences: [
                "like",
                "love",
                "hate",
                "prefer",
                "enjoy",
                "favorite",
                "dislike",
                "j'aime",
                "j'adore",
                "je préfère",
                "je déteste",
                "me gusta",
                "prefiero",
                "odio",
                "mi piace",
                "preferisco",
                "ich mag",
                "ich bevorzuge",
                "hasse"
            ],
            relationships: [
                "family",
                "friend",
                "wife",
                "husband",
                "partner",
                "mother",
                "father",
                "girlfriend",
                "boyfriend",
                "anniversary",
                "date",
                "kiss",
                "move in",
                "famille",
                "ami",
                "copine",
                "copain",
                "anniversaire",
                "rendez-vous",
                "baiser",
                "emménagé",
                "pareja",
                "cita",
                "beso",
                "aniversario",
                "mudarnos",
                "fidanzata",
                "fidanzato",
                "anniversario",
                "bacio",
                "trasferiti",
                "freundin",
                "freund",
                "jahrestag",
                "kuss",
                "eingezogen"
            ],
            activities: [
                "play",
                "hobby",
                "sport",
                "activity",
                "practice",
                "do",
                "joue",
                "passe-temps",
                "hobby",
                "juego",
                "pasatiempo",
                "gioco",
                "passatempo",
                "spiele",
                "hobby"
            ],
            goals: [
                "want",
                "plan",
                "goal",
                "dream",
                "hope",
                "wish",
                "future",
                "veux",
                "objectif",
                "apprends",
                "aprendo",
                "voglio",
                "obiettivo",
                "lerne",
                "ziel"
            ],
            experiences: [
                "remember",
                "happened",
                "story",
                "experience",
                "time",
                "we met",
                "first date",
                "first kiss",
                "anniversary",
                "rencontré",
                "premier rendez-vous",
                "premier baiser",
                "anniversaire",
                "conocimos",
                "primera cita",
                "primer beso",
                "aniversario",
                "conosciuti",
                "primo appuntamento",
                "primo bacio",
                "anniversario",
                "kennengelernt",
                "erstes date",
                "erster kuss",
                "jahrestag"
            ],
            important: [
                "important",
                "remember",
                "special",
                "never forget",
                "important",
                "souvenir",
                "spécial",
                "importante",
                "recuerda",
                "importante",
                "ricorda",
                "wichtig",
                "erinnere"
            ]
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
                memory.lastAccess = new Date();
                await this.db.db.memories.put(memory);
            }
        } catch (error) {
            console.error("Error recording memory access:", error);
        }
    }

    // Touch multiple memories to update lastAccess and accessCount
    async _touchMemories(memories, limit = 5) {
        if (!this.db || !Array.isArray(memories) || memories.length === 0) return;

        try {
            const top = memories.slice(0, limit);
            const now = new Date();
            const minMinutes = window.KIMI_MEMORY_TOUCH_MINUTES || 60;
            const minTouchInterval = minMinutes * 60 * 1000;

            // Batch collection: gather all updates before executing
            const batchUpdates = [];

            for (const m of top) {
                try {
                    const id = m.id;
                    const existing = await this.db.db.memories.get(id);
                    if (existing) {
                        const lastAccess = existing.lastAccess ? new Date(existing.lastAccess).getTime() : 0;

                        // Only touch if enough time has passed
                        if (now.getTime() - lastAccess > minTouchInterval) {
                            batchUpdates.push({
                                key: id,
                                changes: {
                                    accessCount: (existing.accessCount || 0) + 1,
                                    lastAccess: now
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.warn("Error preparing memory touch batch for", m && m.id, e);
                }
            }

            // Execute all updates in a single batch operation
            if (batchUpdates.length > 0) {
                if (this.db.db.memories.bulkUpdate) {
                    // Use bulkUpdate if available (Dexie 3.x+)
                    await this.db.db.memories.bulkUpdate(batchUpdates);
                } else {
                    // Fallback: parallel individual updates (still better than sequential)
                    const updatePromises = batchUpdates.map(update => this.db.db.memories.update(update.key, update.changes));
                    await Promise.all(updatePromises);
                }

                if (window.KIMI_CONFIG?.DEBUG?.MEMORY) {
                    console.log(`📊 Batch touched ${batchUpdates.length} memories`);
                }
            }
        } catch (e) {
            console.warn("Error in _touchMemories batch processing", e);
        }
    }

    // ===== MEMORY SCORING & RANKING =====
    scoreMemory(memory) {
        // Factors: importance (0-1), recency, frequency, confidence
        const now = Date.now();
        const created = memory.createdAt ? new Date(memory.createdAt).getTime() : memory.timestamp ? new Date(memory.timestamp).getTime() : now;
        const lastAccess = memory.lastAccess ? new Date(memory.lastAccess).getTime() : created;
        const ageMs = Math.max(1, now - created);
        const sinceLastAccessMs = Math.max(1, now - lastAccess);
        // Recency: exponential decay
        const recency = Math.exp(-sinceLastAccessMs / (1000 * 60 * 60 * 24 * 14)); // 14-day half-life approx
        const freshness = Math.exp(-ageMs / (1000 * 60 * 60 * 24 * 60)); // 60-day aging
        const freq = Math.log10((memory.accessCount || 0) + 1) / Math.log10(50); // normalized frequency (cap ~50)
        const importance = typeof memory.importance === "number" ? memory.importance : 0.5;
        const confidence = typeof memory.confidence === "number" ? memory.confidence : 0.5;
        // Weighted sum using global knobs
        const wImportance = window.KIMI_WEIGHT_IMPORTANCE || 0.35;
        const wRecency = window.KIMI_WEIGHT_RECENCY || 0.2;
        const wFrequency = window.KIMI_WEIGHT_FREQUENCY || 0.15;
        const wConfidence = window.KIMI_WEIGHT_CONFIDENCE || 0.2;
        const wFreshness = window.KIMI_WEIGHT_FRESHNESS || 0.1;

        const score = importance * wImportance + recency * wRecency + freq * wFrequency + confidence * wConfidence + freshness * wFreshness;
        return Number(score.toFixed(6));
    }

    async getRankedMemories(contextText = "", limit = 7) {
        const all = await this.getAllMemories();
        if (!all.length) return [];
        // Optional basic context relevance boost
        const ctxLower = (contextText || "").toLowerCase();
        // Favor pinned memories by boosting their base score
        return all
            .map(m => {
                let baseScore = this.scoreMemory(m);
                if (m.tags && m.tags.includes && m.tags.includes("pinned")) baseScore += 0.2;
                if (ctxLower && m.content && ctxLower.includes(m.content.toLowerCase().split(" ")[0])) {
                    baseScore += 0.05; // tiny relevance boost
                }
                return { memory: m, score: baseScore };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(r => r.memory);
    }

    // Pin/unpin APIs to manually mark important memories
    async pinMemory(memoryId) {
        if (!this.db) return false;
        try {
            const m = await this.db.db.memories.get(memoryId);
            if (!m) return false;
            const tags = new Set([...(m.tags || []), "pinned"]);
            await this.db.db.memories.update(memoryId, { tags: [...tags], importance: Math.max(m.importance || 0.5, 0.95) });
            return true;
        } catch (e) {
            console.error("Error pinning memory", e);
            return false;
        }
    }

    async unpinMemory(memoryId) {
        if (!this.db) return false;
        try {
            const m = await this.db.db.memories.get(memoryId);
            if (!m) return false;
            const tags = new Set([...(m.tags || [])]);
            tags.delete("pinned");
            await this.db.db.memories.update(memoryId, { tags: [...tags] });
            return true;
        } catch (e) {
            console.error("Error unpinning memory", e);
            return false;
        }
    }

    // Summarize recent memories into a non-destructive summary memory
    async summarizeRecentMemories(days = 7, options = { category: null, archiveSources: false }) {
        if (!this.db) return null;
        try {
            const cutoff = Date.now() - (days || 7) * 24 * 60 * 60 * 1000;
            const all = await this.getAllMemories();
            // Exclude existing summaries to avoid summarizing summaries repeatedly
            const recent = all.filter(
                m => new Date(this.getCreationTimestamp(m)).getTime() >= cutoff && m.isActive && m.type !== "summary" && !(m.tags && m.tags.includes("summary"))
            );
            if (!recent.length) return null;

            // Group by top keyword
            const groups = {};
            for (const m of recent) {
                const keys = m.keywords && m.keywords.length ? m.keywords : this.deriveKeywords(m.content || "");
                const top = keys[0] || "misc";
                groups[top] = groups[top] || [];
                groups[top].push(m);
            }

            // Build a simple summary per group
            const summaries = [];
            for (const [k, items] of Object.entries(groups)) {
                const contents = items.map(i => i.content).slice(0, 6);
                summaries.push(`${k}: ${contents.join(" | ")}`);
            }

            const summaryContent = `Summary (${days}d): ` + summaries.join(" \n");

            const summaryJson = { summary: summaries };

            const summaryMemory = {
                category: options.category || "experiences",
                type: "summary",
                content: summaryContent,
                sourceText: summaryContent,
                summaryJson: JSON.stringify(summaryJson),
                confidence: 0.9,
                createdAt: new Date(), // Use createdAt consistently
                character: this.selectedCharacter,
                isActive: true,
                tags: ["summary"]
            };

            const saved = await this.addMemory(summaryMemory);

            // Optionally archive sources (soft-deactivate)
            if (options.archiveSources) {
                for (const m of recent) {
                    try {
                        await this.updateMemory(m.id, { isActive: false });
                    } catch (e) {
                        console.warn("Failed to archive source memory", m.id, e);
                    }
                }
            }

            return saved;
        } catch (e) {
            console.error("Error summarizing memories", e);
            return null;
        }
    }

    // Summarize recent memories and replace sources (hard delete) - destructive
    async summarizeAndReplace(days = 7, options = { category: null }) {
        if (!this.db) return null;
        try {
            const cutoff = Date.now() - (days || 7) * 24 * 60 * 60 * 1000;
            const all = await this.getAllMemories();
            // Exclude existing summaries to avoid recursive summarization
            const recent = all.filter(
                m => new Date(this.getCreationTimestamp(m)).getTime() >= cutoff && m.isActive && m.type !== "summary" && !(m.tags && m.tags.includes("summary"))
            );
            if (!recent.length) return null;

            // Build aggregate content from readable fields in chronological order
            recent.sort((a, b) => new Date(this.getCreationTimestamp(a)) - new Date(this.getCreationTimestamp(b)));
            const texts = recent
                .map(r => {
                    const raw = (r.title && r.title.trim()) || (r.sourceText && r.sourceText.trim()) || (r.content && r.content.trim()) || "";
                    if (!raw) return "";
                    // Normalize whitespace and remove stray leading punctuation
                    let t = raw.replace(/\s+/g, " ").replace(/^[^\p{L}\p{N}]+/u, "");
                    // Capitalize first meaningful letter
                    if (t && t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
                    return t;
                })
                .filter(Boolean)
                .slice(0, 200);

            const summaryContent = `Summary (${days}d):\n` + texts.map(t => `- ${t}`).join("\n");

            const summaryJson = { summary: texts };

            const summaryMemory = {
                category: options.category || "experiences",
                type: "summary",
                title: `Summary - last ${days} days`,
                content: summaryContent,
                // Store the actual summary also in sourceText so editors/UIs show it
                sourceText: summaryContent,
                summaryJson: JSON.stringify(summaryJson),
                confidence: 0.95,
                timestamp: new Date(),
                character: this.selectedCharacter,
                isActive: true,
                tags: ["summary", "replaced"]
            };

            // Add summary directly to DB to avoid addMemory's merge logic
            let saved = null;
            if (this.db && this.db.db && this.db.db.memories) {
                try {
                    const id = await this.db.db.memories.add(summaryMemory);
                    summaryMemory.id = id;
                    saved = summaryMemory;
                    console.log("Summary added with ID:", id);
                    // Read back the saved record to verify stored fields
                    try {
                        const savedRec = await this.db.db.memories.get(id);
                        console.log("Saved summary record:", { id, content: savedRec.content, sourceText: savedRec.sourceText });
                    } catch (e) {
                        console.warn("Unable to read back saved summary", e);
                    }
                } catch (e) {
                    console.error("Failed to write summary directly to DB", e);
                }
            } else {
                // Fallback to addMemory if DB not available
                saved = await this.addMemory(summaryMemory);
            }

            // Hard-delete sources
            for (const m of recent) {
                try {
                    if (this.db && this.db.db && this.db.db.memories) {
                        await this.db.db.memories.delete(m.id);
                    }
                } catch (e) {
                    console.warn("Failed to delete source memory", m.id, e);
                }
            }

            // Notify LLM to refresh context
            this.notifyLLMContextUpdate();

            return saved;
        } catch (e) {
            console.error("Error in summarizeAndReplace", e);
            return null;
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

    // Background migration: populate keywords for all existing memories if missing
    async populateKeywordsForAllMemories() {
        if (!this.db || !this.db.db.memories) return false;
        try {
            console.log("🔧 Starting background keyword population...");
            const all = await this.db.db.memories.toArray();
            const ops = [];
            for (const mem of all) {
                if (!mem.keywords || !Array.isArray(mem.keywords) || mem.keywords.length === 0) {
                    const keys = this.deriveKeywords(mem.content || "");
                    ops.push(this.db.db.memories.update(mem.id, { keywords: keys }));
                }
                // batch in small chunks to avoid blocking
                if (ops.length >= 50) {
                    await Promise.all(ops);
                    ops.length = 0;
                }
            }
            if (ops.length) await Promise.all(ops);
            console.log("✅ Keyword population complete");
            return true;
        } catch (e) {
            console.warn("Error populating keywords", e);
            return false;
        }
    }
}

window.KimiMemorySystem = KimiMemorySystem;
export default KimiMemorySystem;
