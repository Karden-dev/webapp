// src/controllers/stock.movement.controller.js
const stockMovementModel = require('../models/stock.movement.model');

// MARCHAND : Enregistrer une vente (Sortie directe)
const recordSale = async (req, res) => {
    try {
        const { shop_id, product_id, quantity, staff_id } = req.body;

        if (quantity <= 0) {
            return res.status(400).json({ message: "La quantité vendue doit être positive." });
        }

        // Appel au modèle qui décrémente et journalise
        // CORRECTION ICI : On ajoute '|| null' pour le staff_id
        const newStock = await stockMovementModel.recordSale(
            shop_id, 
            product_id, 
            quantity, 
            staff_id || null
        );
        
        res.json({ message: "Vente enregistrée.", new_stock: newStock });
    } catch (error) {
        console.error("Erreur recordSale:", error);
        res.status(500).json({ message: "Erreur lors de la vente.", error: error.message });
    }
};

// TOUS : Historique d'un produit
const getProductHistory = async (req, res) => {
    try {
        const { productId } = req.params;
        const history = await stockMovementModel.getHistoryByProduct(productId);
        res.json(history);
    } catch (error) {
        console.error("Erreur getProductHistory:", error);
        res.status(500).json({ message: "Erreur historique." });
    }
};

module.exports = {
    recordSale,
    getProductHistory
};