// src/controllers/stock.request.controller.js
const stockRequestModel = require('../models/stock.request.model');

// 1. MARCHAND : Déclare une entrée de stock
const declareEntry = async (req, res) => {
    try {
        const { shop_id, product_id, quantity, staff_id } = req.body;
        
        // GESTION PREUVE (Fichier ou URL)
        let proofUrl = null;
        
        if (req.file) {
            // Cas 1 : Fichier uploadé (Recommandé)
            proofUrl = `${req.protocol}://${req.get('host')}/uploads/proofs/${req.file.filename}`;
        } else if (req.body.proof_url) {
            // Cas 2 : Fallback Base64 (si l'app n'est pas encore mise à jour)
            proofUrl = req.body.proof_url;
        }

        // Validation basique
        if (!shop_id || !product_id || !quantity || quantity <= 0) {
            return res.status(400).json({ message: "Données invalides (Shop, Produit ou Quantité)." });
        }

        const requestId = await stockRequestModel.create({
            shop_id,
            product_id,
            quantity_declared: quantity,
            // CORRECTION ICI : On utilise "|| null" pour éviter "undefined"
            proof_image_url: proofUrl || null, 
            created_by_staff_id: staff_id || null 
        });

        res.status(201).json({ message: "Demande d'entrée envoyée pour validation.", id: requestId });
    } catch (error) {
        console.error("Erreur declareEntry:", error);
        res.status(500).json({ message: "Erreur lors de la déclaration." });
    }
};

// 2. ADMIN : Voir les demandes en attente
const getPendingRequests = async (req, res) => {
    try {
        const requests = await stockRequestModel.findAllPending();
        res.json(requests);
    } catch (error) {
        console.error("Erreur getPendingRequests:", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
};

// 3. MARCHAND : Voir son historique
const getMyHistory = async (req, res) => {
    try {
        const { shop_id } = req.query; 
        
        if (!shop_id) {
            return res.status(400).json({ message: "ID boutique requis." });
        }
        
        const history = await stockRequestModel.findHistoryByShop(shop_id);
        res.json(history);
    } catch (error) {
        console.error("Erreur getMyHistory:", error);
        res.status(500).json({ message: "Erreur récupération historique." });
    }
};

// 4. ADMIN : Valider une entrée
const validateEntry = async (req, res) => {
    try {
        const { id } = req.params; // ID de la demande
        const { validated_quantity } = req.body;
        // req.user est injecté par le middleware d'auth
        const adminId = req.user ? req.user.id : null; 

        if (validated_quantity === undefined) {
            return res.status(400).json({ message: "La quantité validée est requise." });
        }

        await stockRequestModel.validateRequest(id, validated_quantity, adminId);
        res.json({ message: "Stock validé et mis à jour avec succès." });
    } catch (error) {
        console.error("Erreur validateEntry:", error);
        res.status(500).json({ message: "Erreur lors de la validation." });
    }
};

// 5. ADMIN : Rejeter une entrée
const rejectEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user ? req.user.id : null;

        await stockRequestModel.rejectRequest(id, reason || "Non conforme", adminId);
        res.json({ message: "Demande rejetée." });
    } catch (error) {
        console.error("Erreur rejectEntry:", error);
        res.status(500).json({ message: "Erreur lors du rejet." });
    }
};

module.exports = {
    declareEntry,
    getPendingRequests,
    getMyHistory,
    validateEntry,
    rejectEntry
};