// db.js

const DB_NAME = 'languageLearnerStats';
const DB_VERSION = 3;
const STORE_NAME = 'sentenceStats';
const LESSON_PROGRESS_STORE = 'lessonProgress';
const DOWNLOADED_PACKS_STORE = 'downloadedPacks';

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

            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                dbInstance.createObjectStore(STORE_NAME, { keyPath: 'sentence_id' });
            }
            
            if (!dbInstance.objectStoreNames.contains(LESSON_PROGRESS_STORE)) {
                // We use 'lessonId' as the unique key for this store.
                dbInstance.createObjectStore(LESSON_PROGRESS_STORE, { keyPath: 'lessonId' });
            }

            if (!dbInstance.objectStoreNames.contains(DOWNLOADED_PACKS_STORE)) {
                // We'll use the unique pack 'id' as the key.
                dbInstance.createObjectStore(DOWNLOADED_PACKS_STORE, { keyPath: 'id' });
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

/**
 * Saves a record of a downloaded pack.
 * @param {object} packData The pack object to save (e.g., { id: 'fr-pack-1', ... }).
 * @returns {Promise<string>}
 */
function saveDownloadedPack(packData) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('Database not initialized.');
        const transaction = db.transaction([DOWNLOADED_PACKS_STORE], 'readwrite');
        const store = transaction.objectStore(DOWNLOADED_PACKS_STORE);
        const request = store.put(packData);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('Error saving pack: ' + event.target.error);
    });
}

/**
 * Retrieves all records of downloaded packs.
 * @returns {Promise<Array<object>>}
 */
function getAllDownloadedPacks() {
    return new Promise((resolve, reject) => {
        if (!db) return reject('Database not initialized.');
        const transaction = db.transaction([DOWNLOADED_PACKS_STORE], 'readonly');
        const store = transaction.objectStore(DOWNLOADED_PACKS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('Error fetching all packs: ' + event.target.error);
    });
}

/**
 * Deletes a record of a downloaded pack.
 * @param {string} packId The ID of the pack to delete.
 * @returns {Promise<void>}
 */
function deleteDownloadedPack(packId) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('Database not initialized.');
        const transaction = db.transaction([DOWNLOADED_PACKS_STORE], 'readwrite');
        const store = transaction.objectStore(DOWNLOADED_PACKS_STORE);
        const request = store.delete(packId);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject('Error deleting pack: ' + event.target.error);
    });
}


export {
    initDB,
    getSentenceStat,
    updateSentenceStat,
    getAllStats,
    updateLessonProgress,
    getAllLessonProgress,
    saveDownloadedPack,     
    getAllDownloadedPacks,  
    deleteDownloadedPack    
};