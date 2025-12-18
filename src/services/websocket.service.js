// src/services/websocket.service.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const userModel = require('../models/user.model'); // Pour vérifier l'utilisateur
// NOUVEAU: Import du service Firebase
const firebaseService = require('./firebase.service'); 

// Stockage en mémoire des connexions actives
// Clé: userId, Valeur: Set de connexions WebSocket pour cet utilisateur
const clients = new Map();
// Clé: orderId, Valeur: Set de userIds écoutant cette conversation
const conversations = new Map();

let wss; // Référence au serveur WebSocket

/**
 * Initialise le serveur WebSocket et le lie au serveur HTTP existant.
 * @param {http.Server} server - Le serveur HTTP créé par Express.
 */
const initWebSocketServer = (server) => {
    // --- CORRECTION ICI ---
    // Il y avait "new new WebSocket.Server". Je l'ai corrigé en "new WebSocket.Server".
    wss = new WebSocket.Server({ server }); // Attache WSS au serveur HTTP
    // --- FIN CORRECTION ---

    console.log('🔌 Serveur WebSocket initialisé et attaché au serveur HTTP.');

    wss.on('connection', async (ws, req) => {
        console.log('🔌 Nouvelle connexion WebSocket entrante...');

        // 1. Extraire le token de l'URL (ex: ws://localhost:3000?token=...)
        const parameters = url.parse(req.url, true).query;
        const token = parameters.token;

        if (!token) {
            console.warn('🔌 Connexion WebSocket refusée : Token manquant.');
            ws.close(1008, 'Token manquant'); // 1008 = Policy Violation
            return;
        }

        let decodedToken;
        try {
            // 2. Vérifier le token JWT
            decodedToken = jwt.verify(token, process.env.JWT_SECRET);
            ws.userId = decodedToken.id; // Attache l'ID utilisateur à la connexion WebSocket
            ws.userRole = decodedToken.role; // Attache le rôle utilisateur
            console.log(`🔌 Connexion WebSocket authentifiée pour l'utilisateur ID: ${ws.userId}, Rôle: ${ws.userRole}`);

            // 3. Stocker la connexion
            if (!clients.has(ws.userId)) {
                clients.set(ws.userId, new Set());
            }
            clients.get(ws.userId).add(ws);

            ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', message: 'Connecté au serveur WebSocket.' }));

        } catch (error) {
            console.error('🔌 Connexion WebSocket refusée : Token invalide.', error.message);
            ws.close(1008, 'Token invalide');
            return;
        }

        // 4. Gérer les messages reçus du client
        ws.on('message', (message) => {
            try {
                const parsedMessage = JSON.parse(message);
                console.log(`🔌 Message reçu de l'utilisateur ${ws.userId}:`, parsedMessage);

                // Gérer différents types de messages (ex: rejoindre/quitter une conversation)
                switch (parsedMessage.type) {
                    case 'JOIN_CONVERSATION':
                        handleJoinConversation(ws, parsedMessage.payload.orderId);
                        break;
                    case 'LEAVE_CONVERSATION':
                        handleLeaveConversation(ws, parsedMessage.payload.orderId);
                        break;
                    // Ajouter d'autres types de messages si nécessaire (ex: typing indicator)
                    default:
                        console.warn(`🔌 Type de message inconnu reçu: ${parsedMessage.type}`);
                }
            } catch (error) {
                console.error(`🔌 Erreur traitement message WebSocket de ${ws.userId}:`, error);
                // Envoyer une erreur au client si possible
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Format de message invalide ou erreur serveur.' }));
                }
            }
        });

        // 5. Gérer la déconnexion
        ws.on('close', (code, reason) => {
            console.log(`🔌 Connexion WebSocket fermée pour l'utilisateur ${ws.userId}. Code: ${code}, Raison: ${reason ? reason.toString() : 'N/A'}`);
            if (clients.has(ws.userId)) {
                clients.get(ws.userId).delete(ws);
                if (clients.get(ws.userId).size === 0) {
                    clients.delete(ws.userId);
                }
            }
            // Retirer l'utilisateur de toutes les conversations qu'il écoutait
            conversations.forEach((userIds, orderId) => {
                if (userIds.has(ws.userId)) {
                    userIds.delete(ws.userId);
                }
            });
            console.log(`Utilisateur ${ws.userId} retiré des conversations.`);
        });

        ws.on('error', (error) => {
            console.error(`🔌 Erreur WebSocket pour l'utilisateur ${ws.userId}:`, error);
        });
    });

    console.log('🔌 Serveur WebSocket prêt à accepter les connexions.');
};

/**
 * Associe une connexion WebSocket à une conversation spécifique (orderId).
 * @param {WebSocket} ws - La connexion WebSocket.
 * @param {number} orderId - L'ID de la commande/conversation.
 */
const handleJoinConversation = (ws, orderId) => {
    if (!orderId || isNaN(orderId)) {
        console.warn(`🔌 Tentative de rejoindre une conversation invalide par ${ws.userId}. OrderId: ${orderId}`);
        return;
    }
    orderId = Number(orderId); // Assurer que c'est un nombre

    if (!conversations.has(orderId)) {
        conversations.set(orderId, new Set());
    }
    conversations.get(orderId).add(ws.userId);
    ws.currentOrderId = orderId; // Stocker l'orderId actuel sur la connexion ws
    console.log(`🔌 Utilisateur ${ws.userId} a rejoint la conversation pour la commande ${orderId}`);
};

/**
 * Dissocie une connexion WebSocket d'une conversation spécifique (orderId).
 * @param {WebSocket} ws - La connexion WebSocket.
 * @param {number} orderId - L'ID de la commande/conversation.
 */
const handleLeaveConversation = (ws, orderId) => {
     if (!orderId || isNaN(orderId)) return;
     orderId = Number(orderId);

     if (conversations.has(orderId)) {
        conversations.get(orderId).delete(ws.userId);
        console.log(`🔌 Utilisateur ${ws.userId} a quitté la conversation pour la commande ${orderId}`);
     }
     if (ws.currentOrderId === orderId) {
         ws.currentOrderId = null; // Nettoyer l'orderId actuel sur ws
     }
};

/**
 * Envoie un message à tous les participants d'une conversation.
 * Tente d'envoyer une notification FCM aux livreurs hors ligne ou dans une autre vue de l'app.
 * @param {number} orderId - L'ID de la commande/conversation.
 * @param {object} messageData - L'objet message complet (avec user_name, etc.).
 * @param {number} senderUserId - L'ID de l'expéditeur.
 */
const broadcastMessage = async (orderId, messageData, senderUserId) => { // <-- CHANGÉ EN ASYNC
    if (!conversations.has(orderId)) {
        console.log(`📣 Pas d'auditeurs actifs pour la commande ${orderId}, message non diffusé en temps réel.`);
        return;
    }

    const listeners = conversations.get(orderId);
    if (!listeners || listeners.size === 0) return;

    const messageString = JSON.stringify({
        type: 'NEW_MESSAGE',
        payload: messageData
    });

    console.log(`📣 Diffusion du message pour la commande ${orderId} à ${listeners.size} auditeur(s).`);

    const usersToNotifyFCM = new Set();
    
    // 1. Tenter l'envoi via WebSocket
    listeners.forEach(userId => {
        let wsSent = false;
        
        if (clients.has(userId)) {
            clients.get(userId).forEach(clientWs => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    // Si l'utilisateur est ACTIVE dans le chat ou est admin, on envoie WS
                    if (clientWs.currentOrderId === orderId || clientWs.userRole === 'admin') { 
                       console.log(`   -> Envoi WS à l'utilisateur ${userId} (Actif/Admin)`);
                       clientWs.send(messageString);
                       wsSent = true;
                    }
                }
            });
            
            // Si le message n'a pas été envoyé via WS (chat inactif et pas admin), on ajoute à la liste FCM
            if (!wsSent && userId !== senderUserId) {
                 usersToNotifyFCM.add(userId);
            }

        } else if (userId !== senderUserId) {
            // 2. Si l'utilisateur n'est pas du tout connecté via WS, on l'ajoute à la liste FCM
            usersToNotifyFCM.add(userId);
        }
    });
    
    // 3. Traiter l'envoi FCM (pour les utilisateurs non couverts par WS)
    for (const userId of usersToNotifyFCM) {
        try {
            const user = await userModel.findById(userId); 
            
            // On envoie FCM uniquement aux LIVREURS qui ne sont pas l'expéditeur et qui ont un token
            if (user && user.role === 'livreur' && user.fcm_token) {
                
                const title = 'Nouveau Message Chat !';
                const messageContent = messageData?.message_content ?? 'Vous avez reçu un nouveau message.';
                const body = `${messageData?.user_name ?? 'Admin'}: ${messageContent}`;
                
                // Le payload doit inclure order_id pour le routing dans l'app Flutter
                await firebaseService.sendPushNotification(user.fcm_token, title, body, { type: 'NEW_MESSAGE', ...messageData });
                console.log(`   -> Envoi FCM à l'utilisateur ${userId}`);
            }
        } catch (error) {
            console.error(`❌ Erreur FCM (broadcastMessage) pour l'utilisateur ${userId}:`, error.message);
        }
    }
};

/**
 * Envoie une notification de mise à jour (ex: compteur non lu, changement statut) à un utilisateur spécifique.
 * Tente d'envoyer via WebSocket, puis tente l'envoi Push FCM si le destinataire est un livreur.
 * @param {number} userId - L'ID de l'utilisateur destinataire.
 * @param {string} type - Le type de notification (ex: 'UNREAD_COUNT_UPDATE', 'CONVERSATION_LIST_UPDATE').
 * @param {object} payload - Les données de la notification.
 */
const sendNotification = async (userId, type, payload) => { // <-- CHANGÉ EN ASYNC
    let sentViaWS = false;

    // 1. Tenter l'envoi via WebSocket (pour les admins connectés et les livreurs)
    if (clients.has(userId)) {
        const messageString = JSON.stringify({ type, payload });
        clients.get(userId).forEach(clientWs => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(messageString);
                sentViaWS = true;
            }
        });
        if (sentViaWS) {
            console.log(`📣 Notification [${type}] envoyée via WebSocket à l'utilisateur ${userId}`);
            return; // Notification envoyée via WS, on arrête là
        }
    }

    // 2. Si pas de connexion WS ouverte, tenter l'envoi via FCM si c'est un livreur
    try {
        const user = await userModel.findById(userId); // Récupère le fcm_token et le rôle
        
        if (user && user.role === 'livreur' && user.fcm_token) {
            let title = 'WINK EXPRESS';
            let body = 'Mise à jour de votre application.';
            
            // Déterminer le titre/corps basé sur le type
            switch (type) {
                case 'NEW_ORDER_ASSIGNED':
                    title = '🚨 Nouvelle Course Assignée !';
                    body = `Commande #${payload?.order_id ?? 'N/A'} est maintenant dans vos courses à faire.`;
                    break;
                case 'ORDER_MARKED_URGENT':
                    title = '⚠️ URGENCE !';
                    body = `Commande #${payload?.order_id ?? 'N/A'} marquée comme URGENTE par l'admin.`;
                    break;
                case 'REMITTANCE_CONFIRMED':
                    title = '💰 Versement Confirmé !';
                    body = 'Votre versement a été confirmé par l\'administrateur.';
                    break;
                case 'ORDER_READY_FOR_PICKUP':
                    title = 'Colis Prêt !';
                    body = `Commande #${payload?.order_id ?? 'N/A'} est prête à être récupérée.`;
                    break;
            }

            // Le payload doit inclure order_id pour le routing dans l'app Flutter
            await firebaseService.sendPushNotification(user.fcm_token, title, body, { type, ...payload });

        } else if (user && user.role === 'livreur' && !user.fcm_token) {
             console.log(`📣 Livreur ${userId} n'a pas de token FCM. Notification non envoyée.`);
        }

    } catch (error) {
        console.error(`❌ Erreur FCM (sendNotification) pour l'utilisateur ${userId}:`, error.message);
    }
};

module.exports = {
    initWebSocketServer,
    broadcastMessage,
    sendNotification
};