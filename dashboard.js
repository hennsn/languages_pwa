// dashboard.js

// Import the same DB functions as before
import { initDB, getAllStats, updateLessonProgress } from './db.js';

// ====== 1. ADD STATE MANAGEMENT & LANGUAGE KEY ======
const LANGUAGE_STORAGE_KEY = 'languageLearner-selectedLanguage';
let currentLanguageCode = null;
// ====================================================

// --- DOM Element Selection (No changes here) ---
const understoodCountEl = document.getElementById('understood-count');
const totalCountEl = document.getElementById('total-count');
const easyLessonsEl = document.getElementById('easy-lessons');
const mediumLessonsEl = document.getElementById('medium-lessons');
const hardLessonsEl = document.getElementById('hard-lessons');
const journeyTrackProgressEl = document.getElementById('journey-track-progress');
const journeyProgressTextEl = document.getElementById('journey-progress-text');
const milestoneElements = document.querySelectorAll('.milestone');
const loadingSpinner = document.getElementById('loading-spinner');

const LANGUAGE_LEVELS = [
    { level: 'A1', sentences: 500 }, { level: 'A2', sentences: 1000 },
    { level: 'B1', sentences: 2000 }, { level: 'B2', sentences: 4000 },
    { level: 'C1', sentences: 6000 }, { level: 'C2', sentences: 8000 },
];

// ====== 2. UPDATE THE INITIALIZE FUNCTION ======
// It now checks for a language first before doing anything else.
async function initializeDashboard() {
    currentLanguageCode = localStorage.getItem(LANGUAGE_STORAGE_KEY);

    if (!currentLanguageCode) {
        // Handle the case where the user hasn't selected a language yet
        document.querySelector('.dashboard-container').innerHTML = 
            `<p style="padding: 20px;">Please select a language in the main app first to see your progress.</p>`;
        loadingSpinner.classList.add('hidden');
        return;
    }

    try {
        await initDB();
        // Pass the language code to the processing function
        const processedData = await fetchAndProcessStats(currentLanguageCode);
        renderDashboard(processedData);
    } catch (error) {
        console.error("Failed to initialize dashboard:", error);
        document.querySelector('.dashboard-container').innerHTML = 
            `<p style="color: var(--accent-hard); padding: 20px;">Could not load dashboard data. Please try again later.</p>`;
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

// ====== 3. REFACTOR fetchAndProcessStats TO BE LANGUAGE-SPECIFIC ======
async function fetchAndProcessStats(langCode) {
    console.log(`Fetching and processing stats for language: ${langCode}...`);

    // --- Fetch language-specific lesson data ---
    const lessonsResponse = await fetch(`data/${langCode}/lessons.json`);
    const lessons = await lessonsResponse.json();
    const sentenceToLessonMap = new Map();

    const lessonFilePromises = lessons.map(lesson => 
        fetch(`data/${langCode}/${lesson.path}${lesson.lessonFile}`).then(res => res.json())
    );
    const allLessonContents = await Promise.all(lessonFilePromises);

    allLessonContents.forEach((content, index) => {
        const lessonId = lessons[index].id;
        content.forEach(sentence => {
            // Create prefixed keys for the map to match the DB records
            const prefixedSentenceId = `${langCode}-${sentence.id}`;
            sentenceToLessonMap.set(prefixedSentenceId, lessonId);
        });
    });

    // --- Get all stats and FILTER for the current language ---
    const allStatsFromDB = await getAllStats();
    const currentLanguageStats = allStatsFromDB.filter(stat => stat.sentence_id.startsWith(langCode + '-'));

    if (currentLanguageStats.length === 0) {
        // Return default empty state if no stats for this language
        return { 
            globalStats: { totalSentences: 0, understoodSentences: 0 },
            lessonCategories: { easy: 0, medium: 0, hard: 0 },
            totalLessons: lessons.length
        };
    }

    // --- Aggregate and calculate stats (logic is the same, but data is filtered) ---
    const globalStats = {
        totalSentences: currentLanguageStats.length,
        understoodSentences: 0,
    };
    const lessonData = {}; 

    currentLanguageStats.forEach(stat => {
        const ratio = stat.times_listened > 0 ? stat.times_explained / stat.times_listened : 0;
        if (ratio < 0.3) {
            globalStats.understoodSentences++;
        }

        const lessonId = sentenceToLessonMap.get(stat.sentence_id);
        if (lessonId) {
            if (!lessonData[lessonId]) {
                lessonData[lessonId] = { ratios: [] };
            }
            lessonData[lessonId].ratios.push(ratio);
        }
    });

    // --- Categorize lessons and save progress with prefixed IDs ---
    const lessonCategories = { easy: 0, medium: 0, hard: 0 };
    const progressUpdatePromises = [];

    Object.keys(lessonData).forEach(lessonId => {
        const data = lessonData[lessonId];
        const avgRatio = data.ratios.reduce((a, b) => a + b, 0) / data.ratios.length;
        let difficulty;

        if (avgRatio < 0.33) {
            lessonCategories.easy++;
            difficulty = 'easy';
        } else if (avgRatio >= 0.33 && avgRatio < 0.66) {
            lessonCategories.medium++;
            difficulty = 'medium';
        } else {
            lessonCategories.hard++;
            difficulty = 'hard';
        }
        
        // Save to the DB with a prefixed lessonId for uniqueness
        const prefixedLessonId = `${langCode}-${lessonId}`;
        progressUpdatePromises.push(
            updateLessonProgress({ lessonId: prefixedLessonId, difficulty, avgRatio })
        );
    });
    
    await Promise.all(progressUpdatePromises);
    console.log("Language-specific lesson progress saved to DB.");

    return {
        globalStats,
        lessonCategories,
        totalLessons: lessons.length
    };
}


// --- NO CHANGES to renderDashboard function ---
// It remains the same as it just displays the data it's given.
function renderDashboard(data) {
    const { globalStats, lessonCategories, totalLessons } = data;

    understoodCountEl.textContent = `${globalStats.understoodSentences} / ${globalStats.totalSentences}`;
    totalCountEl.textContent = globalStats.totalSentences;

    easyLessonsEl.textContent = `${lessonCategories.easy} / ${totalLessons}`;
    mediumLessonsEl.textContent = `${lessonCategories.medium} / ${totalLessons}`;
    hardLessonsEl.textContent = `${lessonCategories.hard} / ${totalLessons}`;

    const understoodCount = data.globalStats.understoodSentences;
    const finalGoal = LANGUAGE_LEVELS[LANGUAGE_LEVELS.length - 1].sentences;
    const overallProgressPercent = Math.min((understoodCount / finalGoal) * 100, 100);
    journeyTrackProgressEl.style.width = `${overallProgressPercent}%`;
    
    let nextLevel = null;
    LANGUAGE_LEVELS.forEach((levelInfo) => {
        const milestoneEl = document.querySelector(`.milestone[data-level="${levelInfo.level}"]`);
        milestoneEl.classList.remove('achieved', 'in-progress');
        if (understoodCount >= levelInfo.sentences) {
            milestoneEl.classList.add('achieved');
        } else if (!nextLevel) {
            nextLevel = levelInfo;
            milestoneEl.classList.add('in-progress');
        }
    });
    
    if (nextLevel) {
        journeyProgressTextEl.innerHTML = 
            `Progress to <span>${nextLevel.level}</span>: <span>${understoodCount.toLocaleString()}</span> / ${nextLevel.sentences.toLocaleString()} sentences`;
    } else {
        journeyProgressTextEl.innerHTML = 
            `Congratulations! You've reached the <span>C2</span> level with <span>${understoodCount.toLocaleString()}</span> understood sentences.`;
    }
}

// --- Start the process ---
initializeDashboard();