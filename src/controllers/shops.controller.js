// src/controllers/shops.controller.js
const shopModel = require('../models/shop.model');
const jwt = require('jsonwebtoken');

/**
 * Créer une nouvelle boutique
 */
const create = async (req, res) => {
    try {
        const shopData = {
            name: req.body.name,
            phone_number: req.body.phone_number,
            created_by: req.body.created_by, // L'ID admin injecté par le frontend ou le middleware
            bill_packaging: !!req.body.bill_packaging,
            bill_storage: !!req.body.bill_storage,
            packaging_price: req.body.packaging_price || 50.00,
            storage_price: req.body.storage_price || 100.00
        };
        const result = await shopModel.create(shopData);
        res.status(201).json({ message: 'Boutique créée avec succès.', shopId: result.insertId });
    } catch (error) {
        console.error("Erreur create shop:", error);
        res.status(500).json({ message: 'Erreur lors de la création de la boutique.' });
    }
};

/**
 * Récupérer toutes les boutiques (avec filtres)
 */
const findAll = async (req, res) => {
    try {
        const filters = {
            status: req.query.status || null,
            search: req.query.search || null
        };
        const shops = await shopModel.findAll(filters);
        res.status(200).json(shops);
    } catch (error) {
        console.error("Erreur findAll shops:", error);
        res.status(500).json({ message: 'Erreur lors de la récupération des boutiques.' });
    }
};

/**
 * Récupérer les statistiques globales
 */
const getStats = async (req, res) => {
    try {
        const stats = await shopModel.countAll();
        res.status(200).json(stats);
    } catch (error) {
        console.error("Erreur getStats shops:", error);
        res.status(500).json({ message: 'Erreur lors de la récupération des statistiques.' });
    }
};

/**
 * Récupérer une boutique par ID
 */
const findOne = async (req, res) => {
    try {
        const shop = await shopModel.findById(req.params.id);
        if (!shop) {
            return res.status(404).json({ message: 'Boutique non trouvée.' });
        }
        res.status(200).json(shop);
    } catch (error) {
        console.error("Erreur findOne shop:", error);
        res.status(500).json({ message: 'Erreur lors de la récupération de la boutique.' });
    }
};

/**
 * Mettre à jour une boutique
 */
const update = async (req, res) => {
    try {
        const shopData = {
            name: req.body.name,
            phone_number: req.body.phone_number,
            bill_packaging: !!req.body.bill_packaging,
            bill_storage: !!req.body.bill_storage,
            packaging_price: req.body.packaging_price,
            storage_price: req.body.storage_price
        };
        const result = await shopModel.update(req.params.id, shopData);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Boutique non trouvée.' });
        }
        res.status(200).json({ message: 'Boutique mise à jour avec succès.' });
    } catch (error) {
        console.error("Erreur update shop:", error);
        res.status(500).json({ message: 'Erreur lors de la mise à jour de la boutique.' });
    }
};

/**
 * Changer le statut (Actif/Inactif)
 */
const updateStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const result = await shopModel.updateStatus(req.params.id, status);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Boutique non trouvée.' });
        }
        res.status(200).json({ message: 'Statut mis à jour.' });
    } catch (error) {
        console.error("Erreur updateStatus shop:", error);
        res.status(500).json({ message: 'Erreur lors du changement de statut.' });
    }
};

// ============================================================
// NOUVELLES MÉTHODES (APP MOBILE MARCHAND)
// ============================================================

/**
 * Login Marchand (Via App Mobile)
 * Vérifie Téléphone + Code PIN
 */
const merchantLogin = async (req, res) => {
    try {
        const { phone, pin } = req.body;
        
        if (!phone || !pin) {
            return res.status(400).json({ message: "Téléphone et PIN requis." });
        }

        const shop = await shopModel.verifyMerchantLogin(phone, pin);
        
        if (!shop) {
            return res.status(401).json({ message: "Numéro ou PIN incorrect, ou compte inactif." });
        }

        // Génération du Token JWT spécifique Marchand
        const token = jwt.sign(
            { id: shop.id, role: 'merchant_admin', name: shop.name },
            process.env.JWT_SECRET || 'votre_secret_tres_secret',
            { expiresIn: '30d' }
        );

        res.json({
            message: "Connexion réussie",
            token: token,
            shop: {
                id: shop.id,
                name: shop.name,
                phone: shop.phone_number,
                is_stock_managed: shop.is_stock_managed
            }
        });

    } catch (error) {
        console.error("Erreur merchantLogin:", error);
        res.status(500).json({ message: "Erreur serveur login." });
    }
};

/**
 * Mise à jour du PIN Marchand
 */
const updateShopPin = async (req, res) => {
    try {
        const { shopId } = req.params;
        const { newPin } = req.body;
        
        if (!newPin || newPin.length < 4) {
            return res.status(400).json({ message: "Le PIN doit faire au moins 4 chiffres." });
        }

        await shopModel.updatePin(shopId, newPin);
        res.json({ message: "Code PIN mis à jour avec succès." });
    } catch (error) {
        console.error("Erreur updateShopPin:", error);
        res.status(500).json({ message: "Erreur mise à jour PIN." });
    }
};

module.exports = {
    create,
    findAll,
    getStats,
    findOne,
    update,
    updateStatus,
    merchantLogin,
    updateShopPin
};