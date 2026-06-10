// src/models/shop.model.js
const bcrypt = require('bcryptjs'); // AJOUT : Nécessaire pour gérer les PINs sécurisés
let dbConnection;

// Fonction interne pour gérer l'historique de stockage
const manageStorageHistory = async (shopId, newShopData, connection) => {
    const [oldShopData] = await connection.execute('SELECT bill_storage, storage_price, status FROM shops WHERE id = ?', [shopId]);
    if (!oldShopData.length) return;

    const oldStatus = oldShopData[0].status;
    const oldBillStorage = oldShopData[0].bill_storage;
    const newStatus = newShopData.status !== undefined ? newShopData.status : oldStatus;
    const newBillStorage = newShopData.bill_storage !== undefined ? newShopData.bill_storage : oldBillStorage;
    const newStoragePrice = newShopData.storage_price !== undefined ? newShopData.storage_price : oldShopData[0].storage_price;

    const [activeHistory] = await connection.execute(
        'SELECT id FROM shop_storage_history WHERE shop_id = ? AND end_date IS NULL',
        [shopId]
    );
    const hasActiveHistory = activeHistory.length > 0;

    const closeActiveHistory = async () => {
        if (hasActiveHistory) {
            await connection.execute('UPDATE shop_storage_history SET end_date = CURDATE() WHERE id = ?', [activeHistory[0].id]);
        }
    };
    
    const openNewHistory = async () => {
        await connection.execute(
            'INSERT INTO shop_storage_history (shop_id, start_date, price) VALUES (?, CURDATE(), ?)',
            [shopId, newStoragePrice]
        );
    };

    // Scénario 1: Le statut du marchand change
    if (newStatus !== oldStatus) {
        if (newStatus === 'inactif' && hasActiveHistory) {
            await closeActiveHistory();
        } else if (newStatus === 'actif' && newBillStorage && !hasActiveHistory) {
            await openNewHistory();
        }
    }
    // Scénario 2: La facturation du stockage change
    else if (newBillStorage !== oldBillStorage) {
        if (!newBillStorage && hasActiveHistory) { // Désactivation
            await closeActiveHistory();
        } else if (newBillStorage && !hasActiveHistory) { // Activation
            await openNewHistory();
        }
    }
    // Scénario 3: Le prix change alors que la facturation est active
    else if (newBillStorage && hasActiveHistory && newStoragePrice !== oldShopData[0].storage_price) {
        await closeActiveHistory();
        await openNewHistory();
    }
};

/**
 * (AJOUT OUTIL IA) Récupère les infos d'une boutique pour l'IA.
 */
const getShopInfoForIA = async (shopId) => {
    try {
        const query = `
            SELECT name, payment_number, payment_method, payment_name, phone_number 
            FROM shops 
            WHERE id = ?
        `;
        const [rows] = await dbConnection.execute(query, [shopId]);
        return rows[0];
    } catch (error) {
        console.error(`Erreur getShopInfoForIA pour shop ${shopId}:`, error);
        throw error;
    }
};

/**
 * (AJOUT POUR IDENTIFICATION IA)
 * Trouve une boutique par 'phone_number' OU 'phone_number_for_payment'.
 */
const findByAnyPhoneNumber = async (phoneNumber) => {
    try {
        const query = `
            SELECT id, name, phone_number, 'prospect_b2b' as role 
            FROM shops 
            WHERE (phone_number = ? OR phone_number_for_payment = ?)
            AND status = 'actif'
            LIMIT 1
        `;
        const [rows] = await dbConnection.execute(query, [phoneNumber, phoneNumber]);
        return rows[0];
    } catch (error) {
        console.error(`Erreur findByAnyPhoneNumber pour le numéro ${phoneNumber}:`, error);
        throw error;
    }
};


module.exports = {
    init: (connection) => {
        dbConnection = connection;
    },

    create: async (shopData) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();
            const { name, phone_number, created_by, bill_packaging, bill_storage, packaging_price, storage_price } = shopData;
            const query = 'INSERT INTO shops (name, phone_number, created_by, bill_packaging, bill_storage, packaging_price, storage_price, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)';
            const [result] = await connection.execute(query, [name, phone_number, created_by, bill_packaging, bill_storage, packaging_price, storage_price, 'actif']);
            const newShopId = result.insertId;

            // NOUVEAU: Création automatique de l'historique de stockage si l'option est activée
            if (bill_storage) {
                await connection.execute(
                    'INSERT INTO shop_storage_history (shop_id, start_date, price) VALUES (?, CURDATE(), ?)',
                    [newShopId, storage_price]
                );
            }
            
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    findAll: async (filters = {}) => {
        let query = `
            SELECT s.*, u.name AS creator_name 
            FROM shops s
            LEFT JOIN users u ON s.created_by = u.id
        `;
        const params = [];

        let whereClauses = [];
        if (filters.status) {
            whereClauses.push('s.status = ?');
            params.push(filters.status);
        }
        if (filters.search) {
            whereClauses.push('s.name LIKE ?');
            params.push(`%${filters.search}%`);
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }
        
        query += ' ORDER BY s.name ASC';
        const [rows] = await dbConnection.execute(query, params);
        return rows;
    },

    countAll: async () => {
        const query = `
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'actif' THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status = 'inactif' THEN 1 ELSE 0 END) AS inactive
            FROM shops
        `;
        const [rows] = await dbConnection.execute(query);
        return rows[0];
    },

    findById: async (id) => {
        const query = `
            SELECT s.*, u.name AS creator_name 
            FROM shops s
            LEFT JOIN users u ON s.created_by = u.id
            WHERE s.id = ?
        `;
        const [rows] = await dbConnection.execute(query, [id]);
        return rows[0];
    },
    
    update: async (id, shopData) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();
            
            // NOUVEAU: Gérer l'historique avant de mettre à jour
            await manageStorageHistory(id, shopData, connection);
            
            const { name, phone_number, bill_packaging, bill_storage, packaging_price, storage_price } = shopData;
            const query = 'UPDATE shops SET name = ?, phone_number = ?, bill_packaging = ?, bill_storage = ?, packaging_price = ?, storage_price = ? WHERE id = ?';
            const [result] = await connection.execute(query, [name, phone_number, bill_packaging, bill_storage, packaging_price, storage_price, id]);
            
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },
    
    updateStatus: async (id, status) => {
        const connection = await dbConnection.getConnection();
        try {
            await connection.beginTransaction();
            
            // NOUVEAU: Gérer l'historique avant de mettre à jour
            await manageStorageHistory(id, { status }, connection);
            
            const query = 'UPDATE shops SET status = ? WHERE id = ?';
            const [result] = await connection.execute(query, [status, id]);

            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    // --- NOUVELLES FONCTIONS POUR APP MARCHAND (Sécurité) ---

    // Mise à jour du PIN (Hachage)
    updatePin: async (id, pin) => {
        const salt = await bcrypt.genSalt(10);
        const pinHash = await bcrypt.hash(pin, salt);
        const query = 'UPDATE shops SET pin_hash = ? WHERE id = ?';
        const [result] = await dbConnection.execute(query, [pinHash, id]);
        return result;
    },

    // Vérification login Marchand (Tel + PIN)
    verifyMerchantLogin: async (phoneNumber, pin) => {
        // 1. Chercher le shop actif par téléphone
        const query = `SELECT * FROM shops WHERE phone_number = ? AND status = 'actif'`;
        const [rows] = await dbConnection.execute(query, [phoneNumber]);
        if (rows.length === 0) return null; // Pas trouvé

        const shop = rows[0];

        // 2. Vérifier le PIN
        if (!shop.pin_hash) return null; // Pas de PIN configuré pour ce shop
        const isMatch = await bcrypt.compare(pin, shop.pin_hash);
        
        if (!isMatch) return null;

        // 3. Mettre à jour last_login
        await dbConnection.execute('UPDATE shops SET last_login_at = NOW() WHERE id = ?', [shop.id]);

        return shop;
    },
    
    
    // --- Fonctions AJOUTÉES POUR IA ---
    getShopInfoForIA,
    findByAnyPhoneNumber
};