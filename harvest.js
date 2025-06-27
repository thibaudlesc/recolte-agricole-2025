// harvest.js

import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, onSnapshot, collection, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- SÉLECTION DES ÉLÉMENTS DU DOM ---
const fieldSelect = document.getElementById('field-select');
const fieldInfoContainer = document.getElementById('field-info');
const trailersTableBody = document.getElementById('trailers-table-body');
const addTrailerBtn = document.getElementById('add-trailer-btn');
const cropFiltersContainer = document.getElementById('crop-filters-container');
const calculateTotalsBtn = document.getElementById('calculate-totals-btn');
const exportExcelBtn = document.getElementById('export-excel-btn');

const weightModal = document.getElementById('weight-modal');
const modalTitle = document.getElementById('modal-title');
const weightInput = document.getElementById('weight-input');
const weightModalError = document.getElementById('weight-modal-error');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');

const infoModal = document.getElementById('info-modal');
const infoModalContent = document.getElementById('info-modal-content');
const infoModalCloseBtn = document.getElementById('info-modal-close-btn');

const editModal = document.getElementById('edit-modal');
const editWeightFullInput = document.getElementById('edit-weight-full');
const editWeightEmptyInput = document.getElementById('edit-weight-empty');
const editModalError = document.getElementById('edit-modal-error');
const editModalCancelBtn = document.getElementById('edit-modal-cancel-btn');
const editModalSaveBtn = document.getElementById('edit-modal-save-btn');

const confirmationModal = document.getElementById('confirmation-modal');
const confirmationMessage = document.getElementById('confirmation-message');
const confirmationCancelBtn = document.getElementById('confirmation-cancel-btn');
const confirmationConfirmBtn = document.getElementById('confirmation-confirm-btn');

const globalResultsModal = document.getElementById('global-results-modal');
const globalResultsContent = document.getElementById('global-results-content');
const globalResultsCloseBtn = document.getElementById('global-results-close-btn');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// --- VARIABLES GLOBALES ---
let currentUser = null;
let harvestData = {};
let usersCache = {};
let currentFieldKey = '';
let currentTrailerIndex = -1;
let weightModalMode = '';
let selectedCrops = []; 
let unsubscribe;
let onConfirmAction = null; 

// --- FONCTIONS ---

function showToast(message) {
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('toast-enter');
    setTimeout(() => {
        toast.classList.add('hidden');
        toast.classList.remove('toast-enter');
    }, 3000);
}

async function getUserData(userId) {
    if (!userId) return { name: 'N/A' };
    if (usersCache[userId]) return usersCache[userId];
    const userDocRef = doc(db, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        usersCache[userId] = userDocSnap.data();
        return usersCache[userId];
    }
    return { name: 'Utilisateur inconnu' };
}

function formatTimestamp(ts) {
    if (!ts) return 'N/A';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function getCropColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return { hue, sat: 70, light: 85 }; 
}


function calculateTotals(fieldKey) {
    const field = harvestData[fieldKey];
    if (!field || !field.trailers) return { totalWeight: 0, yield: 0, netWeight: 0 };
    const netWeight = field.trailers.reduce((sum, t) => (t.full && t.empty) ? sum + (t.full - t.empty) : sum, 0);
    const yieldValue = field.size > 0 ? (netWeight / field.size) / 100 : 0; // en qx/ha
    return { totalWeight: netWeight, yield: yieldValue };
}

function displayFieldData() {
    if (!fieldSelect.value || !harvestData[fieldSelect.value]) {
        fieldInfoContainer.innerHTML = `<div class="col-span-full text-center p-8 bg-white rounded-lg shadow-sm"><p class="text-gray-500">Veuillez sélectionner une parcelle dans la liste.</p></div>`;
        trailersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-500">Aucune donnée à afficher.</td></tr>`;
        return;
    }
    currentFieldKey = fieldSelect.value;
    const field = harvestData[currentFieldKey];
    if (!field) return;

    const { totalWeight, yield: yieldValue } = calculateTotals(currentFieldKey);
    fieldInfoContainer.innerHTML = `
        <div class="bg-white p-4 rounded-lg shadow-sm text-center"><h3 class="text-sm font-medium text-gray-500">Surface</h3><p class="mt-1 text-2xl font-semibold">${(field.size || 0).toLocaleString('fr-FR')} ha</p></div>
        <div class="bg-white p-4 rounded-lg shadow-sm text-center"><h3 class="text-sm font-medium text-gray-500">Culture</h3><p class="mt-1 text-2xl font-semibold">${field.crop || 'N/A'}</p></div>
        <div class="bg-white p-4 rounded-lg shadow-sm text-center"><h3 class="text-sm font-medium text-gray-500">Poids Total</h3><p class="mt-1 text-2xl font-semibold">${totalWeight.toLocaleString('fr-FR')} kg</p></div>
        <div class="bg-white p-4 rounded-lg shadow-sm text-center"><h3 class="text-sm font-medium text-gray-500">Rendement</h3><p class="mt-1 text-2xl font-semibold">${yieldValue.toFixed(2)} qx/ha</p></div>
    `;

    trailersTableBody.innerHTML = '';
    if (!field.trailers || field.trailers.length === 0) {
        trailersTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-gray-500">Aucune benne enregistrée.</td></tr>`;
    } else {
        field.trailers.forEach((trailer, index) => {
            const netWeight = (trailer.full && trailer.empty) ? trailer.full - trailer.empty : '---';
            const row = `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${index + 1}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${trailer.full ? trailer.full.toLocaleString('fr-FR') : '---'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${trailer.empty ? trailer.empty.toLocaleString('fr-FR') : '---'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700">${typeof netWeight === 'number' ? netWeight.toLocaleString('fr-FR') : netWeight}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        ${!trailer.empty ? `<button class="finalize-btn text-blue-600 hover:text-blue-900" data-index="${index}">Finaliser</button>` : `<span class="text-green-600 font-semibold">Terminé</span>`}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div class="flex items-center justify-end space-x-2">
                            <button class="edit-btn text-gray-400 hover:text-blue-600 p-1" data-index="${index}" title="Modifier">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                            </button>
                            <button class="info-btn text-gray-400 hover:text-gray-600 p-1" data-index="${index}" title="Informations">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
                            </button>
                            <button class="delete-btn text-gray-400 hover:text-red-600 p-1" data-index="${index}" title="Supprimer">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            trailersTableBody.innerHTML += row;
        });
    }
}

function openModal(modal) {
    modal.classList.remove('hidden');
    modal.querySelector('.modal-content').classList.add('modal-enter');
}

function closeModal(modal) {
    const content = modal.querySelector('.modal-content');
    content.classList.add('modal-leave');
    setTimeout(() => {
        modal.classList.add('hidden');
        content.classList.remove('modal-enter', 'modal-leave');
    }, 300);
}

function showConfirmationModal(message, onConfirm) {
    confirmationMessage.innerHTML = message.replace(/\n/g, '<br>'); // Support line breaks
    onConfirmAction = onConfirm;
    openModal(confirmationModal);
}

async function handleConfirmWeight() {
    const weight = parseInt(weightInput.value);
    if (isNaN(weight) || weight <= 0) {
        weightModalError.textContent = "Veuillez entrer un poids valide.";
        weightModalError.classList.remove('hidden');
        return;
    }
    weightModalError.classList.add('hidden');
    
    // No over-validation for creation
    const field = harvestData[currentFieldKey];
    if (weightModalMode === 'full') {
        field.trailers.push({ full: weight, empty: null, fullBy: currentUser.uid, fullAt: new Date(), emptyBy: null, emptyAt: null });
        showToast('Benne pleine enregistrée.');
    } else if (weightModalMode === 'empty') {
        const trailer = field.trailers[currentTrailerIndex];
        trailer.empty = weight;
        trailer.emptyBy = currentUser.uid;
        trailer.emptyAt = new Date();
        showToast('Transport finalisé !');
    }

    try {
        await updateDoc(doc(db, 'fields', currentFieldKey), { trailers: field.trailers });
        closeModal(weightModal);
    } catch (error) {
        showToast("Erreur de synchronisation.");
        console.error("Firestore update error:", error);
    }
}

function openEditModal(index) {
    currentTrailerIndex = index;
    const trailer = harvestData[currentFieldKey].trailers[index];
    if (!trailer) return;

    editWeightFullInput.value = trailer.full || '';
    editWeightEmptyInput.value = trailer.empty || '';
    editWeightEmptyInput.disabled = trailer.empty === null;
    editModalError.classList.add('hidden');
    openModal(editModal);
}

async function handleSaveEdit() {
    const newFull = parseInt(editWeightFullInput.value);
    const newEmpty = editWeightEmptyInput.disabled ? null : parseInt(editWeightEmptyInput.value);

    if (isNaN(newFull) || newFull <= 0) {
        editModalError.textContent = "Le poids plein est invalide.";
        editModalError.classList.remove('hidden');
        return;
    }
    if (newEmpty !== null && (isNaN(newEmpty) || newEmpty < 0)) {
        editModalError.textContent = "Le poids vide est invalide.";
        editModalError.classList.remove('hidden');
        return;
    }
    // Over-validation re-established for modification
    if (newEmpty !== null && newEmpty >= newFull) {
        editModalError.textContent = "Le poids vide doit être inférieur au poids plein.";
        editModalError.classList.remove('hidden');
        return;
    }
    editModalError.classList.add('hidden');
    
    const field = harvestData[currentFieldKey];
    const trailer = field.trailers[currentTrailerIndex];
    const oldFull = trailer.full || 0;
    const oldEmpty = trailer.empty;

    let message = 'Confirmez-vous les modifications suivantes ?';
    if (oldFull !== newFull) {
        message += `\n- Poids Plein : <b>${oldFull.toLocaleString('fr-FR')} kg</b> → <b>${newFull.toLocaleString('fr-FR')} kg</b>`;
    }
    if (oldEmpty !== newEmpty && newEmpty !== null) {
        message += `\n- Poids Vide : <b>${(oldEmpty || 0).toLocaleString('fr-FR')} kg</b> → <b>${newEmpty.toLocaleString('fr-FR')} kg</b>`;
    }

    const action = async () => {
        trailer.full = newFull;
        trailer.empty = newEmpty;
        trailer.editedBy = currentUser.uid;
        trailer.editedAt = new Date();
        try {
            await updateDoc(doc(db, 'fields', currentFieldKey), { trailers: field.trailers });
            showToast('Ligne de benne modifiée.');
        } catch (error) {
            showToast("Erreur de synchronisation.");
            console.error("Firestore update error:", error);
        }
    };

    closeModal(editModal);
    showConfirmationModal(message, action);
}

function handleDeleteTrailer(index) {
    const trailer = harvestData[currentFieldKey].trailers[index];
    if (!trailer) return;

    const message = `Êtes-vous sûr de vouloir supprimer la benne n°${index + 1} ? L'action est définitive.`;

    const action = async () => {
        const field = harvestData[currentFieldKey];
        field.trailers.splice(index, 1); 
        try {
            await updateDoc(doc(db, 'fields', currentFieldKey), { trailers: field.trailers });
            showToast('Ligne de benne supprimée.');
        } catch (error) {
            showToast("Erreur de synchronisation lors de la suppression.");
            console.error("Firestore delete error:", error);
        }
    };

    showConfirmationModal(message, action);
}

async function showTrailerInfo(index) {
    const trailer = harvestData[currentFieldKey].trailers[index];
    infoModalContent.innerHTML = '<p class="text-center">Chargement...</p>';
    openModal(infoModal);
    const [fullUser, emptyUser] = await Promise.all([getUserData(trailer.fullBy), getUserData(trailer.emptyBy)]);
    let content = `<div class="border-b pb-3"><p class="font-semibold text-lg text-green-700">Pesée Pleine</p><p><strong>Par:</strong> ${fullUser.name}</p><p><strong>Le:</strong> ${formatTimestamp(trailer.fullAt)}</p></div>`;
    if (trailer.empty) {
        content += `<div class="pt-3"><p class="font-semibold text-lg text-blue-700">Pesée à Vide</p><p><strong>Par:</strong> ${emptyUser.name}</p><p><strong>Le:</strong> ${formatTimestamp(trailer.emptyAt)}</p></div>`;
    }
    infoModalContent.innerHTML = content;
}

function displayCropFilters() {
    const crops = [...new Set(Object.values(harvestData).map(field => field.crop).filter(Boolean))];
    crops.sort((a, b) => a.localeCompare(b)); 

    cropFiltersContainer.innerHTML = ''; 

    const allButton = document.createElement('button');
    allButton.textContent = 'Toutes les cultures';
    allButton.dataset.crop = 'all';
    allButton.className = 'filter-btn px-3 py-1 text-sm font-medium rounded-full transition border';
    cropFiltersContainer.appendChild(allButton);

    crops.forEach(crop => {
        const button = document.createElement('button');
        button.textContent = crop;
        button.dataset.crop = crop;
        button.className = 'filter-btn px-3 py-1 text-sm font-medium rounded-full transition border';
        cropFiltersContainer.appendChild(button);
    });

    updateActiveFilterButton();
}

function updateActiveFilterButton() {
    const hasSelection = selectedCrops.length > 0;
    calculateTotalsBtn.classList.toggle('hidden', !hasSelection);

    document.querySelectorAll('.filter-btn').forEach(btn => {
        const crop = btn.dataset.crop;
        
        if (crop === 'all') {
            const active = !hasSelection;
            btn.classList.toggle('bg-gray-600', active);
            btn.classList.toggle('text-white', active);
            btn.classList.toggle('border-gray-600', active);
            btn.classList.toggle('bg-gray-200', !active);
            btn.classList.toggle('text-gray-700', !active);
            btn.classList.toggle('border-gray-300', !active);
            return;
        }

        const color = getCropColor(crop);
        const active = selectedCrops.includes(crop);
        
        btn.style.backgroundColor = active ? `hsl(${color.hue}, ${color.sat}%, 60%)` : `hsl(${color.hue}, ${color.sat}%, 90%)`;
        btn.style.color = active ? 'white' : `hsl(${color.hue}, ${color.sat}%, 25%)`;
        btn.style.borderColor = active ? `hsl(${color.hue}, ${color.sat}%, 60%)` : `hsl(${color.hue}, ${color.sat}%, 75%)`;
    });
}


function populateFieldSelect() {
    const selected = fieldSelect.value;
    fieldSelect.innerHTML = '';
    
    const fieldKeys = Object.keys(harvestData)
        .filter(key => selectedCrops.length === 0 || selectedCrops.includes(harvestData[key].crop))
        .sort((a, b) => a.localeCompare(b));

    if (fieldKeys.length === 0) {
        fieldSelect.innerHTML = `<option value="">Aucune parcelle pour la sélection</option>`;
    } else {
        fieldKeys.forEach(key => {
            fieldSelect.innerHTML += `<option value="${key}">${harvestData[key].name || key}</option>`;
        });
    }

    if (selected && fieldKeys.includes(selected)) {
        fieldSelect.value = selected;
    }

    displayFieldData();
}

function showGlobalResults() {
    if (selectedCrops.length === 0) {
        showToast("Veuillez sélectionner au moins une culture.");
        return;
    }

    let totalWeight = 0;
    let totalArea = 0;
    
    Object.values(harvestData).forEach(field => {
        if (selectedCrops.includes(field.crop)) {
            totalArea += field.size || 0;
            const fieldTotals = calculateTotals(field.name);
            totalWeight += fieldTotals.totalWeight || 0;
        }
    });

    const globalYield = totalArea > 0 ? (totalWeight / totalArea) / 100 : 0;

    globalResultsContent.innerHTML = `
        <p class="text-sm text-gray-600">Pour les cultures : <span class="font-semibold">${selectedCrops.join(', ')}</span></p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-center">
            <div class="bg-gray-100 p-4 rounded-lg">
                <h4 class="text-sm font-medium text-gray-500">Surface Totale</h4>
                <p class="mt-1 text-2xl font-semibold">${totalArea.toLocaleString('fr-FR')} ha</p>
            </div>
            <div class="bg-gray-100 p-4 rounded-lg">
                <h4 class="text-sm font-medium text-gray-500">Poids Total</h4>
                <p class="mt-1 text-2xl font-semibold">${totalWeight.toLocaleString('fr-FR')} kg</p>
            </div>
            <div class="bg-gray-100 p-4 rounded-lg">
                <h4 class="text-sm font-medium text-gray-500">Rendement Moyen</h4>
                <p class="mt-1 text-2xl font-semibold">${globalYield.toFixed(2)} qx/ha</p>
            </div>
        </div>
    `;
    openModal(globalResultsModal);
}

function exportToExcel() {
    if (Object.keys(harvestData).length === 0) {
        showToast("Aucune donnée à exporter.");
        return;
    }

    const wb = XLSX.utils.book_new();

    // --- 1. Feuille de récapitulation ---
    const recapAOA = [
        [{v: "Récapitulatif de la Récolte 2025", s: { font: { bold: true, sz: 16 }, alignment: { horizontal: "center" } } }],
        [],
        [
            {v: "Parcelle", s: { font: { bold: true }, fill: { fgColor: { rgb: "D3D3D3" } } } },
            {v: "Culture", s: { font: { bold: true }, fill: { fgColor: { rgb: "D3D3D3" } } } },
            {v: "Surface (ha)", s: { font: { bold: true }, fill: { fgColor: { rgb: "D3D3D3" } } } },
            {v: "Poids Total (kg)", s: { font: { bold: true }, fill: { fgColor: { rgb: "D3D3D3" } } } },
            {v: "Rendement (qx/ha)", s: { font: { bold: true }, fill: { fgColor: { rgb: "D3D3D3" } } } }
        ]
    ];
    
    let totalArea = 0;
    let totalWeight = 0;
    const sortedFields = Object.values(harvestData).sort((a,b) => a.name.localeCompare(b.name));

    sortedFields.forEach(field => {
        const { totalWeight: fieldWeight, yield: fieldYield } = calculateTotals(field.name);
        recapAOA.push([
            field.name,
            field.crop || "N/A",
            { t: 'n', v: field.size || 0, z: '0.00' },
            { t: 'n', v: fieldWeight, z: '#,##0' },
            { t: 'n', v: fieldYield, z: '0.00' }
        ]);
        totalArea += field.size || 0;
        totalWeight += fieldWeight;
    });

    recapAOA.push([]);
    recapAOA.push([
        {v: "TOTAL", s: { font: { bold: true }}},
        "",
        {t: 'n', v: totalArea, z: '0.00', s: { font: { bold: true }}},
        {t: 'n', v: totalWeight, z: '#,##0', s: { font: { bold: true }}},
        ""
    ]);

    const wsRecap = XLSX.utils.aoa_to_sheet(recapAOA);
    wsRecap['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
    wsRecap['!cols'] = [ {wch: 25}, {wch: 15}, {wch: 15}, {wch: 18}, {wch: 20} ];
    XLSX.utils.book_append_sheet(wb, wsRecap, "Récapitulatif");


    // --- 2. Feuilles individuelles pour chaque parcelle ---
    sortedFields.forEach(field => {
        const sheetName = field.name.replace(/[\\/*?:"<>|]/g, "").substring(0, 31);
        
        const aoa = [
            ["Récolte 2025"], [],
            ["Parcelle :", field.name],
            ["Culture :", field.crop || "N/A"],
            ["Surface :", `${field.size || 'N/A'} ha`], [], 
            ["N° Benne", "Poids Plein (kg)", "Poids Vide (kg)"]
        ];

        if (field.trailers && field.trailers.length > 0) {
             field.trailers.forEach((trailer, index) => {
                aoa.push([
                    index + 1,
                    trailer.full || null,
                    trailer.empty || null,
                ]);
            });
        } else {
            aoa.push(["Aucune benne enregistrée."]);
        }
       
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [ { wch: 10 }, { wch: 18 }, { wch: 18 } ];
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, "Récolte_2025.xlsx");
}


function setupEventListeners() {
    fieldSelect.addEventListener('change', displayFieldData);
    
    cropFiltersContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-btn')) {
            const crop = e.target.dataset.crop;
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
            updateActiveFilterButton();
            populateFieldSelect();
        }
    });

    calculateTotalsBtn.addEventListener('click', showGlobalResults);
    globalResultsCloseBtn.addEventListener('click', () => closeModal(globalResultsModal));
    exportExcelBtn.addEventListener('click', exportToExcel);


    addTrailerBtn.addEventListener('click', () => {
        if (!fieldSelect.value) {
            showToast("Veuillez d'abord sélectionner une parcelle.");
            return;
        }
        weightModalMode = 'full';
        modalTitle.textContent = 'Entrez le poids plein de la benne';
        weightInput.value = '';
        weightModalError.classList.add('hidden');
        openModal(weightModal);
    });

    trailersTableBody.addEventListener('click', (e) => {
        const finalizeBtn = e.target.closest('.finalize-btn');
        const editBtn = e.target.closest('.edit-btn');
        const infoBtn = e.target.closest('.info-btn');
        const deleteBtn = e.target.closest('.delete-btn');

        if (finalizeBtn) {
            currentTrailerIndex = parseInt(finalizeBtn.dataset.index);
            weightModalMode = 'empty';
            modalTitle.textContent = 'Entrez le poids à vide de la benne';
            weightInput.value = '';
            weightModalError.classList.add('hidden');
            openModal(weightModal);
        } else if (editBtn) {
            openEditModal(parseInt(editBtn.dataset.index));
        } else if (infoBtn) {
            showTrailerInfo(parseInt(infoBtn.dataset.index));
        } else if (deleteBtn) {
            handleDeleteTrailer(parseInt(deleteBtn.dataset.index));
        }
    });

    modalCancelBtn.addEventListener('click', () => closeModal(weightModal));
    modalConfirmBtn.addEventListener('click', handleConfirmWeight);
    infoModalCloseBtn.addEventListener('click', () => closeModal(infoModal));
    editModalCancelBtn.addEventListener('click', () => closeModal(editModal));
    editModalSaveBtn.addEventListener('click', handleSaveEdit);
    
    confirmationCancelBtn.addEventListener('click', () => {
        onConfirmAction = null;
        closeModal(confirmationModal);
    });
    confirmationConfirmBtn.addEventListener('click', () => {
        if (typeof onConfirmAction === 'function') {
            onConfirmAction();
        }
        onConfirmAction = null;
        closeModal(confirmationModal);
    });
}

export function initHarvestApp(user) {
    currentUser = user;
    if (unsubscribe) unsubscribe();
    const fieldsCollectionRef = collection(db, 'fields');
    unsubscribe = onSnapshot(fieldsCollectionRef, (snapshot) => {
        harvestData = {};
        snapshot.forEach(doc => {
            harvestData[doc.id] = { name: doc.id, ...doc.data() };
        });
        
        displayCropFilters();
        populateFieldSelect();

    }, (error) => {
        console.error("Firestore listener error:", error);
        showToast("Impossible de charger les données des parcelles.");
    });
    setupEventListeners();
}
