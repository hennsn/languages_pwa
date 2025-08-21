// app.js

// 1. UPDATE IMPORT: Add 'getAllLessonProgress' to the list.
import { initDB, getSentenceStat, updateSentenceStat, getAllLessonProgress } from './db.js';

document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('media-player');
    const transcriptContainer = document.getElementById('transcript-container');
    const menuToggle = document.getElementById('menu-toggle');
    const navDrawer = document.getElementById('nav-drawer');
    const drawerOverlay = document.getElementById('drawer-overlay');
    const lessonList = document.getElementById('lesson-list');

    const languageSelectorOverlay = document.getElementById('language-selector-overlay');
    const languageListModal = document.getElementById('language-list-modal');
    const switchLanguageBtn = document.getElementById('switch-language-btn');
    const currentLanguageIndicator = document.getElementById('current-language-indicator');

    const LANGUAGE_STORAGE_KEY = 'languageLearner-selectedLanguage';
    let availableLanguages = []; // Will hold data from languages.json

    let lessonsData = [];
    let currentLanguageCode = null; // New state variable
    let currentLessonId = null;
    let isChangingLesson = false; 
    let maxTimeReached = 0;
    let sessionStatsSaved = false; 

    let currentLessonContent = [];
    let explainedCuesThisSession = new Set();

    // async function init() {
    //     try {
    //         await initDB(); 
            
    //         const response = await fetch('data/lessons.json');
    //         lessonsData = await response.json();
            
    //         await renderLessonList(lessonsData);

    //         const lessonIdFromUrl = window.location.hash.substring(1);
    //         if (lessonIdFromUrl && lessonsData.some(l => l.id === lessonIdFromUrl)) {
    //             loadLesson(lessonIdFromUrl);
    //         } else {
    //             loadLesson(lessonsData[0].id);
    //         }
    //     } catch (error) {
    //         console.error("Failed to initialize lessons:", error);
    //         transcriptContainer.innerHTML = "<p style='padding:20px'>Could not load lessons. Please try again later.</p>";
    //     }
    // }


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
            // Show a loading state in the lesson list
            lessonList.innerHTML = '<li>Loading lessons...</li>';
            
            // Set the global state
            currentLanguageCode = langCode;
            localStorage.setItem(LANGUAGE_STORAGE_KEY, langCode);
    
            // Fetch the specific lesson manifest for the chosen language
            const response = await fetch(`data/${langCode}/lessons.json`);
            lessonsData = await response.json();
            
            await renderLessonList(lessonsData);
            updateLanguageIndicatorUI(); // Update the button in the nav drawer
    
            // Clear any old lesson hash from a different language
            window.location.hash = '';
    
            if (lessonsData.length > 0) {
                // Load the first lesson of the new language
                loadLesson(lessonsData[0].id);
            } else {
                // Handle case where a language has no lessons yet
                transcriptContainer.innerHTML = `<p style='padding:20px'>No lessons available for this language yet.</p>`;
                player.src = '';
            }
        } catch (error) {
            console.error(`Failed to load data for language ${langCode}:`, error);
            lessonList.innerHTML = '<li>Could not load lessons.</li>';
        }
    }


    async function renderLessonList(lessons) {
        // Fetch all calculated lesson difficulties from the DB
        const allProgress = await getAllLessonProgress();
        // Convert the array into a Map for fast lookups (lessonId -> 'easy'/'medium'/'hard')
        const progressMap = new Map(allProgress.map(p => [p.lessonId, p.difficulty]));
    
        lessonList.innerHTML = '';
        lessons.forEach(lesson => {
            const li = document.createElement('li');
            li.textContent = lesson.title;
            li.dataset.lessonId = lesson.id;
    
            // Check our map for this lesson's difficulty
            const difficulty = progressMap.get(lesson.id);
            if (difficulty) {
                // If found, create the indicator dot and add it to the list item
                const indicator = document.createElement('span');
                indicator.classList.add('difficulty-indicator', difficulty);
                // Prepend adds the dot before the text, which looks nice.
                li.prepend(indicator);
            }
            
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
        transcriptContainer.innerHTML = `<p style='padding:20px'>Loading...</p>`;

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
        transcriptContainer.innerHTML = '';

        transcriptData.forEach(item => {
            const cueItem = document.createElement('div');
            cueItem.classList.add('cue-item', 'glass-panel');

            const cueMain = document.createElement('div');
            cueMain.classList.add('cue-main');
            cueMain.dataset.startTime = item.startTime;

            const cueText = document.createElement('p');
            cueText.classList.add('cue-text');
            cueText.textContent = item.text;

            const cueToggle = document.createElement('span');
            cueToggle.classList.add('cue-toggle');
            cueToggle.textContent = '▼';

            cueMain.append(cueText, cueToggle);

            const cueExplanation = document.createElement('div');
            cueExplanation.classList.add('cue-explanation');
            
            const renderedExplanation = marked.parse(item.explanation);
            cueExplanation.innerHTML = renderedExplanation 

            cueItem.append(cueMain, cueExplanation);
            transcriptContainer.appendChild(cueItem);

            cueMain.addEventListener('click', () => {
                player.currentTime = item.startTime;
                player.play();
            });

            cueToggle.addEventListener('click', (event) => {
                event.stopPropagation();
                explainedCuesThisSession.add(item.id); 
                const isVisible = cueExplanation.classList.contains('visible');
                document.querySelectorAll('.cue-explanation.visible').forEach(panel => {
                    panel.classList.remove('visible');
                    panel.previousElementSibling.querySelector('.cue-toggle').classList.remove('open');
                });
                if (!isVisible) {
                    cueExplanation.classList.add('visible');
                    cueToggle.classList.add('open');
                }
            });
        });
    }

    function updateActiveLessonInList() {
        document.querySelectorAll('#lesson-list li').forEach(li => {
            li.classList.toggle('active', li.dataset.lessonId === currentLessonId);
        });
    }

    function updateTranscriptHighlight() {
        const currentTime = player.currentTime;

        if (currentTime > maxTimeReached) {
            maxTimeReached = currentTime;
        }

        const cues = transcriptContainer.querySelectorAll('.cue-main');

        cues.forEach(cue => {
            const startTime = parseFloat(cue.dataset.startTime);
            const nextCueItem = cue.parentElement.nextElementSibling;
            const nextStartTime = nextCueItem ? parseFloat(nextCueItem.querySelector('.cue-main').dataset.startTime) : player.duration;

            cue.classList.toggle('active', currentTime >= startTime && currentTime < nextStartTime);
        });
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
            button.innerHTML = `<span>${lang.flag}</span> ${lang.name}`;
            
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
            currentLanguageIndicator.innerHTML = `${currentLang.flag} ${currentLang.name}`;
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

    async function collectAndSaveStats() {
        // Check if a language is selected. If not, we can't save stats.
        if (!currentLanguageCode) return;
    
        if (sessionStatsSaved || !player.duration) return;
        
        const listeningThreshold = 0.9;
        if (maxTimeReached < player.duration * listeningThreshold) {
            console.log(`Listen progress (${Math.round(maxTimeReached / player.duration * 100)}%) did not meet threshold of ${listeningThreshold*100}%. Stats not saved.`);
            return;
        }
        
        sessionStatsSaved = true;
        console.log('Listen progress met threshold. Collecting and saving stats...');
    
        if (!currentLessonContent || currentLessonContent.length === 0) {
            console.log('No lesson content to process.');
            return;
        }
    
        const updatePromises = currentLessonContent.map(async (sentence) => {
            // ====== THE KEY CHANGE IS HERE ======
            // Create a globally unique ID by prefixing with the language code.
            const prefixedSentenceId = `${currentLanguageCode}-${sentence.id}`;
            // ===================================
    
            const wasExplained = explainedCuesThisSession.has(sentence.id);
    
            // 1. Get the existing stat record using the new prefixed ID
            const existingStat = await getSentenceStat(prefixedSentenceId);
    
            if (existingStat) {
                // 2. If it exists, update it
                existingStat.times_listened += 1;
                if (wasExplained) {
                    existingStat.times_explained += 1;
                }
                await updateSentenceStat(existingStat);
            } else {
                // 3. If it doesn't exist, create a new record using the prefixed ID
                const newStat = {
                    sentence_id: prefixedSentenceId, // Use the prefixed ID here
                    times_listened: 1,
                    times_explained: wasExplained ? 1 : 0
                };
                await updateSentenceStat(newStat);
            }
        });
    
        try {
            await Promise.all(updatePromises);
            console.log('All stats saved successfully with language prefixes!');
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