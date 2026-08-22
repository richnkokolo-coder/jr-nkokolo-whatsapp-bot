# Bot WhatsApp JR NKOKOLO — Guide de mise en route

Tu as déjà ton compte Meta Business / WABA, donc voici les étapes qu'il te reste pour que ce bot tourne réellement sur ton numéro.

## Ce que contient ce projet
- `server.js` — le webhook qui reçoit les messages et répond (FAQ, suivi livraison, réservation véhicule)
- `data/faq.json` — tes infos horaires/tarifs/paiement (à remplacer par tes vraies infos)
- `data/tracking.json` — exemple de suivi de livraison (à terme, à connecter à ton vrai système de suivi)
- `data/vehicles.json` — exemple de planning véhicules (à terme, à connecter à ton vrai planning)
- `.env.example` — modèle des clés à renseigner

## Étape 1 — Récupérer tes accès Meta
1. Va sur [developers.facebook.com](https://developers.facebook.com) → ton app liée à ton compte Business
2. Section **WhatsApp > Configuration de l'API** : tu y trouveras
   - le **Phone Number ID** (`WHATSAPP_PHONE_NUMBER_ID`)
   - un **token d'accès temporaire** pour tester (24h) — pour la production, génère un **token permanent** via un "System User" dans Meta Business Settings
3. Copie `.env.example` en `.env` et colle ces valeurs dedans

## Étape 2 — Installer et lancer le serveur
```bash
npm install
npm start
```
Ça démarre le serveur en local sur le port 3000. Pour que Meta puisse l'appeler, il doit être accessible publiquement (voir étape 3).

## Étape 3 — Héberger le serveur
En local, Meta ne peut pas t'atteindre. Il faut déployer ce code quelque part d'accessible sur internet. Options simples et peu coûteuses :
- **Render.com** ou **Railway.app** (gratuit pour démarrer, déploiement en quelques clics depuis un dépôt Git)
- Un petit VPS si tu préfères garder la main dessus

## Étape 4 — Connecter le webhook dans Meta
1. Dans Meta for Developers → WhatsApp → Configuration → **Webhook**
2. URL de rappel : `https://ton-serveur-deploye.com/webhook`
3. Verify Token : la même valeur que tu as mise dans `WHATSAPP_VERIFY_TOKEN`
4. Abonne-toi au champ **messages**

## Étape 5 — Tester
Envoie un message à ton numéro WhatsApp Business depuis ton téléphone personnel :
- "location" → doit lister les véhicules disponibles
- "suivi" puis "JR2026001" → doit donner un statut de livraison
- "horaires" → doit répondre avec tes horaires

## Étape 6 — Remplacer les données de démo par tes vraies données
Les fichiers dans `data/` sont des exemples. Pour une vraie mise en production :
- `faq.json` → mets tes vrais tarifs, horaires, zones
- `tracking.json` → idéalement, connecte ça à ton vrai système de suivi (même un Google Sheet lu automatiquement, ou une vraie base de données)
- `vehicles.json` → connecte ça à ton vrai planning de disponibilité

## Limites importantes à connaître
- Les sessions client sont **en mémoire** (`sessions` dans `server.js`) : elles sont perdues si le serveur redémarre. Pour la production, il vaudra mieux les stocker dans une vraie base (Redis ou Postgres).
- Meta impose depuis 2026 que les bots IA effectuent des tâches concrètes plutôt que d'être des chatbots ouverts — ce bot est conçu dans cet esprit (FAQ précise, suivi, réservation), pas comme un chat libre.
- Ce bot répond avec des règles simples (mots-clés). Si tu veux qu'il comprenne des phrases plus naturelles et variées, on peut brancher un vrai modèle de langage (LLM) à la place du routeur par mots-clés — dis-le moi si tu veux qu'on ajoute ça.
