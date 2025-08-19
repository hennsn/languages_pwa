// db.js

const DB_NAME = 'languageLearnerStats';
// 1. UPDATE VERSION: Increment the version number from 1 to 2.
// This is the essential trigger for the 'onupgradeneeded' event to run.
const DB_VERSION = 2;
const STORE_NAME = 'sentenceStats';
// 2. NEW CONSTANT: Define the name for our new object store.
const LESSON_PROGRESS_STORE = 'lessonProgress';

let db; // This variable will hold the database connection.

/**
 * Initializes the IndexedDB database.
 * Creates the object store if it doesn't exist.
 * @returns {Promise<IDBDatabase>} A promise that resolves when the DB is ready.
 */
function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }
        console.log('[DB] Initializing database...');

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const dbInstance = event.target.result;
            console.log('[DB] Upgrade needed. Creating/updating object stores...');

            // Keep the existing logic for the sentenceStats store
            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                dbInstance.createObjectStore(STORE_NAME, { keyPath: 'sentence_id' });
            }
            
            // 3. NEW LOGIC: Add the new object store for lesson progress.
            // This code only runs because we incremented DB_VERSION.
            if (!dbInstance.objectStoreNames.contains(LESSON_PROGRESS_STORE)) {
                // We use 'lessonId' as the unique key for this store.
                dbInstance.createObjectStore(LESSON_PROGRESS_STORE, { keyPath: 'lessonId' });
            }
        };

        request.onerror = (event) => {
            console.error('[DB] Database error:', event.target.error);
            reject(`Database error: ${event.target.error}`);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('[DB] Database opened successfully.');
            resolve(db);
        };
    });
}

// --- No changes to getSentenceStat or updateSentenceStat ---

function getSentenceStat(sentenceId) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('Database not initialized. Call initDB() first.');
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(sentenceId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('Error fetching stat: ' + event.target.error);
    });
}

function updateSentenceStat(statObject) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('Database not initialized. Call initDB() first.');
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(statObject);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('Error updating stat: ' + event.target.error);
    });
}

// --- No changes to getAllStats ---

function getAllStats() {
    return new Promise((resolve, reject) => {
        if (!db) return reject('Database not initialized. Call initDB() first.');
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('Error fetching all stats: ' + event.target.error);
    });
}


// 4. NEW FUNCTIONS: Add two new helper functions to interact with our new store.

/**
 * Creates or updates a lesson's progress/difficulty data.
 * @param {object} progressObject The object to save (e.g., { lessonId: 'l1', difficulty: 'hard' }).
 * @returns {Promise<string>}
 */
function updateLessonProgress(progressObject) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('Database not initialized. Call initDB() first.');
        const transaction = db.transaction([LESSON_PROGRESS_STORE], 'readwrite');
        const store = transaction.objectStore(LESSON_PROGRESS_STORE);
        const request = store.put(progressObject);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('Error updating lesson progress: ' + event.target.error);
    });
}

/**
 * Retrieves all lesson progress records.
 * @returns {Promise<Array<object>>}
 */
function getAllLessonProgress() {
    return new Promise((resolve, reject) => {
        if (!db) return reject('Database not initialized. Call initDB() first.');
        const transaction = db.transaction([LESSON_PROGRESS_STORE], 'readonly');
        const store = transaction.objectStore(LESSON_PROGRESS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('Error fetching all lesson progress: ' + event.target.error);
    });
}

// 5. UPDATE EXPORTS: Add the new functions to the export list.
export {
    initDB,
    getSentenceStat,
    updateSentenceStat,
    getAllStats,
    updateLessonProgress,
    getAllLessonProgress
};