// src/controllers/whatsapp.controller.js

const crypto = require('crypto');
const WhatsAppService = require('../services/whatsapp.service');
const AIService = require('../services/ai.service');
const UserModel = require('../models/user.model');
const ShopModel = require('../models/shop.model'); // <-- AJOUT NÉCESSAIRE
const ProspectModel = require('../models/shop.prospect.model');

// --- DÉBUT DU LOGGER PERSONNALISÉ ---
const fs = require('fs');
const path = require('path');
const logFilePath = path.join(__dirname, '..', 'whatsapp_debug.log');

/**
 * Écrit un message de log dans le fichier whatsapp_debug.log
 * @param {string} message Le message à enregistrer
 */
const logToFile = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;
    try {
        fs.appendFileSync(logFilePath, logMessage, 'utf8');
    } catch (err) {
        console.error(`Échec de l'écriture dans le fichier log: ${err.message}`);
    }
};
// --- FIN DU LOGGER PERSONNALISÉ ---


// --- ANTI-DOUBLON (Inchangé) ---
const PROCESSED_MESSAGE_IDS = new Map();
const MESSAGE_CACHE_EXPIRATION_MS = 1000 * 60 * 5; // 5 minutes

setInterval(() => {
    const now = Date.now();
    PROCESSED_MESSAGE_IDS.forEach((timestamp, id) => {
        if (now - timestamp > MESSAGE_CACHE_EXPIRATION_MS) {
            PROCESSED_MESSAGE_IDS.delete(id);
        }
    });
}, MESSAGE_CACHE_EXPIRATION_MS * 2); 
// --- FIN DE L'ANTI-DOUBLON ---


// --- SÉCURITÉ (Inchangé) ---
const WEBHOOK_SECRET = process.env.WASENDER_WEBHOOK_SECRET;
const DEBUG_MODE_SKIP_SECURITY = (!WEBHOOK_SECRET || WEBHOOK_SECRET === 'VOTRE_SECRET_FOURNI_PAR_WASENDER');

const verifyWasenderSignature = (signature, secret) => {
    if (DEBUG_MODE_SKIP_SECURITY) {
        logToFile("ATTENTION SÉCURITÉ: Contournement de la vérification de signature (DEBUG_MODE_SKIP_SECURITY=true).");
        return true;
    }
    if (!secret || !signature) {
        logToFile("[ERREUR SÉCURITÉ] Secret ou Signature manquant.");
        return false;
    }
    
    const isMatch = (signature === secret); 
    
    if (!isMatch) {
        logToFile(`[SIG VERIFY] ÉCHEC. Signature reçue: ${signature.substring(0, 5)}...`);
    } else {
        logToFile("[SIG VERIFY] Signature vérifiée avec succès !");
    }
    return isMatch;
};


/**
 * (CORRIGÉ) Fonction utilitaire pour vérifier l'identité de l'expéditeur dans la BD.
 * Ordre de priorité : Employés (users) -> Marchands (shops) -> Prospects (shop_prospect)
 */
const identifyUser = async (phoneNumber) => {
    // 1. Initialisation par défaut
    let userInfo = { phoneNumber: phoneNumber, role: 'prospect_b2b', id: null, name: 'Nouveau Prospect', shopId: null };
    
    try {
        // 2. Vérifier si c'est un employé (Admin ou Livreur)
        const user = await UserModel.findByPhoneNumber(phoneNumber); 
        if (user && user.status === 'actif') { // Vérifie aussi le statut
            userInfo.role = user.role; // 'admin' ou 'livreur'
            userInfo.id = user.id; 
            // userInfo.shopId = user.shop_id; // 'shop_id' n'existe pas dans la table users (1).sql
            userInfo.name = user.name;
            return userInfo;
        }

        // 3. Si non, vérifier si c'est un Marchand connu (par les deux numéros)
        const shop = await ShopModel.findByAnyPhoneNumber(phoneNumber);
        if (shop) {
            userInfo.role = 'prospect_b2b'; // Rôle 'marchand' (géré comme prospect_b2b par l'IA)
            userInfo.id = shop.id; // L'ID utilisateur est l'ID de la boutique
            userInfo.shopId = shop.id; // <-- LE POINT CRUCIAL (transmission du shopId)
            userInfo.name = shop.name;
            return userInfo;
        }

        // 4. Si non, vérifier si c'est un prospect déjà contacté
        let prospect = await ProspectModel.findByPhoneNumber(phoneNumber);
        if (prospect) {
            userInfo.id = prospect.id;
            userInfo.name = prospect.contact_name || 'Prospect';
            return userInfo; // Reste 'prospect_b2b', shopId reste null
        }

        // 5. Si non, c'est un tout nouveau prospect
        prospect = await ProspectModel.create({ phone_number: phoneNumber, last_contact_date: new Date() });
        userInfo.id = prospect.id;
        return userInfo;

    } catch (error) {
        logToFile(`[ID] Erreur lors de la vérification DB de l'utilisateur: ${error.message}`);
        return userInfo; // Retourne les infos par défaut
    }
};

/**
 * Fonction de traitement asynchrone pour éviter le timeout du Webhook.
 */
const processIncomingMessage = async (fromPhone, messageText, messageId, messageData) => {
    try {
        // A. Identification de l'Expéditeur (utilise la nouvelle logique)
        const userInfo = await identifyUser(fromPhone);
        logToFile(`[ASYNCH] Utilisateur DB trouvé/créé: ${userInfo.role} (ShopID: ${userInfo.shopId}). Lancement de SAM...`);

        // B. Enregistrement (Log le message de l'utilisateur)
        await WhatsAppService.logConversation(fromPhone, messageText, 'INCOMING', userInfo.role, null, userInfo.shopId);
        
        // C. Lancement de l'IA (Utilise le nouveau modèle stable)
        const aiResult = await AIService.processRequest(userInfo, messageText); 

        logToFile(`[ASYNCH] Réponse de SAM générée (Modèle: ${aiResult.model}). Envoi Wasender...`);

        // D. Envoi de la Réponse
        await WhatsAppService.sendText(fromPhone, aiResult.text, aiResult.model);
        logToFile(`[ASYNCH] Réponse envoyée avec succès. Traitement terminé.`);
        
    } catch (error) {
        // ... (Gestion d'erreur inchangée)
        if (messageId) {
             PROCESSED_MESSAGE_IDS.delete(messageId); 
        }
        
        logToFile(`[ERREUR DE FLUX CRITIQUE] Le code a échoué dans le TRY/CATCH: ${error.message}`);
        try {
            const errorText = "Désolé, je rencontre une erreur interne. L'administrateur est notifié.";
            await WhatsAppService.sendText(fromPhone, errorText, 'system-error');
        } catch (sendError) {
            logToFile(`[ERREUR CRITIQUE] Impossible même d'envoyer le message d'erreur: ${sendError.message}`);
        }
    }
};


/**
 * Gère le Webhook Wasender (réception de messages et d'événements).
 */
const handleWebhook = async (req, res) => {
    
    logToFile("-----------------------------------------");
    logToFile(`[FLUX] Appel Webhook reçu.`);

    // 1. VÉRIFICATION DE SÉCURITÉ
    const signature = req.header('x-webhook-signature'); 
    const rawBody = req.rawBody; 

    if (!verifyWasenderSignature(signature, WEBHOOK_SECRET)) {
        logToFile(`[ERREUR SÉCURITÉ] Signature Invalide. Blocage du message.`);
        return res.status(401).send('Unauthorized');
    }
    
    // 2. PARSING DE L'ÉVÉNEMENT
    let event;
    try {
        if (!rawBody || rawBody.length === 0) {
            logToFile("[FLUX] Corps de requête vide reçu (peut-être un test ping ?).");
            return res.status(200).send('Empty body received.');
        }
        event = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
        logToFile(`[ERREUR PARSING] Impossible de parser le JSON du rawBody: ${e.message}`);
        return res.status(400).send('Bad Request: Invalid JSON');
    }

    logToFile(`[FLUX] Événement Wasender reçu et validé.`);

    // 3. FILTRE ET TRAITEMENT DES MESSAGES ENTRANTS
    
    const isMessageEvent = (event.event === 'messages.received' || event.event === 'messages.upsert');
    const isTestWebhook = (event.event === 'webhook.test'); 

    if (isTestWebhook) {
        logToFile("[FLUX] Événement de TEST reçu et validé avec succès !");
        return res.status(200).send('Webhook test validé avec succès.');
    }

    if (isMessageEvent) {
        
        const messageData = event.data?.messages;
        if (!messageData) {
            logToFile("[FLUX] Événement ignoré (data.messages est manquant).");
            return res.status(200).send('Event ignored, no message data.');
        }
        
        // --- BLOC ANTI-DOUBLON (ID DE MESSAGE) ---
        const messageId = messageData.key?.id;
        if (messageId) {
            if (PROCESSED_MESSAGE_IDS.has(messageId)) {
                logToFile(`[FLUX] Message ignoré (ID déjà traité - doublon Wasender): ${messageId}`);
                return res.status(200).send('Event ignored, duplicate message ID.');
            }
            PROCESSED_MESSAGE_IDS.set(messageId, Date.now());
        }

        // --- Filtre 'fromMe' ---
        const fromMe = messageData.key?.fromMe === true;
        if (fromMe) {
            logToFile("[FLUX] Événement ignoré (message 'fromMe').");
            return res.status(200).send('Event ignored, message from me.');
        }

        // --- FILTRE BLOCAGE DES GROUPES ---
        const chatId = messageData.key?.remoteJid;
        if (chatId && chatId.endsWith('@g.us')) {
            logToFile(`[FLUX] Message ignoré (provient d'un groupe): ${chatId}`);
            return res.status(200).send('Event ignored, group message.');
        }

        // --- BLOC STRICTE : VÉRIFICATION DE L'HORODATAGE ---
        const messageTimestamp = messageData.messageTimestamp; 
        const MAX_AGE_SECONDS = 900; // 15 minutes

        if (messageTimestamp) {
            const currentTimestampInSeconds = Math.floor(Date.now() / 1000);
            const messageAgeInSeconds = currentTimestampInSeconds - Number(messageTimestamp);

            if (messageAgeInSeconds > MAX_AGE_SECONDS) {
                logToFile(`[FLUX] Message ignoré car trop ancien. Âge: ${messageAgeInSeconds}s (Max: ${MAX_AGE_SECONDS}s).`);
                return res.status(200).send('Event ignored, message too old.');
            }
            logToFile(`[FLUX] Horodatage validé. Âge: ${messageAgeInSeconds}s.`);
        } else {
            logToFile("[FLUX] AVERTISSEMENT: 'messageTimestamp' est manquant. Impossible de valider l'âge du message.");
        }

        // Extraire le numéro de l'expéditeur
        let fromPhone = messageData.key?.cleanedParticipantPn || 
                          messageData.key?.cleanedSenderPn ||   
                          messageData.remoteJid;                
        
        if (!fromPhone) {
            logToFile("[FLUX] Événement ignoré (impossible de trouver le numéro de l'expéditeur).");
            return res.status(200).send('Event ignored, unknown sender.');
        }
        if (fromPhone.includes('@')) {
            fromPhone = fromPhone.split('@')[0];
        }

        // Extraire le contenu texte
        let messageText = null;
        if (messageData.message?.conversation) {
            messageText = messageData.message.conversation;
        } else if (messageData.message?.extendedTextMessage?.text) {
            messageText = messageData.message.extendedTextMessage.text;
        } else if (messageData.message?.imageMessage?.caption) {
            messageText = messageData.message.imageMessage.caption;
        }
        
        // Vérifier si on a du texte à traiter
        if (!messageText || messageText.trim() === "") {
            const messageType = Object.keys(messageData.message || {})[0] || 'inconnu';
            logToFile(`[FLUX] Événement ignoré (pas de contenu texte). Type de message reçu: ${messageType} (ex: reactionMessage, audioMessage, etc.)`);
            return res.status(200).send('Event ignored, no text content.');
        }
        
        logToFile(`[FLUX] Message texte à traiter de ${fromPhone}: "${messageText}"`);

        // --- RÉPONSE IMMÉDIATE et TRAITEMENT ASYNCHRONE ---
        res.status(200).send('Message received, processing in background.');
        
        processIncomingMessage(fromPhone, messageText, messageId, messageData).catch(error => {
            logToFile(`[ERREUR ASYNC CRITIQUE] Le traitement en arrière-plan a échoué: ${error.message}`);
        });

        return; 
    }
    
    logToFile(`[FLUX] Événement non pertinent ignoré (Event: ${event.event}). Renvoi de 200 OK.`);
    return res.status(200).send('Webhook event received, no action taken');
};


module.exports = {
    handleWebhook
};