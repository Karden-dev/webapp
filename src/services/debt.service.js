// src/services/debt.service.js
const moment = require('moment');
// Import du service de bilan pour synchroniser les dettes
const balanceService = require('./balance.service');

let dbConnection;

const init = (connection) => { 
    dbConnection = connection; 
};

/**
 * Traite les frais de stockage (Paiement au succès)
 * Prend en compte l'historique d'activation pour éviter la surfacturation.
 */
const processStorageFees = async (processingDate) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();
        const dateString = moment(processingDate).format('YYYY-MM-DD');
        const currentDate = moment(dateString);

        // 1. Récupérer les boutiques actives (ventes ce jour) qui ont le stockage activé
        const [activeShops] = await connection.execute(`
            SELECT DISTINCT o.shop_id, s.storage_price, s.created_at
            FROM orders o
            JOIN shops s ON o.shop_id = s.id
            WHERE DATE(o.created_at) = ? AND s.bill_storage = 1
        `, [dateString]);

        let processedCount = 0;

        for (const shop of activeShops) {
            // A. Sécurité anti-double clic
            const [currentBalance] = await connection.execute(
                'SELECT total_storage_fees FROM daily_shop_balances WHERE shop_id = ? AND report_date = ?',
                [shop.shop_id, dateString]
            );

            if (currentBalance.length === 0 || parseFloat(currentBalance[0].total_storage_fees) > 0) {
                continue;
            }

            const storagePrice = parseFloat(shop.storage_price || 0);
            
            // B. Trouver la date d'activation du cycle actuel (depuis shop_storage_history)
            // On cherche la période active (end_date IS NULL)
            const [historyRows] = await connection.execute(
                'SELECT start_date FROM shop_storage_history WHERE shop_id = ? AND end_date IS NULL ORDER BY start_date DESC LIMIT 1',
                [shop.shop_id]
            );

            // Date de référence : soit la date d'activation du stockage, soit la création de la boutique par défaut
            let activationDate = moment(shop.created_at);
            if (historyRows.length > 0) {
                activationDate = moment(historyRows[0].start_date);
            }

            // C. Trouver le dernier paiement effectué
            const [lastStorageRow] = await connection.execute(`
                SELECT report_date 
                FROM daily_shop_balances 
                WHERE shop_id = ? 
                AND report_date < ? 
                AND total_storage_fees > 0
                ORDER BY report_date DESC 
                LIMIT 1
            `, [shop.shop_id, dateString]);

            let daysToCharge = 0;
            let lastPaidDate = null;

            if (lastStorageRow.length > 0) {
                lastPaidDate = moment(lastStorageRow[0].report_date);
            }

            // D. CALCUL INTELLIGENT
            if (lastPaidDate && lastPaidDate.isSameOrAfter(activationDate)) {
                // Cas 1 : Il a déjà payé depuis qu'il a activé le stockage.
                // On compte les jours depuis le dernier paiement jusqu'à aujourd'hui.
                // Ex: Payé le 25. On est le 27. Diff = 2 jours (le 26 et le 27).
                daysToCharge = currentDate.diff(lastPaidDate, 'days');
            } else {
                // Cas 2 : C'est le premier paiement de cette période d'activation.
                // On compte depuis la date d'activation jusqu'à aujourd'hui (inclus).
                // Ex: Activé le 25. On est le 27. Diff = 2. On ajoute 1 pour inclure le jour d'activation => 3 jours.
                const diffDays = currentDate.diff(activationDate, 'days');
                daysToCharge = diffDays >= 0 ? diffDays + 1 : 1; 
            }

            // Sécurité : On ne facture pas 0 ou négatif
            if (daysToCharge <= 0) daysToCharge = 1;

            const totalAmount = daysToCharge * storagePrice;

            // E. Mise à jour du bilan
            const updateQuery = `
                UPDATE daily_shop_balances 
                SET total_storage_fees = ?, 
                    remittance_amount = remittance_amount - ?
                WHERE shop_id = ? AND report_date = ?
            `;
            
            await connection.execute(updateQuery, [totalAmount, totalAmount, shop.shop_id, dateString]);
            processedCount++;

            // F. Synchronisation dette
            await balanceService.syncBalanceDebt(connection, shop.shop_id, dateString);
        }

        await connection.commit();
        
        if (processedCount === 0 && activeShops.length > 0) {
            return { message: `Aucun nouveau frais appliqué. Stockage déjà à jour pour les boutiques actives.` };
        } else if (activeShops.length === 0) {
            return { message: `Aucune boutique avec stockage n'a eu d'activité le ${processingDate}.` };
        }

        return { message: `${processedCount} boutique(s) mise(s) à jour avec le rattrapage de stockage.` };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const consolidateDailyBalances = async (dateToConsolidate) => {
    console.log(`[INFO] Consolidation automatique désactivée (Gérée par recalcul).`);
    return { message: `La consolidation automatique des soldes est désactivée.` };
};

module.exports = {
    init,
    processStorageFees,
    consolidateDailyBalances,
};