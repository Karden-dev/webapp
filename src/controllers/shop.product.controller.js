// src/controllers/shop.product.controller.js
const productModel = require('../models/shop.product.model');

// Créer un nouveau produit
const createProduct = async (req, res) => {
    try {
        // req.user est injecté par le middleware Auth (Admin ou Marchand Manager)
        // Si c'est un marchand, on force le shop_id. Si admin, il peut spécifier.
        // Ici on suppose l'usage par le Marchand via l'app mobile.
        
        const data = req.body;
        
        if (!data.name) {
            return res.status(400).json({ message: "Le nom du produit est requis." });
        }

        const productId = await productModel.create(data);
        res.status(201).json({ message: "Produit créé avec succès.", id: productId });
    } catch (error) {
        console.error("Erreur createProduct:", error);
        res.status(500).json({ message: "Erreur lors de la création du produit." });
    }
};

// Récupérer le catalogue d'une boutique
const getShopProducts = async (req, res) => {
    try {
        const { shopId } = req.params;
        const products = await productModel.findByShop(shopId);
        res.json(products);
    } catch (error) {
        console.error("Erreur getShopProducts:", error);
        res.status(500).json({ message: "Erreur récupération catalogue." });
    }
};

// Mise à jour produit (Prix, Photo, Seuil)
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        await productModel.update(id, req.body);
        res.json({ message: "Produit mis à jour." });
    } catch (error) {
        console.error("Erreur updateProduct:", error);
        res.status(500).json({ message: "Erreur mise à jour produit." });
    }
};

module.exports = {
    createProduct,
    getShopProducts,
    updateProduct
};