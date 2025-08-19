// dashboard.js

import { initDB, getAllStats } from './db.js';

// --- DOM Element Selection ---
const understoodCountEl = document.getElementById('understood-count');
const totalCountEl = document.getElementById('total-count');
const easyLessonsEl = document.getElementById('easy-lessons');
const mediumLessonsEl = document.getElementById('medium-lessons');
const hardLessonsEl = document.getElementById('hard-lessons');
const progressCircleBar = document.querySelector('.progress-circle-bar');
const loadingSpinner = document.getElementById('loading-spinner');

/**
 * Main function to initialize and populate the dashboard.
 */
async function initializeDashboard() {
    try {
        await initDB();
        const processedData = await fetchAndProcessStats();
        renderDashboard(processedData);
    } catch (error) {
        console.error("Failed to initialize dashboard:", error);
        // Display an error message to the user
        document.querySelector('.dashboard-container').innerHTML = 
            `<p style="color: var(--accent-hard); padding: 20px;">Could not load dashboard data. Please try again later.</p>`;
    } finally {
        // Hide the loading spinner
        loadingSpinner.classList.add('hidden');
    }
}

/**
 * Fetches all necessary data and calculates statistics.
 * @returns {Promise<object>} A promise that resolves with the calculated stats.
 */
async function fetchAndProcessStats() {
    console.log("Fetching and processing stats...");

    // 1. Create a map of sentence IDs to lesson IDs
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

    // 2. Get all sentence stats from IndexedDB
    const allStats = await getAllStats();
    if (allStats.length === 0) {
        return { // Return default empty state
            globalStats: { totalSentences: 0, understoodSentences: 0 },
            lessonCategories: { easy: 0, medium: 0, hard: 0 },
            totalLessons: lessons.length
        };
    }

    // 3. Aggregate and calculate stats
    const globalStats = {
        totalSentences: allStats.length,
        understoodSentences: 0,
    };

    const lessonData = {}; // { "lesson-1": { ratios: [0.1, 0.5], ... } }

    allStats.forEach(stat => {
        const ratio = stat.times_listened > 0 ? stat.times_explained / stat.times_listened : 0;
        
        // Calculate global stats
        if (ratio < 0.3) {
            globalStats.understoodSentences++;
        }

        // Aggregate lesson stats
        const lessonId = sentenceToLessonMap.get(stat.sentence_id);
        if (lessonId) {
            if (!lessonData[lessonId]) {
                lessonData[lessonId] = { ratios: [] };
            }
            lessonData[lessonId].ratios.push(ratio);
        }
    });

    // 4. Categorize lessons
    const lessonCategories = { easy: 0, medium: 0, hard: 0 };
    Object.values(lessonData).forEach(data => {
        const avgRatio = data.ratios.reduce((a, b) => a + b, 0) / data.ratios.length;
        if (avgRatio < 0.33) {
            lessonCategories.easy++;
        } else if (avgRatio >= 0.33 && avgRatio < 0.66) {
            lessonCategories.medium++;
        } else {
            lessonCategories.hard++;
        }
    });

    console.log("Processing complete.");
    return {
        globalStats,
        lessonCategories,
        totalLessons: lessons.length
    };
}

/**
 * Renders the processed data onto the dashboard UI.
 * @param {object} data The processed statistics object.
 */
function renderDashboard(data) {
    const { globalStats, lessonCategories, totalLessons } = data;

    // Render global stats text
    understoodCountEl.textContent = `${globalStats.understoodSentences} / ${globalStats.totalSentences}`;
    totalCountEl.textContent = globalStats.totalSentences;

    // Render lesson category stats
    easyLessonsEl.textContent = `${lessonCategories.easy} / ${totalLessons}`;
    mediumLessonsEl.textContent = `${lessonCategories.medium} / ${totalLessons}`;
    hardLessonsEl.textContent = `${lessonCategories.hard} / ${totalLessons}`;

    // Render the SVG progress circle
    const radius = progressCircleBar.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    const progressPercentage = globalStats.totalSentences > 0 ? globalStats.understoodSentences / globalStats.totalSentences : 0;
    const offset = circumference - (progressPercentage * circumference);

    progressCircleBar.style.strokeDasharray = circumference;
    progressCircleBar.style.strokeDashoffset = offset;
}

// --- Start the process when the script loads ---
initializeDashboard();