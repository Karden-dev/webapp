// src/routes/orders.routes.js
const express = require('express');
const router = express.Router();
const orderModel = require('../models/order.model');
// --- AJOUT 1 : Import du service WhatsApp ---
const whatsappService = require('../services/whatsapp.service'); 
// -------------------------------------------
const { verifyToken, isAdmin, isRider } = require('../middleware/auth.middleware');

// --- NOUVELLE ROUTE (Admin) : Récupérer les commandes en attente de préparation ---
router.get('/pending-preparation', verifyToken, isAdmin, async (req, res) => {
    try {
        const ordersToPrepare = await orderModel.findOrdersToPrepare();
        res.status(200).json(ordersToPrepare);
    } catch (error) {
        console.error("Erreur (GET /orders/pending-preparation):", error);
        res.status(500).json({ message: 'Erreur serveur lors de la récupération des commandes à préparer.' });
    }
});

// --- NOUVELLE ROUTE (Admin) : Marquer une commande comme prête ---
router.put('/:id/ready', verifyToken, isAdmin, async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const preparedByUserId = req.user.id;

        if (isNaN(orderId)) {
            return res.status(400).json({ message: 'ID de commande invalide.' });
        }

        const result = await orderModel.markAsReadyForPickup(orderId, preparedByUserId);

        if (result.success) {
            res.status(200).json({ message: 'Commande marquée comme prête pour la récupération.' });
        } else {
            res.status(400).json({ message: result.message || 'Impossible de marquer la commande comme prête.' });
        }
    } catch (error) {
        console.error("Erreur (PUT /orders/:id/ready):", error);
        res.status(500).json({ message: error.message || 'Erreur serveur lors du marquage comme prêt.' });
    }
});

// --- NOUVELLE ROUTE (Livreur) : Déclarer un retour ---
router.post('/:id/declare-return', verifyToken, isRider, async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const riderUserId = req.user.id;
        const { comment } = req.body;

        if (isNaN(orderId)) {
            return res.status(400).json({ message: 'ID de commande invalide.' });
        }

        const result = await orderModel.declareReturn(orderId, riderUserId, comment);

        if (result.success) {
            res.status(201).json({ message: 'Retour déclaré avec succès.', trackingId: result.trackingId });
        } else {
            res.status(400).json({ message: result.message || 'Échec de la déclaration de retour.' });
        }
    } catch (error) {
        console.error("Erreur (POST /orders/:id/declare-return):", error);
        res.status(500).json({ message: error.message || 'Erreur lors de la déclaration du retour.' });
    }
});


// --- ROUTES EXISTANTES ---

// POST / : Créer une nouvelle commande (protégée)
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const { shop_id, customer_name, customer_phone, delivery_location, article_amount, delivery_fee, expedition_fee, items } = req.body;
        const created_by = req.user.id;

        if (!shop_id || !customer_phone || !delivery_location || !items || items.length === 0) {
            return res.status(400).json({ message: 'Données de commande invalides (champs obligatoires manquants).' });
        }

        const orderData = {
            shop_id,
            customer_name: (customer_name && customer_name.trim() !== '') ? customer_name : null,
            customer_phone: customer_phone || null,
            delivery_location: delivery_location || null,
            article_amount,
            delivery_fee,
            expedition_fee,
            created_by,
            items
        };

        const result = await orderModel.create(orderData);

        res.status(201).json({ message: 'Commande créée avec succès.', orderId: result.orderId });

        // --- AJOUT 2 : Déclencheur Notification Création & Bienvenue ---
        // On le lance sans "await" pour ne pas bloquer la réponse API
        whatsappService.notifyMerchantNewOrder(result.orderId, shop_id, orderData);

    } catch (error) {
        console.error("Erreur (POST /orders):", error);
        if (!res.headersSent) res.status(500).json({ message: 'Erreur lors de la création de la commande.' });
    }
});

// GET / : Récupérer toutes les commandes avec filtres (protégée)
// MODIFICATION : Suppression du middleware 'isAdmin' pour gestion manuelle des droits
router.get('/', verifyToken, async (req, res) => {
    try {
        // --- AJOUT : Sécurité Rôle ---
        // Autoriser seulement Admin OU Merchant Admin
        if (req.user.role !== 'admin' && req.user.role !== 'merchant_admin') {
            return res.status(403).json({ message: 'Accès refusé.' });
        }

        const filters = {
            search: req.query.search,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            status: req.query.status,
            // --- AJOUT : Filtrage automatique pour les marchands ---
            // Si c'est un marchand, on force l'ID de sa boutique. 
            // Si c'est un admin, on prend le paramètre d'URL s'il existe.
            shopId: (req.user.role === 'merchant_admin') ? req.user.id : (req.query.shopId || null)
        };

        const orders = await orderModel.findAll(filters);
        res.status(200).json(orders);
    } catch (error) {
        console.error("Erreur (GET /orders):", error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

// GET /:id : Récupérer une seule commande avec ses détails (protégée)
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await orderModel.findById(id);
        if (!order) {
            return res.status(404).json({ message: 'Commande non trouvée.' });
        }
        
        // --- MODIFICATION : Logique de permission étendue ---
        const isAdmin = req.user.role === 'admin';
        // Le livreur peut voir si c'est sa commande
        const isAssignedRider = (req.user.role === 'livreur' || req.user.role === 'deliveryman') && order.deliveryman_id === req.user.id;
        // Le marchand peut voir si c'est sa boutique
        const isShopOwner = (req.user.role === 'merchant_admin' && order.shop_id === req.user.id);

        if (!isAdmin && !isAssignedRider && !isShopOwner) {
            return res.status(403).json({ message: 'Accès refusé.' });
        }
        // ---------------------------------------------------

        res.status(200).json(order);
    } catch (error) {
        console.error("Erreur (GET /orders/:id):", error);
        res.status(500).json({ message: 'Erreur lors de la récupération de la commande.' });
    }
});

// PUT /:id : Modifier une commande (protégée Admin)
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updated_by = req.user.id;
        const { ...orderData } = req.body;

        const validOrderData = {};
        for (const key in orderData) {
            if (key !== 'updated_by' && orderData[key] !== undefined) {
                validOrderData[key] = (orderData[key] === '' ? null : orderData[key]);
            }
        }

        await orderModel.update(id, validOrderData, updated_by);
        res.status(200).json({ message: 'Commande modifiée avec succès.' });
    } catch (error) {
        console.error("Erreur (PUT /orders/:id):", error);
        res.status(500).json({ message: error.message || 'Erreur lors de la modification de la commande.' });
    }
});

// DELETE /:id : Supprimer une commande (protégée Admin)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await orderModel.remove(id);
        if (result.affectedRows === 0) {
             return res.status(404).json({ message: 'Commande non trouvée.' });
        }
        res.status(200).json({ message: 'Commande supprimée avec succès.' });
    } catch (error) {
        console.error("Erreur (DELETE /orders/:id):", error);
        res.status(500).json({ message: 'Erreur lors de la suppression de la commande.' });
    }
});

// PUT /:id/status : Changer le statut d'une commande (protégée)
router.put('/:id/status', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, amount_received, payment_status, follow_up_at } = req.body;
        const userId = req.user.id;

        await orderModel.updateStatus(id, status, amount_received, payment_status, userId, follow_up_at);

        res.status(200).json({ message: `Statut mis à jour en '${status}'.` });

        // --- AJOUT 3 : Déclencheur Notification Livraison ---
        if (status === 'delivered') {
            whatsappService.notifyMerchantDelivery(id);
        }

    } catch (error) {
        console.error("Erreur (PUT /orders/:id/status):", error);
        if (!res.headersSent) res.status(500).json({ message: error.message || 'Erreur lors de la mise à jour du statut.' });
    }
});

// PUT /:id/assign : Assigner un livreur (protégée Admin)
router.put('/:id/assign', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { deliverymanId } = req.body;
        const userId = req.user.id;

        if (!deliverymanId) {
            return res.status(400).json({ message: 'ID du livreur manquant.' });
        }

        await orderModel.assignDeliveryman(id, deliverymanId, userId);
        res.status(200).json({ message: 'Livreur assigné avec succès.' });
    } catch (error) {
        console.error("Erreur (PUT /orders/:id/assign):", error);
        res.status(500).json({ message: error.message || 'Erreur lors de l\'assignation du livreur.' });
    }
});

module.exports = router;