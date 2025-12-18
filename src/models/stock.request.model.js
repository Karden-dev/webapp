// src/models/stock.request.model.js
const stockMovementModel = require('./stock.movement.model');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const create = async (data) => {
    const { shop_id, product_id, quantity_declared, proof_image_url, created_by_staff_id } = data;
    const query = `
        INSERT INTO stock_requests (shop_id, product_id, quantity_declared, proof_image_url, created_by_staff_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', NOW())
    `;
    const [result] = await dbConnection.execute(query, [shop_id, product_id, quantity_declared, proof_image_url, created_by_staff_id]);
    return result.insertId;
};

// CÔTÉ ADMIN : Voir les demandes en attente
const findAllPending = async () => {
    const query = `
        SELECT 
            r.*, 
            p.name as product_name, 
            p.variant as variant_name,  /* CORRECTION : On récupère la variante */
            p.reference as product_ref, /* AJOUT : On récupère la référence (SKU) */
            p.image_url as product_image,
            s.name as shop_name 
        FROM stock_requests r
        JOIN shop_products p ON r.product_id = p.id
        JOIN shops s ON r.shop_id = s.id
        WHERE r.status = 'pending'
        ORDER BY r.created_at ASC
    `;
    const [rows] = await dbConnection.execute(query);
    return rows;
};

// CÔTÉ MARCHAND : Voir l'historique de mes demandes
const findHistoryByShop = async (shopId) => {
    const query = `
        SELECT 
            r.*, 
            p.name as product_name, 
            p.variant as variant_name,
            p.image_url as product_image_url
        FROM stock_requests r
        JOIN shop_products p ON r.product_id = p.id
        WHERE r.shop_id = ?
        ORDER BY r.created_at DESC
        LIMIT 50
    `;
    const [rows] = await dbConnection.execute(query, [shopId]);
    return rows;
};

// ACTION ADMIN : Valider ou Corriger
const validateRequest = async (requestId, validatedQuantity, adminUserId) => {
    const connection = await dbConnection.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Récupérer la demande
        const [reqRows] = await connection.execute('SELECT * FROM stock_requests WHERE id = ?', [requestId]);
        if (reqRows.length === 0) throw new Error("Demande introuvable");
        const request = reqRows[0];

        // 2. Mettre à jour le statut de la demande
        const updateReqQuery = `
            UPDATE stock_requests 
            SET status = 'validated', quantity_validated = ?, validated_by_user_id = ?, validated_at = NOW() 
            WHERE id = ?
        `;
        await connection.execute(updateReqQuery, [validatedQuantity, adminUserId, requestId]);

        // 3. Mettre à jour le Stock Réel (Produit)
        const updateProdQuery = `UPDATE shop_products SET quantity = quantity + ? WHERE id = ?`;
        await connection.execute(updateProdQuery, [validatedQuantity, request.product_id]);

        // 4. Créer le Mouvement (Journal)
        const [prodRows] = await connection.execute('SELECT quantity FROM shop_products WHERE id = ?', [request.product_id]);
        const newStock = prodRows[0].quantity;
        const oldStock = newStock - validatedQuantity;

        const moveQuery = `
            INSERT INTO stock_movements 
            (shop_id, product_id, type, quantity, stock_before, stock_after, related_request_id, performed_by_user_id, created_at)
            VALUES (?, ?, 'entry', ?, ?, ?, ?, ?, NOW())
        `;
        await connection.execute(moveQuery, [
            request.shop_id, request.product_id, validatedQuantity, oldStock, newStock, requestId, adminUserId
        ]);

        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const rejectRequest = async (requestId, reason, adminUserId) => {
    const query = `
        UPDATE stock_requests 
        SET status = 'rejected', admin_comment = ?, validated_by_user_id = ?, validated_at = NOW() 
        WHERE id = ?
    `;
    const [result] = await dbConnection.execute(query, [reason, adminUserId, requestId]);
    return result;
};

module.exports = {
    init,
    create,
    findAllPending,
    findHistoryByShop,
    validateRequest,
    rejectRequest
};