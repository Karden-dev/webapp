// js/debts.js

document.addEventListener('DOMContentLoaded', async () => {

    // =========================================================
    // ⚙️ CONFIGURATION
    // Modifiez uniquement cette valeur pour changer la limite
    // de jours en arrière autorisée pour un règlement manuel.
    // =========================================================
    const SETTLE_MAX_DAYS_BACK = 3;

    const API_BASE_URL = '/api';
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    const user = storedUser ? JSON.parse(storedUser) : { id: 1, name: 'Admin Test', token: 'mock-token' };
    const CURRENT_USER_ID = user.id;

    // --- RÉFÉRENCES DOM (Onglet 1 : En attente) ---
    const debtsTableBody      = document.getElementById('debtsTableBody');
    const searchInput         = document.getElementById('searchInput');
    const startDateFilter     = document.getElementById('startDateFilter');
    const endDateFilter       = document.getElementById('endDateFilter');
    const filterBtn           = document.getElementById('filterBtn');

    // --- RÉFÉRENCES DOM (Onglet 2 : Historique) ---
    const paidDatePicker      = document.getElementById('paid-date-picker');
    const searchPaidDebtsBtn  = document.getElementById('search-paid-debts-btn');
    const paidDebtsTableBody  = document.getElementById('paidDebtsTableBody');

    // --- RÉFÉRENCES DOM (Cartes de statistiques) ---
    const debtorsCount        = document.getElementById('debtorsCount');
    const totalPendingDebts   = document.getElementById('totalPendingDebts');
    const totalPaidDebts      = document.getElementById('totalPaidDebts');
    const settlementRate      = document.getElementById('settlementRate');

    // --- RÉFÉRENCES DOM (Modale Ajouter/Modifier) ---
    const debtModal           = new bootstrap.Modal(document.getElementById('addDebtModal'));
    const debtForm            = document.getElementById('debtForm');
    const debtIdInput         = document.getElementById('debtId');
    const shopSelect          = document.getElementById('shopSelect');
    const amountInput         = document.getElementById('amountInput');
    const typeSelect          = document.getElementById('typeSelect');
    const dateInput           = document.getElementById('dateInput');
    const commentInput        = document.getElementById('commentInput');
    const debtSubmitBtn       = document.getElementById('debtSubmitBtn');
    const addDebtModalLabel   = document.getElementById('addDebtModalLabel');

    // --- RÉFÉRENCES DOM (Modale Règlement — NOUVEAU) ---
    const settleModal         = new bootstrap.Modal(document.getElementById('settleModal'));
    const settledAtInput      = document.getElementById('settledAtInput');
    const settleDateHint      = document.getElementById('settle-date-hint');
    const settleDateError     = document.getElementById('settle-date-error');
    const confirmSettleBtn    = document.getElementById('confirmSettleBtn');

    // --- RÉFÉRENCES DOM (Modale Suppression — NOUVEAU) ---
    const deleteModal         = new bootstrap.Modal(document.getElementById('deleteModal'));
    const confirmDeleteBtn    = document.getElementById('confirmDeleteBtn');

    // --- RÉFÉRENCES DOM (Général) ---
    const sidebarToggler      = document.getElementById('sidebar-toggler');
    const sidebar             = document.getElementById('sidebar');
    const mainContent         = document.getElementById('main-content');
    const logoutBtn           = document.getElementById('logoutBtn');

    // --- Caches de données ---
    let shopsCache        = [];
    let pendingDebtsCache = [];
    let paidDebtsCache    = [];

    // --- État interne (pour les modales) ---
    let currentSettleId   = null; // ID de la créance en cours de règlement
    let currentDeleteId   = null; // ID de la créance en cours de suppression

    // Mémorise la dernière action de filtrage pour les rafraîchissements
    let lastFetchFunction = async () => {};

    // --- Dictionnaires ---
    const statusTranslations = { 'pending': 'En attente', 'paid': 'Réglé' };
    const typeTranslations = {
        'daily_balance': 'Bilan Négatif',
        'storage_fee':   'Frais de Stockage',
        'packaging':     'Frais d\'Emballage',
        'expedition':    'Frais d\'Expédition',
        'other':         'Autre'
    };

    // Classes CSS pour les badges de type
    const typeBadgeClasses = {
        'daily_balance': 'badge-type badge-type-daily',
        'storage_fee':   'badge-type badge-type-storage',
        'packaging':     'badge-type badge-type-pkg',
        'expedition':    'badge-type badge-type-exp',
        'other':         'badge-type badge-type-other'
    };

    // =========================================================
    // FONCTIONS UTILITAIRES
    // =========================================================

    const showNotification = (message, type = 'success') => {
        const container = document.getElementById('notification-container');
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.role = 'alert';
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        container.appendChild(alert);
        setTimeout(() => {
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
            bsAlert.close();
        }, 4000);
    };

    const formatAmount = (amount) =>
        `${parseFloat(amount || 0).toLocaleString('fr-FR')} FCFA`;

    /**
     * Calcule l'âge d'une créance en jours et retourne un badge HTML coloré.
     * Vert : 0-3 jours | Orange : 4-7 jours | Rouge : 8+ jours
     */
    const getAgeBadge = (createdAt) => {
        const days = moment().diff(moment(createdAt), 'days');
        let cls  = 'badge-age-fresh';
        let label = `${days}j`;
        if (days === 0) label = "Aujourd'hui";
        else if (days === 1) label = 'Hier';
        else if (days >= 4 && days <= 7) cls = 'badge-age-medium';
        else if (days >= 8) cls = 'badge-age-old';
        return `<span class="badge-age ${cls}">${label}</span>`;
    };

    /**
     * Retourne le badge HTML pour le type de créance.
     */
    const getTypeBadge = (type) => {
        const cls   = typeBadgeClasses[type] || 'badge-type badge-type-other';
        const label = typeTranslations[type] || type;
        return `<span class="${cls}">${label}</span>`;
    };

    /**
     * Calcule les bornes de date autorisées pour le règlement.
     * Min = aujourd'hui - SETTLE_MAX_DAYS_BACK | Max = aujourd'hui
     */
    const getSettleDateBounds = () => {
        const today = moment().format('YYYY-MM-DD');
        const minDate = moment().subtract(SETTLE_MAX_DAYS_BACK, 'days').format('YYYY-MM-DD');
        return { today, minDate };
    };

    // =========================================================
    // FETCH / API
    // =========================================================

    const fetchPendingDebts = async () => {
        lastFetchFunction = fetchPendingDebts;
        const startDate = startDateFilter.value;
        const endDate   = endDateFilter.value;
        const search    = searchInput.value;

        const pendingParams = { search, startDate, endDate, status: 'pending' };
        const paidParams    = { search, settledStartDate: startDate, settledEndDate: endDate, status: 'paid' };

        try {
            const [pendingResponse, paidResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/debts`, { params: pendingParams }),
                axios.get(`${API_BASE_URL}/debts`, { params: paidParams })
            ]);
            pendingDebtsCache = pendingResponse.data;
            paidDebtsCache    = paidResponse.data;
            renderDebtsTable(pendingDebtsCache);
            renderPaidDebtsTable(paidDebtsCache);
            updateGlobalStats();
        } catch (error) {
            console.error('Erreur fetchPendingDebts:', error);
            showNotification('Erreur lors du chargement des données.', 'danger');
        }
    };

    const fetchPaidDebts = async () => {
        lastFetchFunction = fetchPaidDebts;
        const settledDate = paidDatePicker.value;
        const search      = searchInput.value;

        if (!settledDate) {
            paidDebtsTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Veuillez sélectionner une date de paiement.</td></tr>`;
            debtsTableBody.innerHTML     = `<tr><td colspan="8" class="text-center p-3">Synchronisé avec l'onglet "Historique".</td></tr>`;
            pendingDebtsCache = [];
            paidDebtsCache    = [];
            updateGlobalStats();
            return;
        }

        const pendingParams = { search, startDate: settledDate, endDate: settledDate, status: 'pending' };
        const paidParams    = { search, settledStartDate: settledDate, settledEndDate: settledDate, status: 'paid' };

        try {
            const [pendingResponse, paidResponse] = await Promise.all([
                axios.get(`${API_BASE_URL}/debts`, { params: pendingParams }),
                axios.get(`${API_BASE_URL}/debts`, { params: paidParams })
            ]);
            pendingDebtsCache = pendingResponse.data;
            paidDebtsCache    = paidResponse.data;
            renderDebtsTable(pendingDebtsCache);
            renderPaidDebtsTable(paidDebtsCache);
            updateGlobalStats();
        } catch (error) {
            console.error('Erreur fetchPaidDebts:', error);
            showNotification('Erreur lors du chargement des données.', 'danger');
        }
    };

    const fetchShops = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/shops?status=actif`);
            shopsCache = response.data;
            shopSelect.innerHTML = '<option value="">Sélectionner un marchand</option>';
            shopsCache.forEach(shop => {
                const option = document.createElement('option');
                option.value       = shop.id;
                option.textContent = shop.name;
                shopSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Erreur fetchShops:', error);
            showNotification('Erreur lors du chargement de la liste des marchands.', 'danger');
        }
    };

    // =========================================================
    // RENDU DES TABLEAUX
    // =========================================================

    const updateGlobalStats = () => {
        let pendingSum = 0;
        let paidSum    = 0;
        const pendingDebtors = new Set();

        pendingDebtsCache.forEach(debt => {
            if (debt.status === 'pending') {
                pendingSum += parseFloat(debt.amount);
                pendingDebtors.add(debt.shop_id);
            }
        });
        paidDebtsCache.forEach(debt => {
            if (debt.status === 'paid') paidSum += parseFloat(debt.amount);
        });

        const totalDebtAmount = pendingSum + paidSum;
        const rate = totalDebtAmount > 0 ? (paidSum / totalDebtAmount) * 100 : 0;

        debtorsCount.textContent      = pendingDebtors.size;
        totalPendingDebts.textContent = formatAmount(pendingSum);
        totalPaidDebts.textContent    = formatAmount(paidSum);
        settlementRate.textContent    = `${rate.toFixed(1)}%`;
    };

    const renderDebtsTable = (debts) => {
        debtsTableBody.innerHTML = '';
        if (debts.length === 0) {
            debtsTableBody.innerHTML = `<tr><td colspan="8" class="text-center p-3">Aucune créance en attente pour les filtres sélectionnés.</td></tr>`;
            return;
        }

        debts.forEach(debt => {
            const row     = document.createElement('tr');
            const isManual = debt.type !== 'daily_balance';

            row.innerHTML = `
                <td>${moment(debt.created_at).format('DD/MM/YYYY')}</td>
                <td>${getAgeBadge(debt.created_at)}</td>
                <td><strong>${debt.shop_name}</strong></td>
                <td class="text-danger fw-bold">${formatAmount(debt.amount)}</td>
                <td>${getTypeBadge(debt.type)}</td>
                <td class="text-muted">${debt.comment || '—'}</td>
                <td><span class="badge bg-warning text-dark">${statusTranslations[debt.status] || debt.status}</span></td>
                <td class="text-center">
                    <div class="dropdown">
                        <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i class="bi bi-gear"></i>
                        </button>
                        <ul class="dropdown-menu">
                            ${debt.status === 'pending'
                                ? `<li><a class="dropdown-item settle-btn" href="#" data-id="${debt.id}"><i class="bi bi-check-circle text-success"></i> Régler</a></li>`
                                : ''
                            }
                            <li><a class="dropdown-item edit-btn ${!isManual || debt.status !== 'pending' ? 'disabled' : ''}" href="#" data-id="${debt.id}">
                                <i class="bi bi-pencil"></i> Modifier
                            </a></li>
                            <li><a class="dropdown-item delete-btn text-danger ${!isManual || debt.status !== 'pending' ? 'disabled' : ''}" href="#" data-id="${debt.id}">
                                <i class="bi bi-trash"></i> Supprimer
                            </a></li>
                        </ul>
                    </div>
                </td>
            `;
            debtsTableBody.appendChild(row);
        });
    };

    const renderPaidDebtsTable = (debts) => {
        paidDebtsTableBody.innerHTML = '';
        if (debts.length === 0) {
            paidDebtsTableBody.innerHTML = `<tr><td colspan="6" class="text-center p-3">Aucune créance réglée trouvée pour les filtres sélectionnés.</td></tr>`;
            return;
        }

        debts.forEach(debt => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${debt.shop_name}</strong></td>
                <td>${moment(debt.created_at).format('DD/MM/YYYY')}</td>
                <td><span class="text-success fw-bold">${moment(debt.settled_at).format('DD/MM/YYYY')}</span></td>
                <td class="text-success fw-bold">${formatAmount(debt.amount)}</td>
                <td>${getTypeBadge(debt.type)}</td>
                <td class="text-muted">${debt.comment || '—'}</td>
            `;
            paidDebtsTableBody.appendChild(row);
        });
    };

    // =========================================================
    // MODALE : AJOUTER / MODIFIER UNE CRÉANCE
    // =========================================================

    const handleDebtFormSubmit = async (e) => {
        e.preventDefault();
        const debtData = {
            shop_id:    shopSelect.value,
            amount:     amountInput.value,
            type:       typeSelect.value,
            comment:    commentInput.value,
            created_at: dateInput.value,
            created_by: CURRENT_USER_ID,
            updated_by: CURRENT_USER_ID
        };

        try {
            if (debtIdInput.value) {
                await axios.put(`${API_BASE_URL}/debts/${debtIdInput.value}`, debtData);
                showNotification('Créance modifiée avec succès !');
            } else {
                await axios.post(`${API_BASE_URL}/debts`, debtData);
                showNotification('Créance manuelle ajoutée avec succès !');
            }
            debtModal.hide();
            await lastFetchFunction();
        } catch (error) {
            showNotification(error.response?.data?.message || 'Erreur lors de l\'enregistrement.', 'danger');
        }
    };

    // =========================================================
    // MODALE : RÉGLER UNE CRÉANCE (NOUVEAU)
    // =========================================================

    /**
     * Ouvre la modale de règlement pour une créance donnée.
     * Pré-remplit le récapitulatif et configure les bornes du champ date.
     */
    const openSettleModal = (debtId) => {
        const debt = pendingDebtsCache.find(d => d.id == debtId);
        if (!debt) return;

        currentSettleId = debtId;

        // Remplir le récapitulatif
        document.getElementById('settle-shop-name').textContent  = debt.shop_name;
        document.getElementById('settle-amount').textContent     = formatAmount(debt.amount);
        document.getElementById('settle-type').textContent       = typeTranslations[debt.type] || debt.type;
        document.getElementById('settle-created-at').textContent = moment(debt.created_at).format('DD/MM/YYYY');

        // Configurer les bornes de date
        const { today, minDate } = getSettleDateBounds();
        settledAtInput.min   = minDate;
        settledAtInput.max   = today;
        settledAtInput.value = today;

        // Message d'aide sous le champ
        settleDateHint.textContent = `Date autorisée : du ${moment(minDate).format('DD/MM/YYYY')} au ${moment(today).format('DD/MM/YYYY')} (max. ${SETTLE_MAX_DAYS_BACK} jours en arrière).`;

        // Réinitialiser l'état d'erreur
        settledAtInput.classList.remove('is-invalid');
        settleDateError.textContent = '';

        settleModal.show();
    };

    /**
     * Valide la date choisie et envoie la requête de règlement.
     */
    const handleConfirmSettle = async () => {
        const chosenDate = settledAtInput.value;
        const { today, minDate } = getSettleDateBounds();

        // Validation côté client
        if (!chosenDate) {
            settledAtInput.classList.add('is-invalid');
            settleDateError.textContent = 'Veuillez sélectionner une date.';
            return;
        }
        if (chosenDate > today) {
            settledAtInput.classList.add('is-invalid');
            settleDateError.textContent = 'La date de règlement ne peut pas être dans le futur.';
            return;
        }
        if (chosenDate < minDate) {
            settledAtInput.classList.add('is-invalid');
            settleDateError.textContent = `La date ne peut pas être antérieure à ${moment(minDate).format('DD/MM/YYYY')} (limite : ${SETTLE_MAX_DAYS_BACK} jours).`;
            return;
        }

        // Tout est valide : envoyer la requête
        confirmSettleBtn.disabled = true;
        confirmSettleBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Traitement...';

        try {
            await axios.put(`${API_BASE_URL}/debts/${currentSettleId}/settle`, {
                userId:     CURRENT_USER_ID,
                settled_at: chosenDate
            });
            settleModal.hide();
            showNotification('Créance réglée avec succès.');
            await lastFetchFunction();
        } catch (error) {
            showNotification(error.response?.data?.message || 'Erreur lors du règlement.', 'danger');
        } finally {
            confirmSettleBtn.disabled = false;
            confirmSettleBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Confirmer le règlement';
        }
    };

    // =========================================================
    // MODALE : SUPPRIMER UNE CRÉANCE (NOUVEAU)
    // =========================================================

    /**
     * Ouvre la modale de confirmation de suppression.
     */
    const openDeleteModal = (debtId) => {
        const debt = pendingDebtsCache.find(d => d.id == debtId);
        if (!debt) return;

        currentDeleteId = debtId;
        document.getElementById('delete-shop-name').textContent = debt.shop_name;
        document.getElementById('delete-amount').textContent    = formatAmount(debt.amount);

        deleteModal.show();
    };

    /**
     * Exécute la suppression après confirmation.
     */
    const handleConfirmDelete = async () => {
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Suppression...';

        try {
            await axios.delete(`${API_BASE_URL}/debts/${currentDeleteId}`);
            deleteModal.hide();
            showNotification('Créance supprimée.');
            await lastFetchFunction();
        } catch (error) {
            showNotification('Erreur lors de la suppression.', 'danger');
        } finally {
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.innerHTML = '<i class="bi bi-trash me-1"></i>Supprimer';
        }
    };

    // =========================================================
    // GESTION DES CLICS SUR LE TABLEAU (délégation d'événements)
    // =========================================================

    const handleTableActions = (e) => {
        const target = e.target.closest('a');
        if (!target || target.classList.contains('disabled')) return;
        e.preventDefault();

        const debtId = target.dataset.id;

        if (target.classList.contains('settle-btn')) {
            openSettleModal(debtId);

        } else if (target.classList.contains('edit-btn')) {
            const debt = pendingDebtsCache.find(d => d.id == debtId);
            if (debt) {
                debtIdInput.value    = debt.id;
                shopSelect.value     = debt.shop_id;
                amountInput.value    = debt.amount;
                typeSelect.value     = debt.type;
                commentInput.value   = debt.comment;
                dateInput.value      = moment(debt.created_at).format('YYYY-MM-DD');
                addDebtModalLabel.textContent = 'Modifier la créance manuelle';
                debtSubmitBtn.textContent     = 'Sauvegarder';
                debtModal.show();
            }

        } else if (target.classList.contains('delete-btn')) {
            openDeleteModal(debtId);
        }
    };

    // =========================================================
    // INITIALISATION
    // =========================================================

    const initializeApp = async () => {
        const today = moment().format('YYYY-MM-DD');
        startDateFilter.value = today;
        endDateFilter.value   = today;
        dateInput.value       = today;
        paidDatePicker.value  = today;

        lastFetchFunction = fetchPendingDebts;

        // Sidebar & déconnexion
        sidebarToggler?.addEventListener('click', () => {
            if (window.innerWidth < 992) {
                sidebar?.classList.toggle('show');
            } else {
                sidebar?.classList.toggle('collapsed');
                mainContent?.classList.toggle('expanded');
            }
        });
        logoutBtn?.addEventListener('click', () => {
            localStorage.removeItem('user');
            sessionStorage.removeItem('user');
            window.location.href = 'index.html';
        });

        // Onglet "En attente"
        filterBtn.addEventListener('click', fetchPendingDebts);
        searchInput.addEventListener('input', fetchPendingDebts);
        startDateFilter.addEventListener('change', fetchPendingDebts);
        endDateFilter.addEventListener('change', fetchPendingDebts);

        // Onglet "Historique"
        searchPaidDebtsBtn.addEventListener('click', fetchPaidDebts);
        paidDatePicker.addEventListener('change', fetchPaidDebts);

        // Tableau (délégation)
        debtsTableBody.addEventListener('click', handleTableActions);

        // Modale Ajouter/Modifier
        debtForm.addEventListener('submit', handleDebtFormSubmit);
        document.getElementById('addDebtModal').addEventListener('hidden.bs.modal', () => {
            debtForm.reset();
            debtIdInput.value             = '';
            dateInput.value               = moment().format('YYYY-MM-DD');
            addDebtModalLabel.textContent = 'Ajouter une créance manuelle';
            debtSubmitBtn.textContent     = 'Ajouter';
        });

        // Modale Règlement
        confirmSettleBtn.addEventListener('click', handleConfirmSettle);
        settledAtInput.addEventListener('input', () => {
            settledAtInput.classList.remove('is-invalid');
            settleDateError.textContent = '';
        });
        document.getElementById('settleModal').addEventListener('hidden.bs.modal', () => {
            currentSettleId = null;
        });

        // Modale Suppression
        confirmDeleteBtn.addEventListener('click', handleConfirmDelete);
        document.getElementById('deleteModal').addEventListener('hidden.bs.modal', () => {
            currentDeleteId = null;
        });

        // Lien actif dans la sidebar
        const currentPath = window.location.pathname.split('/').pop();
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        const activeDebtLink = document.querySelector(`.dropdown-item[href="${currentPath}"]`);
        if (activeDebtLink) {
            activeDebtLink.classList.add('active');
            const parentToggle = activeDebtLink.closest('.dropdown')?.querySelector('.dropdown-toggle');
            if (parentToggle) parentToggle.classList.add('active');
        }

        // Chargement initial
        await fetchShops();
        await fetchPendingDebts();
    };

    initializeApp();
});
