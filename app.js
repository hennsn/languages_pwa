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

    async function init() {
        try {
            const response = await fetch('data/lessons.json');
            lessonsData = await response.json();
            renderLessonList(lessonsData);

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

    function renderLessonList(lessons) {
        lessonList.innerHTML = '';
        lessons.forEach(lesson => {
            const li = document.createElement('li');
            li.textContent = lesson.title;
            li.dataset.lessonId = lesson.id;
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
        transcriptContainer.innerHTML = `<p style='padding:20px'>Loading...</p>`; // Loading indicator

        try {
            const lesson = lessonsData.find(l => l.id === lessonId);
            if (!lesson) throw new Error(`Lesson ${lessonId} not found.`);

            const lessonJsonPath = `data/${lesson.path}${lesson.lessonFile}`;
            const audioPath = `data/${lesson.path}${lesson.audioFile}`;

            const response = await fetch(lessonJsonPath);
            const lessonContent = await response.json();

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
            //cueExplanation.textContent = item.explanation;
            
            // render markdown 
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

    player.addEventListener('play', () => {
        navigator.mediaSession.playbackState = 'playing';
    });
    player.addEventListener('pause', () => {
        navigator.mediaSession.playbackState = 'paused';
    });

    // Media Session API
    function updateMediaSession(lesson) {
        if (!('mediaSession' in navigator)) {
            console.log("Media Session API is not supported.");
            return;
        }
    
        console.log(`Updating media session for: ${lesson.title}`);
    
        navigator.mediaSession.metadata = new MediaMetadata({
            title: lesson.title,
            artist: 'Language Learner', // Your app's name or author
            album: 'Beginner Course', // A course or series name
            artwork: [
                // Use a default icon if lesson-specific art isn't available
                { src: lesson.artwork || 'images/icon-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: lesson.artwork || 'images/icon-512x512.png', sizes: '512x512', type: 'image/png' },
            ]
        });
    }

    function getLessonIndex(lessonId) {
    return lessonsData.findIndex(l => l.id === lessonId);
    }

    function playNextLesson() {
        const currentIndex = getLessonIndex(currentLessonId);
        if (currentIndex < lessonsData.length - 1) {
            const nextLesson = lessonsData[currentIndex + 1];
            console.log('Playing next lesson:', nextLesson.title);
            loadLesson(nextLesson.id);
        } else {
            console.log('Already at the last lesson.');
        }
    }

    function playPreviousLesson() {
        const currentIndex = getLessonIndex(currentLessonId);
        if (currentIndex > 0) {
            const prevLesson = lessonsData[currentIndex - 1];
            console.log('Playing previous lesson:', prevLesson.title);
            loadLesson(prevLesson.id);
        } else {
            console.log('Already at the first lesson.');
        }
    }

    function setupMediaSessionHandlers() {
        if (!('mediaSession' in navigator)) {
            return; 
        }
    
        // The player variable must be accessible here
        const player = document.getElementById('media-player');
    
        navigator.mediaSession.setActionHandler('play', () => {
            player.play();
        });
    
        navigator.mediaSession.setActionHandler('pause', () => {
            player.pause();
        });
    
        // Optional but highly recommended:
        navigator.mediaSession.setActionHandler('nexttrack', playNextLesson);
        navigator.mediaSession.setActionHandler('previoustrack', playPreviousLesson);
    
        // You can also handle seeking
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            player.currentTime = Math.max(player.currentTime - (details.seekOffset || 10), 0);
        });
        
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
            player.currentTime = Math.min(player.currentTime + (details.seekOffset || 10), player.duration);
        });
    }

    setupMediaSessionHandlers();

    init();
});

