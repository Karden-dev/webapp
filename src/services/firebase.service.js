// src/services/firebase.service.js

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs'); // <--- AJOUTÉ pour le logging

// --- DEBUT DU MODULE DE LOGGING (intégré) ---

// CORRECTION: Chemin mis à jour pour logger dans /src/
const logStream = fs.createWriteStream(
    path.join(__dirname, '..', 'mon_app.log'), // Va de /src/services/ à /src/mon_app.log
    { flags: 'a' }
);

/**
 * Écrit un message dans le fichier de log.
 * @param {string} level - Le niveau du log (INFO, WARN, ERROR).
 * @param {string} message - Le message à logger.
 */
function writeLog(level, message) {
    try {
        const date = new Date().toISOString();
        const logMessage = `[${date}] [${level}] [FirebaseService] ${message}\n`;
        
        // Écrit dans le fichier
        logStream.write(logMessage);
        
        // Écrit aussi dans la console (au cas où)
        if (level === 'ERROR' || level === 'WARN') {
            console.warn(logMessage.trim());
        } else {
            console.log(logMessage.trim());
        }
    } catch (error) {
        console.error("Erreur critique du logger:", error);
    }
}
// --- FIN DU MODULE DE LOGGING ---


// Chemin vers la clé de service (placée à la racine du projet)
const serviceAccountPath = path.join(__dirname, '..', '..', 'serviceAccountKey.json');

let isInitialized = false;

/**
 * Initialise l'SDK Firebase Admin
 */
function initialize() {
    try {
        const serviceAccount = require(serviceAccountPath);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        isInitialized = true;
        writeLog('INFO', '🔥 Service Firebase Admin initialisé avec succès.');

    } catch (error) {
        writeLog('ERROR', `❌ ERREUR: Impossible d'initialiser Firebase Admin. Assurez-vous que le fichier "serviceAccountKey.json" est présent à la racine. Erreur: ${error.message}`);
    }
}

/**
 * Envoie une notification push à un appareil spécifique via son token FCM.
 * @param {string} token - Le token FCM du destinataire.
 * @param {string} title - Le titre de la notification.
 * @param {string} body - Le corps du message de la notification.
 * @param {Object} [data={}] - Données supplémentaires (payload) à envoyer.
 */
async function sendPushNotification(token, title, body, data = {}) {
    if (!isInitialized) {
        writeLog('WARN', 'Firebase Admin non initialisé. Envoi de notification annulé.');
        return;
    }

    if (!token) {
        writeLog('WARN', 'Tentative d\'envoi de notification sans token FCM.');
        return;
    }

    // --- CORRECTION POUR L'ERREUR "data must only contain string values" ---
    // Firebase Data Payload n'accepte que des chaînes.
    // Nous convertissons toutes les valeurs (nombres, etc.) en chaînes.
    const sanitizedData = {};
    if (data) {
        for (const key in data) {
            const value = data[key];
            if (value !== null && value !== undefined) {
                sanitizedData[key] = String(value); // Convertit tout en String
            }
        }
    }
    // --- FIN DE LA CORRECTION ---

    const message = {
        token: token,
        notification: {
            title: title,
            body: body,
        },
        data: sanitizedData, // <-- Utilise les données converties
        
        // Configuration APNs (Apple) pour affichage en arrière-plan
        apns: {
            payload: {
                aps: {
                    'content-available': 1,
                },
            },
        },
        // Configuration Android pour priorité haute
        android: {
            priority: 'high',
        },
    };

    try {
        const response = await admin.messaging().send(message);
        writeLog('INFO', `🚀 Notification push envoyée avec succès à ${token.substring(0, 20)}... (Titre: ${title}) (ID: ${response})`);
    } catch (error) {
        writeLog('ERROR', `❌ Erreur lors de l'envoi de la notification push à ${token.substring(0, 20)}...: ${error.message}`);
        
        if (error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/invalid-registration-token') {
            writeLog('WARN', `Token FCM ${token} invalide. Il devrait être supprimé de la base de données.`);
        }
    }
}

module.exports = {
    initialize,
    sendPushNotification
};