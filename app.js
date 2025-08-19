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

    let lessonsData = [];
    let currentLessonId = null;
    let isChangingLesson = false; 

    let currentLessonContent = [];
    let explainedCuesThisSession = new Set();

    async function init() {
        try {
            await initDB(); 
            
            const response = await fetch('data/lessons.json');
            lessonsData = await response.json();
            
            // 2. UPDATE THIS LINE: Add 'await' because renderLessonList is now async
            await renderLessonList(lessonsData);

            const lessonIdFromUrl = window.location.hash.substring(1);
            if (lessonIdFromUrl && lessonsData.some(l => l.id === lessonIdFromUrl)) {
                loadLesson(lessonIdFromUrl);
            } else {
                loadLesson(lessonsData[0].id);
            }
        } catch (error) {
            console.error("Failed to initialize lessons:", error);
            transcriptContainer.innerHTML = "<p style='padding:20px'>Could not load lessons. Please try again later.</p>";
        }
    }

    // 3. ENTIRELY REPLACE the old renderLessonList function with this new async version.
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

    // --- No changes to the functions below this line ---

    async function loadLesson(lessonId) {
        if (currentLessonId === lessonId || isChangingLesson) return; 

        isChangingLesson = true; 
        transcriptContainer.innerHTML = `<p style='padding:20px'>Loading...</p>`;

        try {
            const lesson = lessonsData.find(l => l.id === lessonId);
            if (!lesson) throw new Error(`Lesson ${lessonId} not found.`);

            const lessonJsonPath = `data/${lesson.path}${lesson.lessonFile}`;
            const audioPath = `data/${lesson.path}${lesson.audioFile}`;

            const response = await fetch(lessonJsonPath);
            const lessonContent = await response.json();

            currentLessonContent = lessonContent;
            explainedCuesThisSession.clear();

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

    player.addEventListener('timeupdate', updateTranscriptHighlight);
    menuToggle.addEventListener('click', openDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);

    player.addEventListener('play', () => { navigator.mediaSession.playbackState = 'playing'; });
    player.addEventListener('pause', () => { navigator.mediaSession.playbackState = 'paused'; });
    player.addEventListener('ended', collectAndSaveStats);

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
        console.log('Lesson finished. Collecting and saving stats...');
        if (!currentLessonContent || currentLessonContent.length === 0) return;

        const updatePromises = currentLessonContent.map(async (sentence) => {
            const sentenceId = sentence.id;
            const wasExplained = explainedCuesThisSession.has(sentenceId);
            const existingStat = await getSentenceStat(sentenceId);
            if (existingStat) {
                existingStat.times_listened += 1;
                if (wasExplained) { existingStat.times_explained += 1; }
                await updateSentenceStat(existingStat);
            } else {
                const newStat = {
                    sentence_id: sentenceId,
                    times_listened: 1,
                    times_explained: wasExplained ? 1 : 0
                };
                await updateSentenceStat(newStat);
            }
        });
        try {
            await Promise.all(updatePromises);
            console.log('All stats saved successfully!');
        } catch (error) {
            console.error('An error occurred while saving stats:', error);
        }
    }

    setupMediaSessionHandlers();
    init();
});