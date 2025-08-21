// dashboard.js

// 1. UPDATE IMPORT: Add 'updateLessonProgress' to the import list.
import { initDB, getAllStats, updateLessonProgress } from './db.js';

// --- DOM Element Selection (No changes here) ---
const understoodCountEl = document.getElementById('understood-count');
const totalCountEl = document.getElementById('total-count');
const easyLessonsEl = document.getElementById('easy-lessons');
const mediumLessonsEl = document.getElementById('medium-lessons');
const hardLessonsEl = document.getElementById('hard-lessons');
const progressCircleBar = document.querySelector('.progress-circle-bar');
const loadingSpinner = document.getElementById('loading-spinner');

const journeyTrackProgressEl = document.getElementById('journey-track-progress');
const journeyProgressTextEl = document.getElementById('journey-progress-text');
const milestoneElements = document.querySelectorAll('.milestone');

const LANGUAGE_LEVELS = [
    { level: 'A1', sentences: 500 },
    { level: 'A2', sentences: 1000 },
    { level: 'B1', sentences: 2000 },
    { level: 'B2', sentences: 4000 },
    { level: 'C1', sentences: 6000 },
    { level: 'C2', sentences: 8000 },
];

// --- initializeDashboard function (No changes here) ---
async function initializeDashboard() {
    try {
        await initDB();
        const processedData = await fetchAndProcessStats();
        renderDashboard(processedData);
    } catch (error) {
        console.error("Failed to initialize dashboard:", error);
        document.querySelector('.dashboard-container').innerHTML = 
            `<p style="color: var(--accent-hard); padding: 20px;">Could not load dashboard data. Please try again later.</p>`;
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

// --- fetchAndProcessStats function (This is where we make our changes) ---
async function fetchAndProcessStats() {
    console.log("Fetching and processing stats...");

    // (No changes in the first part: creating the map and getting stats)
    const lessonsResponse = await fetch('data/lessons.json');
    const lessons = await lessonsResponse.json();
    const sentenceToLessonMap = new Map();

    const lessonFilePromises = lessons.map(lesson => 
        fetch(`data/${lesson.path}${lesson.lessonFile}`).then(res => res.json())
    );
    const allLessonContents = await Promise.all(lessonFilePromises);

    allLessonContents.forEach((content, index) => {
        const lessonId = lessons[index].id;
        content.forEach(sentence => {
            sentenceToLessonMap.set(sentence.id, lessonId);
        });
    });

    const allStats = await getAllStats();
    if (allStats.length === 0) {
        return { 
            globalStats: { totalSentences: 0, understoodSentences: 0 },
            lessonCategories: { easy: 0, medium: 0, hard: 0 },
            totalLessons: lessons.length
        };
    }

    const globalStats = {
        totalSentences: allStats.length,
        understoodSentences: 0,
    };

    const lessonData = {}; 

    allStats.forEach(stat => {
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

    // 4. UPDATE THIS SECTION: Categorize lessons AND save the results to the DB
    const lessonCategories = { easy: 0, medium: 0, hard: 0 };
    // 2. NEW: Create an array to hold our database update promises.
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

        // 3. NEW: Add the database update operation to our promise array.
        // This will save an object like { lessonId: 'lesson-1', difficulty: 'hard', avgRatio: 0.8 }
        progressUpdatePromises.push(
            updateLessonProgress({ lessonId, difficulty, avgRatio })
        );
    });
    
    // 4. NEW: Wait for all the database updates to complete before continuing.
    await Promise.all(progressUpdatePromises);
    console.log("Lesson progress saved to DB.");

    console.log("Processing complete.");
    return {
        globalStats,
        lessonCategories,
        totalLessons: lessons.length
    };
}

// --- renderDashboard function (No changes here) ---
function renderDashboard(data) {
    const { globalStats, lessonCategories, totalLessons } = data;

    understoodCountEl.textContent = `${globalStats.understoodSentences} / ${globalStats.totalSentences}`;
    totalCountEl.textContent = globalStats.totalSentences;

    easyLessonsEl.textContent = `${lessonCategories.easy} / ${totalLessons}`;
    mediumLessonsEl.textContent = `${lessonCategories.medium} / ${totalLessons}`;
    hardLessonsEl.textContent = `${lessonCategories.hard} / ${totalLessons}`;

    const radius = progressCircleBar.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const progressPercentage = globalStats.totalSentences > 0 ? globalStats.understoodSentences / globalStats.totalSentences : 0;
    const offset = circumference - (progressPercentage * circumference);

    progressCircleBar.style.strokeDasharray = circumference;
    progressCircleBar.style.strokeDashoffset = offset;

    const understoodCount = data.globalStats.understoodSentences;
    const finalGoal = LANGUAGE_LEVELS[LANGUAGE_LEVELS.length - 1].sentences;

    // --- 1. Update the overall progress bar width ---
    const overallProgressPercent = Math.min((understoodCount / finalGoal) * 100, 100);
    journeyTrackProgressEl.style.width = `${overallProgressPercent}%`;

    // --- 2. Determine current and next levels & update milestone states ---
    let nextLevel = null;
    let prevLevelSentences = 0;

    LANGUAGE_LEVELS.forEach((levelInfo, index) => {
        const milestoneEl = document.querySelector(`.milestone[data-level="${levelInfo.level}"]`);
        milestoneEl.classList.remove('achieved', 'in-progress'); // Reset states

        if (understoodCount >= levelInfo.sentences) {
            milestoneEl.classList.add('achieved');
            prevLevelSentences = levelInfo.sentences;
        } else if (!nextLevel) {
            // This is the first level not yet achieved
            nextLevel = levelInfo;
            milestoneEl.classList.add('in-progress');
        }
    });

    // --- 3. Update the contextual progress text ---
    if (nextLevel) {
        journeyProgressTextEl.innerHTML = 
            `Progress to <span>${nextLevel.level}</span>: <span>${understoodCount.toLocaleString()}</span> / ${nextLevel.sentences.toLocaleString()} sentences`;
    } else {
        // User has achieved the highest level
        journeyProgressTextEl.innerHTML = 
            `Congratulations! You've reached the <span>C2</span> level with <span>${understoodCount.toLocaleString()}</span> understood sentences.`;
    }
}

// --- Start the process when the script loads (No changes here) ---
initializeDashboard();