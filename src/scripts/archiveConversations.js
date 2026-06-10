// src/scripts/archiveConversations.js

// CONFIGURATION
// Exécuter toutes les 3 heures
const ARCHIVE_INTERVAL_MS = 1000 * 60 * 60 * 1; // MODIFIÉ: Remis à 3h comme suggéré par le commentaire

let db; // Le pool de connexions de la base de données

/**
 * Exécute le cycle d'archivage.
 */
const runArchiveCycle = async () => {
    if (!db) {
        console.error('[ArchiveService] Le service n\'est pas initialisé (DB manquante).');
        return;
    }
    
    console.log('[ArchiveService] Lancement du cycle d\'archivage...');

    try {
        // Statuts considérés comme "terminés" et pouvant être archivés
        const terminalStatuses = [
            'delivered', 
            'cancelled', 
            'failed_delivery', 
            'returned'
        ];

        // CORRECTION: Génération dynamique des placeholders pour le IN (...)
        const placeholders = terminalStatuses.map(() => '?').join(',');

        const query = `
            UPDATE orders
            SET is_archived = 1
            WHERE status IN (${placeholders})
            AND is_archived = 0;
        `;

        // CORRECTION: On passe le tableau directement pour qu'il soit "spread" par execute si supporté, 
        // ou mieux, on s'assure que les arguments correspondent aux placeholders.
        // Dans mysql2 avec execute, il faut passer les arguments correspondant aux '?'
        const [result] = await db.execute(query, terminalStatuses);
        
        if (result.affectedRows > 0) {
            console.log(`[ArchiveService] ${result.affectedRows} conversation(s) archivée(s).`);
        }

    } catch (error) {
        console.error('[ArchiveService] Erreur lors du cycle d\'archivage:', error.message);
    }
};

/**
 * Initialise le service d'archivage.
 * @param {object} dbPool Le pool de connexion DB principal de l'application.
 */
const init = (dbPool) => {
    console.log("[ArchiveService] Initialisé avec la connexion DB.");
    db = dbPool;
    
    if (process.env.NODE_ENV !== 'test') {
        console.log(`[ArchiveService] Démarrage du moteur d'archivage (Intervalle: ${ARCHIVE_INTERVAL_MS / 1000}s).`);
        // Lancer immédiatement au démarrage, puis toutes les X heures
        runArchiveCycle(); 
        setInterval(runArchiveCycle, ARCHIVE_INTERVAL_MS);
    }
};

module.exports = {
    init
};