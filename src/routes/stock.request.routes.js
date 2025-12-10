// src/routes/stock.request.routes.js
const express = require('express');
const router = express.Router();
const requestController = require('../controllers/stock.request.controller');
const authMiddleware = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

// Sécurisation globale
router.use(authMiddleware.verifyToken);

// --- CÔTÉ MARCHAND ---

// 1. Déclarer une entrée de stock (Avec Preuve Photo)
router.post('/declare', upload.single('proof_image'), requestController.declareEntry);

// 2. Voir l'historique de mes demandes
router.get('/my-history', requestController.getMyHistory);

// --- CÔTÉ ADMIN ---

// 3. Voir les demandes en attente
router.get('/pending', requestController.getPendingRequests);

// 4. Valider une entrée
router.put('/:id/validate', requestController.validateEntry);

// 5. Rejeter une entrée
router.put('/:id/reject', requestController.rejectEntry);

module.exports = router;