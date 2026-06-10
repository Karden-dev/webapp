// src/models/debt.model.js

const moment        = require('moment');
const balanceService = require('../services/balance.service');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const findAll = async (filters) => {
    const connection = await dbConnection.getConnection();
    try {
        let query = `
            SELECT d.*, s.name AS shop_name
            FROM debts d
            JOIN shops s ON d.shop_id = s.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.search) {
            query += ` AND s.name LIKE ?`;
            params.push(`%${filters.search}%`);
        }
        if (filters.status) {
            query += ` AND d.status = ?`;
            params.push(filters.status);
        }

        // Cas 1 : Dettes "En attente" → filtre sur la date de CRÉATION
        if (filters.status === 'pending') {
            if (filters.startDate) {
                query += ` AND d.created_at >= ?`;
                params.push(moment(filters.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'));
            }
            if (filters.endDate) {
                query += ` AND d.created_at <= ?`;
                params.push(moment(filters.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss'));
            }
        }
        // Cas 2 : Dettes "Réglées" → filtre sur la date de RÈGLEMENT
        else if (filters.status === 'paid') {
            if (filters.settledStartDate) {
                query += ` AND d.settled_at >= ?`;
                params.push(moment(filters.settledStartDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'));
            }
            if (filters.settledEndDate) {
                query += ` AND d.settled_at <= ?`;
                params.push(moment(filters.settledEndDate).endOf('day').format('YYYY-MM-DD HH:mm:ss'));
            }
        }
        // Cas 3 : Requête générique (sécurité)
        else {
            if (filters.startDate) {
                query += ` AND d.created_at >= ?`;
                params.push(moment(filters.startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'));
            }
            if (filters.endDate) {
                query += ` AND d.created_at <= ?`;
                params.push(moment(filters.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss'));
            }
        }

        query += ` ORDER BY d.created_at DESC`;

        const [rows] = await connection.execute(query, params);
        return rows;
    } finally {
        connection.release();
    }
};

const findById = async (id) => {
    const connection = await dbConnection.getConnection();
    try {
        const [rows] = await connection.execute('SELECT * FROM debts WHERE id = ?', [id]);
        return rows[0];
    } finally {
        connection.release();
    }
};

const create = async (debtData) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        const query = 'INSERT INTO debts (shop_id, amount, type, comment, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const [result] = await connection.execute(query, [
            debtData.shop_id, debtData.amount, debtData.type,
            debtData.comment, 'pending', debtData.created_by, debtData.created_at
        ]);

        await balanceService.updateDailyBalance(connection, {
            shop_id:                  debtData.shop_id,
            date:                     moment(debtData.created_at).format('YYYY-MM-DD'),
            remittance_impact_override: -parseFloat(debtData.amount)
        });

        await connection.commit();
        return result.insertId;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const update = async (id, debtData, userId) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        const [oldDebtRows] = await connection.execute('SELECT * FROM debts WHERE id = ?', [id]);
        if (oldDebtRows.length === 0) throw new Error('Créance non trouvée');
        const oldDebt = oldDebtRows[0];

        // Annuler l'ancien impact sur le bilan
        await balanceService.updateDailyBalance(connection, {
            shop_id:                  oldDebt.shop_id,
            date:                     moment(oldDebt.created_at).format('YYYY-MM-DD'),
            remittance_impact_override: parseFloat(oldDebt.amount)
        });

        const query = 'UPDATE debts SET amount = ?, comment = ?, updated_by = ?, updated_at = NOW() WHERE id = ? AND type != "daily_balance"';
        const [result] = await connection.execute(query, [debtData.amount, debtData.comment, userId, id]);

        // Appliquer le nouvel impact sur le bilan
        await balanceService.updateDailyBalance(connection, {
            shop_id:                  oldDebt.shop_id,
            date:                     moment(oldDebt.created_at).format('YYYY-MM-DD'),
            remittance_impact_override: -parseFloat(debtData.amount)
        });

        await connection.commit();
        return { success: result.affectedRows > 0 };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const remove = async (id) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        const [oldDebtRows] = await connection.execute('SELECT * FROM debts WHERE id = ?', [id]);
        if (oldDebtRows.length === 0) throw new Error('Créance non trouvée');
        const oldDebt = oldDebtRows[0];

        await balanceService.updateDailyBalance(connection, {
            shop_id:                  oldDebt.shop_id,
            date:                     moment(oldDebt.created_at).format('YYYY-MM-DD'),
            remittance_impact_override: parseFloat(oldDebt.amount)
        });

        const [result] = await connection.execute('DELETE FROM debts WHERE id = ? AND type != "daily_balance"', [id]);

        await connection.commit();
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

/**
 * Règle une créance avec une date de règlement choisie.
 * @param {number} id        - ID de la créance
 * @param {number} userId    - ID de l'utilisateur qui règle
 * @param {string} settledAt - Date de règlement au format 'YYYY-MM-DD'
 */
const settle = async (id, userId, settledAt) => {
    const connection = await dbConnection.getConnection();
    try {
        // On utilise la date fournie par le controller (déjà validée)
        const query = 'UPDATE debts SET status = ?, settled_at = ?, updated_by = ?, updated_at = NOW() WHERE id = ?';
        const [result] = await connection.execute(query, ['paid', settledAt, userId, id]);
        return { success: result.affectedRows > 0 };
    } finally {
        connection.release();
    }
};

module.exports = {
    init,
    findAll,
    findById,
    create,
    update,
    remove,
    settle
};
