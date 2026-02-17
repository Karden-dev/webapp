// src/models/remittance.model.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
    module.exports.dbConnection = connection;
};

/**
 * Synchronise les soldes journaliers positifs avec la table des versements,
 * en consolidant les créances en attente au moment de la synchronisation.
 * CORRECTION : Nettoie également les versements si le solde devient nul ou négatif.
 */
const syncDailyBalancesToRemittances = async (date, connection) => {
    // 1. Lire TOUS les soldes journaliers (On supprime le filtre > 0 ici)
    const [dailyBalances] = await connection.execute(
        `SELECT
            dsb.shop_id,
            dsb.remittance_amount,
            s.payment_operator
         FROM daily_shop_balances dsb
         JOIN shops s ON dsb.shop_id = s.id
         WHERE dsb.report_date = ?`,
        [date]
    );

    for (const balance of dailyBalances) {
        // CAS 1 : Le solde est POSITIF -> On crée ou met à jour le versement
        if (balance.remittance_amount > 0) {
            // 1.5. Calculer la somme des créances en attente (status = 'pending') pour ce marchand.
            const [debtRow] = await connection.execute(
                `SELECT COALESCE(SUM(amount), 0) AS total_pending_debts
                 FROM debts
                 WHERE shop_id = ? AND status = 'pending'`,
                [balance.shop_id]
            );
            const debtsAmount = parseFloat(debtRow[0]?.total_pending_debts || 0);

            // 2. Tente de créer/mettre à jour l'entrée dans 'remittances' (UPSERT)
            // La colonne net_amount_paid n'est pas mise à jour ici, seulement lors du paiement.
            await connection.execute(
                `INSERT INTO remittances
                    (shop_id, amount, remittance_date, payment_operator, status, user_id, debts_consolidated)
                 VALUES (?, ?, ?, ?, 'pending', 1, ?)
                 ON DUPLICATE KEY UPDATE
                    amount = VALUES(amount),
                    payment_operator = VALUES(payment_operator),
                    debts_consolidated = VALUES(debts_consolidated),
                    remittance_date = VALUES(remittance_date),
                    -- Ne pas toucher à net_amount_paid ici
                    updated_at = NOW()`,
                [
                    balance.shop_id,
                    balance.remittance_amount,
                    date,
                    balance.payment_operator || null,
                    debtsAmount
                ]
            );
        }
        // CAS 2 : Le solde est NUL ou NÉGATIF -> On nettoie la table remittances
        else {
            // Si un versement 'pending' existait pour ce jour (ex: créé plus tôt quand le solde était positif), on le supprime.
            await connection.execute(
                `DELETE FROM remittances 
                 WHERE shop_id = ? AND remittance_date = ? AND status = 'pending'`,
                [balance.shop_id, date]
            );
        }
    }
};

/**
 * Récupère les versements pour l'affichage, AVEC FILTRE ET CALCUL DE MONTANT NET.
 * Utilise net_amount_paid pour les versements payés.
 */
const findForRemittance = async (filters = {}) => {
    const { date, status, search } = filters;
    const params = [];

    // Le Montant Net est calculé dans le SELECT en utilisant net_amount_paid si 'paid'
    let query = `
        SELECT
            r.id,
            s.id AS shop_id,
            s.name AS shop_name,
            s.payment_name,
            s.phone_number_for_payment,
            s.payment_operator,
            r.amount AS gross_amount,
            r.debts_consolidated,
            r.net_amount_paid, -- Ajouté pour info si besoin, mais le calcul est dans net_amount
            -- *** MODIFICATION ICI: Utilise net_amount_paid si payé, sinon calcule dynamiquement ***
            CASE WHEN r.status = 'paid' THEN r.net_amount_paid ELSE (r.amount - r.debts_consolidated) END AS net_amount,
            r.status,
            r.remittance_date,
            r.payment_date,
            r.transaction_id,
            r.comment,
            u.name as user_name
        FROM remittances r
        JOIN shops s ON r.shop_id = s.id
        LEFT JOIN users u ON r.user_id = u.id
        WHERE 1=1
    `;

    let whereConditions = [];

    // Filtrage par Montant Net à Verser (Bug 1 - N'affiche que les lignes payées OU les lignes en attente avec un Montant Net > 0)
    // Le calcul du net_amount dans le WHERE doit aussi utiliser le CASE pour être cohérent
    whereConditions.push(`
        (
            r.status = 'paid' OR
            (r.status = 'pending' AND (r.amount - r.debts_consolidated) > 0)
        )
    `);

    // Filtrage par date journalière (applique après le filtre de Montant Net)
    if (date) {
        whereConditions.push(`r.remittance_date = ?`);
        params.push(date);
    }

    // Filtrage par statut
    if (status && status !== 'all') {
        whereConditions.push(`r.status = ?`);
        params.push(status);
    }

    // Recherche par mot-clé
    if (search) {
        const searchTerm = `%${search}%`;
        whereConditions.push(`(s.name LIKE ? OR s.payment_name LIKE ? OR s.phone_number_for_payment LIKE ?)`);
        params.push(searchTerm, searchTerm, searchTerm);
    }

    if (whereConditions.length > 0) {
        query += ' AND ' + whereConditions.join(' AND ');
    }

    query += ` ORDER BY r.status DESC, s.name ASC`;
    
    // *** CORRECTION DU BUG 500 : Ajout du bloc try...catch ***
    try {
        const [rows] = await dbConnection.execute(query, params);

        // Formatter les montants
        return rows.map(row => ({
            ...row,
            gross_amount: parseFloat(row.gross_amount || 0),
            debts_consolidated: parseFloat(row.debts_consolidated || 0),
            net_amount: parseFloat(row.net_amount || 0), // net_amount est déjà calculé correctement dans la requête
            net_amount_paid: row.net_amount_paid !== null ? parseFloat(row.net_amount_paid) : null // Formatter aussi celui-ci
        }));
    } catch (error) {
        console.error("Erreur SQL critique dans findForRemittance:", error);
        throw error; // Relance l'erreur pour que le contrôleur la gère (statut 500)
    }
};

/**
 * Marque un versement comme payé.
 * CORRECTION CRITIQUE : Calcule et déduit les dettes en temps réel.
 * UPDATE : Accepte 'effectiveDate' pour forcer la date comptable (remontée dans le temps).
 */
const markAsPaid = async (remittanceId, userId, effectiveDate = null) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        // Définition des dates (Si effectiveDate est fourni par le contrôleur, on l'utilise)
        const paymentDateStr = effectiveDate 
            ? moment(effectiveDate).format('YYYY-MM-DD') 
            : moment().format('YYYY-MM-DD');
            
        // Pour les dettes, on utilise la même date pour que le settled_at soit cohérent
        const settledAtStr = effectiveDate 
            ? moment(effectiveDate).format('YYYY-MM-DD HH:mm:ss') 
            : moment().format('YYYY-MM-DD HH:mm:ss');

        // 1. Récupérer les informations du versement (ID Boutique et Montant Brut)
        const [remittanceRow] = await connection.execute(
            'SELECT shop_id, amount FROM remittances WHERE id = ? AND status = ? FOR UPDATE',
            [remittanceId, 'pending']
        );

        if (remittanceRow.length === 0) {
            throw new Error('Versement non trouvé ou déjà payé.');
        }

        const shopId = remittanceRow[0].shop_id;
        const grossAmount = parseFloat(remittanceRow[0].amount);

        // 2. CALCULER LES DETTES EN TEMPS RÉEL
        const [debtRow] = await connection.execute(
            `SELECT COALESCE(SUM(amount), 0) AS current_total_debts 
             FROM debts 
             WHERE shop_id = ? AND status = 'pending' FOR UPDATE`,
            [shopId]
        );

        const currentDebts = parseFloat(debtRow[0].current_total_debts);

        // 3. Calculer le Montant Net à Payer MAINTENANT
        const netAmountPaid = grossAmount - currentDebts;

        // 4. Mettre à jour le versement avec les valeurs réelles et la DATE EFFECTIVE
        const [updateResult] = await connection.execute(
            `UPDATE remittances 
             SET status = 'paid', 
                 payment_date = ?, -- Utilisation de la date effective
                 user_id = ?, 
                 net_amount_paid = ?, 
                 debts_consolidated = ? 
             WHERE id = ?`,
            [paymentDateStr, userId, netAmountPaid, currentDebts, remittanceId]
        );

        // 5. Marquer les dettes comme payées avec la DATE EFFECTIVE
        if (currentDebts > 0) {
            await connection.execute(
                `UPDATE debts 
                 SET status = 'paid', 
                     settled_at = ?, -- Utilisation de la date effective
                     updated_by = ? 
                 WHERE shop_id = ? AND status = 'pending'`,
                [settledAtStr, userId, shopId]
            );
        }

        await connection.commit();
        return updateResult;

    } catch (error) {
        await connection.rollback(); // Annuler tout en cas d'erreur
        console.error("Erreur critique dans markAsPaid:", error);
        throw error;
    } finally {
        connection.release();
    }
};

// --- AUTRES FONCTIONS (INCHANGÉES) ---

const getShopDetails = async (shopId) => {
    const connection = await dbConnection.getConnection();
    try {
        const [remittances] = await connection.execute(
            'SELECT id, shop_id, amount, remittance_date, payment_date, payment_operator, status, transaction_id, comment, debts_consolidated, net_amount_paid FROM remittances WHERE shop_id = ? ORDER BY payment_date DESC',
            [shopId]
        );
        const [debts] = await connection.execute(
            'SELECT * FROM debts WHERE shop_id = ? AND status = "pending" ORDER BY created_at DESC',
            [shopId]
        );
        const [ordersPayout] = await connection.execute(
             `SELECT COALESCE(SUM(CASE WHEN status = 'delivered' AND payment_status = 'cash' THEN article_amount - delivery_fee - expedition_fee WHEN status = 'delivered' AND payment_status = 'paid_to_supplier' THEN -delivery_fee - expedition_fee WHEN status = 'failed_delivery' THEN amount_received - delivery_fee - expedition_fee ELSE 0 END), 0) AS orders_payout_amount
              FROM orders
              WHERE shop_id = ? AND (status IN ('delivered', 'failed_delivery'))`,
             [shopId]
        );
        const ordersPayoutAmount = ordersPayout[0].orders_payout_amount || 0;
        const totalDebt = debts.reduce((sum, debt) => sum + parseFloat(debt.amount), 0);
        const totalRemitted = remittances.reduce((sum, rem) => {
            const amountConsidered = rem.status === 'paid' ? parseFloat(rem.net_amount_paid || 0) : parseFloat(rem.amount - rem.debts_consolidated);
            return sum + (amountConsidered > 0 ? amountConsidered : 0); 
        }, 0);

        const currentBalance = ordersPayoutAmount - totalDebt; 
        return { remittances, debts, currentBalance };
    } finally {
        connection.release();
    }
};

const updateShopPaymentDetails = async (shopId, paymentData) => {
    const { payment_name, phone_number_for_payment, payment_operator } = paymentData;
    const query = 'UPDATE shops SET payment_name = ?, phone_number_for_payment = ?, payment_operator = ? WHERE id = ?';
    const [result] = await dbConnection.execute(query, [payment_name, phone_number_for_payment, payment_operator, shopId]);
    return result;
};

const recordRemittance = async (shopId, amount, paymentOperator, status, transactionId = null, comment = null, userId) => {
    const query = 'INSERT INTO remittances (shop_id, amount, remittance_date, payment_operator, status, transaction_id, comment, user_id) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?)';
    const [result] = await dbConnection.execute(query, [shopId, amount, paymentOperator, status, transactionId, comment, userId]);
    return result;
};


// --- DÉBUT : AJOUTS POUR OUTILS IA MARCHAND ---

const getDateRange = (period) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    switch (period) {
        case 'today':
            return { start: today, end: tomorrow };
        case 'yesterday':
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            return { start: yesterday, end: today };
        case 'this_week':
            const firstDayOfWeek = new Date(today);
            firstDayOfWeek.setDate(today.getDate() - today.getDay()); 
            return { start: firstDayOfWeek, end: tomorrow };
        case 'last_week':
            const firstDayOfLastWeek = new Date(today);
            firstDayOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
            const firstDayOfThisWeek = new Date(today);
            firstDayOfThisWeek.setDate(today.getDate() - today.getDay());
            return { start: firstDayOfLastWeek, end: firstDayOfThisWeek };
        case 'this_month':
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            return { start: firstDayOfMonth, end: tomorrow };
        default:
            return { start: today, end: tomorrow }; 
    }
};

const getHistoryForShop = async (shopId, period) => {
    const connection = await dbConnection.getConnection();
    try {
        const { start, end } = getDateRange(period);
        
        const query = `
            SELECT remittance_date, amount, status, net_amount_paid, debts_consolidated
            FROM remittances
            WHERE shop_id = ?
            AND remittance_date >= ?
            AND remittance_date < ?
            ORDER BY remittance_date DESC
        `;
        
        const [rows] = await connection.execute(query, [shopId, start, end]);
        return rows;
    } catch (error) {
        console.error(`Erreur getHistoryForShop pour shop ${shopId}:`, error);
        throw error;
    } finally {
        connection.release();
    }
};

// --- FIN : AJOUTS POUR OUTILS IA MARCHAND ---


module.exports = {
    init,
    findForRemittance, 
    syncDailyBalancesToRemittances, 
    getShopDetails, 
    updateShopPaymentDetails, 
    recordRemittance, 
    markAsPaid, 
    getHistoryForShop 
};
