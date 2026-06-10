// src/controllers/stock.movement.controller.js
const stockMovementModel = require('../models/stock.movement.model');
const productModel = require('../models/shop.product.model');

// Enregistrer une vente (Sortie)
const recordSale = async (req, res) => {
    try {
        const { shop_id, product_id, quantity } = req.body; 

        if (!shop_id || !product_id || !quantity) {
            return res.status(400).json({ message: "Données manquantes" });
        }

        // Mise à jour atomique du stock
        await productModel.updateQuantity(product_id, -Math.abs(quantity), null);

        await stockMovementModel.create({
            shop_id,
            product_id,
            type: 'sale',
            quantity: -Math.abs(quantity),
            stock_before: 0, 
            stock_after: 0,
            performed_by_staff_id: req.user ? req.user.id : null, 
            comment: "Vente App"
        });

        res.json({ message: "Vente enregistrée" });
    } catch (error) {
        console.error("Erreur recordSale:", error);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

const getProductHistory = async (req, res) => {
    try {
        const { productId } = req.params;
        const history = await stockMovementModel.getHistoryByProduct(productId);
        res.json(history);
    } catch (error) {
        console.error("Erreur historique:", error);
        res.status(500).json({ message: "Erreur serveur" });
    }
};

// --- NOUVEAU : RÉCUPÉRER LE JOURNAL GLOBAL ---
const getShopJournal = async (req, res) => {
    try {
        const { shopId } = req.params;
        // On récupère les filtres depuis l'URL (query params)
        const { start_date, end_date, type, search } = req.query;

        const journal = await stockMovementModel.findByShop(shopId, {
            startDate: start_date,
            endDate: end_date,
            type: type,
            search: search
        });

        res.json(journal);
    } catch (error) {
        console.error("Erreur Journal:", error);
        res.status(500).json({ message: "Impossible de récupérer le journal." });
    }
};

module.exports = {
    recordSale,
    getProductHistory,
    getShopJournal
};