// src/controllers/stock.request.controller.js
const stockRequestModel = require('../models/stock.request.model');

// 1. MARCHAND : Déclare une entrée de stock
const declareEntry = async (req, res) => {
    try {
        const { shop_id, product_id, quantity, proof_url, staff_id } = req.body;

        if (!shop_id || !product_id || !quantity || quantity <= 0) {
            return res.status(400).json({ message: "Données invalides." });
        }

        const requestId = await stockRequestModel.create({
            shop_id,
            product_id,
            quantity_declared: quantity,
            proof_image_url: proof_url,
            created_by_staff_id: staff_id // Optionnel si fait par le manager
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

// 3. ADMIN : Valider une entrée
const validateEntry = async (req, res) => {
    try {
        const { id } = req.params; // ID de la demande
        const { validated_quantity } = req.body;
        const adminId = req.user.id; // L'admin connecté

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

// 4. ADMIN : Rejeter une entrée
const rejectEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const adminId = req.user.id;

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
    validateEntry,
    rejectEntry
};