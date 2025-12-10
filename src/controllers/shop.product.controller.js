// src/controllers/shop.product.controller.js
const productModel = require('../models/shop.product.model');

// Créer un nouveau produit avec gestion d'image fichier
const createProduct = async (req, res) => {
    try {
        const data = req.body;
        
        // GESTION IMAGE (Priorité au fichier uploadé via Multer)
        let imageUrl = null;
        if (req.file) {
            // Construction de l'URL publique
            // req.protocol = http ou https
            // req.get('host') = domaine:port (ex: localhost:3000)
            imageUrl = `${req.protocol}://${req.get('host')}/uploads/products/${req.file.filename}`;
        } else if (data.image_url) {
            // Fallback : Si une URL est envoyée directement (rare mais possible)
            imageUrl = data.image_url;
        }

        // Vérification des champs obligatoires
        if (!data.name) {
            return res.status(400).json({ message: "Le nom du produit est requis." });
        }

        // Fusion des données corps + image
        const productData = {
            ...data,
            image_url: imageUrl
        };

        // Appel au modèle
        const result = await productModel.create(productData);
        
        res.status(201).json({ 
            message: "Produit créé avec succès.", 
            id: result.id,
            reference: result.reference 
        });

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
        const data = req.body;

        // GESTION IMAGE POUR UPDATE
        let imageUrl = undefined; // undefined = ne pas toucher si pas fourni
        if (req.file) {
            imageUrl = `${req.protocol}://${req.get('host')}/uploads/products/${req.file.filename}`;
        } else if (data.image_url !== undefined) {
            // Si on veut explicitement mettre null (supprimer l'image) ou changer l'URL
            imageUrl = data.image_url;
        }

        const updateData = {
            ...data,
            // Si imageUrl est défini (nouvelle image), on l'écrase, sinon on laisse undefined
            ...(imageUrl !== undefined && { image_url: imageUrl })
        };

        await productModel.update(id, updateData);
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