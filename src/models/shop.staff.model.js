// src/models/shop.staff.model.js
const bcrypt = require('bcryptjs'); // Assurez-vous d'avoir bcryptjs installé
let dbConnection;

const init = (connection) => {
    dbConnection = connection;
};

const create = async (data) => {
    const { shop_id, name, phone_number, pin, role } = data;
    
    // Hashage du PIN
    const salt = await bcrypt.genSalt(10);
    const pinHash = await bcrypt.hash(pin, salt);

    const query = `
        INSERT INTO shop_staff (shop_id, name, phone_number, pin_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    `;
    const [result] = await dbConnection.execute(query, [shop_id, name, phone_number, pinHash, role]);
    return result.insertId;
};

const verifyLogin = async (shopId, pin) => {
    // Ce login est pour les employés spécifiques
    // Pour le login principal du shop, voir shop.model.js
    // ... Logique de vérification (à implémenter si login direct employé)
};

const findByShop = async (shopId) => {
    const query = `SELECT id, name, phone_number, role, is_active FROM shop_staff WHERE shop_id = ?`;
    const [rows] = await dbConnection.execute(query, [shopId]);
    return rows;
};

module.exports = {
    init,
    create,
    findByShop
};