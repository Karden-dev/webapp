// src/services/report.service.js
const moment = require('moment');
const balanceService = require('./balance.service');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

/**
 * Reconstitue le rapport journalier d'un marchand spécifique pour une date donnée.
 * Cette fonction est transactionnelle et sécurisée :
 * 1. Nettoie les données existantes (sauf versements payés).
 * 2. Recalcule le bilan basé sur les commandes.
 * 3. Réapplique les frais de stockage.
 * 4. Synchronise les dettes et les versements (avec protection des paiements effectués).
 */
const reconstituteMerchantReport = async (date, shopId) => {
    // On utilise une connexion dédiée pour la transaction
    const connection = await dbConnection.getConnection();
    
    try {
        await connection.beginTransaction();

        const targetDate = moment(date).format('YYYY-MM-DD');
        const shopIdInt = parseInt(shopId);

        // --- ÉTAPE 1 : NETTOYAGE PRÉALABLE ---
        // On supprime le bilan, la dette de bilan, et les versements EN ATTENTE.
        // On ne touche PAS aux versements 'paid'.
        
        await connection.execute(
            'DELETE FROM daily_shop_balances WHERE report_date = ? AND shop_id = ?', 
            [targetDate, shopIdInt]
        );
        
        await connection.execute(
            "DELETE FROM debts WHERE DATE(created_at) = ? AND shop_id = ? AND type = 'daily_balance'", 
            [targetDate, shopIdInt]
        );

        await connection.execute(
            "DELETE FROM remittances WHERE remittance_date = ? AND shop_id = ? AND status = 'pending'",
            [targetDate, shopIdInt]
        );

        // --- ÉTAPE 2 : RECALCUL DU BILAN (COMMANDES) ---
        
        // Récupération des commandes avec les infos de facturation du shop
        const [orders] = await connection.execute(`
            SELECT o.*, s.bill_packaging, s.packaging_price, s.bill_storage, s.storage_price, s.payment_operator
            FROM orders o 
            JOIN shops s ON o.shop_id = s.id
            WHERE o.shop_id = ? AND DATE(o.created_at) = ?
            ORDER BY o.created_at ASC
        `, [shopIdInt, targetDate]);

        // Application des impacts pour chaque commande
        for (const order of orders) {
            // Impact Création (Course envoyée + Frais expédition)
            await balanceService.updateDailyBalance(connection, {
                shop_id: order.shop_id,
                date: targetDate,
                orders_sent: 1,
                expedition_fees: parseFloat(order.expedition_fee || 0)
            });

            // Impact Statut (Livré / Échoué / etc.)
            const statusImpact = balanceService.getBalanceImpactForStatus(order);
            if (Object.values(statusImpact).some(val => val !== 0)) {
                await balanceService.updateDailyBalance(connection, {
                    shop_id: order.shop_id,
                    date: targetDate,
                    ...statusImpact
                });
            }
        }

        // --- ÉTAPE 3 : APPLICATION DES FRAIS DE STOCKAGE ---
        
        const [shopInfo] = await connection.execute(
            'SELECT bill_storage, storage_price, payment_operator FROM shops WHERE id = ?', 
            [shopIdInt]
        );

        if (shopInfo.length > 0 && shopInfo[0].bill_storage) {
            const storagePrice = parseFloat(shopInfo[0].storage_price || 0);
            
            // Insertion ou Mise à jour pour les frais de stockage
            const storageQuery = `
                INSERT INTO daily_shop_balances 
                (report_date, shop_id, total_storage_fees, remittance_amount, status)
                VALUES (?, ?, ?, ?, 'pending')
                ON DUPLICATE KEY UPDATE
                    remittance_amount = CASE WHEN total_storage_fees = 0 THEN remittance_amount - VALUES(total_storage_fees) ELSE remittance_amount END,
                    total_storage_fees = CASE WHEN total_storage_fees = 0 THEN VALUES(total_storage_fees) ELSE total_storage_fees END
            `;
            // Le montant à verser diminue (est débité) du montant du stockage
            await connection.execute(storageQuery, [targetDate, shopIdInt, storagePrice, -storagePrice]);
        }

        // --- ÉTAPE 4 : SYNCHRONISATION (DETTES & VERSEMENTS) ---

        // A. Créer la dette si le solde est négatif
        await balanceService.syncBalanceDebt(connection, shopIdInt, targetDate);

        // B. Gérer le versement
        let resultMessage = "Recalcul effectué avec succès.";
        let remittanceDiff = 0;

        const [balanceRows] = await connection.execute(
            'SELECT remittance_amount FROM daily_shop_balances WHERE shop_id = ? AND report_date = ?',
            [shopIdInt, targetDate]
        );

        if (balanceRows.length > 0) {
            const remittanceAmount = parseFloat(balanceRows[0].remittance_amount);

            // SÉCURITÉ CRITIQUE : Vérifier s'il existe déjà un versement PAYÉ
            const [existingPaid] = await connection.execute(
                "SELECT id, amount FROM remittances WHERE shop_id = ? AND remittance_date = ? AND status = 'paid'",
                [shopIdInt, targetDate]
            );

            if (existingPaid.length > 0) {
                const paidAmount = parseFloat(existingPaid[0].amount);
                remittanceDiff = remittanceAmount - paidAmount;
                
                resultMessage = `Recalcul terminé. ATTENTION : Un versement de ${paidAmount} F est déjà PAYÉ. Le nouveau montant théorique est ${remittanceAmount} F (Écart: ${remittanceDiff} F). Aucune modification n'a été apportée au versement payé.`;
            } 
            else if (remittanceAmount > 0) {
                // Pas de versement payé, on peut créer ou mettre à jour le pending
                const [debtRow] = await connection.execute(
                    `SELECT COALESCE(SUM(amount), 0) AS total_pending_debts
                     FROM debts
                     WHERE shop_id = ? AND status = 'pending'`,
                    [shopIdInt]
                );
                const debtsAmount = parseFloat(debtRow[0]?.total_pending_debts || 0);
                const paymentOperator = shopInfo[0]?.payment_operator || null;

                await connection.execute(
                    `INSERT INTO remittances
                        (shop_id, amount, remittance_date, payment_operator, status, user_id, debts_consolidated)
                     VALUES (?, ?, ?, ?, 'pending', 1, ?)
                     ON DUPLICATE KEY UPDATE
                        amount = VALUES(amount),
                        payment_operator = VALUES(payment_operator),
                        debts_consolidated = VALUES(debts_consolidated),
                        updated_at = NOW()`,
                    [shopIdInt, remittanceAmount, targetDate, paymentOperator, debtsAmount]
                );
                resultMessage = `Recalcul terminé. Versement mis à jour à ${remittanceAmount} F.`;
            } else {
                resultMessage = `Recalcul terminé. Solde nul ou négatif (${remittanceAmount} F).`;
            }
        }

        await connection.commit();
        
        return { 
            success: true, 
            message: resultMessage, 
            diff: remittanceDiff 
        };

    } catch (error) {
        await connection.rollback();
        console.error("Erreur dans report.service.reconstituteMerchantReport:", error);
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    reconstituteMerchantReport
};