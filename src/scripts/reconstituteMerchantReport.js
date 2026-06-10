// src/scripts/reconstituteMerchantReport.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const moment = require('moment');
const balanceService = require('../services/balance.service');

// Configuration BDD
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
};

// Récupération des arguments
const args = process.argv.slice(2);
const targetDateArg = args[0];
const targetShopIdArg = args[1];

if (!targetDateArg || !targetShopIdArg) {
    console.error("❌ Usage incorrect.");
    console.error("👉 Commande : node src/scripts/reconstituteMerchantReport.js <YYYY-MM-DD> <SHOP_ID>");
    process.exit(1);
}

if (!moment(targetDateArg, 'YYYY-MM-DD', true).isValid()) {
    console.error("❌ Format de date invalide. Utilisez AAAA-MM-JJ.");
    process.exit(1);
}

const runReconstitution = async () => {
    let connection;
    try {
        console.log(`🔌 Connexion à la base de données...`);
        connection = await mysql.createConnection(dbConfig);
        
        // Initialiser le service avec la connexion
        balanceService.init(connection);

        const targetDate = moment(targetDateArg).format('YYYY-MM-DD');
        const shopId = parseInt(targetShopIdArg);

        console.log(`🎯 Cible : Marchand ID ${shopId} pour le ${targetDate}`);

        // ---------------------------------------------------------------------
        // ÉTAPE 1 : NETTOYAGE COMPLET (Bilan, Dettes, Versements)
        // ---------------------------------------------------------------------
        console.log(`🧹 1. Nettoyage des anciennes données...`);
        
        // Supprimer le bilan journalier existant
        await connection.execute(
            'DELETE FROM daily_shop_balances WHERE report_date = ? AND shop_id = ?', 
            [targetDate, shopId]
        );
        
        // Supprimer la dette "Bilan Négatif" de ce jour
        await connection.execute(
            "DELETE FROM debts WHERE DATE(created_at) = ? AND shop_id = ? AND type = 'daily_balance'", 
            [targetDate, shopId]
        );

        // Supprimer le versement "En attente" de ce jour
        await connection.execute(
            "DELETE FROM remittances WHERE remittance_date = ? AND shop_id = ? AND status = 'pending'",
            [targetDate, shopId]
        );

        // ---------------------------------------------------------------------
        // ÉTAPE 2 : RECALCUL DU BILAN (Basé sur les Commandes)
        // ---------------------------------------------------------------------
        console.log(`🔄 2. Recalcul du bilan à partir des commandes...`);

        // IMPORTANT : On récupère bien bill_packaging et packaging_price ici
        const [orders] = await connection.execute(`
            SELECT o.*, s.bill_packaging, s.packaging_price, s.bill_storage, s.storage_price, s.payment_operator
            FROM orders o 
            JOIN shops s ON o.shop_id = s.id
            WHERE o.shop_id = ? AND DATE(o.created_at) = ?
            ORDER BY o.created_at ASC
        `, [shopId, targetDate]);

        console.log(`📦 ${orders.length} commande(s) trouvée(s).`);

        for (const order of orders) {
            // A. Impact Création (Envoi + Frais Expédition)
            await balanceService.updateDailyBalance(connection, {
                shop_id: order.shop_id,
                date: targetDate,
                orders_sent: 1,
                expedition_fees: parseFloat(order.expedition_fee || 0)
            });

            // B. Impact Statut (Livré, Échoué, etc.)
            // balanceService utilise 'bill_packaging' présent dans 'order' pour calculer les frais
            const statusImpact = balanceService.getBalanceImpactForStatus(order);
            
            if (Object.values(statusImpact).some(val => val !== 0)) {
                // Log de vérification pour les emballages
                if (statusImpact.packaging_fees && statusImpact.packaging_fees > 0) {
                    console.log(`   📦 Frais d'emballage (+${statusImpact.packaging_fees} F) appliqués sur Cde #${order.id}`);
                }

                await balanceService.updateDailyBalance(connection, {
                    shop_id: order.shop_id,
                    date: targetDate,
                    ...statusImpact
                });
            }
        }

        // ---------------------------------------------------------------------
        // ÉTAPE 3 : APPLICATION DES FRAIS DE STOCKAGE (Optionnel)
        // ---------------------------------------------------------------------
        const [shopInfo] = await connection.execute(
            'SELECT bill_storage, storage_price, payment_operator FROM shops WHERE id = ?', 
            [shopId]
        );

        if (shopInfo.length > 0 && shopInfo[0].bill_storage) {
            const storagePrice = parseFloat(shopInfo[0].storage_price);
            console.log(`🏭 3. Application des frais de stockage (${storagePrice} F)...`);
            
            const storageQuery = `
                INSERT INTO daily_shop_balances 
                (report_date, shop_id, total_storage_fees, remittance_amount, status)
                VALUES (?, ?, ?, ?, 'pending')
                ON DUPLICATE KEY UPDATE
                    remittance_amount = CASE WHEN total_storage_fees = 0 THEN remittance_amount - VALUES(total_storage_fees) ELSE remittance_amount END,
                    total_storage_fees = CASE WHEN total_storage_fees = 0 THEN VALUES(total_storage_fees) ELSE total_storage_fees END
            `;
            await connection.execute(storageQuery, [targetDate, shopId, storagePrice, -storagePrice]);
        }

        // ---------------------------------------------------------------------
        // ÉTAPE 4 : SYNCHRONISATION DETTES & VERSEMENTS
        // ---------------------------------------------------------------------
        console.log(`⚖️  4. Synchronisation finale (Dettes / Versements)...`);

        // A. Créer la dette si le solde est négatif
        await balanceService.syncBalanceDebt(connection, shopId, targetDate);

        // B. Créer le versement si le solde est positif
        const [balanceRows] = await connection.execute(
            'SELECT remittance_amount FROM daily_shop_balances WHERE shop_id = ? AND report_date = ?',
            [shopId, targetDate]
        );

        if (balanceRows.length > 0) {
            const remittanceAmount = parseFloat(balanceRows[0].remittance_amount);

            if (remittanceAmount > 0) {
                console.log(`💰 Solde positif (${remittanceAmount} F). Création/Mise à jour du versement...`);

                const [debtRow] = await connection.execute(
                    `SELECT COALESCE(SUM(amount), 0) AS total_pending_debts
                     FROM debts
                     WHERE shop_id = ? AND status = 'pending'`,
                    [shopId]
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
                    [shopId, remittanceAmount, targetDate, paymentOperator, debtsAmount]
                );
            } else {
                console.log(`📉 Solde négatif ou nul (${remittanceAmount} F). Aucun versement créé.`);
            }
        } else {
            console.log(`⚠️ Aucun bilan trouvé après calcul (Pas de commandes ni stockage).`);
        }

        console.log(`✅ RECONSTITUTION COMPLÈTE TERMINÉE.`);

    } catch (error) {
        console.error('❌ Erreur critique :', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Connexion fermée.');
        }
    }
};

runReconstitution();