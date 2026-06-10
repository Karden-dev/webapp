// init_pin.js
require('dotenv').config(); // Charge vos accès BDD depuis .env
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const TARGET_PHONE_NUMBER = '650724683'; // <--- REMPLACEZ PAR LE NUMÉRO DE VOTRE MARCHAND TEST
const NEW_PIN = '1234';

async function setPin() {
    console.log(`🔐 Génération du PIN pour le numéro ${TARGET_PHONE_NUMBER}...`);

    let connection;
    try {
        // 1. Connexion BDD
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE
        });

        // 2. Hashage du PIN
        const salt = await bcrypt.genSalt(10);
        const pinHash = await bcrypt.hash(NEW_PIN, salt);

        // 3. Mise à jour en base
        const [result] = await connection.execute(
            'UPDATE shops SET pin_hash = ?, is_stock_managed = 1 WHERE phone_number = ?',
            [pinHash, TARGET_PHONE_NUMBER]
        );

        if (result.affectedRows > 0) {
            console.log(`✅ SUCCÈS ! Le marchand ${TARGET_PHONE_NUMBER} a maintenant le PIN "${NEW_PIN}".`);
            console.log(`👉 Vous pouvez vous connecter sur l'appli mobile.`);
        } else {
            console.error(`❌ ERREUR : Aucun marchand trouvé avec le numéro ${TARGET_PHONE_NUMBER}.`);
            console.error(`   Vérifiez que ce numéro existe bien dans votre table 'shops'.`);
        }

    } catch (error) {
        console.error("❌ Erreur technique :", error);
    } finally {
        if (connection) await connection.end();
    }
}

setPin();