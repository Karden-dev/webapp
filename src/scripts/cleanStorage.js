// src/scripts/cleanStorage.js
require('dotenv').config(); // Charge les variables d'environnement (DB_HOST, etc.)
const mysql = require('mysql2/promise');

// Configuration de la base de données
// Assure-toi que ces variables sont bien dans ton fichier .env
// Ou remplace process.env.DB_XXX par tes valeurs en dur si nécessaire
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'csdkqyubnt_winddb',
    port: process.env.DB_PORT || 3306
};

async function cleanStorageData() {
    let connection;
    try {
        console.log('🔌 Connexion à la base de données...');
        connection = await mysql.createConnection(dbConfig);
        
        console.log('🔄 Démarrage de la transaction de nettoyage...');
        await connection.beginTransaction();

        // 1. Suppression des dettes orphelines (Table debts)
        // On cible uniquement les dettes de 100F liées à des jours sans ventes
        const deleteDebtsQuery = `
            DELETE d 
            FROM debts d
            INNER JOIN daily_shop_balances dsb 
                ON d.shop_id = dsb.shop_id 
                AND DATE(d.created_at) = dsb.report_date
            WHERE d.type = 'daily_balance' 
              AND d.status = 'pending' 
              AND d.amount = 100 
              AND dsb.total_storage_fees = 100 
              AND dsb.total_orders_sent = 0 
              AND dsb.total_orders_delivered = 0;
        `;

        const [debtResult] = await connection.execute(deleteDebtsQuery);
        console.log(`✅ Étape 1 : ${debtResult.affectedRows} dettes de stockage (100F) supprimées.`);

        // 2. Suppression des rapports journaliers vides (Table daily_shop_balances)
        // On cible les rapports où seul le stockage a été facturé
        const deleteBalancesQuery = `
            DELETE FROM daily_shop_balances 
            WHERE total_storage_fees = 100 
              AND remittance_amount = -100 
              AND total_orders_sent = 0 
              AND total_orders_delivered = 0;
        `;

        const [balanceResult] = await connection.execute(deleteBalancesQuery);
        console.log(`✅ Étape 2 : ${balanceResult.affectedRows} rapports journaliers vides supprimés.`);

        await connection.commit();
        console.log('🎉 Nettoyage terminé avec succès ! La base est propre.');

    } catch (error) {
        if (connection) {
            console.log('⚠️ Erreur rencontrée, annulation des modifications (Rollback)...');
            await connection.rollback();
        }
        console.error('❌ Erreur fatale lors du nettoyage :', error.message);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Déconnexion.');
        }
        process.exit();
    }
}

// Exécution du script
cleanStorageData();