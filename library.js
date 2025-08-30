// library.js

// Import all the database functions we will need
import { initDB, getAllDownloadedPacks, saveDownloadedPack, deleteDownloadedPack } from './db.js';

// --- State Management ---
const LANGUAGE_STORAGE_KEY = 'languageLearner-selectedLanguage';
let currentLanguageCode = null;
let allLessons = []; // To store the lesson details from lessons.json

// --- DOM Element Selection ---
const packsContainer = document.getElementById('packs-container');
const loadingIndicator = document.getElementById('loading-indicator');
const headerTitle = document.querySelector('.library-header h1');
const refreshBtn = document.getElementById('refresh-btn');

document.addEventListener('DOMContentLoaded', () => {
    initializeLibrary();

    // Listen for messages from the service worker
    navigator.serviceWorker.addEventListener('message', event => {
        if (!event.data || !event.data.type) return;

        const { type, payload } = event.data;

        switch (type) {
            case 'DOWNLOAD_PROGRESS':
                updateDownloadProgress(payload.packId, payload.progress);
                break;
            case 'DOWNLOAD_COMPLETE':
                handleDownloadComplete(payload.packId);
                break;
            case 'DOWNLOAD_ERROR':
                handleDownloadError(payload.packId, payload.message);
                break;
            case 'DELETE_COMPLETE':
                handleDeleteComplete(payload.packId);
                break;
        }
    });

    // Refresh button event listener
    refreshBtn.addEventListener('click', () => {
        console.log("User triggered refresh.");
        initializeLibrary(); // Just re-run the initialization!
    });

});

/**
 * Main function to initialize the Library screen.
 */
async function initializeLibrary() {
    showLoading(true);
    try {
        await initDB();

        // 1. Get the current language from localStorage
        currentLanguageCode = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (!currentLanguageCode) {
            displayError("Please select a language in the main app first.");
            return;
        }
        
        // Fetch language details to show the name in the header
        const languagesResponse = await fetch('data/languages.json');
        const availableLanguages = await languagesResponse.json();
        const currentLangDetails = availableLanguages.find(l => l.code === currentLanguageCode);
        if (currentLangDetails) {
            headerTitle.textContent = `${currentLangDetails.name} Library`;
        }

        // 2. Fetch all necessary data in parallel
        const [packs, downloadedPacks, lessons] = await Promise.all([
            fetch(`data/${currentLanguageCode}/packs.json`).then(res => res.json()),
            getAllDownloadedPacks(),
            fetch(`data/${currentLanguageCode}/lessons.json`).then(res => res.json())
        ]);
        
        allLessons = lessons; // Store lessons for later use

        // 3. Combine the data: add a 'isDownloaded' flag to each pack
        const downloadedPackIds = new Set(downloadedPacks.map(p => p.id));
        const packsWithStatus = packs.map(pack => ({
            ...pack,
            isDownloaded: downloadedPackIds.has(pack.id)
        }));

        // 4. Pass the combined data to the rendering function (to be built next)
        renderPacks(packsWithStatus);

    } catch (error) {
        console.error("Error initializing library:", error);
        displayError("Could not load the library. Please try again.");
    } finally {
        showLoading(false);
    }
}

/**
 * Shows or hides the main loading indicator.
 * @param {boolean} isLoading 
 */
function showLoading(isLoading) {
    if (isLoading) {
        packsContainer.innerHTML = ''; // Clear previous content
        loadingIndicator.classList.add('visible');
    } else {
        loadingIndicator.classList.remove('visible');
    }
}

/**
 * Displays an error message in the main container.
 * @param {string} message 
 */
function displayError(message) {
    packsContainer.innerHTML = `<p class="error-message">${message}</p>`;
    showLoading(false);
}

/**
 * Renders the pack cards on the screen.
 * @param {Array<object>} packs - The array of pack objects with status.
 */
function renderPacks(packs) {
    if (packs.length === 0) {
        packsContainer.innerHTML = `<p>No lesson packs available for this language yet.</p>`;
        return;
    }

    // Generate the HTML for all cards
    packsContainer.innerHTML = packs.map(pack => {
        // Determine the initial state of the action button
        let buttonHtml;
        if (pack.isDownloaded) {
            buttonHtml = `
                <button class="action-btn downloaded" data-pack-id="${pack.id}" disabled>
                    <span class="btn-text">Downloaded</span>
                    <span class="btn-icon">✓</span>
                </button>
                <button class="delete-btn" data-pack-id="${pack.id}">Delete</button>
            `;
        } else if (pack.price > 0) {
            buttonHtml = `
                <button class="action-btn paid" data-pack-id="${pack.id}">
                    <span class="btn-text">$${pack.price.toFixed(2)}</span>
                    <span class="btn-icon">🛒</span>
                </button>
            `;
        } else { // Free pack
            buttonHtml = `
                <button class="action-btn download" data-pack-id="${pack.id}">
                    <span class="btn-text">Get</span>
                    <span class="btn-icon">📥</span>
                </button>
            `;
        }

        // Return the full HTML string for one card
        return `
            <div class="pack-card glass-panel" id="pack-${pack.id}">
                <div class="card-content">
                    <h3>${pack.title}</h3>
                    <p class="card-description">${pack.description}</p>
                    <p class="card-info">${pack.lessons.length} Lessons</p>
                </div>
                <div class="card-action">
                    ${buttonHtml}
                </div>
            </div>
        `;
    }).join('');

    addEventListenersToCards();
}

/**
 * Adds event listeners to the dynamically created pack cards.
 */
function addEventListenersToCards() {
    packsContainer.addEventListener('click', event => {
        const target = event.target;

        // Check if a download/paid button was clicked
        if (target.matches('.action-btn.download, .action-btn.paid')) {
            const packId = target.dataset.packId;
            handleDownloadClick(packId);
        }

        // Check if a delete button was clicked
        if (target.matches('.delete-btn')) {
            const packId = target.dataset.packId;
            handleDeleteClick(packId);
        }
    });
}

/**
 * Handles the click on a download or purchase button.
 * @param {string} packId 
 */
async function handleDownloadClick(packId) {
    console.log(`User wants to download pack: ${packId}`);

    // Find the full pack data from the original packs array
    const packsResponse = await fetch(`data/${currentLanguageCode}/packs.json`);
    const allPacks = await packsResponse.json();
    const packToDownload = allPacks.find(p => p.id === packId);

    if (!packToDownload) {
        console.error("Could not find pack data for ID:", packId);
        return;
    }
    
    // --- MONETIZATION HOOK ---
    // In the future, if packToDownload.price > 0, you would trigger
    // your payment processing logic here. For now, we'll proceed directly.
    if (packToDownload.price > 0) {
        alert(`Monetization flow for "${packToDownload.title}" would start here.`);
        // In a real app, you'd wait for a successful payment callback
        // before proceeding with the download.
    }

    // --- Prepare file list for the service worker ---
    const urlsToCache = [];
    // Always include the main lesson manifest
    urlsToCache.push(`data/${currentLanguageCode}/lessons.json`);

    packToDownload.lessons.forEach(lessonId => {
        const lesson = allLessons.find(l => l.id === lessonId);
        if (lesson) {
            urlsToCache.push(`data/${currentLanguageCode}/${lesson.path}${lesson.lessonFile}`);
            urlsToCache.push(`data/${currentLanguageCode}/${lesson.path}${lesson.audioFile}`);
        }
    });

    // --- Send the command to the service worker ---
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'DOWNLOAD_PACK',
            payload: { packId, urls: urlsToCache, packData: packToDownload }
        });
        
        // We will update the UI to a "downloading" state in the next step
        // For now, we just disable the button to prevent multiple clicks
        const button = document.querySelector(`.action-btn[data-pack-id="${packId}"]`);
        if (button) {
            button.disabled = true;
            button.querySelector('.btn-text').textContent = 'Starting...';
        }
    } else {
        console.error("Service worker is not in control. Cannot download.");
        alert("Error: Cannot start download. Please refresh the page and try again.");
    }
}


/**
 * Handles the click on a delete button.
 * @param {string} packId 
 */
async function handleDeleteClick(packId) {
    // Optional: Ask for confirmation
    if (!confirm("Are you sure you want to delete this pack to free up space?")) {
        return;
    }
    
    console.log(`User wants to delete pack: ${packId}`);

    // Logic is very similar to download, but for deletion
    const packsResponse = await fetch(`data/${currentLanguageCode}/packs.json`);
    const allPacks = await packsResponse.json();
    const packToDelete = allPacks.find(p => p.id === packId);
    
    if (!packToDelete) {
        console.error("Could not find pack data for ID:", packId);
        return;
    }

    const urlsToDelete = [];
    // We don't delete the main lessons.json, as other packs might need it.
    // A more advanced system could use reference counting, but this is safer.
    packToDelete.lessons.forEach(lessonId => {
        const lesson = allLessons.find(l => l.id === lessonId);
        if (lesson) {
            urlsToDelete.push(`data/${currentLanguageCode}/${lesson.path}${lesson.lessonFile}`);
            urlsToDelete.push(`data/${currentLanguageCode}/${lesson.path}${lesson.audioFile}`);
        }
    });

    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'DELETE_PACK',
            payload: { packId, urls: urlsToDelete }
        });

        // We will update the UI in the next step based on SW feedback
        const card = document.getElementById(`pack-${packId}`);
        if(card) {
            card.style.opacity = '0.5'; // Visually indicate it's being processed
        }
    }
}

/**
 * Updates the UI of a pack card to show download progress.
 * @param {string} packId 
 * @param {number} progress - The progress percentage (0-100).
 */
function updateDownloadProgress(packId, progress) {
    const card = document.getElementById(`pack-${packId}`);
    if (!card) return;

    let button = card.querySelector('.action-btn');
    // Ensure the button is in the 'downloading' state
    if (!button.classList.contains('downloading')) {
        button.className = 'action-btn downloading';
        button.disabled = true;
        button.innerHTML = `
            <div class="progress-bar"></div>
            <span class="btn-text">Downloading... 0%</span>
        `;
    }

    // Update the progress bar width and text
    card.querySelector('.progress-bar').style.width = `${progress}%`;
    card.querySelector('.btn-text').textContent = `Downloading... ${progress}%`;
}

/**
 * Updates the UI of a pack card to show completion.
 * @param {string} packId 
 */
async function handleDownloadComplete(packId) {
    const card = document.getElementById(`pack-${packId}`);
    if (!card) return;

    // We need the full pack data to save to the DB
    const packsResponse = await fetch(`data/${currentLanguageCode}/packs.json`);
    const allPacks = await packsResponse.json();
    const downloadedPack = allPacks.find(p => p.id === packId);

    if (downloadedPack) {
        // Save the pack's info to IndexedDB to remember it's downloaded
        await saveDownloadedPack(downloadedPack);
    }
    
    const actionContainer = card.querySelector('.card-action');
    actionContainer.innerHTML = `
        <button class="action-btn downloaded" data-pack-id="${packId}" disabled>
            <span class="btn-text">Downloaded</span>
            <span class="btn-icon">✓</span>
        </button>
        <button class="delete-btn" data-pack-id="${packId}">Delete</button>
    `;
}

/**
 * Updates the UI of a pack card to show an error.
 * @param {string} packId 
 * @param {string} message - The error message.
 */
function handleDownloadError(packId, message) {
    const card = document.getElementById(`pack-${packId}`);
    if (!card) return;
    
    console.error(`Download failed for ${packId}:`, message);

    const actionContainer = card.querySelector('.card-action');
    actionContainer.innerHTML = `
        <button class="action-btn error" data-pack-id="${packId}">
            <span class="btn-text">Retry</span>
            <span class="btn-icon">!</span>
        </button>
    `;
    // The existing 'paid' or 'download' class needs to be re-added
    // for the event listener to pick it up on a retry click.
    const button = actionContainer.querySelector('button');
    // This is a simplification; a real app might check the price again.
    button.classList.add('download'); 
}


/**
 * Updates the UI after a pack is successfully deleted.
 * @param {string} packId 
 */
async function handleDeleteComplete(packId) {
    // Remove the pack from our IndexedDB store
    await deleteDownloadedPack(packId);

    // To refresh the UI, we can simply re-initialize the library view
    console.log("Deletion complete. Re-rendering library.");
    initializeLibrary();
}