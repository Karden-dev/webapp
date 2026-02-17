// src/models/dashboard.model.js
const moment = require('moment');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

/**
 * Calcule le pourcentage d'évolution entre deux valeurs.
 * Utilise Math.abs(previous) pour gérer correctement le passage négatif -> positif.
 */
const calculateVariation = (current, previous) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / Math.abs(previous)) * 100;
};

const getPreviousPeriod = (startDate, endDate) => {
    const start = moment(startDate);
    const end = moment(endDate);
    const duration = end.diff(start, 'days') + 1;
    
    return {
        prevEndDate: start.clone().subtract(1, 'days').format('YYYY-MM-DD'),
        prevStartDate: start.clone().subtract(duration, 'days').format('YYYY-MM-DD')
    };
};

const getRawMetrics = async (startDate, endDate) => {
    // NOTE: 'failed_delivery' est compté comme SUCCÈS logistique (total_delivered)
    const metricsQuery = `
        SELECT
            COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN 1 ELSE 0 END), 0) AS total_orders_sent,
            COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? AND status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END), 0) AS total_delivered,
            COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? AND status = 'in_progress' THEN 1 ELSE 0 END), 0) AS total_in_progress,
            COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? AND status IN ('cancelled', 'reported') THEN 1 ELSE 0 END), 0) AS total_failed_cancelled
        FROM orders
    `;
    const [orderRows] = await dbConnection.execute(metricsQuery, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate]);
    const orderMetrics = orderRows[0];

    const caQuery = `
        SELECT
            COALESCE(SUM(total_delivery_fees), 0) AS total_delivery_fees,
            COALESCE(SUM(total_packaging_fees), 0) AS total_packaging_fees,
            COALESCE(SUM(total_storage_fees), 0) AS total_storage_fees
        FROM daily_shop_balances
        WHERE report_date BETWEEN ? AND ?
    `;
    const [caRows] = await dbConnection.execute(caQuery, [startDate, endDate]);
    const caMetrics = caRows[0];

    const totalCANet = parseFloat(caMetrics.total_delivery_fees || 0) 
                     + parseFloat(caMetrics.total_packaging_fees || 0) 
                     + parseFloat(caMetrics.total_storage_fees || 0);

    const cashMetricsQuery = `
        SELECT COALESCE(SUM(CASE WHEN ct.type IN ('expense', 'manual_withdrawal') THEN ABS(ct.amount) ELSE 0 END), 0) AS total_expenses
        FROM cash_transactions ct
        WHERE DATE(ct.created_at) BETWEEN ? AND ?
    `;
    const [cashRows] = await dbConnection.execute(cashMetricsQuery, [startDate, endDate]);
    const totalExpenses = parseFloat(cashRows[0].total_expenses || 0);

    // Calcul du Taux de Qualité (Livrées / Envoyées)
    const totalSent = parseInt(orderMetrics.total_orders_sent || 0);
    const totalDelivered = parseInt(orderMetrics.total_delivered || 0);
    const qualityRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;

    return {
        ca_net: totalCANet,
        total_expenses: totalExpenses,
        solde_net: totalCANet - totalExpenses,
        total_delivery_fees: parseFloat(caMetrics.total_delivery_fees || 0),
        total_sent: totalSent,
        total_delivered: totalDelivered,
        total_in_progress: parseInt(orderMetrics.total_in_progress || 0),
        total_failed_cancelled: parseInt(orderMetrics.total_failed_cancelled || 0),
        quality_rate: qualityRate // Ajout du taux calculé
    };
};

const getDashboardMetrics = async (startDate, endDate) => {
    const currentMetrics = await getRawMetrics(startDate, endDate);
    const { prevStartDate, prevEndDate } = getPreviousPeriod(startDate, endDate);
    const prevMetrics = await getRawMetrics(prevStartDate, prevEndDate);

    return {
        ...currentMetrics,
        ca_variation: calculateVariation(currentMetrics.ca_net, prevMetrics.ca_net),
        expenses_variation: calculateVariation(currentMetrics.total_expenses, prevMetrics.total_expenses),
        solde_variation: calculateVariation(currentMetrics.solde_net, prevMetrics.solde_net),
        delivery_fees_variation: calculateVariation(currentMetrics.total_delivery_fees, prevMetrics.total_delivery_fees),
        
        orders_sent_variation: calculateVariation(currentMetrics.total_sent, prevMetrics.total_sent),
        delivered_variation: calculateVariation(currentMetrics.total_delivered, prevMetrics.total_delivered),
        // Variation du nombre d'échecs
        failed_variation: calculateVariation(currentMetrics.total_failed_cancelled, prevMetrics.total_failed_cancelled),
        
        // NOUVEAU : Variation du Taux de Qualité (Points de pourcentage ou % relatif)
        // Ici on garde le % relatif d'évolution du taux
        quality_rate_variation: calculateVariation(currentMetrics.quality_rate, prevMetrics.quality_rate)
    };
};

const getShopRanking = async (startDate, endDate, limit = 5) => {
    const limitInt = parseInt(limit) || 5;
    const { prevStartDate, prevEndDate } = getPreviousPeriod(startDate, endDate);

    const queryCurrent = `
        SELECT
            s.id AS shop_id,
            s.name AS shop_name,
            COUNT(o.id) AS orders_sent_count,
            COALESCE(SUM(CASE WHEN o.status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END), 0) AS orders_processed_count,
            COALESCE(SUM(CASE WHEN o.status IN ('delivered', 'failed_delivery') THEN o.delivery_fee ELSE 0 END), 0) AS total_delivery_fees_generated
        FROM shops s
        JOIN orders o ON s.id = o.shop_id
        WHERE DATE(o.created_at) BETWEEN ? AND ?
        GROUP BY s.id, s.name
        ORDER BY total_delivery_fees_generated DESC
        LIMIT ?
    `;
    
    const [currentRows] = await dbConnection.query(queryCurrent, [startDate, endDate, limitInt]);

    if (currentRows.length > 0) {
        const shopIds = currentRows.map(r => r.shop_id);
        const placeholders = shopIds.map(() => '?').join(',');
        
        const queryPrev = `
            SELECT shop_id, COALESCE(SUM(CASE WHEN status IN ('delivered', 'failed_delivery') THEN delivery_fee ELSE 0 END), 0) as prev_fees
            FROM orders
            WHERE shop_id IN (${placeholders})
            AND DATE(created_at) BETWEEN ? AND ?
            GROUP BY shop_id
        `;
        
        const [prevRows] = await dbConnection.query(queryPrev, [...shopIds, prevStartDate, prevEndDate]);
        
        return currentRows.map(curr => {
            const prev = prevRows.find(p => p.shop_id === curr.shop_id);
            const prevAmount = prev ? parseFloat(prev.prev_fees) : 0;
            return {
                ...curr,
                fees_variation: calculateVariation(curr.total_delivery_fees_generated, prevAmount)
            };
        });
    }
    return currentRows;
};

const getDeliverymanRanking = async (startDate, endDate, limit = 5) => {
    const limitInt = parseInt(limit) || 5;
    const { prevStartDate, prevEndDate } = getPreviousPeriod(startDate, endDate);

    const queryCurrent = `
        SELECT
            u.id,
            u.name AS deliveryman_name,
            COALESCE(SUM(CASE WHEN o.status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END), 0) AS delivered_count,
            COALESCE(SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END), 0) AS failed_count
        FROM users u
        JOIN orders o ON u.id = o.deliveryman_id
        WHERE u.role = 'livreur'
          AND DATE(o.created_at) BETWEEN ? AND ?
        GROUP BY u.id, u.name
        ORDER BY delivered_count DESC
        LIMIT ?
    `;

    const [currentRows] = await dbConnection.query(queryCurrent, [startDate, endDate, limitInt]);

    if (currentRows.length > 0) {
        const userIds = currentRows.map(r => r.id);
        const placeholders = userIds.map(() => '?').join(',');

        const queryPrev = `
            SELECT deliveryman_id, COALESCE(SUM(CASE WHEN status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END), 0) as prev_count
            FROM orders
            WHERE deliveryman_id IN (${placeholders})
            AND DATE(created_at) BETWEEN ? AND ?
            GROUP BY deliveryman_id
        `;

        const [prevRows] = await dbConnection.query(queryPrev, [...userIds, prevStartDate, prevEndDate]);

        return currentRows.map(curr => {
            const prev = prevRows.find(p => p.deliveryman_id === curr.id);
            const prevCount = prev ? parseInt(prev.prev_count) : 0;
            return {
                ...curr,
                rank_variation: calculateVariation(curr.delivered_count, prevCount)
            };
        });
    }
    return currentRows;
};

module.exports = {
    init,
    getDashboardMetrics,
    getShopRanking,
    getDeliverymanRanking,
};