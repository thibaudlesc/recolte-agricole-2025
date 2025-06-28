// harvest.js - Mobile First Version

import { db, doc, updateDoc, onSnapshot, collection, addDoc, getDocs, query, where } from './firebase-config.js';

// --- DOM ELEMENT SELECTION ---
// Pages
const pageFieldList = document.getElementById('page-field-list');
const pageFieldDetails = document.getElementById('page-field-details');

// Field List Page
const cropFiltersContainer = document.getElementById('crop-filters-container');
const fieldListContainer = document.getElementById('field-list-container');

// Field Details Page
const detailsHeaderTitle = document.getElementById('details-header-title');
const backToListBtn = document.getElementById('back-to-list-btn');
const fieldInfoCards = document.getElementById('field-info-cards');
const trailersListContainer = document.getElementById('trailers-list');
const addTrailerFab = document.getElementById('add-trailer-fab');

// Bottom Navigation
const navFieldsBtn = document.getElementById('nav-fields');
const navSummaryBtn = document.getElementById('nav-summary');
const navExportBtn = document.getElementById('nav-export');

// Modals & Toast
const modalContainer = document.getElementById('modal-container');
const modalContent = document.getElementById('modal-content');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// --- GLOBAL STATE ---
let currentUser = null;
let harvestData = {};
let trailerNames = []; // Pour stocker les noms des bennes
let currentFieldKey = null;
let selectedCrops = [];
let unsubscribe;
let unsubscribeTrailerNames; // Pour le listener des noms de bennes
let onConfirmAction = null;
let currentPage = 'list';

// --- INITIALIZATION ---
export function initHarvestApp(user) {
    currentUser = user;
    if (unsubscribe) unsubscribe();
    if (unsubscribeTrailerNames) unsubscribeTrailerNames(); // Nettoyer l'ancien listener

    // Listener pour les données des parcelles
    const fieldsCollectionRef = collection(db, 'fields');
    unsubscribe = onSnapshot(fieldsCollectionRef, (snapshot) => {
        harvestData = {};
        snapshot.forEach(doc => {
            harvestData[doc.id] = { name: doc.id, ...doc.data() };
        });
        
        // Initial render based on current state
        if (currentPage === 'list') {
            displayCropFilters();
            displayFieldList();
        } else if (currentPage === 'details' && currentFieldKey) {
            displayFieldDetails(currentFieldKey);
        }

    }, (error) => {
        console.error("Firestore listener error:", error);
        showToast("Erreur de chargement des données.");
    });

    // Listener pour les noms de bennes
    const trailerNamesCollectionRef = collection(db, 'trailerNames');
    unsubscribeTrailerNames = onSnapshot(trailerNamesCollectionRef, (snapshot) => {
        trailerNames = [];
        snapshot.forEach(doc => {
            trailerNames.push({ id: doc.id, ...doc.data() });
        });
        // Trier par ordre alphabétique
        trailerNames.sort((a, b) => a.name.localeCompare(b.name));
    }, (error) => {
        console.error("Trailer names listener error:", error);
        showToast("Erreur de chargement des noms de bennes.");
    });


    setupEventListeners();
    navigateToPage('list');
}

// --- PAGE NAVIGATION ---
function navigateToPage(page, key = null) {
    currentPage = page;
    
    if (page === 'list') {
        currentFieldKey = null;
        pageFieldList.classList.remove('hidden');
        pageFieldDetails.classList.add('hidden');
        updateActiveNav('fields');
        displayCropFilters();
        displayFieldList();
    } else if (page === 'details' && key) {
        currentFieldKey = key;
        pageFieldList.classList.add('hidden');
        pageFieldDetails.classList.remove('hidden');
        updateActiveNav('fields');
        displayFieldDetails(key);
    }
}

// --- UI RENDERING ---

function displayCropFilters() {
    const crops = [...new Set(Object.values(harvestData).map(field => field.crop).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    cropFiltersContainer.innerHTML = '';

    const allButton = createFilterButton('Toutes', 'all', selectedCrops.length === 0);
    cropFiltersContainer.appendChild(allButton);

    crops.forEach(crop => {
        const button = createFilterButton(crop, crop, selectedCrops.includes(crop));
        cropFiltersContainer.appendChild(button);
    });
}

function displayFieldList() {
    fieldListContainer.innerHTML = '';
    const fieldKeys = Object.keys(harvestData)
        .filter(key => selectedCrops.length === 0 || selectedCrops.includes(harvestData[key].crop))
        .sort((a, b) => a.localeCompare(b));

    if (fieldKeys.length === 0) {
        fieldListContainer.innerHTML = `<p class="text-center text-gray-500 mt-8">Aucune parcelle à afficher.</p>`;
        return;
    }

    fieldKeys.forEach(key => {
        const field = harvestData[key];
        const { totalWeight } = calculateTotals(key);
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-200 active:scale-[0.98] transition-transform';
        card.dataset.key = key;
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-lg text-gray-800">${field.name}</h3>
                    <p class="text-sm text-gray-500">${field.crop || 'N/A'}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-lg text-green-600">${totalWeight.toLocaleString('fr-FR')} kg</p>
                    <p class="text-sm text-gray-500">${(field.size || 0).toLocaleString('fr-FR')} ha</p>
                </div>
            </div>
        `;
        card.addEventListener('click', () => navigateToPage('details', key));
        fieldListContainer.appendChild(card);
    });
}

function displayFieldDetails(fieldKey) {
    const field = harvestData[fieldKey];
    if (!field) {
        navigateToPage('list');
        return;
    }

    detailsHeaderTitle.textContent = field.name;

    // Render info cards
    const { totalWeight, yield: yieldValue, totalBaleCount } = calculateTotals(fieldKey);
    const isLinCrop = field.crop && field.crop.toLowerCase().includes('lin');

    let lastCardHTML = '';
    if (isLinCrop) {
        lastCardHTML = `<div class="bg-white p-3 rounded-xl shadow-sm text-center"><h3 class="text-xs font-medium text-gray-500">Total Bottes</h3><p class="mt-1 text-lg font-semibold">${totalBaleCount.toLocaleString('fr-FR')}</p></div>`;
    } else {
        lastCardHTML = `<div class="bg-white p-3 rounded-xl shadow-sm text-center"><h3 class="text-xs font-medium text-gray-500">Rendement</h3><p class="mt-1 text-lg font-semibold">${yieldValue.toFixed(2)} qx/ha</p></div>`;
    }

    fieldInfoCards.innerHTML = `
        <div class="bg-white p-3 rounded-xl shadow-sm text-center"><h3 class="text-xs font-medium text-gray-500">Culture</h3><p class="mt-1 text-lg font-semibold">${field.crop || 'N/A'}</p></div>
        <div class="bg-white p-3 rounded-xl shadow-sm text-center"><h3 class="text-xs font-medium text-gray-500">Surface</h3><p class="mt-1 text-lg font-semibold">${(field.size || 0).toLocaleString('fr-FR')} ha</p></div>
        <div class="bg-white p-3 rounded-xl shadow-sm text-center"><h3 class="text-xs font-medium text-gray-500">Poids Total</h3><p class="mt-1 text-lg font-semibold">${totalWeight.toLocaleString('fr-FR')} kg</p></div>
        ${lastCardHTML}
    `;

    // Render trailers list
    trailersListContainer.innerHTML = '';
    
    const allTrailersInField = field.trailers || [];
    const trailerNameCounters = {};
    const trailersWithSequentialNumber = allTrailersInField.map(t => {
        const name = t.trailerName || 'Benne';
        const count = (trailerNameCounters[name] || 0) + 1;
        trailerNameCounters[name] = count;
        return { ...t, displayNumber: count };
    });

    const visibleTrailers = trailersWithSequentialNumber
        .map((trailer, index) => ({ ...trailer, originalIndex: index }))
        .filter(trailer => 
            (trailer.empty !== null && trailer.empty > 0) ||
            trailer.fullBy === currentUser.uid
        );

    if (visibleTrailers.length === 0) {
        trailersListContainer.innerHTML = `<p class="text-center text-gray-500 mt-6">Aucune benne à afficher.</p>`;
    } else {
        [...visibleTrailers].reverse().forEach((trailer) => {
            const index = trailer.originalIndex;
            const netWeight = (trailer.full && trailer.empty) ? trailer.full - trailer.empty : '---';
            const isFinalized = trailer.empty !== null && trailer.empty > 0;
            const canFinalize = !isFinalized && trailer.fullBy === currentUser.uid;
            const displayName = `${trailer.trailerName || 'Benne'} #${trailer.displayNumber}`;
            const baleInfo = (typeof trailer.baleCount === 'number') ? `<p class="text-sm text-gray-500">Bottes: <span class="font-semibold">${trailer.baleCount}</span></p>` : '';

            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-xl shadow-sm border border-gray-200';
            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-sm text-gray-500 font-semibold">${displayName}</p>
                        <p class="font-bold text-xl text-gray-800">${typeof netWeight === 'number' ? netWeight.toLocaleString('fr-FR') : '??'} kg</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm">Plein: <span class="font-semibold">${trailer.full ? trailer.full.toLocaleString('fr-FR') : '---'}</span></p>
                        <p class="text-sm">Vide: <span class="font-semibold">${trailer.empty ? trailer.empty.toLocaleString('fr-FR') : '---'}</span></p>
                    </div>
                </div>
                ${baleInfo ? `<div class="mt-2 pt-2 border-t border-gray-100">${baleInfo}</div>` : ''}
                <div class="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    ${canFinalize ? `<button class="finalize-btn flex-1 bg-blue-500 text-white px-3 py-2 text-sm font-semibold rounded-lg" data-index="${index}">Finaliser</button>` : ''}
                    ${isFinalized ? `<span class="flex-1 text-center text-green-600 font-semibold text-sm">Terminé</span>` : ''}
                    ${!isFinalized && !canFinalize ? `<span class="flex-1 text-center text-yellow-600 font-semibold text-sm">En attente</span>` : ''}

                    ${isFinalized ? `
                    <button class="edit-btn p-2 text-gray-500 hover:text-blue-600 ml-auto" data-index="${index}" title="Modifier"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg></button>
                    <button class="delete-btn p-2 text-gray-500 hover:text-red-600" data-index="${index}" title="Supprimer"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
                    ` : ''}
                </div>
            `;
            trailersListContainer.appendChild(card);
        });
    }
}


// --- MODAL HANDLING ---
function openModal(content, type) {
    modalContent.innerHTML = content;
    modalContainer.classList.remove('hidden');
    modalContainer.classList.remove('modal-leave');
    modalContainer.classList.add('modal-enter');
    
    if (type === 'weight') {
        document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
        document.getElementById('modal-confirm-btn').addEventListener('click', handleConfirmWeight);
        if (document.getElementById('add-trailer-name-btn')) {
            document.getElementById('add-trailer-name-btn').addEventListener('click', showAddTrailerNameModal);
        }
    } else if (type === 'edit') {
        document.getElementById('edit-modal-cancel-btn').addEventListener('click', closeModal);
        document.getElementById('edit-modal-save-btn').addEventListener('click', handleSaveEdit);
    } else if (type === 'confirmation') {
        document.getElementById('confirmation-cancel-btn').addEventListener('click', closeModal);
        document.getElementById('confirmation-confirm-btn').addEventListener('click', () => {
             if (typeof onConfirmAction === 'function') onConfirmAction();
             closeModal();
        });
    } else if (type === 'summary') {
         document.getElementById('global-results-close-btn').addEventListener('click', closeModal);
    } else if (type === 'addTrailerName') {
        document.getElementById('add-trailer-name-cancel-btn').addEventListener('click', () => showWeightModal('full'));
        document.getElementById('add-trailer-name-confirm-btn').addEventListener('click', handleAddNewTrailerName);
    }
}

function closeModal() {
    modalContainer.classList.add('modal-leave');
    setTimeout(() => {
        modalContainer.classList.add('hidden');
        modalContent.innerHTML = '';
        onConfirmAction = null;
    }, 300);
}

function showWeightModal(mode, index = -1) {
    const field = harvestData[currentFieldKey];
    const isLinCrop = field && field.crop && field.crop.toLowerCase().includes('lin');
    
    let content = '';
    if (mode === 'full') {
        const trailerOptions = trailerNames.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
        const baleInputHTML = isLinCrop ? `
            <div>
                <label for="bale-count-input" class="block text-sm font-medium text-gray-700 mb-1">Nombre de bottes</label>
                <input type="number" inputmode="numeric" id="bale-count-input" class="w-full p-4 border-2 border-gray-300 rounded-lg text-xl text-center" placeholder="0">
            </div>` : '';

        content = `
            <h3 class="text-xl font-semibold mb-6 text-center">Nouvelle benne pleine</h3>
            <div class="space-y-4">
                <div>
                    <label for="trailer-name-select" class="block text-sm font-medium text-gray-700 mb-1">Nom de la benne</label>
                    <div class="flex items-center gap-2">
                        <select id="trailer-name-select" class="w-full p-3 border-2 border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-green-500 transition">
                            <option value="">Sélectionner une benne...</option>
                            ${trailerOptions}
                        </select>
                        <button id="add-trailer-name-btn" class="p-3 bg-gray-200 rounded-lg hover:bg-gray-300 transition shrink-0">
                            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        </button>
                    </div>
                </div>
                <div>
                    <label for="weight-input" class="block text-sm font-medium text-gray-700 mb-1">Poids plein (kg)</label>
                    <input type="number" inputmode="numeric" id="weight-input" data-mode="full" class="w-full p-4 border-2 border-gray-300 rounded-lg text-xl text-center focus:ring-2 focus:ring-green-500 transition" placeholder="0 kg">
                </div>
                ${baleInputHTML}
            </div>
            <p id="weight-modal-error" class="text-red-500 text-sm hidden text-center mt-2"></p>
            <div class="mt-8 grid grid-cols-2 gap-4">
                <button id="modal-cancel-btn" class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">Annuler</button>
                <button id="modal-confirm-btn" class="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition">Valider</button>
            </div>`;
    } else { // mode === 'empty'
        const title = 'Finaliser : Poids à vide';
        content = `
            <h3 class="text-xl font-semibold mb-6 text-center">${title}</h3>
            <input type="number" inputmode="numeric" id="weight-input" data-mode="empty" data-index="${index}" class="w-full p-4 border-2 border-gray-300 rounded-lg text-xl text-center" placeholder="0 kg">
            <p id="weight-modal-error" class="text-red-500 text-sm hidden text-center mt-2"></p>
            <div class="mt-8 grid grid-cols-2 gap-4">
                <button id="modal-cancel-btn" class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg">Annuler</button>
                <button id="modal-confirm-btn" class="px-6 py-3 bg-green-600 text-white font-bold rounded-lg">Valider</button>
            </div>`;
    }
    openModal(content, 'weight');
}

function showEditModal(index) {
    const allTrailersInField = harvestData[currentFieldKey].trailers || [];
    const trailerNameCounters = {};
    const trailersWithSequentialNumber = allTrailersInField.map(t => {
        const name = t.trailerName || 'Benne';
        const count = (trailerNameCounters[name] || 0) + 1;
        trailerNameCounters[name] = count;
        return { ...t, displayNumber: count };
    });

    const trailer = trailersWithSequentialNumber[index];
    const displayName = `${trailer.trailerName || 'Benne'} #${trailer.displayNumber}`;
    const baleInfo = (typeof trailer.baleCount === 'number') ? `<p class="text-sm font-medium text-gray-600 mt-1">Bottes: <span class="font-bold text-gray-800">${trailer.baleCount}</span></p>` : '';
    
    const content = `
        <h3 class="text-xl font-semibold mb-6 text-center">Modifier la pesée</h3>
        <div class="mb-4 bg-gray-100 p-3 rounded-lg text-center">
            <p class="text-sm font-medium text-gray-600">Benne</p>
            <p class="text-lg font-bold text-gray-800">${displayName}</p>
            ${baleInfo}
        </div>
        <div class="space-y-4">
            <div>
                <label for="edit-weight-full" class="block text-sm font-medium text-gray-700">Poids Plein (kg)</label>
                <input type="number" inputmode="numeric" id="edit-weight-full" data-index="${index}" value="${trailer.full || ''}" class="mt-1 w-full p-3 border-2 border-gray-300 rounded-lg text-lg text-center">
            </div>
            <div>
                <label for="edit-weight-empty" class="block text-sm font-medium text-gray-700">Poids Vide (kg)</label>
                <input type="number" inputmode="numeric" id="edit-weight-empty" value="${trailer.empty || ''}" ${trailer.empty === null ? 'disabled' : ''} class="mt-1 w-full p-3 border-2 border-gray-300 rounded-lg text-lg text-center disabled:bg-gray-100">
            </div>
            <p id="edit-modal-error" class="text-red-500 text-sm hidden text-center">Erreur de validation.</p>
        </div>
        <div class="mt-8 grid grid-cols-2 gap-4">
            <button id="edit-modal-cancel-btn" class="px-6 py-3 bg-gray-200 rounded-lg">Annuler</button>
            <button id="edit-modal-save-btn" class="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg">Enregistrer</button>
        </div>
    `;
    openModal(content, 'edit');
}

function showAddTrailerNameModal() {
    const content = `
        <h3 class="text-xl font-semibold mb-6 text-center">Ajouter une benne</h3>
        <input type="text" id="new-trailer-name-input" class="w-full p-4 border-2 border-gray-300 rounded-lg text-lg text-center" placeholder="Nom de la benne">
        <p id="add-trailer-name-error" class="text-red-500 text-sm hidden text-center mt-2"></p>
        <div class="mt-8 grid grid-cols-2 gap-4">
            <button id="add-trailer-name-cancel-btn" class="px-6 py-3 bg-gray-200 rounded-lg">Annuler</button>
            <button id="add-trailer-name-confirm-btn" class="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg">Ajouter</button>
        </div>
    `;
    openModal(content, 'addTrailerName');
}

function showConfirmationModal(message, onConfirm) {
    onConfirmAction = onConfirm;
    const content = `
        <div class="text-center">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg class="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mt-5">Confirmer l'action</h3>
            <p class="text-sm text-gray-600 mt-2">${message}</p>
        </div>
        <div class="mt-6 grid grid-cols-2 gap-4">
            <button id="confirmation-cancel-btn" class="px-6 py-3 bg-gray-200 rounded-lg">Annuler</button>
            <button id="confirmation-confirm-btn" class="px-6 py-3 bg-red-600 text-white font-bold rounded-lg">Confirmer</button>
        </div>
    `;
    openModal(content, 'confirmation');
}


// --- EVENT HANDLERS & ACTIONS ---
async function handleConfirmWeight() {
    const weightInput = document.getElementById('weight-input');
    const errorEl = document.getElementById('weight-modal-error');
    const weight = parseInt(weightInput.value);
    const mode = weightInput.dataset.mode;
    const index = parseInt(weightInput.dataset.index);

    if (isNaN(weight) || weight <= 0) {
        errorEl.textContent = "Veuillez entrer un poids valide.";
        errorEl.classList.remove('hidden');
        return;
    }
    errorEl.classList.add('hidden');

    const field = harvestData[currentFieldKey];
    if (mode === 'full') {
        const trailerSelect = document.getElementById('trailer-name-select');
        const baleCountInput = document.getElementById('bale-count-input');
        const trailerName = trailerSelect.value;
        
        let baleCount = null;
        if (baleCountInput && baleCountInput.value !== '') {
            baleCount = parseInt(baleCountInput.value);
        }

        if (!trailerName) {
            errorEl.textContent = "Veuillez sélectionner un nom de benne.";
            errorEl.classList.remove('hidden');
            return;
        }
        
        if (baleCount !== null && (isNaN(baleCount) || baleCount < 0)) {
            errorEl.textContent = "Veuillez entrer un nombre de bottes valide.";
            errorEl.classList.remove('hidden');
            return;
        }

        const newTrailer = { 
            full: weight, 
            empty: null, 
            fullBy: currentUser.uid, 
            fullAt: new Date(), 
            emptyBy: null, 
            emptyAt: null, 
            trailerName: trailerName,
        };

        if (baleCount !== null) {
            newTrailer.baleCount = baleCount;
        }

        field.trailers.push(newTrailer);
        showToast('Benne pleine enregistrée.');

    } else if (mode === 'empty') {
        const trailer = field.trailers[index];
        trailer.empty = weight;
        trailer.emptyBy = currentUser.uid;
        trailer.emptyAt = new Date();
        showToast('Transport finalisé !');
    }

    try {
        await updateDoc(doc(db, 'fields', currentFieldKey), { trailers: field.trailers });
        closeModal();
    } catch (error) {
        showToast("Erreur de synchronisation.");
        console.error("Firestore update error:", error);
    }
}

async function handleAddNewTrailerName() {
    const input = document.getElementById('new-trailer-name-input');
    const errorEl = document.getElementById('add-trailer-name-error');
    const name = input.value.trim();

    if (!name) {
        errorEl.textContent = 'Le nom ne peut pas être vide.';
        errorEl.classList.remove('hidden');
        return;
    }

    const normalizedName = name.toLowerCase();
    const nameExists = trailerNames.some(t => t.name.toLowerCase() === normalizedName);

    if (nameExists) {
        errorEl.textContent = 'Ce nom de benne existe déjà.';
        errorEl.classList.remove('hidden');
        return;
    }
    
    errorEl.classList.add('hidden');

    try {
        await addDoc(collection(db, 'trailerNames'), { name: name });
        showToast(`Benne "${name}" ajoutée.`);
        // Retourne au modal précédent, qui sera rafraîchi par le listener
        showWeightModal('full');
    } catch (error) {
        console.error("Error adding trailer name:", error);
        showToast("Erreur lors de l'ajout.");
    }
}


async function handleSaveEdit() {
    const errorEl = document.getElementById('edit-modal-error');
    const index = parseInt(document.getElementById('edit-weight-full').dataset.index);
    const newFull = parseInt(document.getElementById('edit-weight-full').value);
    const newEmptyInput = document.getElementById('edit-weight-empty');
    const newEmpty = newEmptyInput.disabled ? null : parseInt(newEmptyInput.value);

    if (isNaN(newFull) || newFull <= 0) {
        errorEl.textContent = "Le poids plein est invalide."; errorEl.classList.remove('hidden'); return;
    }
    if (newEmpty !== null && (isNaN(newEmpty) || newEmpty < 0)) {
        errorEl.textContent = "Le poids vide est invalide."; errorEl.classList.remove('hidden'); return;
    }
    if (newEmpty !== null && newEmpty >= newFull) {
        errorEl.textContent = "Le poids vide doit être inférieur au poids plein."; errorEl.classList.remove('hidden'); return;
    }
    errorEl.classList.add('hidden');
    
    const field = harvestData[currentFieldKey];
    const trailer = field.trailers[index];
    trailer.full = newFull;
    trailer.empty = newEmpty;
    trailer.editedBy = currentUser.uid;
    trailer.editedAt = new Date();
    
    try {
        await updateDoc(doc(db, 'fields', currentFieldKey), { trailers: field.trailers });
        showToast('Benne modifiée.');
        closeModal();
    } catch (error) {
        showToast("Erreur de synchronisation.");
        console.error("Firestore update error:", error);
    }
}

function handleDeleteTrailer(index) {
    const allTrailersInField = harvestData[currentFieldKey].trailers || [];
    const trailerNameCounters = {};
    const trailersWithSequentialNumber = allTrailersInField.map(t => {
        const name = t.trailerName || 'Benne';
        const count = (trailerNameCounters[name] || 0) + 1;
        trailerNameCounters[name] = count;
        return { ...t, displayNumber: count };
    });

    const trailer = trailersWithSequentialNumber[index];
    const displayName = `${trailer.trailerName || 'Benne'} #${trailer.displayNumber}`;
    const message = `Êtes-vous sûr de vouloir supprimer la pesée de la benne "${displayName}" ?`;

    const action = async () => {
        const field = harvestData[currentFieldKey];
        field.trailers.splice(index, 1);
        try {
            await updateDoc(doc(db, 'fields', currentFieldKey), { trailers: field.trailers });
            showToast('Pesée supprimée.');
        } catch (error) {
            showToast("Erreur de suppression.");
            console.error("Firestore delete error:", error);
        }
    };
    showConfirmationModal(message, action);
}

function showGlobalResults() {
    if (selectedCrops.length === 0) {
        showToast("Veuillez sélectionner au moins une culture.");
        return;
    }
    let totalWeight = 0, totalArea = 0, totalBales = 0;
    const hasLinCrop = selectedCrops.some(crop => crop.toLowerCase().includes('lin'));

    Object.values(harvestData).forEach(field => {
        if (selectedCrops.includes(field.crop)) {
            totalArea += field.size || 0;
            const totals = calculateTotals(field.name);
            totalWeight += totals.totalWeight || 0;
            totalBales += totals.totalBaleCount || 0;
        }
    });

    const globalYield = totalArea > 0 ? (totalWeight / totalArea) / 100 : 0;

    let summaryHTML = `
        <div class="flex justify-between items-center bg-gray-100 p-3 rounded-lg"><span class="font-medium">Surface Totale</span><span class="font-bold">${totalArea.toLocaleString('fr-FR')} ha</span></div>
        <div class="flex justify-between items-center bg-gray-100 p-3 rounded-lg"><span class="font-medium">Poids Total</span><span class="font-bold">${totalWeight.toLocaleString('fr-FR')} kg</span></div>
    `;

    if (hasLinCrop) {
        summaryHTML += `<div class="flex justify-between items-center bg-gray-100 p-3 rounded-lg"><span class="font-medium">Total Bottes</span><span class="font-bold">${totalBales.toLocaleString('fr-FR')}</span></div>`;
    } else {
        summaryHTML += `<div class="flex justify-between items-center bg-gray-100 p-3 rounded-lg"><span class="font-medium">Rendement Moyen</span><span class="font-bold">${globalYield.toFixed(2)} qx/ha</span></div>`;
    }

    const content = `
        <h3 class="text-xl font-semibold mb-4 text-center">Récapitulatif</h3>
        <p class="text-sm text-center text-gray-600 mb-6">Pour : <span class="font-semibold">${selectedCrops.join(', ')}</span></p>
        <div class="space-y-3">
            ${summaryHTML}
        </div>
        <div class="mt-8">
             <button id="global-results-close-btn" class="w-full px-6 py-3 bg-gray-200 text-gray-800 rounded-lg">Fermer</button>
        </div>
    `;
    openModal(content, 'summary');
}


function setupEventListeners() {
    // Page Navigation
    backToListBtn.addEventListener('click', () => navigateToPage('list'));

    // Crop Filters
    cropFiltersContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.filter-btn');
        if (!button) return;
        const crop = button.dataset.crop;
        if (crop === 'all') {
            selectedCrops = [];
        } else {
            const index = selectedCrops.indexOf(crop);
            if (index > -1) {
                selectedCrops.splice(index, 1);
            } else {
                selectedCrops.push(crop);
            }
        }
        displayCropFilters();
        displayFieldList();
        updateActiveNav('fields');
    });

    // Trailer Actions (delegated)
    trailersListContainer.addEventListener('click', (e) => {
        const finalizeBtn = e.target.closest('.finalize-btn');
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        
        if (finalizeBtn) showWeightModal('empty', parseInt(finalizeBtn.dataset.index));
        if (editBtn) showEditModal(parseInt(editBtn.dataset.index));
        if (deleteBtn) handleDeleteTrailer(parseInt(deleteBtn.dataset.index));
    });
    
    // FAB
    addTrailerFab.addEventListener('click', () => {
        if (currentFieldKey) showWeightModal('full');
    });

    // Bottom Navigation
    navFieldsBtn.addEventListener('click', () => navigateToPage('list'));
    navSummaryBtn.addEventListener('click', () => {
        updateActiveNav('summary');
        if(selectedCrops.length === 0) {
            showToast('Filtrez par culture d\'abord');
            return;
        }
        showGlobalResults();
    });
    navExportBtn.addEventListener('click', () => {
        updateActiveNav('export');
        exportToExcel();
    });

    // Close modal on backdrop click
    modalContainer.addEventListener('click', (e) => {
        if (e.target.id === 'modal-backdrop') closeModal();
    });
}


// --- UTILITY FUNCTIONS ---

function createFilterButton(text, crop, isActive) {
    const button = document.createElement('button');
    button.className = `filter-btn whitespace-nowrap px-4 py-2 text-sm font-medium rounded-full transition-colors border ${isActive ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300'}`;
    button.textContent = text;
    button.dataset.crop = crop;
    return button;
}

function calculateTotals(fieldKey) {
    const field = harvestData[fieldKey];
    if (!field || !field.trailers) return { totalWeight: 0, yield: 0, totalBaleCount: 0 };
    
    const totalWeight = field.trailers.reduce((sum, t) => (t.full && t.empty) ? sum + (t.full - t.empty) : sum, 0);
    const totalBaleCount = field.trailers.reduce((sum, t) => sum + (t.baleCount || 0), 0);
    const yieldValue = field.size > 0 ? (totalWeight / field.size) / 100 : 0;
    
    return { totalWeight, yield: yieldValue, totalBaleCount };
}

function updateActiveNav(activeId) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-green-600');
        btn.classList.add('text-gray-500');
    });
     const activeBtn = document.getElementById(`nav-${activeId}`);
     if(activeBtn) {
        activeBtn.classList.add('text-green-600');
        activeBtn.classList.remove('text-gray-500');
     }
}

function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('toast-enter');
    setTimeout(() => {
        toast.classList.add('hidden');
        toast.classList.remove('toast-enter');
    }, 3000);
}

function exportToExcel() {
    if (Object.keys(harvestData).length === 0) {
        showToast("Aucune donnée à exporter.");
        return;
    }
    const wb = XLSX.utils.book_new();
    const recapAOA = [
        ["Récapitulatif de la Récolte"], [],
        ["Parcelle", "Culture", "Surface (ha)", "Poids Total (kg)", "Rendement (qx/ha)", "Total Bottes"]
    ];
    const sortedFields = Object.values(harvestData).sort((a,b) => a.name.localeCompare(b.name));
    
    sortedFields.forEach(field => {
        const { totalWeight, yield: fieldYield, totalBaleCount } = calculateTotals(field.name);
        const isLinCrop = field.crop && field.crop.toLowerCase().includes('lin');
        
        const yieldDisplay = isLinCrop ? '' : fieldYield.toFixed(2);
        const baleDisplay = isLinCrop ? totalBaleCount : '';

        recapAOA.push([field.name, field.crop || "N/A", field.size || 0, totalWeight, yieldDisplay, baleDisplay]);
    });

    const wsRecap = XLSX.utils.aoa_to_sheet(recapAOA);
    XLSX.utils.book_append_sheet(wb, wsRecap, "Récapitulatif");

    sortedFields.forEach(field => {
        const sheetName = field.name.replace(/[\\/*?:"<>|]/g, "").substring(0, 31);
        const aoa = [
            ["Détail Parcelle:", field.name], ["Culture:", field.crop], [],
            ["#", "Nom Benne", "Poids Plein (kg)", "Poids Vide (kg)", "Poids Net (kg)", "Bottes"]
        ];
        if (field.trailers && field.trailers.length > 0) {
            const trailerNameCounters = {};
            field.trailers.forEach((trailer, index) => {
                const name = trailer.trailerName || 'Benne';
                const count = (trailerNameCounters[name] || 0) + 1;
                trailerNameCounters[name] = count;
                const displayName = `${name} #${count}`;
                const net = (trailer.full && trailer.empty) ? trailer.full - trailer.empty : 0;
                aoa.push([index + 1, displayName, trailer.full || 0, trailer.empty || 0, net, trailer.baleCount || '']);
            });
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, "Récolte_2025.xlsx");
    showToast("Exportation Excel terminée.");
}
