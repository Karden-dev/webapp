// src/routes/shop.product.routes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/shop.product.controller');
const authMiddleware = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

// Sécurisation globale : On applique verifyToken (qui est la fonction) et non l'objet entier
router.use(authMiddleware.verifyToken);

// --- ROUTES ---

// 1. Créer un produit (Avec gestion d'image)
router.post('/', upload.single('product_image'), productController.createProduct);

// 2. Récupérer le catalogue d'une boutique
router.get('/shop/:shopId', productController.getShopProducts);

// 3. Mettre à jour un produit (Avec gestion d'image potentielle)
router.put('/:id', upload.single('product_image'), productController.updateProduct);

module.exports = router;