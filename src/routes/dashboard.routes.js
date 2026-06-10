// src/routes/dashboard.routes.js
const express = require('express');
const router = express.Router();
const dashboardModel = require('../models/dashboard.model'); // UTILISE LE NOUVEAU MODÈLE

// Contrôleur pour agréger toutes les données du tableau de bord
const getDashboardData = async (req, res) => {
    try {
        // Récupération de la limite (par défaut 5 si non fournie)
        const { startDate, endDate, limit } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ message: "La période (startDate, endDate) est requise." });
        }

        // 1. Métriques et CA (inclut maintenant les variations vs période précédente)
        const metrics = await dashboardModel.getDashboardMetrics(startDate, endDate);
        
        // 2. Classement des marchands (Top X)
        const ranking = await dashboardModel.getShopRanking(startDate, endDate, limit);

        // 3. Classement des livreurs (Top X) - NOUVEAU
        const deliverymanRanking = await dashboardModel.getDeliverymanRanking(startDate, endDate, limit);
        
        res.json({
            metrics: metrics,
            ranking: ranking,
            deliverymanRanking: deliverymanRanking, // Ajouté à la réponse API
        });

    } catch (error) {
        console.error("Erreur getDashboardData:", error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération des données du tableau de bord." });
    }
};

router.get('/stats', getDashboardData);

module.exports = router;