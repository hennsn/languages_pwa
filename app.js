// app.js

// 1. UPDATE IMPORT: Add 'getAllLessonProgress' to the list.
import { initDB, getSentenceStat, updateSentenceStat, getAllLessonProgress, getAllDownloadedPacks, deleteSentenceStat } from './db.js';

document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('media-player');
    const transcriptContainer = document.getElementById('transcript-container');
    const menuToggle = document.getElementById('menu-toggle');
    const navDrawer = document.getElementById('nav-drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const lessonList = document.getElementById('lesson-list');

    const modeToggleCheckbox = document.getElementById('mode-toggle-checkbox');

    const languageSelectorOverlay = document.getElementById('language-selector-overlay');
    const languageListModal = document.getElementById('language-list-modal');
    const switchLanguageBtn = document.getElementById('switch-language-btn');
    const currentLanguageIndicator = document.getElementById('current-language-indicator');

    const LANGUAGE_STORAGE_KEY = 'languageLearner-selectedLanguage';
    let availableLanguages = []; // Will hold data from languages.json

    let lessonsData = [];
    let currentLanguageCode = null; 
    let currentLessonId = null;
    let isChangingLesson = false; 
    let maxTimeReached = 0;
    let sessionStatsSaved = false; 
    let currentLessonContent = [];
    let explainedCuesThisSession = new Set();

    let currentMode = 'study'; // Can be 'study' or 'quiz'
    let pauseAtTime = null; 

    async function init() {
        try {
            await initDB();
            
            // Fetch the master list of available languages
            const response = await fetch('data/languages.json');
            availableLanguages = await response.json();
    
            // Check if a language is saved in localStorage
            const savedLanguageCode = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    
            if (savedLanguageCode && availableLanguages.some(l => l.code === savedLanguageCode)) {
                // If a valid language is saved, load it
                console.log(`Found saved language: ${savedLanguageCode}`);
                await loadLanguageData(savedLanguageCode);
            } else {
                // Otherwise, show the selector for the first-time user
                console.log('No language selected. Showing selector.');
                showLanguageSelector();
            }
        } catch (error) {
            console.error("Failed to initialize the app:", error);
            transcriptContainer.innerHTML = `<p style='padding:20px'>Could not start the application. Please try again later.</p>`;
        }
    }

    async function loadLanguageData(langCode) {
        try {
            lessonList.innerHTML = '<li>Loading lessons...</li>';
            
            currentLanguageCode = langCode;
            localStorage.setItem(LANGUAGE_STORAGE_KEY, langCode);
    
            // 1. Fetch all necessary data sources in parallel
            const [packs, allLessons, downloadedPacks] = await Promise.all([
                fetch(`data/${langCode}/packs.json`).then(res => res.json()),
                fetch(`data/${langCode}/lessons.json`).then(res => res.json()),
                getAllDownloadedPacks() // From db.js
            ]);
            
            // 2. Determine which lessons should be visible
            const visibleLessonIds = new Set();
    
            // Add lessons from the first (free) pack by default
            if (packs.length > 0 && packs[0].lessons) {
                packs[0].lessons.forEach(id => visibleLessonIds.add(id));
            }
    
            // Add lessons from all downloaded packs for the current language
            downloadedPacks.forEach(pack => {
                if (pack.id.startsWith(langCode)) {
                    pack.lessons.forEach(id => visibleLessonIds.add(id));
                }
            });
    
            // 3. Filter the master lesson list based on the visible IDs
            const lessonsToShow = allLessons.filter(lesson => visibleLessonIds.has(lesson.id));
            
            // Store the correctly filtered list in our global variable
            lessonsData = lessonsToShow;
    
            // The rest of the function proceeds as before
            await renderLessonList(lessonsData);
            updateLanguageIndicatorUI();
    
            // If a lesson from a previous session is no longer in the list, clear the hash
            const lessonIdFromUrl = window.location.hash.substring(1);
            if (!visibleLessonIds.has(lessonIdFromUrl)) {
                 window.location.hash = '';
            }
    
            if (lessonsData.length > 0) {
                // Load the first lesson if no specific one is in the URL
                if (!window.location.hash) {
                    loadLesson(lessonsData[0].id);
                }
            } else {
                transcriptContainer.innerHTML = `<p style='padding:20px'>No lessons available. Visit the Library to get started.</p>`;
                lessonList.innerHTML = '<li>No lessons found.</li>';
                player.src = '';
            }
        } catch (error)
        {
            console.error(`Failed to load data for language ${langCode}:`, error);
            lessonList.innerHTML = '<li>Could not load lessons.</li>';
        }
    }


    async function renderLessonList(lessons) {
        // We will fetch all necessary data in parallel for better performance
        const [allProgress, downloadedPacks] = await Promise.all([
            getAllLessonProgress(),
            getAllDownloadedPacks()
        ]);
    
        // Create a Map for fast lookups of lesson difficulty
        const progressMap = new Map(allProgress.map(p => [p.lessonId.split('-')[1], p.difficulty]));
        
        // Create a Set for very fast lookups of downloaded lesson IDs
        const downloadedLessonIds = new Set();
        downloadedPacks.forEach(pack => {
            // We only care about packs for the current language
            if (pack.id.startsWith(currentLanguageCode)) {
                pack.lessons.forEach(lessonId => downloadedLessonIds.add(lessonId));
            }
        });
    
        lessonList.innerHTML = '';
        lessons.forEach(lesson => {
            const li = document.createElement('li');
            li.dataset.lessonId = lesson.id;
    
            // --- Create a container for the text and icons ---
            const titleContainer = document.createElement('div');
            titleContainer.className = 'lesson-title-container';
    
            const titleSpan = document.createElement('span');
            titleSpan.className = 'lesson-title';
            titleSpan.textContent = lesson.title;
            titleContainer.appendChild(titleSpan);
    
            // --- Create a container for the status icons ---
            const iconsContainer = document.createElement('div');
            iconsContainer.className = 'lesson-icons-container';
    
            // Check if this lesson is downloaded
            if (downloadedLessonIds.has(lesson.id)) {
                const offlineIcon = document.createElement('span');
                offlineIcon.className = 'status-icon offline-icon';
                offlineIcon.title = 'Available Offline'; // Tooltip for desktop users
                offlineIcon.innerHTML = '📥'; // The download icon
                iconsContainer.appendChild(offlineIcon);
            }
    
            // Check our map for this lesson's difficulty
            const difficulty = progressMap.get(lesson.id);
            if (difficulty) {
                const indicator = document.createElement('span');
                indicator.classList.add('difficulty-indicator', difficulty);
                indicator.title = `Difficulty: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`;
                // Prepend the difficulty dot so it appears first
                li.prepend(indicator);
    
            }
            
            li.appendChild(titleContainer);
            li.appendChild(iconsContainer);
            
            li.addEventListener('click', () => {
                loadLesson(lesson.id);
                closeDrawer();
            });
            lessonList.appendChild(li);
        });
    }

    async function loadLesson(lessonId) {
        if (currentLessonId === lessonId || isChangingLesson) return; 

        isChangingLesson = true; 
        document.getElementById('cue-list-container').innerHTML = `<p style='padding:20px'>Loading...</p>`;

        try {
            const lesson = lessonsData.find(l => l.id === lessonId);
            if (!lesson) throw new Error(`Lesson ${lessonId} not found.`);

            // Prepend the current language code to the path
            const lessonJsonPath = `data/${currentLanguageCode}/${lesson.path}${lesson.lessonFile}`;
            const audioPath = `data/${currentLanguageCode}/${lesson.path}${lesson.audioFile}`;

            const response = await fetch(lessonJsonPath);
            const lessonContent = await response.json();

            currentLessonContent = lessonContent;
            resetSessionTrackers();

            // Ensure the transcript container has the correct mode class when a lesson loads
            const transcriptContainer = document.getElementById('transcript-container');
            transcriptContainer.classList.add('study-mode');
            transcriptContainer.classList.remove('quiz-mode');
            modeToggleCheckbox.checked = false; // Reset toggle to 'Study'
            currentMode = 'study'; // Reset mode state

            player.src = audioPath;
            player.load();

            renderTranscript(lessonContent);
            updateMediaSession(lesson); 

            currentLessonId = lessonId;
            updateActiveLessonInList();
            window.location.hash = lessonId;

        } catch (error) {
            console.error(`Failed to load lesson ${lessonId}:`, error);
            transcriptContainer.innerHTML = `<p style='padding:20px'>Error loading lesson content.</p>`;
        } finally {
            isChangingLesson = false;
        }
    }

    function renderTranscript(transcriptData) {
        const cueListContainer = document.getElementById('cue-list-container');
        // Clear only the cue list, leaving the mode toggle intact
        cueListContainer.innerHTML = '';
    
        if (!transcriptData) return;
    
        transcriptData.forEach(item => {
            const cueItem = document.createElement('div');
            cueItem.classList.add('cue-item', 'glass-panel');
            cueItem.dataset.sentenceId = item.id; 
    
            const cueMain = document.createElement('div');
            cueMain.classList.add('cue-main');
            cueMain.dataset.startTime = item.startTime;
    
            if (currentMode === 'study') {
                const cueText = document.createElement('p');
                cueText.classList.add('cue-text');
                cueText.textContent = item.text;
                cueMain.appendChild(cueText);
            } else { // 'quiz' mode
                const quizUiContainer = document.createElement('div');
                quizUiContainer.className = 'quiz-ui';
    
                const inputContainer = document.createElement('div');
                inputContainer.className = 'quiz-input-container';
    
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'quiz-input';
                input.placeholder = 'Type what you hear...';
                input.autocomplete = 'off';

                // ... after creating the 'input' ...
                const peekAnswer = document.createElement('div');
                peekAnswer.className = 'peek-answer';

                // The new icon button
                const peekButton = document.createElement('button');
                peekButton.className = 'peek-btn';
                peekButton.innerHTML = '👁️'; // Lightbulb icon. Use 👁️ for an eye.
                peekButton.setAttribute('aria-label', 'Peek at answer'); // For accessibility

                // Update the container
                inputContainer.append(peekAnswer, input, peekButton); // Add the button here    
                quizUiContainer.append(inputContainer);
                cueMain.appendChild(quizUiContainer);
    
                // --- NEW EVENT LISTENERS ---
                // Event listener for when the user clicks away or tabs out
                input.addEventListener('change', () => {
                    checkAnswer(input, item.text, cueItem);
                });
    
                // Event listener for when the user presses a key
                input.addEventListener('keydown', (event) => {
                    // If the key is Enter, trigger the check immediately
                    if (event.key === 'Enter') {
                        event.preventDefault(); // Stop default form submission
                        checkAnswer(input, item.text, cueItem);
                    }
                    // If the user starts typing again in an incorrect field,
                    // remove the 'incorrect' feedback to show it's a new attempt.
                    else if (cueItem.classList.contains('incorrect')) {
                        cueItem.classList.remove('incorrect');
                    }
                });

                // Stop the click event on the input from bubbling up to cueMain
                input.addEventListener('click', (event) => {
                    event.stopPropagation();
                });

                const showAnswer = () => {
                    peekAnswer.textContent = item.text;
                    peekAnswer.style.opacity = '1';
                };
                
                const hideAnswer = () => {
                    peekAnswer.style.opacity = '0';
                };
                
                // For mouse users (click and hold)
                peekButton.addEventListener('mousedown', showAnswer);
                peekButton.addEventListener('mouseup', hideAnswer);
                peekButton.addEventListener('mouseleave', hideAnswer); // Hide if mouse leaves button
                
                // For touch screen users (tap and hold)
                peekButton.addEventListener('touchstart', (e) => {
                    e.preventDefault(); // Prevents a "ghost click" from firing
                    showAnswer();
                });
                peekButton.addEventListener('touchend', hideAnswer);

            }
    
            const cueToggle = document.createElement('span');
            cueToggle.classList.add('cue-toggle');
            cueToggle.textContent = '▼';
            cueMain.appendChild(cueToggle);
    
            const cueExplanation = document.createElement('div');
            cueExplanation.classList.add('cue-explanation');
            const renderedExplanation = marked.parse(item.explanation);
            cueExplanation.innerHTML = renderedExplanation;
            
            cueItem.append(cueMain, cueExplanation);
            // Append to the correct container
            cueListContainer.appendChild(cueItem);
    
            cueMain.addEventListener('click', () => {
                if (currentMode === 'quiz') {
                    // Find the start time of the *next* cue to determine our end time
                    const nextCueItem = cueItem.nextElementSibling;
                    if (nextCueItem) {
                        pauseAtTime = parseFloat(nextCueItem.querySelector('.cue-main').dataset.startTime);
                    } else {
                        // If it's the last cue, just pause at the end of the audio
                        pauseAtTime = player.duration;
                    }
                } else {
                    // In study mode, we don't want to auto-pause
                    pauseAtTime = null;
                }
                player.currentTime = item.startTime;
                player.play();
            });
    
            cueToggle.addEventListener('click', (event) => {
                event.stopPropagation();
                const isVisible = cueExplanation.classList.contains('visible');
                document.querySelectorAll('.cue-explanation.visible').forEach(panel => {
                    if (panel !== cueExplanation) {
                        panel.classList.remove('visible');
                        panel.previousElementSibling.querySelector('.cue-toggle').classList.remove('open');
                    }
                });
                cueExplanation.classList.toggle('visible');
                cueToggle.classList.toggle('open');
                explainedCuesThisSession.add(item.id);
            });
        });
    }

    function updateActiveLessonInList() {
        document.querySelectorAll('#lesson-list li').forEach(li => {
            li.classList.toggle('active', li.dataset.lessonId === currentLessonId);
        });
    }

    function updateTranscriptHighlight() {
        // If the player is paused, don't update the highlight.
        if (player.paused) return;

        const currentTime = player.currentTime;

        if (currentTime > maxTimeReached) {
            maxTimeReached = currentTime;
        }

        // Add the new auto-pause logic
        if (currentMode === 'quiz' && pauseAtTime && player.currentTime >= pauseAtTime) {
            player.pause();
            pauseAtTime = null; // Clear the target so it only fires once
            return;
        }

        const cues = transcriptContainer.querySelectorAll('.cue-main');

        cues.forEach(cue => {
            const startTime = parseFloat(cue.dataset.startTime);
            const nextCueItem = cue.parentElement.nextElementSibling;
            const nextStartTime = nextCueItem ? parseFloat(nextCueItem.querySelector('.cue-main').dataset.startTime) : player.duration;

            cue.classList.toggle('active', currentTime >= startTime && currentTime < nextStartTime);
        });
    }

    /**
     * Compares user input to the correct answer and applies visual feedback.
     * @param {HTMLInputElement} inputElement - The input field element.
     * @param {string} correctAnswer - The correct sentence text.
     * @param {HTMLElement} cueItemElement - The parent .cue-item element.
     */
    function checkAnswer(inputElement, correctAnswer, cueItemElement) {
        const userInput = inputElement.value;

        // Do nothing if the user hasn't typed anything
        if (userInput.trim() === '') {
            cueItemElement.classList.remove('correct', 'incorrect');
            return;
        }

        // Normalize both strings for a more forgiving comparison
        const isCorrect = normalizeString(userInput) === normalizeString(correctAnswer);

        // Remove previous feedback states
        cueItemElement.classList.remove('correct', 'incorrect');

        if (isCorrect) {
            cueItemElement.classList.add('correct');
            // Lock the input field once the answer is correct
            inputElement.disabled = true;
        } else {
            cueItemElement.classList.add('incorrect');
        }
    }

    /**
     * Helper function to normalize strings for comparison.
     * Trims whitespace, converts to lowercase, and removes common punctuation.
     * @param {string} str
     * @returns {string}
     */
    function normalizeString(str) {
        return str
            .trim()
            .toLowerCase()
            // This regex removes common punctuation marks. Adjust as needed for your target language.
            .replace(/[.,¡!¿?]/g, ''); 
    }

    function openDrawer() {
        navDrawer.classList.add('is-open');
        drawerOverlay.classList.add('is-open');
    }
    function closeDrawer() {
        navDrawer.classList.remove('is-open');
        drawerOverlay.classList.remove('is-open');
    }

    function showLanguageSelector() {
        // Clear any previous list items
        languageListModal.innerHTML = '';
    
        // Create a button for each available language
        availableLanguages.forEach(lang => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.dataset.langCode = lang.code;
            button.innerHTML = `<img src="${lang.image}" alt="" class="flag-icon"> ${lang.name}`;
            
            button.addEventListener('click', () => {
                // When a language is chosen, load its data and hide the modal
                handleLanguageSelection(lang.code);
            });
            
            li.appendChild(button);
            languageListModal.appendChild(li);
        });
    
        languageSelectorOverlay.classList.remove('hidden');
    }

    function handleLanguageSelection(langCode) {
        // Hide the modal immediately for a responsive feel
        languageSelectorOverlay.classList.add('hidden');
    
        // Load the data for the newly selected language
        // This will fetch lessons, render the list, and load the first lesson.
        loadLanguageData(langCode);
    }
    
    function updateLanguageIndicatorUI() {
        if (!currentLanguageCode || availableLanguages.length === 0) return;
    
        const currentLang = availableLanguages.find(lang => lang.code === currentLanguageCode);
        if (currentLang) {
            currentLanguageIndicator.innerHTML = `<img src="${currentLang.image}" alt="" class="flag-icon"> ${currentLang.name}`;
        }
    }

    player.addEventListener('timeupdate', updateTranscriptHighlight);
    menuToggle.addEventListener('click', openDrawer);
    switchLanguageBtn.addEventListener('click', showLanguageSelector);
    drawerOverlay.addEventListener('click', closeDrawer);
    player.addEventListener('play', () => {
        // A new listening session starts if the user presses play near the beginning.
        // We use a small threshold (e.g., 1 second) to account for minor delays.
        if (player.currentTime < 1) {
            resetSessionTrackers();
        }
        
        navigator.mediaSession.playbackState = 'playing';
    });
    player.addEventListener('pause', () => { navigator.mediaSession.playbackState = 'paused'; });
    player.addEventListener('ended', collectAndSaveStats);
    window.addEventListener('pagehide', collectAndSaveStats);

    modeToggleCheckbox.addEventListener('change', () => {
        // 1. Update the state variable based on whether the checkbox is checked
        currentMode = modeToggleCheckbox.checked ? 'quiz' : 'study';
        console.log(`Mode switched to: ${currentMode}`);
    
        // 2. Update the parent container's class for CSS targeting
        // We get a reference to the container here.
        const transcriptContainer = document.getElementById('transcript-container');
        transcriptContainer.classList.toggle('quiz-mode', modeToggleCheckbox.checked);
        transcriptContainer.classList.toggle('study-mode', !modeToggleCheckbox.checked);
    
        // 3. Re-render the entire transcript UI to reflect the new mode
        // currentLessonContent holds the data for the currently loaded lesson
        if (currentLessonContent.length > 0) {
            renderTranscript(currentLessonContent);
        }
    });

    /**
     * Handles automatic refreshing of content when the user returns to the tab.
     * This ensures the lesson list is up-to-date after a download.
     */
    document.addEventListener('visibilitychange', () => {
        // 'visible' means the user has switched back to this tab
        if (document.visibilityState === 'visible' && currentLanguageCode) {
            console.log("Tab is visible again. Refreshing language data.");
            // Re-run the data loading process to show newly downloaded lessons
            loadLanguageData(currentLanguageCode);
        }
    });

    function updateMediaSession(lesson) {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: lesson.title,
            artist: 'Language Learner',
            album: 'Beginner Course',
            artwork: [
                { src: lesson.artwork || 'images/icon-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: lesson.artwork || 'images/icon-512x512.png', sizes: '512x512', type: 'image/png' },
            ]
        });
    }

    function getLessonIndex(lessonId) { return lessonsData.findIndex(l => l.id === lessonId); }

    function playNextLesson() {
        const currentIndex = getLessonIndex(currentLessonId);
        if (currentIndex < lessonsData.length - 1) {
            loadLesson(lessonsData[currentIndex + 1].id);
        }
    }

    function playPreviousLesson() {
        const currentIndex = getLessonIndex(currentLessonId);
        if (currentIndex > 0) {
            loadLesson(lessonsData[currentIndex - 1].id);
        }
    }

    function setupMediaSessionHandlers() {
        if (!('mediaSession' in navigator)) return; 
        navigator.mediaSession.setActionHandler('play', () => { player.play(); });
        navigator.mediaSession.setActionHandler('pause', () => { player.pause(); });
        navigator.mediaSession.setActionHandler('nexttrack', playNextLesson);
        navigator.mediaSession.setActionHandler('previoustrack', playPreviousLesson);
        navigator.mediaSession.setActionHandler('seekbackward', (details) => { player.currentTime = Math.max(player.currentTime - (details.seekOffset || 10), 0); });
        navigator.mediaSession.setActionHandler('seekforward', (details) => { player.currentTime = Math.min(player.currentTime + (details.seekOffset || 10), player.duration); });
    }

    // async function collectAndSaveStats() {
    //     // Check if a language is selected. If not, we can't save stats.
    //     if (!currentLanguageCode) return;
    //     if (sessionStatsSaved || !player.duration) return;
        
    //     const listeningThreshold = 0.9;
    //     if (maxTimeReached < player.duration * listeningThreshold) {
    //         console.log(`Listen progress (${Math.round(maxTimeReached / player.duration * 100)}%) did not meet threshold of ${listeningThreshold*100}%. Stats not saved.`);
    //         return;
    //     }
        
    //     sessionStatsSaved = true;
    //     console.log('Listen progress met threshold. Collecting and saving stats...');
    
    //     if (!currentLessonContent || currentLessonContent.length === 0) {
    //         console.log('No lesson content to process.');
    //         return;
    //     }
    
    //     const updatePromises = currentLessonContent.map(async (sentence) => {
    //         // ====== THE KEY CHANGE IS HERE ======
    //         // Create a globally unique ID by prefixing with the language code.
    //         const prefixedSentenceId = `${currentLanguageCode}-${sentence.id}`;
    //         // ===================================
    
    //         const wasExplained = explainedCuesThisSession.has(sentence.id);
    
    //         // 1. Get the existing stat record using the new prefixed ID
    //         const existingStat = await getSentenceStat(prefixedSentenceId);
    
    //         if (existingStat) {
    //             // 2. If it exists, update it
                
    //             // Option A: use a simple boolean 1-0 system 
    //             existingStat.times_listened = 1;
    //             if (wasExplained) {
    //                 existingStat.times_explained = 1;
    //             }

    //             // Option B: use a rolling average that aggregates over all listening times and explanations. 
    //             //existingStat.times_listened += 1;
    //             //if (wasExplained) {
    //             //    existingStat.times_explained += 1;
    //             //}
    //             await updateSentenceStat(existingStat);
    //         } else {
    //             // 3. If it doesn't exist, create a new record using the prefixed ID
    //             const newStat = {
    //                 sentence_id: prefixedSentenceId, // Use the prefixed ID here
    //                 times_listened: 1,
    //                 times_explained: wasExplained ? 1 : 0
    //             };
    //             await updateSentenceStat(newStat);
    //         }
    //     });
    
    //     try {
    //         await Promise.all(updatePromises);
    //         console.log('All stats saved successfully with language prefixes!');
    //     } catch (error) {
    //         console.error('An error occurred while saving stats:', error);
    //     }
    // }

    async function collectAndSaveStats() {
        if (!currentLanguageCode) return;
        if (sessionStatsSaved || !player.duration) return;
        
        const listeningThreshold = 0.9;
        if (maxTimeReached < player.duration * listeningThreshold) {
            console.log(`Listen progress did not meet threshold. Stats not saved.`);
            return;
        }
        
        sessionStatsSaved = true;
        console.log('Listen progress met threshold. Saving stats for this session.');
    
        if (!currentLessonContent || currentLessonContent.length === 0) {
            return;
        }
    
        try {
            // --- THE KEY CHANGE: RESET STEP ---
            // Before saving new stats, delete all existing stats for this lesson.
            console.log('Resetting previous stats for this lesson...');
            const deletePromises = currentLessonContent.map(sentence => {
                const prefixedSentenceId = `${currentLanguageCode}-${sentence.id}`;
                return deleteSentenceStat(prefixedSentenceId);
            });
            // Wait for all deletions to complete.
            await Promise.all(deletePromises);
            console.log('Previous stats cleared.');
            // --- END OF KEY CHANGE ---
    
    
            // --- SAVE STEP (This logic remains the same as before) ---
            const updatePromises = currentLessonContent.map(async (sentence) => {
                const prefixedSentenceId = `${currentLanguageCode}-${sentence.id}`;
                const wasExplained = explainedCuesThisSession.has(sentence.id);
    
                // Since we just deleted old stats, 'existingStat' will always be null,
                // so this logic will always create a fresh record.
                const existingStat = await getSentenceStat(prefixedSentenceId);
    
                if (existingStat) { // This block will likely never run, but is safe to keep
                    existingStat.times_listened += 1;
                    if (wasExplained) { existingStat.times_explained += 1; }
                    await updateSentenceStat(existingStat);
                } else {
                    const newStat = {
                        sentence_id: prefixedSentenceId,
                        times_listened: 1, // Always starts at 1 now
                        times_explained: wasExplained ? 1 : 0 // Always 0 or 1
                    };
                    await updateSentenceStat(newStat);
                }
            });
    
            await Promise.all(updatePromises);
            console.log('New session stats saved successfully!');
    
        } catch (error) {
            console.error('An error occurred while saving stats:', error);
        }
    }

    function resetSessionTrackers() {
        console.log("Resetting session trackers for a new listen.");
        maxTimeReached = 0;
        sessionStatsSaved = false;
        explainedCuesThisSession.clear();
    }

    setupMediaSessionHandlers();
    init();
});