// src/controllers/whatsapp.controller.js
const WhatsAppService = require('../services/whatsapp.service');

// --- LOGGER SIMPLE ---
const fs = require('fs');
const path = require('path');
const logFilePath = path.join(__dirname, '..', 'whatsapp_debug.log');

const logToFile = (message) => {
    // On garde un log minimal juste pour le debug technique (erreurs d'envoi)
    const timestamp = new Date().toISOString();
    try {
        fs.appendFileSync(logFilePath, `${timestamp} - ${message}\n`, 'utf8');
    } catch (err) {
        console.error(`Log error: ${err.message}`);
    }
};

// --- SÉCURITÉ ---
const WEBHOOK_SECRET = process.env.WASENDER_WEBHOOK_SECRET;

const verifyWasenderSignature = (signature, secret) => {
    if (!secret || !signature) return true; // On laisse passer si pas configuré (mode dev)
    return signature === secret;
};

/**
 * Gère le Webhook Wasender.
 * MODE NOTIFICATION SEULE : On reçoit, on dit "OK", on ne fait rien.
 */
const handleWebhook = async (req, res) => {
    // 1. Vérification basique (Optionnel)
    const signature = req.header('x-webhook-signature'); 
    if (WEBHOOK_SECRET && !verifyWasenderSignature(signature, WEBHOOK_SECRET)) {
        return res.status(401).send('Unauthorized');
    }

    // 2. Gestion du "Ping" / Vérification
    // Si c'est un test de webhook ou un événement de message
    const rawBody = req.rawBody; 
    let event;
    try {
        if (!rawBody || rawBody.length === 0) return res.status(200).send('OK');
        event = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
        return res.status(400).send('Invalid JSON');
    }

    // 3. STRATÉGIE "SOURDE" : On ignore le contenu entrant
    // On répond juste 200 OK pour que WhatsApp/Wasender sache qu'on a reçu l'info
    // et qu'il arrête de renvoyer le message.
    
    if (event.event === 'messages.received' || event.event === 'messages.upsert') {
        // On ne loggue même pas le contenu pour respecter la consigne "ne rien lire"
        // On ne déclenche aucune action.
        return res.status(200).send('Message ignored (Notification Only Mode)');
    }

    // Pour les autres événements (statuts d'envoi 'ack', 'sent', etc.), on peut les ignorer aussi
    // ou les logger si vous voulez suivre si vos notifs sont bien arrivées.
    if (event.event === 'messages.ack') {
        // Optionnel : Mettre à jour le statut du message sortant en BDD si nécessaire
        // Sinon, on ignore.
    }

    return res.status(200).send('Event received');
};

/**
 * Point d'entrée pour envoyer un message manuellement via l'API (si besoin)
 */
const sendMessage = async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message) return res.status(400).json({ error: 'Phone and message required' });

        await WhatsAppService.sendText(phone, message);
        res.json({ success: true, message: 'Notification envoyée' });
    } catch (error) {
        logToFile(`Erreur envoi manuel : ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    handleWebhook,
    sendMessage
};