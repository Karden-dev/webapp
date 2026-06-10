// src/services/whatsapp.service.js

const axios = require('axios');
let db;

// --- INITIALISATION DE L'API WASENDER (URL et Clé) ---
const WASENDER_API_URL = "https://wasenderapi.com/api/send-message";
const WASENDER_API_KEY = process.env.WASENDER_API_KEY;

if (!WASENDER_API_KEY) {
    console.error("ERREUR FATALE: WASENDER_API_KEY n'est pas défini.");
}

/**
 * Nettoie et formate un numéro de téléphone pour l'API Wasender.
 */
const formatPhoneNumber = (phone) => {
    let cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 9 && (cleaned.startsWith('6') || cleaned.startsWith('2'))) { 
        return '237' + cleaned;
    }
    if (cleaned.length === 12 && cleaned.startsWith('237')) {
        return cleaned;
    }
    return cleaned;
};

/**
 * Loggue une conversation dans la base de données.
 */
const logConversation = async (phone_number, message_text, direction, sender_type = 'wink_agent_ai', ai_model = null, shop_id = null) => {
    if (!db) {
        console.error("Erreur: Le service WhatsApp n'est pas initialisé avec la DB.");
        return; 
    }
    try {
        const query = `
            INSERT INTO whatsapp_conversation_history 
            (recipient_phone, sender_type, message_direction, message_text, ai_model_used, shop_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await db.execute(query, [ 
            phone_number,
            sender_type,
            direction,
            message_text,
            ai_model,
            shop_id
        ]);
    } catch (error) {
        console.error("Erreur critique lors de l'enregistrement de l'historique de conversation:", error);
    }
};


/**
 * Envoie un message texte via Wasender en utilisant Axios (méthode curl).
 * (MODIFIÉ : Modèle par défaut gemini-2.5-flash)
 */
const sendText = async (recipient_phone, message_text, ai_model = 'gemini-2.5-flash') => {
    
    const formattedPhone = formatPhoneNumber(recipient_phone);
    
    const textPayload = {
        to: formattedPhone, 
        text: message_text,
    };
        
    const headers = {
        'Authorization': `Bearer ${WASENDER_API_KEY}`,
        'Content-Type': 'application/json'
    };

    try {
        console.log(`[WhatsAppService] Envoi (via Axios) à ${formattedPhone}...`);
        
        const result = await axios.post(WASENDER_API_URL, textPayload, { headers: headers }); 
        
        console.log(`[WhatsAppService] Envoi réussi à ${formattedPhone}. Status: ${result.status}`);
        
        await logConversation(recipient_phone, message_text, 'OUTGOING', 'wink_agent_ai', ai_model);

        return result.data;

    } catch (error) {
        if (error.response) {
            console.error(`[ERREUR ENVOI] Échec d'envoi à ${formattedPhone} (Status: ${error.response.status}):`, error.response.data);
        } else if (error.request) {
            console.error(`[ERREUR ENVOI] Pas de réponse de Wasender pour ${formattedPhone}:`, error.request);
        } else {
            console.error(`[ERREUR ENVOI] Erreur configuration Axios:`, error.message);
        }
        
        throw new Error(`Erreur d'envoi WhatsApp: ${error.message}`);
    }
};

/**
 * Envoie un message de type VCard (Contact) via Wasender.
 */
const sendVCard = async (recipient_phone, contactName, contactPhone) => {
    
    const formattedRecipientPhone = formatPhoneNumber(recipient_phone);

    const contactPayload = {
        to: formattedRecipientPhone,
        contact: {
            name: contactName,
            phone: contactPhone 
        }
    };

    const headers = {
        'Authorization': `Bearer ${WASENDER_API_KEY}`,
        'Content-Type': 'application/json'
    };

    try {
        console.log(`[WhatsAppService] Envoi VCard (via Axios) à ${formattedRecipientPhone} pour ${contactName}...`);
        
        const result = await axios.post(WASENDER_API_URL, contactPayload, { headers: headers }); 
        
        console.log(`[WhatsAppService] Envoi VCard réussi à ${formattedRecipientPhone}. Status: ${result.status}`);
        
        const logMessage = `[Envoi de la VCard : ${contactName} - ${contactPhone}]`;
        await logConversation(recipient_phone, logMessage, 'OUTGOING', 'wink_agent_ai', 'vcard_tool');

        return result.data;

    } catch (error) {
        if (error.response) {
            console.error(`[ERREUR ENVOI VCARD] Échec d'envoi VCard à ${formattedRecipientPhone} (Status: ${error.response.status}):`, error.response.data);
        } else if (error.request) {
            console.error(`[ERREUR ENVOI VCARD] Pas de réponse de Wasender pour ${formattedRecipientPhone}:`, error.request);
        } else {
            console.error(`[ERREUR ENVOI VCARD] Erreur configuration Axios:`, error.message);
        }
        
        throw new Error(`Erreur d'envoi VCard WhatsApp: ${error.message}`);
    }
};

/**
 * (AJOUT POUR MÉMOIRE IA)
 * Récupère les N derniers messages d'une conversation.
 */
const getConversationHistory = async (phone_number, limit = 10) => {
    if (!db) {
        console.error("Erreur: Le service WhatsApp n'est pas initialisé avec la DB.");
        return []; 
    }
    try {
        const query = `
            SELECT message_text, message_direction
            FROM whatsapp_conversation_history 
            WHERE recipient_phone = ?
            ORDER BY created_at DESC
            LIMIT ?
        `;
        const [rows] = await db.execute(query, [phone_number, limit]);
        return rows.reverse(); 
    } catch (error) {
        console.error("Erreur lors de la récupération de l'historique de conversation:", error);
        return []; 
    }
};


/**
 * Initialise le service en injectant le pool de connexion DB.
 */
const init = (dbPool) => {
    console.log("[WhatsAppService] Initialisé avec la connexion DB.");
    db = dbPool; 
};

module.exports = {
    init, 
    sendText,
    sendVCard, 
    logConversation,
    getConversationHistory 
};