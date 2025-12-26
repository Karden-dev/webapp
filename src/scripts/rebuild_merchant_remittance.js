// src/scripts/rebuild_merchant_remittance.js
require('dotenv').config();
const mysql = require('mysql2/promise');
const moment = require('moment');

// Import des services existants
const balanceService = require('../services/balance.service');
const remittanceModel = require('../models/remittance.model');

// Configuration BDD
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
};

const runRebuild = async () => {
    // 1. Récupération des arguments (CLI)
    // process.argv[0] = node, [1] = script, [2] = date, [3] = shopId
    const args = process.argv.slice(2);
    
    if (args.length !== 2) {
        console.error("❌ ERREUR : Arguments manquants.");
        console.error("👉 Usage attendu : node src/scripts/rebuild_merchant_remittance.js <YYYY-MM-DD> <SHOP_ID>");
        process.exit(1);
    }

    const targetDate = args[0];
    const shopId = parseInt(args[1], 10);

    // Validation
    if (!moment(targetDate, 'YYYY-MM-DD', true).isValid()) {
        console.error(`❌ Date invalide : ${targetDate}. Format attendu : YYYY-MM-DD`);
        process.exit(1);
    }
    if (isNaN(shopId)) {
        console.error(`❌ ID Marchand invalide : ${args[1]}`);
        process.exit(1);
    }

    let connection;
    try {
        console.log(`🔌 Connexion à la BDD...`);
        connection = await mysql.createConnection(dbConfig);
        
        // Initialisation des services avec la connexion active
        balanceService.init(connection);
        remittanceModel.init(connection);

        console.log(`🎯 DÉMARRAGE RECONSTRUCTION CIBLÉE`);
        console.log(`   📅 Date : ${targetDate}`);
        console.log(`   🏪 Marchand ID : ${shopId}`);

        // ÉTAPE 1 : Nettoyage (Suppression de l'ancien bilan journalier)
        console.log('1️⃣  Nettoyage de l\'ancien bilan...');
        await connection.execute(
            'DELETE FROM daily_shop_balances WHERE shop_id = ? AND report_date = ?', 
            [shopId, targetDate]
        );

        // ÉTAPE 2 : Récupération des commandes
        console.log('2️⃣  Analyse des commandes...');
        const [orders] = await connection.execute(`
            SELECT o.*, s.bill_packaging, s.packaging_price 
            FROM orders o 
            JOIN shops s ON o.shop_id = s.id
            WHERE o.shop_id = ? 
            AND DATE(o.created_at) = ?
        `, [shopId, targetDate]);

        console.log(`   -> ${orders.length} commande(s) trouvée(s).`);

        // ÉTAPE 3 : Recalcul complet
        if (orders.length > 0) {
            console.log('3️⃣  Recalcul des montants...');
            for (const order of orders) {
                // A. Impact de l'envoi (frais d'expédition + compteur envoi)
                await balanceService.updateDailyBalance(connection, {
                    shop_id: order.shop_id,
                    date: targetDate,
                    orders_sent: 1,
                    expedition_fees: parseFloat(order.expedition_fee || 0)
                });

                // B. Impact du statut (Livré / Échec)
                // Exclure les statuts intermédiaires qui n'ont pas d'impact financier final
                const intermediateStatuses = ['pending', 'in_progress', 'reported', 'ready_for_pickup', 'en_route', 'return_declared', 'Ne decroche pas', 'Injoignable', 'A relancer', 'Reportée'];
                
                if (!intermediateStatuses.includes(order.status) && order.status !== 'cancelled') {
                    const statusImpact = balanceService.getBalanceImpactForStatus(order);
                    await balanceService.updateDailyBalance(connection, {
                        shop_id: order.shop_id,
                        date: targetDate,
                        ...statusImpact
                    });
                }
            }
        } else {
            console.log('⚠️  Aucune commande ce jour-là. Le bilan restera vide.');
        }

        // ÉTAPE 4 : Synchronisation Finale (Dettes & Versements)
        console.log('4️⃣  Mise à jour Dettes & Versements...');
        
        // A. Synchroniser les dettes (si solde négatif)
        await balanceService.syncBalanceDebt(connection, shopId, targetDate);
        
        // B. Synchroniser les versements (si solde positif)
        // Utilise la fonction existante qui scanne daily_shop_balances pour la date donnée
        await remittanceModel.syncDailyBalancesToRemittances(targetDate, connection);

        console.log('\n✅ RECONSTRUCTION TERMINÉE AVEC SUCCÈS.');

    } catch (error) {
        console.error('\n❌ ERREUR CRITIQUE :', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Déconnexion.');
        }
    }
};

runRebuild();