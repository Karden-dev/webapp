-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Hôte : localhost:3306
-- Généré le : mar. 09 déc. 2025 à 03:04
-- Version du serveur : 11.4.8-MariaDB-cll-lve
-- Version de PHP : 8.3.27

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données : `csdkqyubnt_winddb`
--

-- --------------------------------------------------------

--
-- Structure de la table `cash_closings`
--

CREATE TABLE `cash_closings` (
  `id` int(11) NOT NULL,
  `closing_date` date NOT NULL,
  `total_cash_collected` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_delivery_fees` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_expenses` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_remitted` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_withdrawals` decimal(12,2) NOT NULL DEFAULT 0.00,
  `expected_cash` decimal(12,2) NOT NULL DEFAULT 0.00,
  `actual_cash_counted` decimal(12,2) NOT NULL DEFAULT 0.00,
  `difference` decimal(12,2) NOT NULL DEFAULT 0.00,
  `comment` text DEFAULT NULL,
  `closed_by_user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `cash_transactions`
--

CREATE TABLE `cash_transactions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('remittance','expense','manual_withdrawal') NOT NULL,
  `category_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `comment` text DEFAULT NULL,
  `status` enum('pending','confirmed') NOT NULL DEFAULT 'confirmed',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `validated_by` int(11) DEFAULT NULL,
  `validated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Déclencheurs `cash_transactions`
--
DELIMITER $$
CREATE TRIGGER `before_cash_transactions_insert` BEFORE INSERT ON `cash_transactions` FOR EACH ROW BEGIN
    IF NEW.type != 'remittance' THEN
        SET NEW.status = 'confirmed';
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Structure de la table `daily_shop_balances`
--

CREATE TABLE `daily_shop_balances` (
  `id` int(11) NOT NULL,
  `report_date` date NOT NULL,
  `shop_id` int(11) NOT NULL,
  `total_orders_sent` int(11) NOT NULL DEFAULT 0,
  `total_orders_delivered` int(11) NOT NULL DEFAULT 0,
  `total_revenue_articles` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_delivery_fees` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_expedition_fees` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_packaging_fees` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_storage_fees` decimal(12,2) NOT NULL DEFAULT 0.00,
  `previous_debts` decimal(12,2) NOT NULL DEFAULT 0.00,
  `remittance_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','paid') NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `debts`
--

CREATE TABLE `debts` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `type` enum('packaging','storage','delivery_fee','other','expedition','daily_balance') NOT NULL,
  `status` enum('pending','paid') NOT NULL DEFAULT 'pending',
  `comment` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `settled_at` datetime DEFAULT NULL,
  `creation_date_only` date GENERATED ALWAYS AS (cast(`created_at` as date)) VIRTUAL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `deliveryman_shortfalls`
--

CREATE TABLE `deliveryman_shortfalls` (
  `id` int(11) NOT NULL,
  `deliveryman_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `comment` text DEFAULT NULL,
  `status` enum('pending','paid','partially_paid') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `created_by_user_id` int(11) DEFAULT NULL,
  `settled_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `expenses`
--

CREATE TABLE `expenses` (
  `id` int(11) NOT NULL,
  `rider_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `comment` text DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `expense_categories`
--

CREATE TABLE `expense_categories` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` enum('company_charge','deliveryman_charge') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `livreurs`
--

CREATE TABLE `livreurs` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL COMMENT 'Clé étrangère vers users.id',
  `vehicle_type` enum('pied','moto') NOT NULL COMMENT 'Type de véhicule utilisé par le livreur',
  `base_salary` decimal(10,2) DEFAULT NULL COMMENT 'Salaire de base mensuel (pour motards)',
  `commission_rate` decimal(5,2) DEFAULT NULL COMMENT 'Taux de commission en % (pour livreurs à pied)',
  `monthly_objective` int(11) DEFAULT NULL COMMENT 'Objectif mensuel individuel (si nécessaire)',
  `personal_goal_daily` int(11) DEFAULT NULL COMMENT 'Objectif personnel quotidien (nb courses)',
  `personal_goal_weekly` int(11) DEFAULT NULL COMMENT 'Objectif personnel hebdomadaire (nb courses)',
  `personal_goal_monthly` int(11) DEFAULT NULL COMMENT 'Objectif personnel mensuel (nb courses)',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Détails spécifiques aux livreurs';

-- --------------------------------------------------------

--
-- Structure de la table `message_read_status`
--

CREATE TABLE `message_read_status` (
  `id` int(11) NOT NULL,
  `message_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL COMMENT 'Utilisateur qui a lu le message',
  `read_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Statut de lecture des messages par utilisateur';

-- --------------------------------------------------------

--
-- Structure de la table `monthly_objectives`
--

CREATE TABLE `monthly_objectives` (
  `id` int(11) NOT NULL,
  `month_year` varchar(7) NOT NULL COMMENT 'Mois et année au format YYYY-MM',
  `target_deliveries_moto` int(11) DEFAULT 370 COMMENT 'Objectif de courses pour les motards ce mois-là',
  `bonus_tiers_moto` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Structure JSON des paliers de prime. Ex: [{"min_percent": 65, "bonus": 100}, ...]' CHECK (json_valid(`bonus_tiers_moto`)),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Objectifs de performance mensuels fixés par l''admin';

-- --------------------------------------------------------

--
-- Structure de la table `orders`
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `deliveryman_id` int(11) DEFAULT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `customer_phone` varchar(20) NOT NULL,
  `delivery_location` varchar(255) NOT NULL,
  `article_amount` decimal(10,2) NOT NULL,
  `delivery_fee` decimal(10,2) NOT NULL,
  `expedition_fee` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` enum('pending','in_progress','ready_for_pickup','en_route','return_declared','delivered','cancelled','failed_delivery','reported','returned','Ne decroche pas','Injoignable','A relancer','Reportée') NOT NULL DEFAULT 'pending',
  `payment_status` enum('pending','cash','paid_to_supplier','cancelled') NOT NULL DEFAULT 'pending',
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `amount_received` decimal(10,2) DEFAULT 0.00,
  `debt_amount` decimal(10,2) DEFAULT 0.00,
  `remittance_amount` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Montant net pré-calculé à verser au marchand pour cette commande.',
  `updated_by` int(11) DEFAULT NULL,
  `follow_up_at` datetime DEFAULT NULL COMMENT 'Timestamp pour les statuts A relancer ou Reportée',
  `prepared_by` int(11) DEFAULT NULL,
  `prepared_at` datetime DEFAULT NULL,
  `picked_up_by_rider_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `is_urgent` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Indique si la commande/conversation est marquée comme urgente',
  `is_archived` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Indique si la conversation doit être archivée (masquée par défaut)',
  `ai_review_sent` tinyint(1) DEFAULT 0 COMMENT 'Flag 1 si l''Agent IA a envoyé la demande d''avis Google.'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `order_history`
--

CREATE TABLE `order_history` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `action` varchar(255) NOT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `order_items`
--

CREATE TABLE `order_items` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `order_messages`
--

CREATE TABLE `order_messages` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL COMMENT 'ID de l''utilisateur (admin ou livreur) qui a envoyé le message',
  `message_content` text NOT NULL COMMENT 'Contenu du message',
  `message_type` enum('user','system') NOT NULL DEFAULT 'user' COMMENT 'Type de message (utilisateur ou système)',
  `created_at` timestamp(3) NOT NULL DEFAULT current_timestamp(3) COMMENT 'Timestamp avec millisecondes'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Messages associés aux commandes pour le suivi';

-- --------------------------------------------------------

--
-- Structure de la table `quick_replies`
--

CREATE TABLE `quick_replies` (
  `id` int(11) NOT NULL,
  `role` enum('admin','livreur','all') NOT NULL COMMENT 'Pour quel rôle ce message est-il disponible?',
  `message_text` varchar(255) NOT NULL COMMENT 'Le texte du message rapide',
  `display_order` int(11) DEFAULT 0 COMMENT 'Ordre d''affichage',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Messages rapides pré-configurés pour le chat';

-- --------------------------------------------------------

--
-- Structure de la table `remittances`
--

CREATE TABLE `remittances` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `remittance_date` date DEFAULT NULL COMMENT 'Date du rapport qui a généré ce versement',
  `payment_date` date DEFAULT NULL COMMENT 'Date réelle du paiement',
  `payment_operator` enum('Orange Money','MTN Mobile Money') DEFAULT NULL,
  `status` enum('pending','paid','partially_paid','failed') NOT NULL,
  `transaction_id` varchar(255) DEFAULT NULL,
  `comment` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `user_id` int(11) DEFAULT NULL,
  `debts_consolidated` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Créances en attente consolidées au moment de la synchronisation.',
  `net_amount_paid` decimal(10,2) DEFAULT NULL COMMENT 'Montant net effectivement payé au moment de la transaction'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `remittance_orders`
--

CREATE TABLE `remittance_orders` (
  `remittance_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `returned_stock_tracking`
--

CREATE TABLE `returned_stock_tracking` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `deliveryman_id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `return_status` enum('pending_return_to_hub','received_at_hub','returned_to_shop','cancelled') NOT NULL DEFAULT 'pending_return_to_hub',
  `declaration_date` datetime NOT NULL COMMENT 'Date à laquelle le livreur a déclaré le retour',
  `hub_reception_date` datetime DEFAULT NULL COMMENT 'Date de confirmation de réception au hub par le magasinier',
  `stock_received_by_user_id` int(11) DEFAULT NULL COMMENT 'Utilisateur (Admin/Stocker) qui a reçu le stock au hub',
  `comment` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `rider_absences`
--

CREATE TABLE `rider_absences` (
  `id` int(11) NOT NULL,
  `absence_date` date NOT NULL COMMENT 'Date de l''absence/jour férié',
  `user_id` int(11) DEFAULT NULL COMMENT 'ID du livreur concerné (NULL si férié pour tous)',
  `type` enum('absence','permission','ferie') NOT NULL COMMENT 'Type d''événement',
  `motif` varchar(255) DEFAULT NULL COMMENT 'Motif ou nom du jour férié (ex: Maladie, Tabaski)',
  `created_by_user_id` int(11) DEFAULT NULL COMMENT 'ID de l''admin qui a enregistré',
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Enregistrement des jours non travaillés';

-- --------------------------------------------------------

--
-- Structure de la table `shops`
--

CREATE TABLE `shops` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `payment_name` varchar(255) DEFAULT NULL,
  `phone_number` varchar(20) NOT NULL,
  `pin_hash` varchar(255) DEFAULT NULL,
  `phone_number_for_payment` varchar(20) DEFAULT NULL,
  `payment_operator` enum('Orange Money','MTN Mobile Money') DEFAULT NULL,
  `bill_packaging` tinyint(1) NOT NULL DEFAULT 0,
  `bill_storage` tinyint(1) NOT NULL DEFAULT 0,
  `packaging_price` decimal(10,2) NOT NULL DEFAULT 50.00,
  `storage_price` decimal(10,2) NOT NULL DEFAULT 100.00,
  `status` enum('actif','inactif') NOT NULL DEFAULT 'actif',
  `is_stock_managed` tinyint(1) DEFAULT 0,
  `created_by` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `last_login_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `shop_products`
--

CREATE TABLE `shop_products` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `reference` varchar(50) NOT NULL COMMENT 'Généré auto : NOM-DATE-SEQ',
  `name` varchar(255) NOT NULL,
  `variant` varchar(100) DEFAULT NULL COMMENT 'Taille, Couleur, Poids (ex: XL, Rouge)',
  `quantity` int(11) NOT NULL DEFAULT 0 COMMENT 'Stock réel validé',
  `alert_threshold` int(11) NOT NULL DEFAULT 5 COMMENT 'Seuil pour notification stock bas',
  `cost_price` decimal(10,2) DEFAULT 0.00 COMMENT 'Prix d''achat (confidentiel manager)',
  `selling_price` decimal(10,2) DEFAULT 0.00 COMMENT 'Prix de vente public',
  `image_url` longtext DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `shop_prospects`
--

CREATE TABLE `shop_prospects` (
  `id` int(11) NOT NULL,
  `phone_number` varchar(20) NOT NULL COMMENT 'Le numéro du prospect (utile pour lier le chat)',
  `contact_name` varchar(255) DEFAULT NULL,
  `status` enum('new','quoted','dormant','converted','rejected') NOT NULL DEFAULT 'new',
  `objection_history` text DEFAULT NULL COMMENT 'Stocke la dernière objection (ex: prix, dette) pour le raisonnement de relance',
  `last_contact_date` datetime NOT NULL COMMENT 'Utilisé par l''Agent Observateur pour déclencher les relances',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `shop_staff`
--

CREATE TABLE `shop_staff` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL COMMENT 'Nom de l''employé (ex: Vendeur Matin)',
  `phone_number` varchar(20) DEFAULT NULL COMMENT 'Optionnel, pour login direct',
  `pin_hash` varchar(255) NOT NULL COMMENT 'Code PIN personnel',
  `role` enum('manager','stock_clerk','sales') NOT NULL DEFAULT 'sales' COMMENT 'Manager: Tout, Stock: Entrées, Sales: Sorties',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `shop_storage_history`
--

CREATE TABLE `shop_storage_history` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `stock_movements`
--

CREATE TABLE `stock_movements` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `type` enum('entry','sale','adjustment','return','initial') NOT NULL,
  `quantity` int(11) NOT NULL COMMENT 'Positif pour entrée, Négatif pour sortie',
  `stock_before` int(11) NOT NULL,
  `stock_after` int(11) NOT NULL,
  `related_request_id` int(11) DEFAULT NULL COMMENT 'Lien vers stock_requests si entrée',
  `related_order_id` int(11) DEFAULT NULL COMMENT 'Lien vers orders si vente liée à une course',
  `performed_by_staff_id` int(11) DEFAULT NULL COMMENT 'Si fait par marchand',
  `performed_by_user_id` int(11) DEFAULT NULL COMMENT 'Si fait par admin WINK',
  `comment` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `stock_requests`
--

CREATE TABLE `stock_requests` (
  `id` int(11) NOT NULL,
  `shop_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `quantity_declared` int(11) NOT NULL COMMENT 'Quantité saisie par le marchand',
  `quantity_validated` int(11) DEFAULT NULL COMMENT 'Quantité réelle validée par Admin WINK',
  `proof_image_url` varchar(255) DEFAULT NULL COMMENT 'Photo du bordereau ou du carton',
  `status` enum('pending','validated','rejected','corrected') NOT NULL DEFAULT 'pending',
  `admin_comment` text DEFAULT NULL COMMENT 'Raison du rejet ou de la correction',
  `created_by_staff_id` int(11) DEFAULT NULL COMMENT 'Qui a fait la demande (NULL si compte principal)',
  `validated_by_user_id` int(11) DEFAULT NULL COMMENT 'Admin WINK qui a validé',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `validated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `phone_number` varchar(20) NOT NULL,
  `pin` varchar(255) NOT NULL,
  `role` enum('admin','livreur') NOT NULL,
  `status` enum('actif','inactif') NOT NULL DEFAULT 'actif',
  `name` varchar(255) NOT NULL,
  `fcm_token` varchar(255) DEFAULT NULL COMMENT 'Jeton Firebase Cloud Messaging de l''appareil',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Structure de la table `whatsapp_conversation_history`
--

CREATE TABLE `whatsapp_conversation_history` (
  `id` int(11) NOT NULL,
  `recipient_phone` varchar(20) NOT NULL,
  `sender_type` enum('prospect_b2b','client_b2c','wink_agent_ai','wink_agent_humain','admin','livreur') NOT NULL,
  `message_direction` enum('INCOMING','OUTGOING') NOT NULL,
  `message_text` text NOT NULL,
  `ai_model_used` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `shop_id` int(11) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Index pour les tables déchargées
--

--
-- Index pour la table `cash_closings`
--
ALTER TABLE `cash_closings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `closing_date` (`closing_date`),
  ADD KEY `closed_by_user_id` (`closed_by_user_id`);

--
-- Index pour la table `cash_transactions`
--
ALTER TABLE `cash_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `validated_by` (`validated_by`),
  ADD KEY `category_id` (`category_id`);

--
-- Index pour la table `daily_shop_balances`
--
ALTER TABLE `daily_shop_balances`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `date_shop_unique` (`report_date`,`shop_id`),
  ADD KEY `shop_id` (`shop_id`);

--
-- Index pour la table `debts`
--
ALTER TABLE `debts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_debt_idempotence` (`shop_id`,`type`,`creation_date_only`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `idx_debt_shop` (`shop_id`),
  ADD KEY `idx_debt_status` (`status`),
  ADD KEY `idx_debt_created_at` (`created_at`),
  ADD KEY `idx_debt_type_date` (`type`,`created_at`);

--
-- Index pour la table `deliveryman_shortfalls`
--
ALTER TABLE `deliveryman_shortfalls`
  ADD PRIMARY KEY (`id`),
  ADD KEY `deliveryman_id` (`deliveryman_id`),
  ADD KEY `fk_shortfall_user` (`created_by_user_id`);

--
-- Index pour la table `expenses`
--
ALTER TABLE `expenses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `rider_id` (`rider_id`);

--
-- Index pour la table `expense_categories`
--
ALTER TABLE `expense_categories`
  ADD PRIMARY KEY (`id`);

--
-- Index pour la table `livreurs`
--
ALTER TABLE `livreurs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `user_id` (`user_id`);

--
-- Index pour la table `message_read_status`
--
ALTER TABLE `message_read_status`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_message_user_read` (`message_id`,`user_id`),
  ADD KEY `idx_user_read` (`user_id`);

--
-- Index pour la table `monthly_objectives`
--
ALTER TABLE `monthly_objectives`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `month_year` (`month_year`),
  ADD KEY `idx_month_year` (`month_year`);

--
-- Index pour la table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `shop_id` (`shop_id`),
  ADD KEY `deliveryman_id` (`deliveryman_id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `updated_by` (`updated_by`),
  ADD KEY `fk_order_prepared_by` (`prepared_by`);

--
-- Index pour la table `order_history`
--
ALTER TABLE `order_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Index pour la table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_id` (`order_id`);

--
-- Index pour la table `order_messages`
--
ALTER TABLE `order_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_order_id` (`order_id`),
  ADD KEY `idx_created_at` (`created_at`),
  ADD KEY `fk_message_user` (`user_id`);

--
-- Index pour la table `quick_replies`
--
ALTER TABLE `quick_replies`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_role_order` (`role`,`display_order`);

--
-- Index pour la table `remittances`
--
ALTER TABLE `remittances`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `shop_date_unique` (`shop_id`,`remittance_date`),
  ADD UNIQUE KEY `uk_remittance_unique` (`shop_id`,`remittance_date`),
  ADD KEY `shop_id` (`shop_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Index pour la table `remittance_orders`
--
ALTER TABLE `remittance_orders`
  ADD PRIMARY KEY (`remittance_id`,`order_id`),
  ADD KEY `order_id` (`order_id`);

--
-- Index pour la table `returned_stock_tracking`
--
ALTER TABLE `returned_stock_tracking`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_order_return` (`order_id`),
  ADD KEY `fk_return_deliveryman` (`deliveryman_id`),
  ADD KEY `fk_return_shop` (`shop_id`),
  ADD KEY `fk_return_stocker` (`stock_received_by_user_id`);

--
-- Index pour la table `rider_absences`
--
ALTER TABLE `rider_absences`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by_user_id` (`created_by_user_id`),
  ADD KEY `idx_absence_date` (`absence_date`),
  ADD KEY `idx_user_date` (`user_id`,`absence_date`);

--
-- Index pour la table `shops`
--
ALTER TABLE `shops`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_shops_name` (`name`),
  ADD KEY `idx_shops_phone_number` (`phone_number`),
  ADD KEY `idx_shops_created_by` (`created_by`);

--
-- Index pour la table `shop_products`
--
ALTER TABLE `shop_products`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_product_ref` (`reference`),
  ADD KEY `idx_product_shop` (`shop_id`);

--
-- Index pour la table `shop_prospects`
--
ALTER TABLE `shop_prospects`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `phone_number` (`phone_number`);

--
-- Index pour la table `shop_staff`
--
ALTER TABLE `shop_staff`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_staff_shop` (`shop_id`);

--
-- Index pour la table `shop_storage_history`
--
ALTER TABLE `shop_storage_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `shop_id` (`shop_id`);

--
-- Index pour la table `stock_movements`
--
ALTER TABLE `stock_movements`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_movement_shop` (`shop_id`),
  ADD KEY `idx_movement_product` (`product_id`),
  ADD KEY `idx_movement_date` (`created_at`),
  ADD KEY `fk_movement_request` (`related_request_id`),
  ADD KEY `fk_movement_order` (`related_order_id`);

--
-- Index pour la table `stock_requests`
--
ALTER TABLE `stock_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_request_shop` (`shop_id`),
  ADD KEY `idx_request_status` (`status`),
  ADD KEY `fk_request_product` (`product_id`),
  ADD KEY `fk_request_staff` (`created_by_staff_id`),
  ADD KEY `fk_request_admin` (`validated_by_user_id`);

--
-- Index pour la table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `phone_number` (`phone_number`),
  ADD KEY `idx_users_phone_number` (`phone_number`),
  ADD KEY `idx_users_role` (`role`);

--
-- Index pour la table `whatsapp_conversation_history`
--
ALTER TABLE `whatsapp_conversation_history`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `cash_closings`
--
ALTER TABLE `cash_closings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `cash_transactions`
--
ALTER TABLE `cash_transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `daily_shop_balances`
--
ALTER TABLE `daily_shop_balances`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `debts`
--
ALTER TABLE `debts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `deliveryman_shortfalls`
--
ALTER TABLE `deliveryman_shortfalls`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `expenses`
--
ALTER TABLE `expenses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `expense_categories`
--
ALTER TABLE `expense_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `livreurs`
--
ALTER TABLE `livreurs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `message_read_status`
--
ALTER TABLE `message_read_status`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `monthly_objectives`
--
ALTER TABLE `monthly_objectives`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `order_history`
--
ALTER TABLE `order_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `order_messages`
--
ALTER TABLE `order_messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `quick_replies`
--
ALTER TABLE `quick_replies`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `remittances`
--
ALTER TABLE `remittances`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `returned_stock_tracking`
--
ALTER TABLE `returned_stock_tracking`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `rider_absences`
--
ALTER TABLE `rider_absences`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `shops`
--
ALTER TABLE `shops`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `shop_products`
--
ALTER TABLE `shop_products`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `shop_prospects`
--
ALTER TABLE `shop_prospects`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `shop_staff`
--
ALTER TABLE `shop_staff`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `shop_storage_history`
--
ALTER TABLE `shop_storage_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `stock_movements`
--
ALTER TABLE `stock_movements`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `stock_requests`
--
ALTER TABLE `stock_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `whatsapp_conversation_history`
--
ALTER TABLE `whatsapp_conversation_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Contraintes pour les tables déchargées
--

--
-- Contraintes pour la table `cash_closings`
--
ALTER TABLE `cash_closings`
  ADD CONSTRAINT `cash_closings_ibfk_1` FOREIGN KEY (`closed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `cash_transactions`
--
ALTER TABLE `cash_transactions`
  ADD CONSTRAINT `cash_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `cash_transactions_ibfk_2` FOREIGN KEY (`validated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `cash_transactions_ibfk_3` FOREIGN KEY (`category_id`) REFERENCES `expense_categories` (`id`);

--
-- Contraintes pour la table `daily_shop_balances`
--
ALTER TABLE `daily_shop_balances`
  ADD CONSTRAINT `daily_shop_balances_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `debts`
--
ALTER TABLE `debts`
  ADD CONSTRAINT `debts_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `debts_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `deliveryman_shortfalls`
--
ALTER TABLE `deliveryman_shortfalls`
  ADD CONSTRAINT `fk_shortfall_deliveryman` FOREIGN KEY (`deliveryman_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_shortfall_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `expenses`
--
ALTER TABLE `expenses`
  ADD CONSTRAINT `expenses_ibfk_1` FOREIGN KEY (`rider_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `livreurs`
--
ALTER TABLE `livreurs`
  ADD CONSTRAINT `livreurs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `message_read_status`
--
ALTER TABLE `message_read_status`
  ADD CONSTRAINT `fk_read_message` FOREIGN KEY (`message_id`) REFERENCES `order_messages` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_read_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `fk_order_prepared_by` FOREIGN KEY (`prepared_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`deliveryman_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `orders_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `orders_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `order_history`
--
ALTER TABLE `order_history`
  ADD CONSTRAINT `order_history_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `order_history_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `order_messages`
--
ALTER TABLE `order_messages`
  ADD CONSTRAINT `fk_message_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_message_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `remittances`
--
ALTER TABLE `remittances`
  ADD CONSTRAINT `remittances_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `remittances_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `remittance_orders`
--
ALTER TABLE `remittance_orders`
  ADD CONSTRAINT `remittance_orders_ibfk_1` FOREIGN KEY (`remittance_id`) REFERENCES `remittances` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `remittance_orders_ibfk_2` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `returned_stock_tracking`
--
ALTER TABLE `returned_stock_tracking`
  ADD CONSTRAINT `fk_return_deliveryman` FOREIGN KEY (`deliveryman_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_return_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_return_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_return_stocker` FOREIGN KEY (`stock_received_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `rider_absences`
--
ALTER TABLE `rider_absences`
  ADD CONSTRAINT `rider_absences_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `rider_absences_ibfk_2` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `shops`
--
ALTER TABLE `shops`
  ADD CONSTRAINT `shops_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Contraintes pour la table `shop_products`
--
ALTER TABLE `shop_products`
  ADD CONSTRAINT `fk_product_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `shop_staff`
--
ALTER TABLE `shop_staff`
  ADD CONSTRAINT `fk_staff_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `shop_storage_history`
--
ALTER TABLE `shop_storage_history`
  ADD CONSTRAINT `shop_storage_history_ibfk_1` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `stock_movements`
--
ALTER TABLE `stock_movements`
  ADD CONSTRAINT `fk_movement_order` FOREIGN KEY (`related_order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_movement_product` FOREIGN KEY (`product_id`) REFERENCES `shop_products` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_movement_request` FOREIGN KEY (`related_request_id`) REFERENCES `stock_requests` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_movement_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `stock_requests`
--
ALTER TABLE `stock_requests`
  ADD CONSTRAINT `fk_request_admin` FOREIGN KEY (`validated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_request_product` FOREIGN KEY (`product_id`) REFERENCES `shop_products` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_request_shop` FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_request_staff` FOREIGN KEY (`created_by_staff_id`) REFERENCES `shop_staff` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
