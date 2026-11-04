"""Everything the InkonabTV support bot knows: menus, answers and keywords.

Each topic has a button label and an answer in English and French, plus
keywords. When a customer types a message, the bot looks for those keywords
and sends the best matching answer straight away (the message still reaches
you). {apk}, {code}, {channel}, {version}, {notes} and {donate} are filled in
from config.json.

To add a question: add a topic below and put its id in one of the MENUS.
"""

TOPICS = {
    # ------------------------------------------------------------ install
    "versions": {
        "kw": ["which version", "difference", "inkonabtv+", "inkonabtv plus", "plus version",
               "sideload", "quelle version", "différence", "difference entre"],
        "en": ("🔀 Which version do I need?",
               "🔀 Two versions of InkonabTV\n\n"
               "⭐ InkonabTV+ (from our site, installed by hand)\n"
               "• Android phones, Android TV, Google TV, Fire TV, Android boxes\n"
               "• Sign in with your InkonabTV subscription, extra M3U playlists, "
               "built-in free VPN, auto updates\n"
               "• 📱 Phone: link {apk}\n"
               "• 📺 TV: Downloader app, code {code}\n\n"
               "▶️ InkonabTV (stores)\n"
               "• Google Play and Samsung TV app store (coming soon)\n"
               "• Pure player: you add your own Xtream Codes or M3U playlist\n"
               "• No VPN\n\n"
               "Pick a step-by-step guide in 📖 Guides A to Z."),
        "fr": ("🔀 Quelle version choisir ?",
               "🔀 Deux versions d'InkonabTV\n\n"
               "⭐ InkonabTV+ (depuis notre site, installée à la main)\n"
               "• Téléphones Android, Android TV, Google TV, Fire TV, box Android\n"
               "• Connexion avec votre abonnement InkonabTV, playlists M3U en plus, "
               "VPN gratuit intégré, mises à jour auto\n"
               "• 📱 Téléphone : lien {apk}\n"
               "• 📺 Télé : appli Downloader, code {code}\n\n"
               "▶️ InkonabTV (boutiques)\n"
               "• Google Play et boutique Samsung TV (bientôt)\n"
               "• Lecteur pur : vous ajoutez votre propre playlist Xtream Codes ou M3U\n"
               "• Pas de VPN\n\n"
               "Choisissez un guide pas à pas dans 📖 Guides de A à Z."),
    },
    "phone": {
        "kw": ["phone", "mobile", "smartphone", "apk", "download", "telecharger",
               "téléchar", "telephone", "téléphone", "tablet", "tablette"],
        "en": ("📱 InkonabTV+ on a phone (A–Z)",
               "📱 InkonabTV+ on an Android phone or tablet, A to Z\n\n"
               "1️⃣ Open Chrome on your phone and go to:\n{apk}\n"
               "2️⃣ If Chrome says \"File might be harmful\", tap Download anyway.\n"
               "3️⃣ When it's done, tap Open (or open inkonabtv.apk in Downloads).\n"
               "4️⃣ \"Your phone isn't allowed to install unknown apps from this "
               "source\": tap Settings → switch on Allow from this source → go back.\n"
               "5️⃣ Tap Install. If Play Protect warns you, tap More details → "
               "Install anyway (the app is safe, it just isn't from the Play Store).\n"
               "6️⃣ Tap Open.\n\n"
               "Next: ⚙️ First setup of InkonabTV+ (sign in)."),
        "fr": ("📱 InkonabTV+ sur téléphone (A–Z)",
               "📱 InkonabTV+ sur téléphone ou tablette Android, de A à Z\n\n"
               "1️⃣ Ouvrez Chrome sur votre téléphone et allez sur :\n{apk}\n"
               "2️⃣ Si Chrome dit « Fichier potentiellement dangereux », touchez "
               "Télécharger quand même.\n"
               "3️⃣ À la fin, touchez Ouvrir (ou ouvrez inkonabtv.apk dans "
               "Téléchargements).\n"
               "4️⃣ « Votre téléphone n'est pas autorisé à installer des applis "
               "inconnues de cette source » : Paramètres → activez Autoriser cette "
               "source → revenez.\n"
               "5️⃣ Touchez Installer. Si Play Protect avertit : Plus de détails → "
               "Installer quand même (l'appli est sûre, elle ne vient juste pas du "
               "Play Store).\n"
               "6️⃣ Touchez Ouvrir.\n\n"
               "Ensuite : ⚙️ Premier réglage d'InkonabTV+ (connexion)."),
    },
    "tv": {
        "kw": ["android tv", "google tv", "box", "boitier", "boîtier", "downloader",
               "tv box", "nvidia", "shield", "mi box", "chromecast", "code", "aftv"],
        "en": ("📺 InkonabTV+ on Android TV / box (A–Z)",
               "📺 InkonabTV+ on Android TV, Google TV or an Android box, A to Z\n\n"
               "1️⃣ Open the Google Play Store on the TV, search \"Downloader\" and "
               "install \"Downloader by AFTVnews\" (orange icon, free).\n"
               "2️⃣ Allow it to install apps:\n"
               "• Google TV: Settings → Apps → Security & restrictions → Unknown "
               "sources → Downloader ON\n"
               "• Android TV: Settings → Device preferences → Security & "
               "restrictions → Unknown sources → Downloader ON\n"
               "(If you can't find it, Downloader will ask you during step 5.)\n"
               "3️⃣ Open Downloader. Allow access to files if asked. Close the tips.\n"
               "4️⃣ In the box \"Enter a URL or Search Term\", type the code {code} "
               "and press Go.\n"
               "5️⃣ The download starts. When it asks, press Install.\n"
               "6️⃣ Press Open. You can then press Delete in Downloader to remove the "
               "installer file and save space.\n\n"
               "Next: ⚙️ First setup of InkonabTV+ (sign in)."),
        "fr": ("📺 InkonabTV+ sur Android TV / box (A–Z)",
               "📺 InkonabTV+ sur Android TV, Google TV ou une box Android, de A à Z\n\n"
               "1️⃣ Ouvrez le Google Play Store sur la télé, cherchez « Downloader » "
               "et installez « Downloader by AFTVnews » (icône orange, gratuit).\n"
               "2️⃣ Autorisez-le à installer des applis :\n"
               "• Google TV : Paramètres → Applis → Sécurité et restrictions → Sources "
               "inconnues → Downloader activé\n"
               "• Android TV : Paramètres → Préférences de l'appareil → Sécurité et "
               "restrictions → Sources inconnues → Downloader activé\n"
               "(Introuvable ? Downloader vous le demandera à l'étape 5.)\n"
               "3️⃣ Ouvrez Downloader. Autorisez l'accès aux fichiers si demandé. "
               "Fermez les astuces.\n"
               "4️⃣ Dans la case « Enter a URL or Search Term », tapez le code {code} "
               "et appuyez sur Go.\n"
               "5️⃣ Le téléchargement démarre. Quand c'est demandé, appuyez sur "
               "Installer.\n"
               "6️⃣ Appuyez sur Ouvrir. Vous pouvez ensuite appuyer sur Delete dans "
               "Downloader pour supprimer le fichier d'installation.\n\n"
               "Ensuite : ⚙️ Premier réglage d'InkonabTV+ (connexion)."),
    },
    "firetv": {
        "kw": ["fire tv", "firestick", "fire stick", "amazon", "firetv", "fire"],
        "en": ("🔥 InkonabTV+ on Fire TV (A–Z)",
               "🔥 InkonabTV+ on Fire TV / Fire Stick, A to Z\n\n"
               "1️⃣ On the Fire TV home screen, go to Find → Search, type "
               "\"Downloader\" and install \"Downloader\" by AFTVnews (orange icon).\n"
               "2️⃣ Turn on developer options (once): Settings → My Fire TV → About → "
               "click on your device name (e.g. Fire TV Stick) 7 times until it says "
               "\"You are now a developer\".\n"
               "3️⃣ Settings → My Fire TV → Developer options → Install unknown apps → "
               "Downloader ON.\n"
               "4️⃣ Open Downloader, allow access to files, close the tips.\n"
               "5️⃣ In \"Enter a URL or Search Term\", type the code {code} and press "
               "Go.\n"
               "6️⃣ When the download finishes, press Install, then Open.\n"
               "7️⃣ Optional: press Delete in Downloader to remove the installer file.\n\n"
               "Next: ⚙️ First setup of InkonabTV+ (sign in)."),
        "fr": ("🔥 InkonabTV+ sur Fire TV (A–Z)",
               "🔥 InkonabTV+ sur Fire TV / Fire Stick, de A à Z\n\n"
               "1️⃣ Sur l'accueil Fire TV, allez dans Rechercher, tapez « Downloader » "
               "et installez « Downloader » par AFTVnews (icône orange).\n"
               "2️⃣ Activez les options développeur (une fois) : Paramètres → Ma Fire "
               "TV → À propos → cliquez 7 fois sur le nom de l'appareil (ex. Fire TV "
               "Stick) jusqu'à « Vous êtes maintenant développeur ».\n"
               "3️⃣ Paramètres → Ma Fire TV → Options pour les développeurs → Installer "
               "des applis inconnues → Downloader activé.\n"
               "4️⃣ Ouvrez Downloader, autorisez l'accès aux fichiers, fermez les "
               "astuces.\n"
               "5️⃣ Dans « Enter a URL or Search Term », tapez le code {code} et "
               "appuyez sur Go.\n"
               "6️⃣ À la fin du téléchargement, Installer, puis Ouvrir.\n"
               "7️⃣ Facultatif : Delete dans Downloader pour supprimer le fichier "
               "d'installation.\n\n"
               "Ensuite : ⚙️ Premier réglage d'InkonabTV+ (connexion)."),
    },
    "plus_setup": {
        "kw": ["first setup", "configure", "configuration", "how to use", "sign in plus",
               "subscription login", "premier réglage", "configurer",
               "after install", "apres installation", "après installation",
               "set up inkonabtv+", "configurer inkonabtv+"],
        "en": ("⚙️ First setup of InkonabTV+",
               "⚙️ First setup of InkonabTV+, A to Z\n\n"
               "1️⃣ Open InkonabTV+. The sign-in screen appears.\n"
               "2️⃣ Choose how to sign in:\n"
               "• Xtream Codes tab: type the username and password of your InkonabTV "
               "subscription, then Sign in.\n"
               "• Set up from phone tab (easier on a TV): scan the QR code with your "
               "phone, type the username and password there, press Send to TV.\n"
               "3️⃣ On a big playlist, choose the languages you want (you can change "
               "them later in Settings).\n"
               "4️⃣ Wait a few seconds while the channels, films and series load. "
               "Next time the app opens instantly.\n"
               "5️⃣ Enjoy: Home, Live TV with the TV guide, Movies, Series, Search.\n\n"
               "➕ Free channels of your own: Settings → Extra playlists → add an M3U link.\n"
               "🛡 If a channel won't play, the built-in free VPN connects by itself "
               "and retries. Nothing to set up.\n"
               "➕ Your own M3U links: Settings → Extra playlists."),
        "fr": ("⚙️ Premier réglage d'InkonabTV+",
               "⚙️ Premier réglage d'InkonabTV+, de A à Z\n\n"
               "1️⃣ Ouvrez InkonabTV+. L'écran de connexion s'affiche.\n"
               "2️⃣ Choisissez comment vous connecter :\n"
               "• Onglet Xtream Codes : tapez le nom d'utilisateur et le mot de passe "
               "de votre abonnement InkonabTV, puis Se connecter.\n"
               "• Onglet Configurer depuis le téléphone (plus simple sur une télé) : "
               "scannez le QR code, tapez l'identifiant et le mot de passe sur le "
               "téléphone, appuyez sur Envoyer à la télé.\n"
               "3️⃣ Sur une grosse playlist, choisissez vos langues (modifiables plus "
               "tard dans les Réglages).\n"
               "4️⃣ Patientez quelques secondes pendant le chargement. La fois suivante, "
               "l'appli s'ouvre tout de suite.\n"
               "5️⃣ Profitez : Accueil, Direct avec le guide TV, Films, Séries, "
               "Recherche.\n\n"
               "➕ Vos propres chaînes gratuites : Réglages → Playlists supplémentaires → ajoutez un lien M3U.\n"
               "🛡 Si une chaîne ne se lance pas, le VPN gratuit intégré se connecte "
               "tout seul et réessaie. Rien à régler.\n"
               "➕ Vos propres liens M3U : Réglages → Playlists supplémentaires."),
    },
    "playstore": {
        "kw": ["play store", "playstore", "google play", "store", "boutique"],
        "en": ("▶️ From Google Play (A–Z)",
               "▶️ InkonabTV from Google Play, A to Z\n\n"
               "1️⃣ Open the Google Play Store on your phone or Android TV.\n"
               "2️⃣ Search \"InkonabTV\" and open the app with the yellow TV logo.\n"
               "3️⃣ Tap Install, then Open.\n"
               "4️⃣ Sign in with your own playlist:\n"
               "• Xtream Codes: server address (with http:// and port), username, "
               "password\n"
               "• M3U: paste your M3U link\n"
               "• Set up from phone (on a TV): scan the QR code and type it all on your "
               "phone\n"
               "5️⃣ Choose your playlist languages if asked, and enjoy.\n\n"
               "ℹ️ The Google Play version is in review right now. If you can't find "
               "it yet, use InkonabTV+ meanwhile (📖 Guides A to Z). The store version "
               "is a pure player: no built-in subscription and no VPN."),
        "fr": ("▶️ Depuis Google Play (A–Z)",
               "▶️ InkonabTV depuis Google Play, de A à Z\n\n"
               "1️⃣ Ouvrez le Google Play Store sur votre téléphone ou Android TV.\n"
               "2️⃣ Cherchez « InkonabTV » et ouvrez l'appli au logo de télé jaune.\n"
               "3️⃣ Touchez Installer, puis Ouvrir.\n"
               "4️⃣ Connectez-vous avec votre propre playlist :\n"
               "• Xtream Codes : adresse du serveur (avec http:// et le port), nom "
               "d'utilisateur, mot de passe\n"
               "• M3U : collez votre lien M3U\n"
               "• Configurer depuis le téléphone (sur une télé) : scannez le QR code et "
               "tapez tout sur votre téléphone\n"
               "5️⃣ Choisissez les langues de la playlist si demandé, et profitez.\n\n"
               "ℹ️ La version Google Play est en cours de validation. Si vous ne la "
               "trouvez pas encore, utilisez InkonabTV+ en attendant (📖 Guides de A à "
               "Z). La version boutique est un lecteur pur : pas d'abonnement intégré "
               "ni de VPN."),
    },
    "samsung": {
        "kw": ["samsung", "tizen", "smart tv", "lg", "webos", "hisense", "tcl"],
        "en": ("📺 Samsung TV (A–Z)",
               "📺 InkonabTV on a Samsung TV, A to Z\n\n"
               "1️⃣ Press Home on the Samsung remote and go to Apps.\n"
               "2️⃣ Select the 🔍 search icon and type \"InkonabTV\".\n"
               "3️⃣ Open the app with the yellow TV logo and select Install.\n"
               "4️⃣ Select Open (it's also added to your Home bar).\n"
               "5️⃣ Sign in with your own playlist. Easiest: choose Set up from phone, "
               "scan the QR code and type the details on your phone. Or type the "
               "Xtream Codes server, username and password, or an M3U link "
               "(press OK on a field to open the keyboard).\n"
               "6️⃣ Remote: ◀ channel list, OK top bar, CH+ / CH− change channel, "
               "colour keys: Red favourite, Green channel list, Yellow TV guide, Blue "
               "search.\n\n"
               "ℹ️ The Samsung version is in Samsung's review right now and works on "
               "2018 and newer TVs. We'll announce it on {channel} the day it's live. "
               "Until then, an Android TV box or Fire TV Stick with InkonabTV+ works "
               "great.\n"
               "Other Smart TVs (LG, Hisense…): not yet."),
        "fr": ("📺 Samsung TV (A–Z)",
               "📺 InkonabTV sur une Samsung TV, de A à Z\n\n"
               "1️⃣ Appuyez sur Home sur la télécommande Samsung et allez dans Apps.\n"
               "2️⃣ Sélectionnez la loupe 🔍 et tapez « InkonabTV ».\n"
               "3️⃣ Ouvrez l'appli au logo de télé jaune et choisissez Installer.\n"
               "4️⃣ Choisissez Ouvrir (elle s'ajoute aussi à la barre d'accueil).\n"
               "5️⃣ Connectez-vous avec votre propre playlist. Le plus simple : "
               "Configurer depuis le téléphone, scannez le QR code et tapez les infos "
               "sur votre téléphone. Ou tapez le serveur Xtream Codes, l'identifiant "
               "et le mot de passe, ou un lien M3U (OK sur un champ ouvre le clavier).\n"
               "6️⃣ Télécommande : ◀ liste des chaînes, OK barre du haut, CH+ / CH− "
               "changer de chaîne, touches couleur : Rouge favori, Vert liste, Jaune "
               "guide TV, Bleu recherche.\n\n"
               "ℹ️ La version Samsung est en cours de validation chez Samsung et "
               "marche sur les télés 2018 et plus récentes. Nous l'annoncerons sur "
               "{channel} le jour même. En attendant, une box Android TV ou une Fire "
               "TV Stick avec InkonabTV+ marche très bien.\n"
               "Autres Smart TV (LG, Hisense…) : pas encore."),
    },
    "apple": {
        "kw": ["iphone", "ipad", "ios", "apple", "mac", "macos", "app store",
               "appstore", "apple tv", "windows", "pc", "computer", "ordinateur"],
        "en": ("🍏 iPhone, iPad, Mac, PC",
               "🍏 iPhone, iPad and Mac\n\n"
               "InkonabTV is coming soon to the Apple App Store for iPhone, iPad and "
               "macOS. Follow our channel to know the day it's out: {channel}\n\n"
               "Windows PC: not planned yet."),
        "fr": ("🍏 iPhone, iPad, Mac, PC",
               "🍏 iPhone, iPad et Mac\n\n"
               "InkonabTV arrive bientôt sur l'App Store d'Apple pour iPhone, iPad et "
               "macOS. Suivez notre chaîne pour connaître la date : {channel}\n\n"
               "PC Windows : pas prévu pour l'instant."),
    },
    "update": {
        "kw": ["update", "upgrade", "new version", "latest", "version", "mise a jour",
               "mise à jour", "maj", "nouvelle version", "dernière", "derniere"],
        "en": ("🆕 Latest version & updating",
               "🆕 Latest version: {version}\n{notes}\n\n"
               "To update, install it again the same way (phone link or Downloader "
               "code {code}). Your sign-in and settings are kept.\n\n"
               "All the news: {channel}"),
        "fr": ("🆕 Dernière version & mise à jour",
               "🆕 Dernière version : {version}\n{notes}\n\n"
               "Pour mettre à jour, réinstallez de la même façon (lien téléphone ou "
               "code Downloader {code}). Votre connexion et vos réglages sont gardés.\n\n"
               "Toutes les nouveautés : {channel}"),
    },
    # ------------------------------------------------------------ setup
    "playlist": {
        "kw": ["playlist", "xtream", "m3u", "login", "sign in", "add", "username",
               "server", "url", "ajouter", "serveur", "identifiant", "connexion",
               "connecter", "set up", "setup", "configurer"],
        "en": ("📋 Add my playlist",
               "📋 Add your playlist\n\n"
               "InkonabTV is a player: it doesn't include channels. Use the details "
               "your TV provider gave you:\n\n"
               "• Xtream Codes: server address (with http:// and the port, e.g. "
               "http://example.com:8080), username, password\n"
               "• or an M3U link\n\n"
               "Copy them exactly: capitals and spaces matter. Then press Sign in. "
               "On a big playlist, the app asks which languages you want and only "
               "loads those."),
        "fr": ("📋 Ajouter ma playlist",
               "📋 Ajouter votre playlist\n\n"
               "InkonabTV est un lecteur : il n'inclut aucune chaîne. Utilisez les "
               "infos données par votre fournisseur :\n\n"
               "• Xtream Codes : adresse du serveur (avec http:// et le port, ex. "
               "http://example.com:8080), nom d'utilisateur, mot de passe\n"
               "• ou un lien M3U\n\n"
               "Recopiez-les exactement : majuscules et espaces comptent. Puis "
               "Se connecter. Sur une grosse playlist, l'appli demande quelles langues "
               "vous voulez et ne charge que celles-là."),
    },
    "fromphone": {
        "kw": ["qr", "from phone", "from my phone", "remote setup", "type", "keyboard",
               "clavier", "taper", "depuis le téléphone", "depuis mon téléphone"],
        "en": ("📲 Set up the TV from my phone",
               "📲 Set up the TV from your phone (no typing with the remote)\n\n"
               "1. On the TV's sign-in screen, choose \"Set up from phone\".\n"
               "2. Scan the QR code with your phone (or open "
               "dykel.github.io/InkonabTV/setup.html and enter the code shown).\n"
               "3. Enter your playlist on the phone and press Send to TV.\n"
               "The TV signs in by itself within a few seconds. Each code works once "
               "and expires after 15 minutes."),
        "fr": ("📲 Configurer la télé depuis mon téléphone",
               "📲 Configurer la télé depuis votre téléphone (sans taper à la "
               "télécommande)\n\n"
               "1. Sur l'écran de connexion de la télé, choisissez « Configurer depuis "
               "le téléphone ».\n"
               "2. Scannez le QR code avec votre téléphone (ou ouvrez "
               "dykel.github.io/InkonabTV/setup.html et entrez le code affiché).\n"
               "3. Entrez votre playlist sur le téléphone et appuyez sur Envoyer à la "
               "télé.\nLa télé se connecte toute seule en quelques secondes. Chaque "
               "code ne sert qu'une fois et expire après 15 minutes."),
    },
    "extra": {
        "kw": ["extra playlist", "second playlist", "another playlist", "two playlist",
               "2 playlist", "deuxième playlist", "autre playlist", "plusieurs"],
        "en": ("➕ Extra playlists",
               "➕ Add more playlists\n\n"
               "Settings → Extra playlists → add an M3U link (by hand, or \"Add from "
               "phone\"). Each one appears as a group at the top of Live TV and as a "
               "row on Home."),
        "fr": ("➕ Playlists supplémentaires",
               "➕ Ajouter d'autres playlists\n\n"
               "Réglages → Playlists supplémentaires → ajoutez un lien M3U (à la main, "
               "ou « Ajouter depuis le téléphone »). Chacune apparaît en groupe en haut "
               "du Direct et en rangée sur l'Accueil."),
    },
    "signout": {
        "kw": ["sign out", "log out", "logout", "change account", "change playlist",
               "other account", "déconnecter", "deconnecter", "changer de compte",
               "changer de playlist"],
        "en": ("🔄 Change account / sign out",
               "🔄 Change account or playlist\n\n"
               "Settings → Sign out, then sign in with the new details. Your "
               "favourites stay on the device."),
        "fr": ("🔄 Changer de compte",
               "🔄 Changer de compte ou de playlist\n\n"
               "Réglages → Se déconnecter, puis connectez-vous avec les nouvelles "
               "infos. Vos favoris restent sur l'appareil."),
    },
    "languages": {
        "kw": ["language", "french", "english", "spanish", "langue", "français",
               "francais", "anglais", "espagnol", "translate"],
        "en": ("🌍 App language & playlist languages",
               "🌍 Languages\n\n"
               "The app follows your device's language: English, Français, Español, "
               "Deutsch, Italiano, Português.\n\n"
               "Playlist languages (which channels and films are loaded) can be "
               "changed any time in Settings."),
        "fr": ("🌍 Langue de l'appli et de la playlist",
               "🌍 Langues\n\n"
               "L'appli suit la langue de votre appareil : English, Français, Español, "
               "Deutsch, Italiano, Português.\n\n"
               "Les langues de la playlist (chaînes et films chargés) se changent à "
               "tout moment dans les Réglages."),
    },
    # ------------------------------------------------------------ problems
    "noplay": {
        "kw": ["not working", "doesn't work", "doesnt work", "dont work", "don't work",
               "won't play", "wont play", "not play", "black screen", "error",
               "no signal", "not loading", "ne marche", "marche pas", "fonctionne pas",
               "écran noir", "ecran noir", "erreur", "ne lit pas", "bloqué", "bloque"],
        "en": ("⛔ A channel or film won't play",
               "⛔ A channel or film won't play\n\n"
               "1. Try another channel. If only one fails, the problem is on the "
               "provider's side for that channel.\n"
               "2. If nothing plays at all, check your subscription is still active "
               "with your provider.\n"
               "3. Settings → Live format: switch between HLS and MPEG-TS.\n"
               "4. Restart the app and your router.\n"
               "5. Make sure you have the latest version ({version}).\n\n"
               "The app already tries the other copies and formats of a channel by "
               "itself before showing an error. Still stuck? Send us a photo of the "
               "error."),
        "fr": ("⛔ Une chaîne ou un film ne se lance pas",
               "⛔ Une chaîne ou un film ne se lance pas\n\n"
               "1. Essayez une autre chaîne. Si une seule ne marche pas, le problème "
               "vient du fournisseur pour cette chaîne.\n"
               "2. Si rien ne marche, vérifiez que votre abonnement est toujours actif "
               "chez votre fournisseur.\n"
               "3. Réglages → Format du direct : passez de HLS à MPEG-TS (ou "
               "l'inverse).\n"
               "4. Redémarrez l'appli et votre box internet.\n"
               "5. Vérifiez que vous avez la dernière version ({version}).\n\n"
               "L'appli essaie déjà toute seule les autres copies et formats d'une "
               "chaîne avant d'afficher une erreur. Toujours bloqué ? Envoyez-nous "
               "une photo de l'erreur."),
    },
    "buffering": {
        "kw": ["buffer", "buffering", "freeze", "freezing", "lag", "slow", "stutter",
               "cut", "loading", "spinning", "coupe", "saccade", "lent", "charge",
               "freeze", "fige", "figé", "mise en mémoire"],
        "en": ("🐢 Buffering / freezing",
               "🐢 Buffering or freezing\n\n"
               "• Speed: HD needs about 10 Mbit/s, 4K about 25 Mbit/s.\n"
               "• Use an Ethernet cable, or 5 GHz Wi-Fi close to the router.\n"
               "• Android TV: ◀ / ▶ while watching switches to another quality copy.\n"
               "• Restart the router and the device.\n"
               "• If every channel freezes at the same time, the provider's server is "
               "busy: try again later."),
        "fr": ("🐢 Coupures / saccades",
               "🐢 Coupures ou saccades\n\n"
               "• Débit : la HD demande environ 10 Mbit/s, la 4K environ 25 Mbit/s.\n"
               "• Utilisez un câble Ethernet, ou le Wi-Fi 5 GHz près de la box.\n"
               "• Android TV : ◀ / ▶ pendant la lecture passe à une autre qualité.\n"
               "• Redémarrez la box internet et l'appareil.\n"
               "• Si toutes les chaînes coupent en même temps, le serveur du "
               "fournisseur est surchargé : réessayez plus tard."),
    },
    "loginerror": {
        "kw": ["wrong password", "invalid", "can't login", "cant login", "can't sign",
               "cant sign", "login failed", "incorrect", "expired", "authentication",
               "mot de passe", "identifiants", "expiré", "expire", "connexion impossible",
               "max connection", "connections"],
        "en": ("🔑 Can't sign in",
               "🔑 Can't sign in\n\n"
               "• Server address: include http:// (or https://) and the port, e.g. "
               "http://example.com:8080, with no space at the end.\n"
               "• Username and password: capitals matter.\n"
               "• Check with your provider that the subscription is active and not "
               "expired.\n"
               "• \"Too many connections\": close the app on your other devices.\n"
               "• Try the M3U link from your provider instead.\n"
               "• Tip: \"Set up from phone\" avoids typing mistakes with the remote."),
        "fr": ("🔑 Impossible de se connecter",
               "🔑 Impossible de se connecter\n\n"
               "• Adresse du serveur : avec http:// (ou https://) et le port, ex. "
               "http://example.com:8080, sans espace à la fin.\n"
               "• Nom d'utilisateur et mot de passe : les majuscules comptent.\n"
               "• Vérifiez avec votre fournisseur que l'abonnement est actif.\n"
               "• « Trop de connexions » : fermez l'appli sur vos autres appareils.\n"
               "• Essayez plutôt le lien M3U de votre fournisseur.\n"
               "• Astuce : « Configurer depuis le téléphone » évite les fautes de "
               "frappe à la télécommande."),
    },
    "guide": {
        "kw": ["guide", "epg", "programme", "program", "schedule", "no info",
               "what's on", "grille", "programme tv"],
        "en": ("📅 TV guide empty",
               "📅 TV guide is empty\n\n"
               "The guide comes from your provider. InkonabTV reads its quick guide, "
               "and since 1.0.10 its full guide when the quick one is empty.\n\n"
               "• Update to {version}.\n"
               "• Wait a minute after signing in: the guide loads in the background.\n"
               "• Some channels simply have no guide from the provider."),
        "fr": ("📅 Guide TV vide",
               "📅 Le guide TV est vide\n\n"
               "Le guide vient de votre fournisseur. InkonabTV lit son guide rapide, "
               "et depuis la 1.0.10 son guide complet quand le rapide est vide.\n\n"
               "• Mettez à jour en {version}.\n"
               "• Attendez une minute après la connexion : le guide se charge en "
               "arrière-plan.\n"
               "• Certaines chaînes n'ont tout simplement pas de guide."),
    },
    "missing": {
        "kw": ["missing", "empty", "no channel", "no movie", "no film", "disappeared",
               "not showing", "manque", "vide", "disparu", "pas de chaîne",
               "pas de chaine", "adult", "adulte", "refresh", "actualiser"],
        "en": ("🔍 Channels or films missing",
               "🔍 Channels, films or series missing\n\n"
               "• Settings → Refresh playlist to load the latest list from your "
               "provider.\n"
               "• Settings → playlist languages: a language you didn't pick isn't "
               "loaded.\n"
               "• Adult categories are hidden until you switch them on in Settings "
               "(PIN protected).\n"
               "• Search (🔍) looks through movies, series and channels."),
        "fr": ("🔍 Chaînes ou films manquants",
               "🔍 Chaînes, films ou séries manquants\n\n"
               "• Réglages → Actualiser la playlist pour charger la dernière liste.\n"
               "• Réglages → langues de la playlist : une langue non choisie n'est pas "
               "chargée.\n"
               "• Les catégories adultes sont cachées tant que vous ne les activez pas "
               "dans les Réglages (code PIN).\n"
               "• La recherche (🔍) couvre films, séries et chaînes."),
    },
    "crash": {
        "kw": ["crash", "crashes", "closes", "close by itself", "stopped", "keeps stopping",
               "app stop", "plante", "ferme tout seul", "s'arrête", "sarrete", "quitte"],
        "en": ("💥 App closes or crashes",
               "💥 The app closes or crashes\n\n"
               "1. Update to the latest version ({version}): it fixes a crash when "
               "leaving a channel that was still connecting.\n"
               "2. Restart the device (unplug it 10 seconds).\n"
               "3. Android: Settings → Apps → InkonabTV → Clear cache.\n"
               "4. Still crashing? Tell us your device model and what you "
               "pressed just before."),
        "fr": ("💥 L'appli se ferme ou plante",
               "💥 L'appli se ferme ou plante\n\n"
               "1. Mettez à jour ({version}) : elle corrige un plantage en quittant une "
               "chaîne encore en connexion.\n"
               "2. Redémarrez l'appareil (débranchez-le 10 secondes).\n"
               "3. Android : Paramètres → Applis → InkonabTV → Vider le cache.\n"
               "4. Ça plante encore ? Donnez-nous le modèle de "
               "l'appareil et ce que vous faisiez juste avant."),
    },
    "sound": {
        "kw": ["sound", "audio", "no sound", "volume", "dolby", "son", "pas de son",
               "silence", "subtitle", "subtitles", "sous-titre", "sous titre"],
        "en": ("🔇 Sound or subtitles",
               "🔇 No sound, or subtitles\n\n"
               "• Try the channel's other quality copy (◀ / ▶ on Android TV).\n"
               "• On the TV or box: Settings → Sound → Audio output → set to PCM or "
               "Auto.\n"
               "• Android plays Dolby (AC3/EAC3) and DTS, so most films work.\n"
               "• Subtitles and audio languages depend on the film your provider "
               "sends."),
        "fr": ("🔇 Son ou sous-titres",
               "🔇 Pas de son, ou sous-titres\n\n"
               "• Essayez l'autre qualité de la chaîne (◀ / ▶ sur Android TV).\n"
               "• Sur la télé ou la box : Paramètres → Son → Sortie audio → PCM ou "
               "Auto.\n"
               "• Android lit le Dolby (AC3/EAC3) et le DTS : la plupart des films "
               "marchent.\n"
               "• Les sous-titres et langues audio dépendent du film envoyé par votre "
               "fournisseur."),
    },
    "install_blocked": {
        "kw": ["blocked", "can't install", "cant install", "not installed",
               "parse error", "unknown sources", "unknown apps", "play protect",
               "installation bloquée", "impossible d'installer", "pas installée",
               "pas installee", "sources inconnues"],
        "en": ("🚫 Install blocked",
               "🚫 The install is blocked\n\n"
               "• Allow \"Install unknown apps\" for Downloader (TV) or your browser "
               "(phone) in Settings → Apps / Security.\n"
               "• Play Protect warning: tap \"More details\" → \"Install anyway\". "
               "The app is safe, it just doesn't come from the Play Store yet.\n"
               "• \"App not installed\": uninstall the old copy first, then install "
               "again.\n"
               "• Download stopped? Check free space on the device."),
        "fr": ("🚫 Installation bloquée",
               "🚫 L'installation est bloquée\n\n"
               "• Autorisez « Installer des applis inconnues » pour Downloader (télé) "
               "ou votre navigateur (téléphone) dans Paramètres → Applis / Sécurité.\n"
               "• Alerte Play Protect : « Plus de détails » → « Installer quand "
               "même ». L'appli est sûre, elle ne vient juste pas encore du Play Store.\n"
               "• « Application non installée » : désinstallez l'ancienne copie, puis "
               "réinstallez.\n"
               "• Téléchargement arrêté ? Vérifiez l'espace libre."),
    },
    # ------------------------------------------------------------ FAQ
    "free": {
        "kw": ["free", "price", "cost", "how much", "pay", "ads", "gratuit", "prix",
               "combien", "payer", "pub", "publicité"],
        "en": ("💸 Is it free?",
               "💸 Yes, InkonabTV is free, with no ads.\n\n"
               "If you'd like to help its development, just ask us how to donate."),
        "fr": ("💸 C'est gratuit ?",
               "💸 Oui, InkonabTV est gratuit, sans publicité.\n\n"
               "Pour aider son développement, demandez-nous comment faire un don."),
    },
    "channels": {
        "kw": ["subscription", "subscribe", "buy", "sell", "channels list", "provider",
               "iptv service", "line", "reseller", "abonnement", "acheter", "vendre",
               "fournisseur", "liste de chaînes", "test playlist", "demo", "trial",
               "essai", "démo"],
        "en": ("📡 Channels & subscriptions",
               "📡 Channels and subscriptions\n\n"
               "InkonabTV is a player: you watch the playlist you already have.\n"
               "• InkonabTV+: sign in with your InkonabTV subscription, and add extra "
               "M3U playlists in Settings.\n"
               "• Store versions (Google Play, Samsung): add your own Xtream Codes or "
               "M3U playlist from your provider.\n\n"
               "Want to try the app first? Ask us for a demo playlist (free open "
               "movies)."),
        "fr": ("📡 Chaînes & abonnements",
               "📡 Chaînes et abonnements\n\n"
               "InkonabTV est un lecteur : vous regardez la playlist que vous avez déjà.\n"
               "• InkonabTV+ : connectez-vous avec votre abonnement InkonabTV, et ajoutez "
               "des playlists M3U en plus dans les Réglages.\n"
               "• Versions boutique (Google Play, Samsung) : ajoutez votre propre "
               "playlist Xtream Codes ou M3U de votre fournisseur.\n\n"
               "Envie d'essayer d'abord ? Demandez-nous une playlist de démo (films "
               "libres)."),
    },
    "devices": {
        "kw": ["devices", "how many", "several", "multiple", "same account",
               "appareils", "plusieurs appareils", "même compte"],
        "en": ("📟 Several devices",
               "📟 Several devices\n\n"
               "Install InkonabTV on as many devices as you like. How many can watch "
               "at the same time depends on your provider's subscription "
               "(\"connections\")."),
        "fr": ("📟 Plusieurs appareils",
               "📟 Plusieurs appareils\n\n"
               "Installez InkonabTV sur autant d'appareils que vous voulez. Le nombre "
               "d'écrans en même temps dépend de votre abonnement chez le fournisseur "
               "(« connexions »)."),
    },
    "remote": {
        "kw": ["remote", "button", "buttons", "arrow", "télécommande", "telecommande",
               "bouton", "flèche", "fleche", "change channel", "zapper"],
        "en": ("🎮 Remote controls",
               "🎮 Remote controls while a channel plays\n\n"
               "▼ or OK: info panel (now, next, start over, favourites)\n"
               "▲: channel strip to flick through the group\n"
               "◀: the full channel list\n"
               "▶: today's programmes, with Replay\n"
               "CH+ / CH−: next / previous channel\n"
               "Back or the opposite arrow: close the panel"),
        "fr": ("🎮 Télécommande",
               "🎮 La télécommande pendant une chaîne\n\n"
               "▼ ou OK : infos (en cours, suivant, reprendre au début, favoris)\n"
               "▲ : bandeau des chaînes du groupe\n"
               "◀ : la liste complète des chaînes\n"
               "▶ : les programmes du jour, avec Replay\n"
               "CH+ / CH− : chaîne suivante / précédente\n"
               "Retour ou la flèche opposée : fermer"),
    },
    "favorites": {
        "kw": ["favorite", "favourite", "my list", "save channel", "favori", "ma liste"],
        "en": ("⭐ Favourites & My List",
               "⭐ Favourites and My List\n\n"
               "• Channels: hold OK on a channel in the list, or ☆ in the guide.\n"
               "• Films and series: ☆ My List on their page.\n"
               "They appear on Home and in their own category."),
        "fr": ("⭐ Favoris & Ma liste",
               "⭐ Favoris et Ma liste\n\n"
               "• Chaînes : restez appuyé sur OK sur une chaîne de la liste, ou ☆ "
               "dans le guide.\n"
               "• Films et séries : ☆ Ma liste sur leur page.\n"
               "Ils apparaissent sur l'Accueil et dans leur propre catégorie."),
    },
    "replay": {
        "kw": ["replay", "catch up", "catchup", "catch-up", "missed", "rewind",
               "rattrapage", "revoir", "raté", "rate", "reprendre"],
        "en": ("⟲ Replay / catch-up",
               "⟲ Replay a show you missed\n\n"
               "While watching a channel, press ▶ to see today's programmes. Pick an "
               "earlier show marked \"Replay\" and press OK.\n\n"
               "Only on channels where your provider offers catch-up."),
        "fr": ("⟲ Replay",
               "⟲ Revoir une émission ratée\n\n"
               "Pendant une chaîne, appuyez sur ▶ pour voir les programmes du jour. "
               "Choisissez une émission passée marquée « Replay » et appuyez sur OK.\n\n"
               "Seulement sur les chaînes où votre fournisseur propose le replay."),
    },
    "series": {
        "kw": ["next episode", "episode", "season", "resume", "continue watching",
               "épisode", "episode suivant", "saison", "reprendre", "continuer"],
        "en": ("🍿 Series, next episode, resume",
               "🍿 Series\n\n"
               "• The next episode starts by itself. In the last 30 seconds a \"Next "
               "episode\" card appears: OK plays it now, Back hides it.\n"
               "• Continue watching (on Home) reopens the right episode or film where "
               "you stopped."),
        "fr": ("🍿 Séries, épisode suivant, reprise",
               "🍿 Séries\n\n"
               "• L'épisode suivant démarre tout seul. Dans les 30 dernières secondes, "
               "une carte « Épisode suivant » apparaît : OK pour le lancer, Retour "
               "pour la masquer.\n"
               "• Continuer à regarder (sur l'Accueil) rouvre le bon épisode ou film "
               "là où vous vous êtes arrêté."),
    },
    "vpn": {
        "kw": ["vpn", "blocked channel", "isp", "privacy", "confidentialité"],
        "en": ("🛡 Built-in VPN",
               "🛡 Built-in free VPN\n\n"
               "The Android version from our site ({apk}) includes a free VPN for the "
               "app only. If a channel won't play even after trying its other copies, "
               "the app connects it by itself and retries. Nothing to set up.\n\n"
               "Not in the Samsung TV or store versions."),
        "fr": ("🛡 VPN intégré",
               "🛡 VPN gratuit intégré\n\n"
               "La version Android de notre site ({apk}) inclut un VPN gratuit, pour "
               "l'appli seulement. Si une chaîne ne se lance pas même après ses autres "
               "copies, l'appli le connecte toute seule et réessaie. Rien à régler.\n\n"
               "Pas dans les versions Samsung TV ni des boutiques."),
    },
    "partner": {
        "kw": ["partner", "partnership", "collaboration", "collab", "business",
               "manufacturer", "preinstall", "pre-install", "white label", "rebrand",
               "partenaire", "partenariat", "revendeur", "distributeur"],
        "en": ("🤝 Business & partnerships",
               "🤝 Business and partnerships\n\n"
               "Box makers, shops and creators are welcome: tell us about your "
               "project here (what you do, your country, how many users) and we'll "
               "get back to you."),
        "fr": ("🤝 Pros & partenariats",
               "🤝 Pros et partenariats\n\n"
               "Fabricants de box, boutiques et créateurs bienvenus : décrivez votre "
               "projet ici (activité, pays, nombre d'utilisateurs) et nous vous "
               "répondrons."),
    },
    "privacy": {
        "kw": ["safe", "virus", "secure", "data", "password stored", "spy", "malware",
               "sûr", "sur ?", "dangereux", "données", "donnees"],
        "en": ("🔒 Is it safe? My data?",
               "🔒 Safety and your data\n\n"
               "Your playlist details stay on your device: InkonabTV has no account "
               "and no server that stores them. The app has no ads and no tracking. "
               "Install it only from our official link or Downloader code {code}."),
        "fr": ("🔒 C'est sûr ? Mes données ?",
               "🔒 Sécurité et données\n\n"
               "Les infos de votre playlist restent sur votre appareil : InkonabTV n'a "
               "ni compte ni serveur qui les stocke. Pas de pub, pas de pistage. "
               "Installez-la seulement via notre lien officiel ou le code Downloader "
               "{code}."),
    },
    # ------------------------------------------------------------ other
    "donate": {
        "kw": ["donate", "donation", "support you", "tip", "paypal", "moneygram",
               "don", "faire un don", "soutenir", "vip", "supporter"],
        "en": ("💛 Donate",
               "💛 Support InkonabTV\n\nThe app is free. If you'd like to help its "
               "development, thank you!\n\n{donate}\n"
               "After a MoneyGram transfer, send us the reference number here."),
        "fr": ("💛 Faire un don",
               "💛 Soutenir InkonabTV\n\nL'appli est gratuite. Si vous voulez aider "
               "son développement, merci !\n\n{donate}\n"
               "Après un envoi MoneyGram, écrivez-nous ici le numéro de référence."),
    },
    "news": {
        "kw": ["news", "channel", "facebook", "follow", "social", "nouvelles",
               "actualités", "suivre"],
        "en": ("📢 News & social",
               "📢 Follow InkonabTV\n\nTelegram channel: {channel}\n"
               "Facebook: {facebook}"),
        "fr": ("📢 Actus & réseaux",
               "📢 Suivre InkonabTV\n\nChaîne Telegram : {channel}\n"
               "Facebook : {facebook}"),
    },
    "human": {
        "kw": ["human", "agent", "someone", "person", "contact", "talk", "help me",
               "humain", "quelqu'un", "parler", "aide"],
        "en": ("💬 Talk to us",
               "💬 Type your question here (you can attach a photo or screenshot). "
               "Tell us your device and app version if it's a problem. We'll reply "
               "as soon as we can."),
        "fr": ("💬 Nous parler",
               "💬 Écrivez votre question ici (vous pouvez joindre une photo ou une "
               "capture). Si c'est un problème, indiquez votre appareil et la version "
               "de l'appli. Nous répondrons dès que possible."),
    },
}

# Menus: id -> (title key, list of topic ids or "menu:<id>")
MENUS = {
    "main": ["menu:guides", "menu:install", "menu:setup", "menu:problems",
             "menu:faq", "update", "donate", "news", "human"],
    "guides": ["versions", "phone", "tv", "firetv", "plus_setup", "playstore",
               "samsung"],
    "install": ["versions", "phone", "tv", "firetv", "playstore", "samsung", "apple",
                "update", "install_blocked"],
    "setup": ["plus_setup", "playlist", "fromphone", "extra", "signout", "languages", "remote"],
    "problems": ["noplay", "buffering", "loginerror", "guide", "missing", "crash",
                 "sound", "install_blocked"],
    "faq": ["free", "channels", "devices", "favorites", "replay", "series", "vpn",
            "privacy", "partner"],
}

MENU_LABELS = {
    "guides": {"en": "📖 Guides A to Z", "fr": "📖 Guides de A à Z"},
    "install": {"en": "📥 Install the app", "fr": "📥 Installer l'appli"},
    "setup": {"en": "⚙️ Set up & use", "fr": "⚙️ Configurer & utiliser"},
    "problems": {"en": "🛠 Something's wrong", "fr": "🛠 Un problème"},
    "faq": {"en": "❓ Questions", "fr": "❓ Questions"},
}

MENU_INTROS = {
    "guides": {"en": "📖 Step-by-step guides, from download to first use. Which one?",
               "fr": "📖 Guides pas à pas, du téléchargement à la première utilisation. Lequel ?"},
    "install": {"en": "📥 Which device?", "fr": "📥 Quel appareil ?"},
    "setup": {"en": "⚙️ What do you want to do?", "fr": "⚙️ Que voulez-vous faire ?"},
    "problems": {"en": "🛠 What's happening?", "fr": "🛠 Que se passe-t-il ?"},
    "faq": {"en": "❓ Common questions", "fr": "❓ Questions fréquentes"},
}

# Short messages that just get the main menu, or a thank-you.
GREETINGS = ["hi", "hello", "hey", "hii", "yo", "good morning", "good evening",
             "bonjour", "bonsoir", "salut", "coucou", "slt", "menu", "start", "help",
             "aide", "salam", "hola"]
THANKS = ["thanks", "thank you", "thx", "ty", "merci", "ok thanks", "ok merci",
          "great", "perfect", "parfait", "super", "top", "ok", "okay", "👍", "🙏"]
