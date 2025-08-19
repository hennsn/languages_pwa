// db.js

const DB_NAME = 'languageLearnerStats';
const DB_VERSION = 1;
const STORE_NAME = 'sentenceStats';

let db; // This variable will hold the database connection.

/**
 * Initializes the IndexedDB database.
 * Creates the object store if it doesn't exist.
 * @returns {Promise<IDBDatabase>} A promise that resolves when the DB is ready.
 */
function initDB() {
    return new Promise((resolve, reject) => {
        // Prevent re-initialization
        if (db) {
            return resolve(db);
        }
        console.log('[DB] Initializing database...');

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // This event runs only when the DB version changes or is first created.
        request.onupgradeneeded = (event) => {
            const dbInstance = event.target.result;
            console.log('[DB] Upgrade needed. Creating object store...');
            // The object store is like a table. We'll store sentence stats here.
            // We use 'sentence_id' as the unique key for each record.
            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                dbInstance.createObjectStore(STORE_NAME, { keyPath: 'sentence_id' });
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

/**
 * Retrieves a single sentence's statistics from the database.
 * @param {string} sentenceId The unique ID of the sentence.
 * @returns {Promise<object|undefined>} A promise that resolves with the stat object or undefined if not found.
 */
function getSentenceStat(sentenceId) {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject('Database not initialized. Call initDB() first.');
        }
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(sentenceId);

        request.onsuccess = () => {
            resolve(request.result); // request.result will be the object or undefined
        };

        request.onerror = (event) => {
            console.error('[DB] Error fetching stat:', event.target.error);
            reject('Error fetching stat');
        };
    });
}

/**
 * Creates or updates a sentence's statistics in the database.
 * @param {object} statObject The object to save (e.g., { sentence_id: 'l1-s1', ... }).
 * @returns {Promise<string>} A promise that resolves with the key of the saved record.
 */
function updateSentenceStat(statObject) {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject('Database not initialized. Call initDB() first.');
        }
        // Use a 'readwrite' transaction to allow changes.
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        // .put() is very convenient: it creates a new record or updates an existing one.
        const request = store.put(statObject);

        request.onsuccess = () => {
            resolve(request.result); // request.result is the key of the record
        };

        request.onerror = (event) => {
            console.error('[DB] Error updating stat:', event.target.error);
            reject('Error updating stat');
        };
    });
}

/**
 * Retrieves all sentence statistics from the database.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of all stat objects.
 */
function getAllStats() {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject('Database not initialized. Call initDB() first.');
        }
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        // getAll() is a convenient modern method to get all records.
        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result); // request.result will be an array of all objects
        };

        request.onerror = (event) => {
            console.error('[DB] Error fetching all stats:', event.target.error);
            reject('Error fetching all stats');
        };
    });
}


// IMPORTANT: Add the new function to the export list at the bottom of the file.
export { initDB, getSentenceStat, updateSentenceStat, getAllStats }; // <-- UPDATE THIS LINE