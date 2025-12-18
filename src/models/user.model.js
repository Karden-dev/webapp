// src/models/user.model.js
const moment = require('moment');
// Note: bcryptjs n'est pas utilisé dans votre logique de 'create' ou 'updatePin' fournie.
// Si vous avez besoin du hachage, vous devez l'importer et l'utiliser.

let dbConnection;

/**
 * NOUVEAU: Fonction de standardisation du numéro de téléphone.
 * Retire les espaces et le code pays '237' s'il est présent.
 */
const cleanPhoneNumber = (number) => {
    if (!number) return '';
    let cleaned = number.trim();
    // Supposons que la DB stocke les numéros sans le code pays '237'
    if (cleaned.startsWith('237')) {
        cleaned = cleaned.substring(3); 
    }
    return cleaned;
};

/**
 * Initialise le modèle avec la connexion à la base de données.
 * @param {object} connection - Le pool de connexion à la base de données.
 */
const init = (connection) => {
    dbConnection = connection;
};

// --- Fonctions pour la gestion des UTILISATEURS ---

const create = async (phone_number, pin, name, role) => {
    // La création du compte doit aussi nettoyer le numéro au cas où il est inséré avec un code pays
    const cleanedPhoneNumber = cleanPhoneNumber(phone_number);
    const query = 'INSERT INTO users (phone_number, pin, name, role, status) VALUES (?, ?, ?, ?, ?)';
    const [result] = await dbConnection.execute(query, [cleanedPhoneNumber, pin, name, role, 'actif']);
    return result;
};

const findByPhoneNumber = async (phone_number) => {
    // CORRECTION : Utilisation de la fonction de nettoyage
    const cleanedPhoneNumber = cleanPhoneNumber(phone_number);
    const query = 'SELECT * FROM users WHERE phone_number = ?';
    const [rows] = await dbConnection.execute(query, [cleanedPhoneNumber]);
    return rows[0];
};

const findById = async (id) => {
    const query = 'SELECT id, name, phone_number, role, status, fcm_token, created_at FROM users WHERE id = ?';
    const [rows] = await dbConnection.execute(query, [id]);
    return rows[0];
};

const findAll = async (filters = {}) => {
    let query = "SELECT id, name, phone_number, role, status, created_at FROM users";
    const params = [];
    if (filters.search) {
        query += ' WHERE name LIKE ?';
        params.push(`%${filters.search}%`);
    }
    query += ' ORDER BY name ASC';
    const [rows] = await dbConnection.execute(query, params);
    return rows;
};

const update = async (id, name, phone_number, role, status) => {
    // CORRECTION : Utilisation de la fonction de nettoyage pour la mise à jour
    const cleanedPhoneNumber = cleanPhoneNumber(phone_number);
    const query = 'UPDATE users SET name = ?, phone_number = ?, role = ?, status = ? WHERE id = ?';
    const [result] = await dbConnection.execute(query, [name, cleanedPhoneNumber, role, status, id]);
    return result;
};

const remove = async (id) => {
    const query = 'DELETE FROM users WHERE id = ?';
    const [result] = await dbConnection.execute(query, [id]);
    return result;
};

const updatePin = async (id, pin) => {
    const query = 'UPDATE users SET pin = ? WHERE id = ?';
    const [result] = await dbConnection.execute(query, [pin, id]);
    return result;
};

const updateStatus = async (id, status) => {
     const query = 'UPDATE users SET status = ? WHERE id = ?';
     const [result] = await dbConnection.execute(query, [status, id]);
     return result;
};


// --- Fonctions pour les statistiques des LIVREURS ---

const findAllDeliverymen = async () => {
    // Cette fonction est utilisée pour l'assignation de commande et n'a pas besoin de jointure
    const query = "SELECT id, name FROM users WHERE role = 'livreur' AND status = 'actif' ORDER BY name ASC";
    const [rows] = await dbConnection.execute(query);
    return rows;
};

/**
 * Récupère les données de performance pour le classement sur la page admin (deliverymen.html).
 * (CORRIGÉ : Nettoyage des espaces blancs invisibles au début de la requête)
 */
const findDeliverymenPerformance = async (filters = {}) => {
    const { startDate, endDate, search } = filters;
    const params = [];

    let dateConditions = '';
    if (startDate && endDate) {
        dateConditions = 'AND DATE(o.created_at) BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }

    let searchQuery = '';
    if (search) {
        searchQuery = 'AND u.name LIKE ?';
        params.push(`%${search}%`);
    }

    // CORRECTION : Requête nettoyée (pas d'espaces corrompus)
    const query = `SELECT
            u.id,
            u.name,
            u.status,
            l.vehicle_type,
            l.base_salary,
            l.commission_rate,
            COALESCE(COUNT(o.id), 0) AS received_orders,
            COALESCE(SUM(CASE WHEN o.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_progress_orders,
            COALESCE(SUM(CASE WHEN o.status IN ('cancelled', 'reported') THEN 1 ELSE 0 END), 0) AS cancelled_orders,
            COALESCE(SUM(CASE WHEN o.status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END), 0) AS delivered_orders,
            COALESCE(SUM(CASE WHEN o.status IN ('delivered', 'failed_delivery') THEN o.delivery_fee ELSE 0 END), 0) AS total_revenue
        FROM users u
        LEFT JOIN livreurs l ON u.id = l.user_id
        LEFT JOIN orders o ON u.id = o.deliveryman_id ${dateConditions}
        WHERE u.role = 'livreur' ${searchQuery}
        GROUP BY u.id, u.name, u.status, l.vehicle_type, l.base_salary, l.commission_rate
        ORDER BY delivered_orders DESC, total_revenue DESC;`;

    const [rows] = await dbConnection.execute(query, params);
    return rows;
};


/**
 * Récupère les statistiques globales pour les cartes sur deliverymen.html
 * (CORRIGÉ : Nettoyage des espaces blancs invisibles au début de la requête)
 */
const getDeliverymenStats = async (startDate, endDate) => {
    const [activeRows] = await dbConnection.execute("SELECT COUNT(*) as total_actif FROM users WHERE role = 'livreur' AND status = 'actif'");
    const totalActif = Number(activeRows[0].total_actif);

    // CORRECTION : Requête nettoyée (pas d'espaces corrompus)
    let statsQuery = `SELECT
            COALESCE(COUNT(DISTINCT deliveryman_id), 0) as working,
            COALESCE(COUNT(id), 0) as received,
            COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) as in_progress,
            COALESCE(SUM(CASE WHEN status IN ('delivered', 'failed_delivery') THEN 1 ELSE 0 END), 0) as delivered,
            COALESCE(SUM(CASE WHEN status IN ('cancelled', 'reported') THEN 1 ELSE 0 END), 0) as cancelled
        FROM orders`;

    const params = [];
    if (startDate && endDate) {
        statsQuery += ' WHERE DATE(created_at) BETWEEN ? AND ?';
        params.push(startDate, endDate);
    }

    const [statsRows] = await dbConnection.execute(statsQuery, params);
    const stats = statsRows[0];
    const workingDeliverymen = Number(stats.working);
    const absentDeliverymen = totalActif - workingDeliverymen;

    return {
        total: totalActif,
        working: workingDeliverymen,
        absent: absentDeliverymen >= 0 ? absentDeliverymen : 0,
        availability_rate: totalActif > 0 ? ((workingDeliverymen / totalActif) * 100) : 0,
        received: Number(stats.received),
        in_progress: Number(stats.in_progress),
        delivered: Number(stats.delivered),
        cancelled: Number(stats.cancelled)
    };
};

/**
 * Met à jour le token FCM pour un utilisateur spécifique.
 */
const updateFcmToken = async (userId, token) => {
    const sql = "UPDATE users SET fcm_token = ? WHERE id = ?";
    try {
        const [result] = await dbConnection.execute(sql, [token, userId]);
        return result;
    } catch (error) {
        console.error(`Erreur lors de la mise à jour du token FCM pour l'utilisateur ${userId}:`, error);
        throw new Error('Erreur lors de la mise à jour du token FCM.');
    }
};

// --- Fonctions pour l'IA (AJOUTÉES ET CORRIGÉES) ---

/**
 * Trouve un admin par son numéro de téléphone (utilisé par ai.service.js)
 * (CORRECTION: Utilisation de la fonction de nettoyage et acceptation de 'super_admin')
 */
const getAdminByPhone = async (phoneNumber) => {
    // 1. Standardisation du numéro
    const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);
    
    // Utilise le dbConnection défini dans init()
    // CORRECTION: Utilise IN pour inclure les rôles d'administration
    const query = `SELECT * FROM users 
                   WHERE phone_number = ? 
                   AND role IN ('admin', 'super_admin') 
                   AND status = 'actif'`;
    const [rows] = await dbConnection.execute(query, [cleanedPhoneNumber]);
    return rows[0];
};

/**
 * Récupère tous les admins actifs (utilisé par ai.service.js)
 * (CORRIGÉ: Utilise dbConnection et status = 'actif')
 */
const getAllAdmins = async () => {
    // Utilise le dbConnection défini dans init()
    const query = "SELECT name, phone_number FROM users WHERE role = 'admin' AND status = 'actif'";
    const [rows] = await dbConnection.execute(query);
    return rows;
};

/**
 * (AJOUTÉ POUR OUTIL IA)
 * Récupère les numéros de téléphone des utilisateurs actifs en fonction de leur rôle.
 * (CORRIGÉ: Utilise dbConnection et status = 'actif' basé sur users (1).sql)
 */
const getPhoneNumbersByRole = async (role) => {
    // CORRECTION : Requête nettoyée
    let query = `SELECT phone_number 
        FROM users 
        WHERE phone_number IS NOT NULL
        AND status = 'actif'`;
    
    // CORRECTION: Suppression du 'a' erroné
    const params = [];

    if (role && role !== 'all') {
        query += ' AND role = ?';
        params.push(role);
    }

    const [users] = await dbConnection.execute(query, params);
    return users;
};

/**
 * (AJOUTÉ POUR OUTIL IA)
 * Trouve un utilisateur actif par son nom (recherche floue, insensible à la casse).
 * (CORRIGÉ: Utilise dbConnection et status = 'actif' basé sur users (1).sql)
*/
const findUserByName = async (userName) => {
    const searchTerm = `%${userName.toLowerCase()}%`;

    // CORRECTION : Requête nettoyée
    const query = `SELECT phone_number, name 
        FROM users 
        WHERE LOWER(name) LIKE ?
        AND status = 'actif'
        LIMIT 1`;
    
    const [users] = await dbConnection.execute(query, [searchTerm]);
    
    return users[0];
};


module.exports = {
    init,
    create,
    findByPhoneNumber,
    findById,
    findAll,
    update,
    remove,
    updatePin,
    updateStatus,
    findAllDeliverymen,
    // CORRECTION: Suppression du 's' erroné
    findDeliverymenPerformance,
    getDeliverymenStats,
    updateFcmToken,
    // --- AJOUTS POUR IA ---
    getAdminByPhone,
    getAllAdmins,
    getPhoneNumbersByRole,
    findUserByName
};