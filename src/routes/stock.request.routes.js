// src/routes/stock.request.routes.js
const express = require('express');
const router = express.Router();
const requestController = require('../controllers/stock.request.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);

// --- CÔTÉ MARCHAND ---
// Déclarer une entrée de stock (POST /api/stock/requests/declare)
router.post('/declare', requestController.declareEntry);

// --- CÔTÉ ADMIN ---
// Voir les demandes en attente (GET /api/stock/requests/pending)
router.get('/pending', requestController.getPendingRequests);

// Valider une entrée (PUT /api/stock/requests/:id/validate)
router.put('/:id/validate', requestController.validateEntry);

// Rejeter une entrée (PUT /api/stock/requests/:id/reject)
router.put('/:id/reject', requestController.rejectEntry);

module.exports = router;